# Task TZ1 — Server: block parameter schema analyzer

## Goal
Create `src/server/blockParameterAnalyzer.ts` that reads the `*ParameterEditor.tsx` files from
the ClientSafe `blockParameters/` directory, uses the TypeScript AST to extract Zod schema field
descriptors for each block, and caches the result as JSON.  Also wire up two API routes.

## Files to read first
- `src/server/seedAstParser.ts` — for TypeScript AST usage patterns
- `src/server/routes/configRoutes.ts` — for route pattern
- `src/server/index.ts` — to know where to mount new routes

## Files to create / modify
- **Create** `src/server/blockParameterAnalyzer.ts`
- **Create** `src/server/routes/blockParameterRoutes.ts`
- **Modify** `src/server/index.ts` — mount new routes at `/api`

---

## A. Types (also exported, used by client via shared/types.ts in TZ2)

```ts
export type ParameterFieldType =
  | 'string' | 'number' | 'boolean'
  | 'enum'          // fixed list of string literals
  | 'activity-id'   // single UUID referencing a workflow activity
  | 'step-id'       // single UUID referencing a workflow step
  | 'activity-id-array' | 'step-id-array'
  | 'string-array'  // z.array(z.string())
  | 'object'        // nested z.strictObject / complex
  | 'unknown';

export interface BlockParameterField {
  key: string;
  type: ParameterFieldType;
  enumValues?: string[];   // only when type === 'enum'
  required: boolean;       // false when .optional() is present in the chain
}

export interface BlockParameterSchema {
  blockName: string;   // camelCase, matches BLOCK_TYPE_MAP key
  fields: BlockParameterField[];
  hasEditor: boolean;  // true = ParameterEditor exists; false = no params
}

export type BlockParameterSchemas = Record<string, BlockParameterSchema>;
```

## B. `analyzeBlockParameterEditors(clientSafePath)` — the main function

### Step 1: find the blockParameters directory
```ts
const editorsDir = path.join(
  clientSafePath,
  'src/frontend/components/pages/services/workflowEditor/blockParameters'
);
```

### Step 2: parse `BlockParameterEditor.tsx` to get the block-name → hasEditor mapping

Walk the AST of `BlockParameterEditor.tsx` looking for the object literal passed to
`blockParameterConfigs`. Extract:
- Keys of the form `[BlockName.xxx]` → the camelCase block name `xxx`
- Value: either `undefined` (→ `hasEditor: false`) or an object literal (→ `hasEditor: true`)

The `BlockName.xxx` member access expression: the property name text is the block name.

### Step 3: parse each `*ParameterEditor.tsx` file to extract field schemas

For each file that is NOT `BlockParameterEditor.tsx`:

1. **Collect const array declarations** (for enum value lookup):
   - Pattern: `const someConst = ['a', 'b', 'c'] as const`
   - AST: `VariableDeclaration` where initializer is an `AsExpression` wrapping an `ArrayLiteralExpression` of `StringLiteral` values
   - Store in a `Map<varName, string[]>` for later lookup when parsing `z.enum(someConst)`

2. **Find the schema factory function** (`function createXxx...`):
   - Any `FunctionDeclaration` or `ArrowFunction` whose name starts with `create` and ends with `Schema`

3. **Find `z.object({...})`** in the function body:
   - Walk until you find a `CallExpression` where the expression is `PropertyAccessExpression { object: Identifier 'z', name: 'object' | 'strictObject' }`
   - The first argument is the `ObjectLiteralExpression` with the fields

4. **Extract each property** of the object literal:
   - Name: `PropertyAssignment.name` text
   - Value: the Zod type chain

5. **Identify Zod type from the chain**:

