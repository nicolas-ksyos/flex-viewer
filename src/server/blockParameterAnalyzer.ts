/**
 * blockParameterAnalyzer.ts
 *
 * Reads the `blockParameters/*.tsx` files from the ClientSafe workflowEditor
 * directory, parses their Zod schema factory functions using the TypeScript
 * AST, and produces a flat JSON-serialisable description of each block's
 * parameter fields.  Results are cached to `block-params-cache.json` at the
 * project root.
 */

import fs from "node:fs";
import path from "node:path";
import ts from "typescript";

// ─────────────────────────────────────────────────────────────
// Public types
// ─────────────────────────────────────────────────────────────

export type ParameterFieldType =
	| "string"
	| "number"
	| "boolean"
	| "enum"
	| "activity-id"
	| "step-id"
	| "activity-id-array"
	| "step-id-array"
	| "string-array"
	| "uuid"
	| "uuid-array"
	| "object"
	| "unknown";

export interface BlockParameterField {
	key: string;
	type: ParameterFieldType;
	enumValues?: string[];
	required: boolean;
}

export interface BlockParameterSchema {
	blockName: string;
	fields: BlockParameterField[];
	hasEditor: boolean;
}

export type BlockParameterSchemas = Record<string, BlockParameterSchema>;

// ─────────────────────────────────────────────────────────────
// Cache helpers
// ─────────────────────────────────────────────────────────────

const CACHE_PATH = path.join(process.cwd(), "block-params-cache.json");

export function loadCachedSchemas(): BlockParameterSchemas | null {
	if (!fs.existsSync(CACHE_PATH)) return null;
	try {
		const raw = fs.readFileSync(CACHE_PATH, "utf-8");
		return JSON.parse(raw) as BlockParameterSchemas;
	} catch {
		return null;
	}
}

export function saveCachedSchemas(schemas: BlockParameterSchemas): void {
	fs.writeFileSync(CACHE_PATH, JSON.stringify(schemas, null, 2), "utf-8");
}

// ─────────────────────────────────────────────────────────────
// Main entry-point
// ─────────────────────────────────────────────────────────────

export function analyzeBlockParameterEditors(
	clientSafePath: string,
): BlockParameterSchemas {
	const editorsDir = path.join(
		clientSafePath,
		"src",
		"frontend",
		"components",
		"pages",
		"services",
		"workflowEditor",
		"blockParameters",
	);

	if (!fs.existsSync(editorsDir)) {
		return {};
	}

	const registryPath = path.join(editorsDir, "BlockParameterEditor.tsx");
	if (!fs.existsSync(registryPath)) {
		return {};
	}

	// Step 1: parse the registry to get block-name → editor file mapping
	const registry = parseBlockParameterRegistry(registryPath, editorsDir);

	const schemas: BlockParameterSchemas = {};

	for (const [blockName, info] of registry.entries()) {
		if (!info.hasEditor || !info.editorFilePath) {
			schemas[blockName] = { blockName, fields: [], hasEditor: false };
			continue;
		}

		if (!fs.existsSync(info.editorFilePath)) {
			schemas[blockName] = { blockName, fields: [], hasEditor: true };
			continue;
		}

		try {
			const fields = analyzeEditorFile(info.editorFilePath);
			schemas[blockName] = { blockName, fields, hasEditor: true };
		} catch {
			schemas[blockName] = { blockName, fields: [], hasEditor: true };
		}
	}

	// Merge backend Koi schemas — frontend schemas take precedence
	const backendSchemas = analyzeBackendBlocks(clientSafePath);
	for (const [blockName, backendSchema] of Object.entries(backendSchemas)) {
		if (!schemas[blockName]) {
			// Block only exists in backend — use backend schema
			schemas[blockName] = backendSchema;
		} else if (!schemas[blockName].hasEditor && backendSchema.hasEditor) {
			// Frontend marks no editor but backend has fields — use backend
			schemas[blockName] = backendSchema;
		}
	}

	return schemas;
}

// ─────────────────────────────────────────────────────────────
// Registry parser — reads BlockParameterEditor.tsx
// ─────────────────────────────────────────────────────────────

interface RegistryEntry {
	hasEditor: boolean;
	editorFilePath: string | null;
}

