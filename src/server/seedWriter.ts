import fs from "node:fs";
import ts from "typescript";
import type { StepPendingChange, EditableStepFields } from "../shared/types.js";

type Replacement = { start: number; end: number; newText: string };

export function patchSeedFile(
	filePath: string,
	changes: StepPendingChange[],
): void {
	if (changes.length === 0) return;

	const source = fs.readFileSync(filePath, "utf-8");
	const sourceFile = ts.createSourceFile(
		filePath,
		source,
		ts.ScriptTarget.ES2022,
		/* setParentNodes */ true,
	);

	const replacements: Replacement[] = [];

	function visitNode(node: ts.Node): void {
		if (ts.isCallExpression(node) && node.arguments.length > 0) {
			const expr = node.expression;
			const isCreateStep =
				(ts.isPropertyAccessExpression(expr) &&
					expr.name.text === "createStep") ||
				(ts.isIdentifier(expr) && expr.text === "createStep");

			if (isCreateStep && ts.isObjectLiteralExpression(node.arguments[0])) {
				processStepObject(node.arguments[0] as ts.ObjectLiteralExpression);
			}
		}
		ts.forEachChild(node, visitNode);
	}

	function processStepObject(obj: ts.ObjectLiteralExpression): void {
		// Identify the step by its 'name' property
		const nameProp = findStringProp(obj, "name");
		if (!nameProp) return;

		const change = changes.find((c) => c.stepName === nameProp);
		if (!change) return;

		// Regenerate the entire object argument from scratch using canonical
		// field ordering and formatting rules instead of patching individual
		// properties — avoids formatting drift across multiple saves.
		const newObjText = regenerateStepObject(obj, source, sourceFile, change);

		replacements.push({
			start: obj.getStart(sourceFile),
			end: obj.getEnd(),
			newText: newObjText,
		});
	}

	function findStringProp(
		obj: ts.ObjectLiteralExpression,
		propName: string,
	): string | null {
		for (const p of obj.properties) {
			if (
				ts.isPropertyAssignment(p) &&
				ts.isIdentifier(p.name) &&
				p.name.text === propName &&
				(ts.isStringLiteral(p.initializer) ||
					ts.isNoSubstitutionTemplateLiteral(p.initializer))
			) {
				return p.initializer.text;
			}
		}
		return null;
	}

	visitNode(sourceFile);

	if (replacements.length === 0) return;

	// Apply replacements from back to front to preserve positions
	replacements.sort((a, b) => b.start - a.start);

	let result = source;
	for (const r of replacements) {
		result = result.slice(0, r.start) + r.newText + result.slice(r.end);
	}

	fs.writeFileSync(filePath, result, "utf-8");
}

// ─────────────────────────────────────────────────────────────
// Whole-object regeneration
// ─────────────────────────────────────────────────────────────

/**
 * Canonical property order for createStep() objects.
 * Properties not in this list (rare extras) are appended at the end.
 */
const CANONICAL_ORDER = [
	"activities",
	"block",
	"id",
	"name",
	"label",
	"type",
	"allowedPerformer",
	"nextSteps",
	"synchronousNextSteps",
	"parameters",
	"performerNeedsTask",
	"x",
	"y",
] as const;

/**
 * Properties whose values are complex expressions (member access, identifiers,
 * call expressions, array literals containing identifiers, etc.) that must
 * be preserved verbatim from the original source.  They are never regenerated
 * from change.fields even if a change is present for them.
 */
const ALWAYS_VERBATIM = new Set([
	"activities",
	"block",
	"id",
	"nextSteps",
	"synchronousNextSteps",
]);

const CANONICAL_SET = new Set<string>(CANONICAL_ORDER);

/**
 * Regenerates the entire `createStep({...})` object argument from scratch,
 * merging the original properties with the pending change.
 *
 * - Properties in ALWAYS_VERBATIM are always copied verbatim from the source.
 * - Properties in change.fields (and not verbatim) are replaced with formatted values.
 * - All other existing properties are copied verbatim.
 * - Property order follows CANONICAL_ORDER; extra properties are appended.
 */