```ts
function extractZodType(node: ts.Expression, constArrays: Map<string, string[]>, source: string): Partial<BlockParameterField> {
  // Walk through method-call chains (e.g. z.boolean().optional()) 
  // to find the root Zod method call.
  // The "root" is the innermost z.xxx() call; outer calls are modifiers (.optional, .min, .default, .nullable).
  
  let isOptional = false;
  let current = node;
  
  // Unwrap modifier chains (.optional(), .min(), .default(), .nullable(), .describe())
  while (ts.isCallExpression(current) && ts.isPropertyAccessExpression(current.expression)) {
    const methodName = current.expression.name.text;
    if (methodName === 'optional' || methodName === 'nullable') {
      isOptional = true;
    }
    // Don't descend into array/object sub-schemas
    if (['object', 'strictObject', 'array', 'enum', 'string', 'number', 'boolean', 'uuid'].includes(methodName)) {
      break; // this IS the root type call
    }
    current = current.expression.expression;
  }
  
  // current should now be the root z.xxx() call
  if (!ts.isCallExpression(current) || !ts.isPropertyAccessExpression(current.expression)) {
    return { type: 'unknown', required: !isOptional };
  }
  
  const methodName = current.expression.name.text;
  
  switch (methodName) {
    case 'string': return { type: 'string', required: !isOptional };
    case 'number': return { type: 'number', required: !isOptional };
    case 'boolean': return { type: 'boolean', required: !isOptional };
    
    case 'enum': {
      const arg = current.arguments[0];
      if (!arg) return { type: 'enum', enumValues: [], required: !isOptional };
      
      // z.enum(['a','b','c']) — array literal
      if (ts.isArrayLiteralExpression(arg)) {
        const values = arg.elements
          .filter(ts.isStringLiteral)
          .map(e => (e as ts.StringLiteral).text);
        return { type: 'enum', enumValues: values, required: !isOptional };
      }
      
      // z.enum(someConst) — identifier reference to a const
      if (ts.isIdentifier(arg)) {
        const constName = arg.text;
        
        // Special ValidationContext references:
        if (constName === 'validActivityIds') return { type: 'activity-id', required: !isOptional };
        if (constName === 'validStepIds') return { type: 'step-id', required: !isOptional };
        
        // Look up const array from file
        const enumValues = constArrays.get(constName);
        if (enumValues) return { type: 'enum', enumValues, required: !isOptional };
        
        return { type: 'enum', enumValues: [], required: !isOptional }; // unresolved
      }
      
      return { type: 'enum', enumValues: [], required: !isOptional };
    }
    
    case 'array': {
      const inner = current.arguments[0];
      if (!inner) return { type: 'string-array', required: !isOptional };
      
      // z.array(z.string()) → string-array
      // z.array(z.enum(validActivityIds)) → activity-id-array
      // z.array(z.enum(validStepIds)) → step-id-array
      const innerType = extractZodType(inner, constArrays, source);
      
      if (innerType.type === 'activity-id') return { type: 'activity-id-array', required: !isOptional };
      if (innerType.type === 'step-id') return { type: 'step-id-array', required: !isOptional };
      if (innerType.type === 'string') return { type: 'string-array', required: !isOptional };
      return { type: 'unknown', required: !isOptional };
    }
    
    case 'strictObject':
    case 'object':
      return { type: 'object', required: !isOptional };
    
    default:
      return { type: 'unknown', required: !isOptional };
  }
}
```

### Step 4: associate file results with block names

Map file name → schema fields, then join with the block-name mapping from Step 2.

Use the file name to derive a "base name" (e.g. `FixedIntervalSchedulerParameterEditor.tsx` → `FixedIntervalScheduler`), then match against block names case-insensitively (the block name is the first chars of the class name without `ParameterEditor`).

Actually: read the imports/exports in `BlockParameterEditor.tsx` to map component names to block names:
- `[BlockName.fixedIntervalScheduler]: { component: FixedIntervalSchedulerParametersEditor }` → associate `FixedIntervalSchedulerParameterEditor.tsx` with `fixedIntervalScheduler`

Build a map from component name → block name using the registry object.

### Step 5: cache to disk

Cache location: `{process.cwd()}/block-params-cache.json` (flex-viewer project root).

```ts
export function loadCachedSchemas(): BlockParameterSchemas | null {
  const cachePath = path.join(process.cwd(), 'block-params-cache.json');
  if (!fs.existsSync(cachePath)) return null;
  try { return JSON.parse(fs.readFileSync(cachePath, 'utf-8')); }
  catch { return null; }
}

export function saveCachedSchemas(schemas: BlockParameterSchemas): void {
  const cachePath = path.join(process.cwd(), 'block-params-cache.json');
  fs.writeFileSync(cachePath, JSON.stringify(schemas, null, 2), 'utf-8');
}
```

---

## C. `src/server/routes/blockParameterRoutes.ts`

```ts
router.get('/block-parameters', (_req, res) => {
  const config = readConfig();
  // Return cached schemas (or empty if not yet analyzed)
  const cached = loadCachedSchemas();
  if (cached) { res.json(cached); return; }
  // Auto-analyze on first request if clientSafePath is set
  if (config.clientSafePath) {
    try {
      const schemas = analyzeBlockParameterEditors(config.clientSafePath);
      saveCachedSchemas(schemas);
      res.json(schemas);
    } catch (err) {
      res.json({}); // non-fatal
    }
  } else {
    res.json({});
  }
});

router.post('/block-parameters/refresh', (_req, res) => {
  const config = readConfig();
  if (!config.clientSafePath) {
    res.status(400).json({ error: 'ClientSafe path not configured' });
    return;
  }
  try {
    const schemas = analyzeBlockParameterEditors(config.clientSafePath);
    saveCachedSchemas(schemas);
    res.json({ success: true, blockCount: Object.keys(schemas).length, schemas });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});
```

## D. Mount in `src/server/index.ts`

Add: `app.use('/api', blockParameterRoutes);`

## Acceptance criteria
- `GET /api/block-parameters` returns a `BlockParameterSchemas` object (from cache or auto-analyzed)
- `POST /api/block-parameters/refresh` re-analyzes and returns updated schemas
- `fixedIntervalScheduler` → `{ fields: [{ key: 'intervalNumber', type: 'number' }, { key: 'intervalType', type: 'enum', enumValues: [...] }] }`
- `sendEmailToRequester` → `{ fields: [{ key: 'emailType', type: 'enum', enumValues: [...] }] }`
- Blocks with no editor (e.g. `performActivity`) → `{ hasEditor: false, fields: [] }`
- `tsc --noEmit` passes on server tsconfig
