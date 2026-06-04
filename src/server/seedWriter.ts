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

		// ── Special case: 'parameters' object replacement ────────────────────
		// Handle before the scalar field loop because the whole object literal
		// node must be replaced, not just a single primitive value.
		if (change.fields.parameters !== undefined) {
			const paramProp = obj.properties.find(
				(p) =>
					ts.isPropertyAssignment(p) &&
					ts.isIdentifier(p.name) &&
					p.name.text === "parameters",
			) as ts.PropertyAssignment | undefined;

			const newParamsText = formatParametersValue(change.fields.parameters);

			if (paramProp) {
				// Replace the existing initializer (the whole object/null expression)
				replacements.push({
					start: paramProp.initializer.getStart(sourceFile),
					end: paramProp.initializer.getEnd(),
					newText: newParamsText,
				});
			} else {
				// Insert as a new property after the last existing property
				const lastProp = obj.properties[obj.properties.length - 1];
				const insertPos = lastProp
					? lastProp.getEnd()
					: obj.getStart(sourceFile) + 1;
				const indent = detectIndent(source, obj);
				replacements.push({
					start: insertPos,
					end: insertPos,
					newText: `,\n${indent}parameters: ${newParamsText}`,
				});
			}
		}

		// ── Scalar field loop ────────────────────────────────────────────────
		for (const [field, value] of Object.entries(change.fields) as [
			keyof EditableStepFields,
			unknown,
		][]) {
			if (value === undefined) continue;
			// parameters already handled above
			if (field === "parameters") continue;

			const existing = obj.properties.find(
				(p) =>
					ts.isPropertyAssignment(p) &&
					ts.isIdentifier(p.name) &&
					p.name.text === field,
			) as ts.PropertyAssignment | undefined;

			const newText = formatPropertyValue(value);

			if (existing) {
				// Only replace StringLiteral, NumericLiteral, or NullKeyword nodes —
				// skip template literals and other complex expressions.
				const init = existing.initializer;
				const replaceable =
					ts.isStringLiteral(init) ||
					ts.isNumericLiteral(init) ||
					init.kind === ts.SyntaxKind.NullKeyword ||
					init.kind === ts.SyntaxKind.TrueKeyword ||
					init.kind === ts.SyntaxKind.FalseKeyword;

				if (replaceable) {
					replacements.push({
						start: init.getStart(sourceFile),
						end: init.getEnd(),
						newText,
					});
				}
			} else {
				// Insert new property after the last property
				const lastProp = obj.properties[obj.properties.length - 1];
				const insertPos = lastProp
					? lastProp.getEnd()
					: obj.getStart(sourceFile) + 1;
				const indent = detectIndent(source, obj);
				replacements.push({
					start: insertPos,
					end: insertPos,
					newText: `,\n${indent}${field}: ${newText}`,
				});
			}
		}
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
	if (obj.properties.length === 0) return "    ";
	const firstPropStart = obj.properties[0].getFullStart();
	const lineStart = source.lastIndexOf("\n", firstPropStart) + 1;
	const match = source.slice(lineStart).match(/^(\s+)/);
	return match ? match[1] : "    ";
}
