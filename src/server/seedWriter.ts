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

		for (const [field, value] of Object.entries(change.fields) as [
			keyof EditableStepFields,
			unknown,
		][]) {
			if (value === undefined) continue;

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

function detectIndent(source: string, obj: ts.ObjectLiteralExpression): string {
	if (obj.properties.length === 0) return "    ";
	const firstPropStart = obj.properties[0].getFullStart();
	const lineStart = source.lastIndexOf("\n", firstPropStart) + 1;
	const match = source.slice(lineStart).match(/^(\s+)/);
	return match ? match[1] : "    ";
}