function parseBlockParameterRegistry(
	registryPath: string,
	editorsDir: string,
): Map<string, RegistryEntry> {
	const source = fs.readFileSync(registryPath, "utf-8");
	const sf = ts.createSourceFile(
		registryPath,
		source,
		ts.ScriptTarget.ES2022,
		true,
	);

	// Step 1: build importedName → relative module path map from import statements
	const importSourceMap = new Map<string, string>(); // componentName → './SomeFile'

	for (const stmt of sf.statements) {
		if (!ts.isImportDeclaration(stmt)) continue;
		const moduleSpecifier = stmt.moduleSpecifier;
		if (!ts.isStringLiteral(moduleSpecifier)) continue;
		const modulePath = moduleSpecifier.text;

		const namedBindings = stmt.importClause?.namedBindings;
		if (!namedBindings || !ts.isNamedImports(namedBindings)) continue;

		for (const specifier of namedBindings.elements) {
			const localName = specifier.name.text;
			importSourceMap.set(localName, modulePath);
		}
	}

	// Step 2: find `blockParameterConfigs` variable and parse its object literal
	const result = new Map<string, RegistryEntry>();

	function visitNode(node: ts.Node): void {
		if (
			ts.isVariableDeclaration(node) &&
			ts.isIdentifier(node.name) &&
			node.name.text === "blockParameterConfigs" &&
			node.initializer &&
			ts.isObjectLiteralExpression(node.initializer)
		) {
			for (const prop of node.initializer.properties) {
				if (!ts.isPropertyAssignment(prop)) continue;

				// Key must be a computed property: [BlockName.xxx]
				if (!ts.isComputedPropertyName(prop.name)) continue;
				const computedExpr = prop.name.expression;
				if (!ts.isPropertyAccessExpression(computedExpr)) continue;
				if (
					!ts.isIdentifier(computedExpr.expression) ||
					computedExpr.expression.text !== "BlockName"
				)
					continue;

				const blockName = computedExpr.name.text;

				// Value: undefined (no editor) or ObjectLiteralExpression (has editor)
				const initExpr = prop.initializer;
				const isUndefined =
					(ts.isIdentifier(initExpr) && initExpr.text === "undefined") ||
					initExpr.kind === ts.SyntaxKind.UndefinedKeyword;

				if (isUndefined) {
					result.set(blockName, { hasEditor: false, editorFilePath: null });
					continue;
				}

				// Find the component name inside the object literal: { component: SomeEditor, ... }
				if (!ts.isObjectLiteralExpression(initExpr)) {
					result.set(blockName, { hasEditor: true, editorFilePath: null });
					continue;
				}

				let componentName: string | null = null;
				for (const innerProp of initExpr.properties) {
					if (!ts.isPropertyAssignment(innerProp)) continue;
					if (!ts.isIdentifier(innerProp.name)) continue;
					if (innerProp.name.text !== "component") continue;
					if (ts.isIdentifier(innerProp.initializer)) {
						componentName = innerProp.initializer.text;
					}
				}

				if (!componentName) {
					result.set(blockName, { hasEditor: true, editorFilePath: null });
					continue;
				}

				// Look up the module path for this component
				const relModule = importSourceMap.get(componentName);
				if (!relModule) {
					result.set(blockName, { hasEditor: true, editorFilePath: null });
					continue;
				}

				// Convert './SomeFile' to absolute path + .tsx extension
				const fileName = relModule.replace(/^\.\//, "");
				const editorFilePath = path.join(editorsDir, `${fileName}.tsx`);
				result.set(blockName, { hasEditor: true, editorFilePath });
			}
		}
		ts.forEachChild(node, visitNode);
	}

	ts.forEachChild(sf, visitNode);
	return result;
}

// ─────────────────────────────────────────────────────────────
// Editor file analyser
// ─────────────────────────────────────────────────────────────

function analyzeEditorFile(filePath: string): BlockParameterField[] {
	const source = fs.readFileSync(filePath, "utf-8");
	const sf = ts.createSourceFile(
		filePath,
		source,
		ts.ScriptTarget.ES2022,
		true,
	);

	// Step 1: collect const array declarations for enum value lookup
	const constArrays = collectConstArrays(sf);

	// Step 2: find the schema factory function and extract z.object fields
	return extractSchemaFields(sf, constArrays);
}

// ─────────────────────────────────────────────────────────────
// Const array collector
// ─────────────────────────────────────────────────────────────

function collectConstArrays(sf: ts.SourceFile): Map<string, string[]> {
	const result = new Map<string, string[]>();

	function visit(node: ts.Node): void {
		if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name)) {
			const name = node.name.text;
			const init = node.initializer;
			if (!init) return;

			// Pattern: [...] as const
			if (
				ts.isAsExpression(init) &&
				ts.isArrayLiteralExpression(init.expression)
			) {
				result.set(name, extractArrayStringValues(init.expression));
				return;
			}

			// Pattern: [...] (without as const)
			if (ts.isArrayLiteralExpression(init)) {
				result.set(name, extractArrayStringValues(init));
				return;
			}

			// Pattern: Object.values(...).filter(...) or other call — empty, unresolvable
			if (ts.isCallExpression(init)) {
				result.set(name, []);
				return;
			}
		}
		ts.forEachChild(node, visit);
	}

	ts.forEachChild(sf, visit);
	return result;
}

