# Task T2 — Server: seed file writer endpoint

## Goal
Add a `PATCH /api/seeds/:fileName` Express endpoint and a `seedWriter.ts` module that surgically updates property values inside a TypeScript seed file in-place. The writer uses the TypeScript compiler API (already a dependency) to locate AST node positions and replace values without reformatting or rewriting any surrounding code.

## Dependencies
- **T1** must be complete — this task imports `StepPendingChange`, `SeedPatchRequest`, `SeedPatchResponse` from `src/shared/types.ts`.

## Files to read (before starting)
- `src/server/seedAstParser.ts` — understand how the TS compiler API is used; the writer uses the same patterns (`ts.createSourceFile`, `ts.forEachChild`, `ts.isCallExpression`, etc.)
- `src/server/routes/seedRoutes.ts` — add the PATCH route here
- `src/server/index.ts` — for context on how routes are mounted (no changes needed)
- `src/shared/types.ts` — `StepPendingChange`, `SeedPatchRequest`, `SeedPatchResponse`

## Files to create / modify

| File | Action |
|------|--------|
| `src/server/seedWriter.ts` | **Create new** — `patchSeedFile()` function |
| `src/server/routes/seedRoutes.ts` | Add `PATCH /seeds/:fileName` route |

## Acceptance criteria
- `PATCH /api/seeds/:fileName` with a valid body updates `x:`, `y:`, and string property values in the seed file in-place.
- The rest of the file (formatting, comments, other steps) is unchanged.
- If a property already exists in the seed object, its value is replaced.
- If a property does not exist in the seed object, it is inserted before the closing `}` of the step's argument object.
- Returns `{ success: true }` on success.
- Returns HTTP 500 + `{ error: "..." }` on failure; the file is not modified if an error occurs (write only after all replacements are computed).
- Concurrent writes to different files are safe (no global mutable state in the writer).

## Implementation notes

### Strategy: AST-position-based replacement

Do **not** use regex-only replacement — the seed files have nested objects that break simple patterns.

Instead:
1. Read the file as a UTF-8 string.
2. Parse it with `ts.createSourceFile(filePath, source, ts.ScriptTarget.ES2022, true)` — the last `true` enables position tracking.
3. Walk the AST to find `createStep({ ... })` call expressions.
4. Inside each step's argument object, find the `name:` string property to identify which step it is.
5. For each field to change, collect `{ start, end, newText }` replacement descriptors using `node.getStart(sourceFile)` / `node.getEnd()`.
6. For missing properties, collect insert descriptors at the end of the last property.
7. Apply all replacements **from highest position to lowest** (so earlier positions are not shifted).
8. Write the result to disk once.

### `src/server/seedWriter.ts`