function regenerateStepObject(
	obj: ts.ObjectLiteralExpression,
	source: string,
	sourceFile: ts.SourceFile,
	change: StepPendingChange,
): string {
	const propIndent = detectIndent(source, obj);
	// Outer indent: one 4-space level up from property indent
	const outerIndent = propIndent.length >= 4 ? propIndent.slice(4) : "";

	// Build a map of existing property assignments
	const existingProps = new Map<string, ts.PropertyAssignment>();
	for (const p of obj.properties) {
		if (ts.isPropertyAssignment(p) && ts.isIdentifier(p.name)) {
			existingProps.set(p.name.text, p);
		}
	}

	// Collect extra properties not in canonical order (to append at end)
	const extraLines: string[] = [];
	for (const p of obj.properties) {
		if (ts.isPropertyAssignment(p) && ts.isIdentifier(p.name)) {
			if (!CANONICAL_SET.has(p.name.text)) {
				const text = source.slice(p.getStart(sourceFile), p.getEnd());
				extraLines.push(`${propIndent}${text},`);
			}
		}
	}

	const changedFields = change.fields as Record<string, unknown>;
	const lines: string[] = [];

	for (const propName of CANONICAL_ORDER) {
		const changedValue = changedFields[propName];
		const hasChange = changedValue !== undefined;
		const existing = existingProps.get(propName);

		if (ALWAYS_VERBATIM.has(propName)) {
			// Always copy verbatim if present; ignore any change value
			if (existing) {
				const text = source.slice(
					existing.getStart(sourceFile),
					existing.getEnd(),
				);
				lines.push(`${propIndent}${text},`);
			}
		} else if (hasChange) {
			// Use the new formatted value
			const formatted =
				propName === "parameters"
					? formatParametersValue(
							changedValue as Record<string, unknown> | null,
						)
					: formatPropertyValue(changedValue);
			lines.push(`${propIndent}${propName}: ${formatted},`);
		} else if (existing) {
			// Copy verbatim from source (preserves complex original values)
			const text = source.slice(
				existing.getStart(sourceFile),
				existing.getEnd(),
			);
			lines.push(`${propIndent}${text},`);
		}
		// else: not present and no change → omit
	}

	// Append extra properties
	for (const extraLine of extraLines) {
		lines.push(extraLine);
	}

	return `{\n${lines.join("\n")}\n${outerIndent}}`;
}

// ─────────────────────────────────────────────────────────────
// Value formatters
// ─────────────────────────────────────────────────────────────

function formatPropertyValue(value: unknown): string {
	if (typeof value === "number") return String(value);
	if (value === null) return "null";
	if (typeof value === "string") {
		// Use single quotes; escape backslashes and single quotes in the value
		const escaped = value.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
		return `'${escaped}'`;
	}
	if (typeof value === "boolean") return value ? "true" : "false";
	return JSON.stringify(value);
}

/**
 * Formats a parameters object (or null) as TypeScript source text that can be
 * inserted directly into a seed file.
 *
 * Uses single-quoted strings, numeric literals, booleans, and recursive
 * object / array formatting — matching the style of hand-written seed files.
 */
function formatParametersValue(params: Record<string, unknown> | null): string {
	if (params === null) return "null";
	return formatObjectLiteral(params, /* depth */ 2);
}

function formatObjectLiteral(
	obj: Record<string, unknown>,
	depth: number,
): string {
	const entries = Object.entries(obj);
	if (entries.length === 0) return "{}";
	const indent = "    ".repeat(depth);
	const innerIndent = "    ".repeat(depth + 1);
	const lines = entries.map(
		([k, v]) => `${innerIndent}${k}: ${formatAnyValue(v, depth + 1)}`,
	);
	return `{\n${lines.join(",\n")},\n${indent}}`;
}

function formatAnyValue(v: unknown, depth: number): string {
	if (v === null) return "null";
	if (typeof v === "string") {
		const escaped = v.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
		return `'${escaped}'`;
	}
	if (typeof v === "number") return String(v);
	if (typeof v === "boolean") return v ? "true" : "false";
	if (Array.isArray(v)) {
		if (v.length === 0) return "[]";
		const indent = "    ".repeat(depth);
		const innerIndent = "    ".repeat(depth + 1);
		const items = v.map(
			(item) => `${innerIndent}${formatAnyValue(item, depth + 1)}`,
		);
		return `[\n${items.join(",\n")},\n${indent}]`;
	}
	if (typeof v === "object" && v !== null) {
		return formatObjectLiteral(v as Record<string, unknown>, depth);
	}
	return JSON.stringify(v);
}

function detectIndent(source: string, obj: ts.ObjectLiteralExpression): string {
	if (obj.properties.length === 0) return "        ";
	const firstPropStart = obj.properties[0].getFullStart();
	const lineStart = source.lastIndexOf("\n", firstPropStart) + 1;
	const match = source.slice(lineStart).match(/^(\s+)/);
	return match ? match[1] : "        ";
}