function extractArrayStringValues(arr: ts.ArrayLiteralExpression): string[] {
	const values: string[] = [];
	for (const element of arr.elements) {
		if (ts.isStringLiteral(element)) {
			values.push(element.text);
		} else if (ts.isPropertyAccessExpression(element)) {
			// EmailTypes.processAssessmentCompleted — use member name as fallback
			values.push(element.name.text);
		}
	}
	return values;
}

// ─────────────────────────────────────────────────────────────
// Schema field extractor
// ─────────────────────────────────────────────────────────────

/**
 * Walks the source file looking for the first z.object / z.strictObject call
 * that is inside a schema factory function.  Returns the object-literal argument
 * or null if not found.
 *
 * Implemented as a stand-alone function (not an inner closure) so that the
 * TypeScript compiler can correctly narrow the return type — a `let` variable
 * mutated inside a closure cannot be narrowed after the closure call.
 */
function findZodObjectLiteral(
	sf: ts.SourceFile,
): ts.ObjectLiteralExpression | null {
	let found: ts.ObjectLiteralExpression | null = null;

	function walk(node: ts.Node): void {
		if (found) return;

		if (ts.isCallExpression(node)) {
			const expr = node.expression;
			if (
				ts.isPropertyAccessExpression(expr) &&
				ts.isIdentifier(expr.expression) &&
				expr.expression.text === "z" &&
				(expr.name.text === "object" || expr.name.text === "strictObject") &&
				node.arguments.length > 0 &&
				ts.isObjectLiteralExpression(node.arguments[0])
			) {
				if (isInsideSchemaFactory(node)) {
					found = node.arguments[0] as ts.ObjectLiteralExpression;
					return;
				}
			}
		}
		ts.forEachChild(node, walk);
	}

	ts.forEachChild(sf, walk);
	return found;
}

function extractSchemaFields(
	sf: ts.SourceFile,
	constArrays: Map<string, string[]>,
): BlockParameterField[] {
	const fields: BlockParameterField[] = [];

	// findZodObjectLiteral returns the definitive type, so TypeScript can narrow
	// foundObjectLiteral correctly after the null-check.
	const foundObjectLiteral = findZodObjectLiteral(sf);
	if (!foundObjectLiteral) return fields;

	// Extract each property from the z.object({...})
	for (const prop of foundObjectLiteral.properties) {
		if (!ts.isPropertyAssignment(prop)) continue;
		if (!ts.isIdentifier(prop.name)) continue;

		const key = prop.name.text;
		const typeInfo = extractZodTypeFromExpr(prop.initializer, constArrays);

		fields.push({ key, ...typeInfo });
	}

	return fields;
}

/** Returns true if the given node is inside a function declaration — i.e. a schema factory. */
function isInsideSchemaFactory(node: ts.Node): boolean {
	let cur: ts.Node | undefined = node.parent;
	while (cur) {
		if (
			ts.isFunctionDeclaration(cur) ||
			ts.isArrowFunction(cur) ||
			ts.isFunctionExpression(cur)
		) {
			// For function declarations, check the name
			if (ts.isFunctionDeclaration(cur) && cur.name) {
				const fnName = cur.name.text.toLowerCase();
				if (fnName.startsWith("create") && fnName.includes("schema")) {
					return true;
				}
			}
			// For any function, just accept it — schema factory is the only
			// function-level z.object() in these files
			return true;
		}
		// Walk up using parent chain (need parent nodes — sf was created with setParentNodes=true)
		cur = cur.parent;
	}
	return false;
}

// ─────────────────────────────────────────────────────────────
// Zod type extraction
// ─────────────────────────────────────────────────────────────

interface ZodTypeResult {
	type: ParameterFieldType;
	enumValues?: string[];
	required: boolean;
}