```ts
import fs from 'node:fs';
import ts from 'typescript';
import type { StepPendingChange, EditableStepFields } from '../shared/types.js';

type Replacement = { start: number; end: number; newText: string };

export function patchSeedFile(filePath: string, changes: StepPendingChange[]): void {
    if (changes.length === 0) return;

    const source = fs.readFileSync(filePath, 'utf-8');
    const sourceFile = ts.createSourceFile(filePath, source, ts.ScriptTarget.ES2022, /* setParentNodes */ true);

    const replacements: Replacement[] = [];

    function visitNode(node: ts.Node): void {
        if (ts.isCallExpression(node) && node.arguments.length > 0) {
            const expr = node.expression;
            const isCreateStep =
                (ts.isPropertyAccessExpression(expr) && expr.name.text === 'createStep') ||
                (ts.isIdentifier(expr) && expr.text === 'createStep');

            if (isCreateStep && ts.isObjectLiteralExpression(node.arguments[0])) {
                const obj = node.arguments[0] as ts.ObjectLiteralExpression;
                processStepObject(obj);
            }
        }
        ts.forEachChild(node, visitNode);
    }

    function processStepObject(obj: ts.ObjectLiteralExpression): void {
        // Identify the step by its 'name' property
        const nameProp = findStringProp(obj, 'name');
        if (!nameProp) return;

        const change = changes.find((c) => c.stepName === nameProp);
        if (!change) return;

        for (const [field, value] of Object.entries(change.fields) as [keyof EditableStepFields, unknown][]) {
            if (value === undefined) continue;

            const existing = obj.properties.find(
                (p) => ts.isPropertyAssignment(p) && ts.isIdentifier(p.name) && p.name.text === field
            ) as ts.PropertyAssignment | undefined;

            const newText = formatPropertyValue(value);

            if (existing) {
                // Replace existing value node
                const init = existing.initializer;
                replacements.push({
                    start: init.getStart(sourceFile),
                    end: init.getEnd(),
                    newText,
                });
            } else {
                // Insert new property before the closing brace
                // Find the indentation of existing properties to match style
                const lastProp = obj.properties[obj.properties.length - 1];
                const insertPos = lastProp ? lastProp.getEnd() : obj.getStart(sourceFile) + 1;
                const indent = detectIndent(source, obj);
                replacements.push({
                    start: insertPos,
                    end: insertPos,
                    newText: `,\n${indent}${field}: ${newText}`,
                });
            }
        }
    }

    function findStringProp(obj: ts.ObjectLiteralExpression, propName: string): string | null {
        for (const p of obj.properties) {
            if (
                ts.isPropertyAssignment(p) &&
                ts.isIdentifier(p.name) &&
                p.name.text === propName &&
                (ts.isStringLiteral(p.initializer) || ts.isNoSubstitutionTemplateLiteral(p.initializer))
            ) {
                return p.initializer.text;
            }
        }
        return null;
    }

    visitNode(sourceFile);

    // Apply replacements from back to front to preserve positions
    replacements.sort((a, b) => b.start - a.start);

    let result = source;
    for (const r of replacements) {
        result = result.slice(0, r.start) + r.newText + result.slice(r.end);
    }

    fs.writeFileSync(filePath, result, 'utf-8');
}

function formatPropertyValue(value: unknown): string {
    if (typeof value === 'number') return String(value);
    if (value === null) return 'null';
    if (typeof value === 'string') {
        // Use single quotes; escape any single quotes in the value
        const escaped = value.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
        return `'${escaped}'`;
    }
    return JSON.stringify(value);
}

function detectIndent(source: string, obj: ts.ObjectLiteralExpression): string {
    // Find the line of the first property and measure its leading spaces
    if (obj.properties.length === 0) return '    ';
    const firstPropStart = obj.properties[0].getFullStart();
    const lineStart = source.lastIndexOf('\n', firstPropStart) + 1;
    const match = source.slice(lineStart).match(/^(\s+)/);
    return match ? match[1] : '    ';
}
```

### Route addition in `src/server/routes/seedRoutes.ts`

Add after the existing GET route:

```ts
import { patchSeedFile } from '../seedWriter.js';
import type { SeedPatchRequest } from '../../shared/types.js';

router.patch('/seeds/:fileName', (req, res) => {
    const config = readConfig();
    if (!config.clientSafePath) {
        res.status(400).json({ error: 'ClientSafe path not configured' });
        return;
    }

    const { changes } = req.body as SeedPatchRequest;
    if (!Array.isArray(changes)) {
        res.status(400).json({ error: 'Missing or invalid changes array' });
        return;
    }

    const filePath = path.join(config.clientSafePath, 'src', 'backend', 'seeds', req.params.fileName);

    try {
        patchSeedFile(filePath, changes);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
    }
});
```

### Gotchas
- The TS compiler used here is a **read-only parse** (no type checking needed) — use `ts.createSourceFile` directly, not `ts.createProgram`. This is much faster.
- `getStart(sourceFile)` skips leading trivia (whitespace/comments); `getFullStart()` includes it. Use `getStart()` for value nodes so only the value token is replaced.
- Seed files can use template literals for string values. The writer only replaces string literals and numeric literals — do not attempt to modify template expressions.
- The file watcher in `fileWatcher.ts` will detect the write and trigger a re-parse automatically via WebSocket. No manual re-parse needed.

## Codebase context

**Seed file example** (what the writer modifies):
```ts
const stepA = helper.createStep({
    block: 'performActivity',
    name: 'Perform something',
    label: 'Perform something',
    x: 1,
    y: 3,
    allowedPerformer: 'someOrganization',
    performerNeedsTask: true,
    nextSteps: [stepB],
});
```

**Existing `src/server/routes/seedRoutes.ts`**:
```ts
import path from 'node:path';
import { Router } from 'express';
import { readConfig } from '../config.js';
import { discoverSeedFiles } from '../seedDiscovery.js';
import { parseSeedFile, getSeedRelativePath } from '../seedAstParser.js';

const router = Router();

router.get('/seeds', ...);
router.get('/seeds/:fileName/parse', ...);

export default router;
```

**Server runs as ESM** — all intra-project imports must use `.js` extension in the import path.