function extractZodTypeFromExpr(
	node: ts.Expression,
	constArrays: Map<string, string[]>,
): ZodTypeResult {
	// Unwrap TypeScript 'as' casts: z.enum(validActivityIds) as z.ZodType<Uuid>
	let unwrapped: ts.Expression = node;
	while (ts.isAsExpression(unwrapped)) {
		unwrapped = unwrapped.expression;
	}

	return extractZodTypeInternal(unwrapped, constArrays);
}

function extractZodTypeInternal(
	node: ts.Expression,
	constArrays: Map<string, string[]>,
): ZodTypeResult {
	const root = getZodRootCall(node);
	if (!root) return { type: "unknown", required: true };

	const { method, args, isOptional } = root;
	const required = !isOptional;

	switch (method) {
		case "string":
		case "uuid":
			return { type: "string", required };

		case "number":
		case "int":
			return { type: "number", required };

		case "boolean":
			return { type: "boolean", required };

		case "enum": {
			const arg = args[0] as ts.Expression | undefined;
			if (!arg) return { type: "enum", enumValues: [], required };

			// Unwrap 'as' from arg too
			let argNode: ts.Expression = arg;
			while (ts.isAsExpression(argNode)) argNode = argNode.expression;

			// z.enum(['a', 'b', 'c'])
			if (ts.isArrayLiteralExpression(argNode)) {
				const values = extractArrayStringValues(argNode);
				return { type: "enum", enumValues: values, required };
			}

			// z.enum(someIdentifier)
			if (ts.isIdentifier(argNode)) {
				const name = argNode.text;
				if (name === "validActivityIds")
					return { type: "activity-id", required };
				if (name === "validStepIds") return { type: "step-id", required };

				const enumValues = constArrays.get(name) ?? [];
				return { type: "enum", enumValues, required };
			}

			return { type: "enum", enumValues: [], required };
		}

		case "array": {
			const innerArg = args[0] as ts.Expression | undefined;
			if (!innerArg) return { type: "string-array", required };

			let innerNode: ts.Expression = innerArg;
			while (ts.isAsExpression(innerNode)) innerNode = innerNode.expression;

			const innerResult = extractZodTypeInternal(innerNode, constArrays);

			if (innerResult.type === "activity-id")
				return { type: "activity-id-array", required };
			if (innerResult.type === "step-id")
				return { type: "step-id-array", required };
			if (innerResult.type === "string")
				return { type: "string-array", required };
			return { type: "unknown", required };
		}

		case "object":
		case "strictObject":
			return { type: "object", required };

		default:
			return { type: "unknown", required };
	}
}

interface ZodRootCallInfo {
	method: string;
	args: ts.NodeArray<ts.Expression>;
	isOptional: boolean;
}

/**
 * Traverses a Zod method chain (e.g. z.boolean().optional().default(false))
 * to find the root z.xxx() call and whether .optional() / .nullable() appeared
 * anywhere in the chain.
 */
function getZodRootCall(node: ts.Expression): ZodRootCallInfo | null {
	let isOptional = false;
	let current: ts.Expression = node;

	while (true) {
		if (!ts.isCallExpression(current)) return null;

		const expr = current.expression;
		if (!ts.isPropertyAccessExpression(expr)) return null;

		const methodName = expr.name.text;
		const obj = expr.expression;

		// Direct z.xxx() call — this is the root
		if (ts.isIdentifier(obj) && obj.text === "z") {
			return { method: methodName, args: current.arguments, isOptional };
		}

		// Modifier — record optional/nullable and unwrap
		if (methodName === "optional" || methodName === "nullable") {
			isOptional = true;
		}
		// Continue unwrapping the chain (go one level inward)
		current = obj;
	}
}

// ─────────────────────────────────────────────────────────────
// Backend block analyzer — reads Koi parameter schemas
// ─────────────────────────────────────────────────────────────

/**
 * Scans the backend serviceWorkflow blocks directory and extracts Koi
 * parameter schemas for every block that declares a `parametersSchema`.
 * Results are merged into the main schema map by `analyzeBlockParameterEditors`
 * (frontend schemas take precedence when both exist).
 */
export function analyzeBackendBlocks(
	clientSafePath: string,
): BlockParameterSchemas {
	const blocksDir = path.join(
		clientSafePath,
		"src",
		"backend",
		"contexts",
		"serviceWorkflow",
		"blocks",
	);
	if (!fs.existsSync(blocksDir)) return {};

	const schemas: BlockParameterSchemas = {};
	const SKIP = new Set(["block.ts", "baseBlock.ts", "blockFactory.ts"]);

	for (const file of fs.readdirSync(blocksDir)) {
		if (!file.endsWith(".ts") || SKIP.has(file)) continue;
		const filePath = path.join(blocksDir, file);
		try {
			const source = fs.readFileSync(filePath, "utf-8");
			const sf = ts.createSourceFile(
				filePath,
				source,
				ts.ScriptTarget.ES2022,
				/* setParentNodes */ true,
			);

			const blockName = extractBlockNameFromBindDecorator(sf);
			if (!blockName) continue;

			const fields = extractKoiParameterFields(sf);
			if (fields === null) continue; // no parametersSchema declaration found

			schemas[blockName] = {
				blockName,
				fields,
				hasEditor: fields.length > 0,
			};
		} catch {
			// skip files that fail to parse
		}
	}
	return schemas;
}

/** Extract the block name from `@bindBlockName(BlockName.xxx)` */
function extractBlockNameFromBindDecorator(sf: ts.SourceFile): string | null {
	let found: string | null = null;

	function visit(node: ts.Node): void {
		if (found) return;
		if (ts.isClassDeclaration(node)) {
			// TypeScript ≥ 5.0 modifiers array — decorators live in node.modifiers
			const modifiers = (node as ts.ClassDeclaration & {
				modifiers?: ts.NodeArray<ts.ModifierLike>;
			}).modifiers;
			const decorators = modifiers?.filter(ts.isDecorator) ?? [];
			for (const dec of decorators) {
				if (!ts.isCallExpression(dec.expression)) continue;
				const call = dec.expression;
				if (
					ts.isIdentifier(call.expression) &&
					call.expression.text === "bindBlockName" &&
					call.arguments.length > 0
				) {
					const arg = call.arguments[0];
					if (
						ts.isPropertyAccessExpression(arg) &&
						ts.isIdentifier(arg.expression) &&
						arg.expression.text === "BlockName"
					) {
						found = arg.name.text;
					}
				}
			}
		}
		if (!found) ts.forEachChild(node, visit);
	}
	visit(sf);
	return found;
}

/** Find `const parametersSchema = Koi.object({...})` and return its fields */
function extractKoiParameterFields(
	sf: ts.SourceFile,
): BlockParameterField[] | null {
	let result: BlockParameterField[] | null = null;

	function visit(node: ts.Node): void {
		if (result) return;
		if (
			ts.isVariableDeclaration(node) &&
			ts.isIdentifier(node.name) &&
			node.name.text === "parametersSchema" &&
			node.initializer
		) {
			const obj = findKoiObjectArg(node.initializer);
			if (obj) {
				result = obj.properties
					.filter(ts.isPropertyAssignment)
					.filter((p) => ts.isIdentifier(p.name))
					.map((p) => {
						const key = (p.name as ts.Identifier).text;
						const info = classifyKoiExpression(p.initializer, key);
						return { key, ...info };
					});
			}
		}
		ts.forEachChild(node, visit);
	}
	visit(sf);
	return result;
}

/** Find the first `Koi.object({...})` call reachable from `node` */
function findKoiObjectArg(
	node: ts.Expression,
): ts.ObjectLiteralExpression | null {
	// Unwrap awaits: `await Koi.object({...})` shouldn't appear but be safe
	let current: ts.Expression = node;
	while (ts.isAwaitExpression(current)) current = current.expression;

	if (
		ts.isCallExpression(current) &&
		ts.isPropertyAccessExpression(current.expression) &&
		ts.isIdentifier(current.expression.expression) &&
		current.expression.expression.text === "Koi" &&
		current.expression.name.text === "object" &&
		current.arguments.length > 0 &&
		ts.isObjectLiteralExpression(current.arguments[0])
	) {
		return current.arguments[0] as ts.ObjectLiteralExpression;
	}
	return null;
}

interface KoiFieldInfo {
	type: ParameterFieldType;
	enumValues?: string[];
	required: boolean;
}

/** Classify the Koi schema chain for one object property. */
function classifyKoiExpression(
	node: ts.Expression,
	fieldName: string,
): KoiFieldInfo {
	// Collect all method calls in the chain (outermost first)
	const chain = collectKoiMethodChain(node);
	const methodNames = chain.map((m) => m.name);
	const isOptional = methodNames.includes("optional");
	const required = !isOptional;

	// Find .valid(...) call for enum values
	const validEntry = chain.find((m) => m.name === "valid");
	const validValues = validEntry ? extractKoiValidValues(validEntry.args) : [];

	// Root method is the last in the chain (innermost call)
	const rootMethod = chain.at(-1)?.name ?? "unknown";
	const rootObject = chain.at(-1)?.calledOn ?? "unknown";

	// ── Koi.string() ────────────────────────────────────────
	if (rootMethod === "string" && rootObject === "Koi") {
		if (methodNames.includes("uuid")) {
			return uuidFieldByName(fieldName, required);
		}
		if (validValues.length > 0) {
			return { type: "enum", enumValues: validValues, required };
		}
		return { type: "string", required };
	}

	// ── Koi.number() ────────────────────────────────────────
	if (rootMethod === "number" && rootObject === "Koi") {
		return { type: "number", required };
	}

	// ── Koi.boolean() ───────────────────────────────────────
	if (rootMethod === "boolean" && rootObject === "Koi") {
		return { type: "boolean", required };
	}

	// ── Koi.array().items(...) ───────────────────────────────
	if (rootMethod === "array" && rootObject === "Koi") {
		const itemsEntry = chain.find((m) => m.name === "items");
		if (itemsEntry && itemsEntry.args.length > 0) {
			const innerInfo = classifyKoiExpression(itemsEntry.args[0], fieldName);
			switch (innerInfo.type) {
				case "activity-id":
					return { type: "activity-id-array", required };
				case "step-id":
					return { type: "step-id-array", required };
				case "uuid":
					return { type: "uuid-array", required };
				case "string":
					return { type: "string-array", required };
				case "enum":
					return { type: "string-array", required };
				default:
					return { type: "unknown", required };
			}
		}
		return { type: "string-array", required };
	}

	// ── Koi.koi().enum(...) ─────────────────────────────────
	// The chain starts with Koi.koi() and has an enum() call
	if (methodNames.includes("enum")) {
		if (validValues.length > 0) {
			return { type: "enum", enumValues: validValues, required };
		}
		return { type: "enum", enumValues: [], required };
	}

	// ── Koi.object() ────────────────────────────────────────
	if (rootMethod === "object" && rootObject === "Koi") {
		return { type: "object", required };
	}

	// ── Koi.any() ───────────────────────────────────────────
	if (rootMethod === "any") {
		return { type: "unknown", required };
	}

	// ── Koi.alternatives() ──────────────────────────────────
	if (rootMethod === "alternatives") {
		return { type: "unknown", required };
	}

	return { type: "unknown", required };
}

function uuidFieldByName(fieldName: string, required: boolean): KoiFieldInfo {
	const lower = fieldName.toLowerCase();
	if (lower.includes("activity")) return { type: "activity-id", required };
	if (lower.includes("step")) return { type: "step-id", required };
	return { type: "uuid", required };
}

interface KoiMethodCall {
	name: string;
	calledOn: string; // identifier text of the immediate receiver, or 'call'
	args: ts.Expression[];
}

/**
 * Walk the method-call chain and return calls from innermost to outermost.
 * e.g. `Koi.string().uuid().required()` → [{name:'string',calledOn:'Koi',...}, {name:'uuid',...}, {name:'required',...}]
 */
function collectKoiMethodChain(node: ts.Expression): KoiMethodCall[] {
	const calls: KoiMethodCall[] = [];
	let current: ts.Expression = node;

	while (ts.isCallExpression(current)) {
		const expr = current.expression;
		if (!ts.isPropertyAccessExpression(expr)) break;

		const methodName = expr.name.text;
		const receiver = expr.expression;
		const calledOn = ts.isIdentifier(receiver)
			? receiver.text
			: ts.isCallExpression(receiver)
				? "call"
				: "other";

		calls.unshift({
			name: methodName,
			calledOn,
			args: Array.from(current.arguments),
		});
		current = receiver;
	}

	return calls;
}

function extractKoiValidValues(args: ts.Expression[]): string[] {
	return args.flatMap((arg) => {
		// Spread: ...someArray  — skip
		if (ts.isSpreadElement(arg)) return [];
		// String literal: 'days'
		if (ts.isStringLiteral(arg)) return [arg.text];
		// Enum member access: CustomControlCode.OSASConsult → 'OSASConsult'
		if (ts.isPropertyAccessExpression(arg)) return [arg.name.text];
		return [];
	});
}
