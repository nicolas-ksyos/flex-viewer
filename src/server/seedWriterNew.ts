/**
 * seedWriterNew.ts
 *
 * Appends brand-new steps, connections, and disable-transitions to an
 * existing TypeScript seed file in-place.
 *
 * Companion to seedWriter.ts (which handles edits to existing steps).
 *
 * Insertion strategy
 * ──────────────────
 * • New createStep() declarations are inserted immediately after the last
 *   existing createStep() statement in the file.
 * • New nextSteps / synchronousNextSteps entries are appended to the
 *   appropriate array in the existing createStep() call.
 * • New TransitionType.disable entries are appended to the existing
 *   generateTransitions([…]) call.  If no such call exists, a new one is
 *   inserted after the last createStep().
 *
 * All position-based string manipulations are collected up-front and
 * applied back-to-front so that earlier offsets are not invalidated.
 */

import fs from "node:fs";
import ts from "typescript";
import type {
	NewStepDraft,
	NewConnectionDraft,
	NewTransitionDraft,
	DeletedBlockDraft,
	RemovedConnectionDraft,
} from "../shared/types.js";

// ─────────────────────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────────────────────

/**
 * Appends new steps, connections, and disable-transitions to `filePath`.
 *
 * @param filePath       Absolute path to the seed file.
 * @param newSteps       Brand-new createStep() drafts.
 * @param newConnections nextSteps / synchronousNextSteps additions.
 * @param newTransitions TransitionType.disable additions.
 * @param stepVarNames   Map<stepId | tempId, variableName> for every step
 *                       (existing + new).  New step tempIds must be included
 *                       so that cross-references between new steps resolve.
 */
export function appendNewItemsToSeedFile(
	filePath: string,
	newSteps: NewStepDraft[],
	newConnections: NewConnectionDraft[],
	newTransitions: NewTransitionDraft[],
	stepVarNames: Map<string, string>,
): void {
	const hasWork =
		newSteps.length > 0 ||
		newConnections.length > 0 ||
		newTransitions.length > 0;
	if (!hasWork) return;

	// Register new-step tempIds in the map so references between new steps work
	for (const draft of newSteps) {
		stepVarNames.set(draft.tempId, draft.variableName);
	}

	let source = fs.readFileSync(filePath, "utf-8");

	// ── 1. Insert new createStep() declarations ───────────────
	if (newSteps.length > 0) {
		source = insertNewSteps(source, filePath, newSteps, stepVarNames);
	}

	// ── 2. Append to existing nextSteps / synchronousNextSteps ─
	// Includes both explicit NewConnectionDrafts AND prevStepIds from new steps.
	const connectionPatches: Array<{
		fromStepId: string;
		toVarNames: string[];
		synchronous: boolean;
	}> = [];

	// From NewConnectionDraft
	for (const conn of newConnections) {
		const toVarNames = conn.toStepIds
			.map((id) => stepVarNames.get(id))
			.filter((v): v is string => Boolean(v));
		if (toVarNames.length > 0) {
			connectionPatches.push({
				fromStepId: conn.fromStepId,
				toVarNames,
				synchronous: conn.synchronous,
			});
		}
	}

	// From prevStepIds on new-step drafts (existing steps that should point TO the new step)
	for (const draft of newSteps) {
		if (draft.fields.prevStepIds && draft.fields.prevStepIds.length > 0) {
			for (const prevId of draft.fields.prevStepIds) {
				connectionPatches.push({
					fromStepId: prevId,
					toVarNames: [draft.variableName],
					synchronous: false,
				});
			}
		}
	}

	for (const patch of connectionPatches) {
		const fromVarName = stepVarNames.get(patch.fromStepId);
		if (!fromVarName) continue;
		// Re-parse after each modification (source may have grown)
		source = appendToNextStepsArray(
			source,
			filePath,
			fromVarName,
			patch.toVarNames,
			patch.synchronous,
		);
	}

	// ── 3. Append disable-transitions to generateTransitions() ─
	if (newTransitions.length > 0) {
		source = appendDisableTransitions(
			source,
			filePath,
			newTransitions,
			stepVarNames,
		);
	}

	fs.writeFileSync(filePath, source, "utf-8");
}

// ─────────────────────────────────────────────────────────────
// Step insertion
// ─────────────────────────────────────────────────────────────

function insertNewSteps(
	source: string,
	filePath: string,
	drafts: NewStepDraft[],
	stepVarNames: Map<string, string>,
): string {
	const sorted = topologicalSort(drafts);
	const insertionPoint = findLastCreateStepEnd(source, filePath);

	if (insertionPoint < 0) {
		// No existing createStep found — append at end of file (fallback)
		const code = sorted.map((d) => generateStepCode(d, stepVarNames)).join("");
		return source + code;
	}

	const code = sorted.map((d) => generateStepCode(d, stepVarNames)).join("");
	return source.slice(0, insertionPoint) + code + source.slice(insertionPoint);
}

/**
 * Returns the source-text offset of the character AFTER the last
 * createStep() statement's closing semicolon / brace.
 */
function findLastCreateStepEnd(source: string, filePath: string): number {
	const sf = ts.createSourceFile(
		filePath,
		source,
		ts.ScriptTarget.ES2022,
		/* setParentNodes */ true,
	);
	let lastEnd = -1;

	function visit(node: ts.Node): void {
		if (ts.isCallExpression(node)) {
			const expr = node.expression;
			const isCreateStep =
				(ts.isPropertyAccessExpression(expr) &&
					expr.name.text === "createStep") ||
				(ts.isIdentifier(expr) && expr.text === "createStep");

			if (isCreateStep) {
				// Walk up to the nearest Statement to capture the full declaration
				let stmtEnd = node.getEnd();
				let cur: ts.Node = node;
				while (cur.parent) {
					cur = cur.parent;
					if (ts.isStatement(cur)) {
						stmtEnd = cur.getEnd();
						break;
					}
				}
				if (stmtEnd > lastEnd) lastEnd = stmtEnd;
			}
		}
		ts.forEachChild(node, visit);
	}

	visit(sf);
	return lastEnd;
}

/**
 * Generate the TypeScript source text for a single new createStep() call.
 * Indented with 4 spaces to match seed-file conventions.
 */
function generateStepCode(
	draft: NewStepDraft,
	_stepVarNames: Map<string, string>,
): string {
	const f = draft.fields;
	const I = "    "; // 4-space indent (function body level)
	const PI = "        "; // 8-space indent (property level)
	const lines: string[] = [];

	lines.push("");
	lines.push("");
	lines.push(`${I}// ${f.name}`);
	lines.push(
		`${I}const ${draft.variableName} = await serviceCreationHelper.createStep({`,
	);
	lines.push(`${PI}block: BlockName.${f.block},`);
	lines.push(`${PI}name: '${escSingleQuote(f.name)}',`);

	if (f.label && f.label !== f.name) {
		lines.push(`${PI}label: '${escSingleQuote(f.label)}',`);
	}
	if (f.allowedPerformer) {
		lines.push(
			`${PI}allowedPerformer: '${escSingleQuote(f.allowedPerformer)}',`,
		);
	}
	if (f.performerNeedsTask) {
		lines.push(`${PI}performerNeedsTask: true,`);
	}

	// parameters — emit if provided
	if (f.parameters && Object.keys(f.parameters).length > 0) {
		lines.push(`${PI}parameters: ${formatParamObject(f.parameters, 2)},`);
	}

	// nextStepIds / synchronousNextStepIds are intentionally NOT inlined here.
	// App.tsx creates explicit NewConnectionDraft entries for them, which are
	// written via appendToNextStepsArray after the step is inserted. Inlining
	// here would cause duplicate entries and requires stepVarNames lookups that
	// may not yet be available at code-generation time.

	lines.push(`${PI}x: ${f.x},`);
	lines.push(`${PI}y: ${f.y},`);
	lines.push(`${I}});`);

	return lines.join("\n");
}

// ─────────────────────────────────────────────────────────────
// nextSteps / synchronousNextSteps array patching
// ─────────────────────────────────────────────────────────────

/**
 * Appends `varNamesToAppend` to the `nextSteps` (or `synchronousNextSteps`)
 * array of the step identified by `stepVarName`.  If the property is absent,
 * it is inserted as a new property.  Returns the updated source.
 */
function appendToNextStepsArray(
	source: string,
	filePath: string,
	stepVarName: string,
	varNamesToAppend: string[],
	synchronous: boolean,
): string {
	if (varNamesToAppend.length === 0) return source;

	const propName = synchronous ? "synchronousNextSteps" : "nextSteps";
	const sf = ts.createSourceFile(
		filePath,
		source,
		ts.ScriptTarget.ES2022,
		/* setParentNodes */ true,
	);

	let insertPos = -1;
	let insertText = "";

	function findCreateStepForVar(node: ts.Node): void {
		if (insertPos >= 0) return; // already found

		// We look for a variable declaration: const {stepVarName} = ...
		if (
			ts.isVariableDeclaration(node) &&
			ts.isIdentifier(node.name) &&
			node.name.text === stepVarName &&
			node.initializer
		) {
			// Find the createStep call within the initializer — use a ref box so
			// TypeScript's strict control-flow analysis doesn't widen the type.
			const argRef: { value: ts.ObjectLiteralExpression | null } = {
				value: null,
			};
			function findArg(n: ts.Node): void {
				if (argRef.value) return;
				if (ts.isCallExpression(n)) {
					const expr = n.expression;
					const isCS =
						(ts.isPropertyAccessExpression(expr) &&
							expr.name.text === "createStep") ||
						(ts.isIdentifier(expr) && expr.text === "createStep");
					if (
						isCS &&
						n.arguments.length > 0 &&
						ts.isObjectLiteralExpression(n.arguments[0])
					) {
						argRef.value = n.arguments[0] as ts.ObjectLiteralExpression;
					}
				}
				ts.forEachChild(n, findArg);
			}
			findArg(node.initializer);

			const obj = argRef.value;
			if (!obj) return;

			// Find the property
			const prop = obj.properties.find(
				(p): p is ts.PropertyAssignment =>
					ts.isPropertyAssignment(p) &&
					ts.isIdentifier(p.name) &&
					p.name.text === propName,
			);

			const newVarsText = varNamesToAppend.join(", ");

			if (prop && ts.isArrayLiteralExpression(prop.initializer)) {
				const arr = prop.initializer;
				if (arr.elements.length === 0) {
					// nextSteps: [] → nextSteps: [newVar]
					insertPos = arr.getStart(sf) + 1; // just after '['
					insertText = newVarsText;
				} else {
					// nextSteps: [existing] → nextSteps: [existing, newVar]
					const lastEl = arr.elements[arr.elements.length - 1];
					insertPos = lastEl.getEnd();
					insertText = ", " + newVarsText;
				}
			} else if (!prop) {
				// Property doesn't exist — insert as new property after last prop
				const lastProp = obj.properties[obj.properties.length - 1];
				if (lastProp) {
					const indent = detectIndent(source, obj);
					insertPos = lastProp.getEnd();
					insertText = `,\n${indent}${propName}: [${newVarsText}]`;
				} else {
					// Empty object — insert as first property
					const indent = "        "; // default 8 spaces
					insertPos = obj.getStart(sf) + 1;
					insertText = `\n${indent}${propName}: [${newVarsText}],\n    `;
				}
			}
			// If prop exists but initializer is not an array literal — skip (complex expression)
		}

		ts.forEachChild(node, findCreateStepForVar);
	}

	findCreateStepForVar(sf);

	if (insertPos < 0) return source; // step not found or couldn't modify

	return source.slice(0, insertPos) + insertText + source.slice(insertPos);
}

// ─────────────────────────────────────────────────────────────
// generateTransitions patching (disable transitions)
// ─────────────────────────────────────────────────────────────

/**
 * Appends new `{ fromStep, toStep, type: TransitionType.disable }` objects
 * to the existing `generateTransitions([…])` call.
 *
 * If no generateTransitions call is found, inserts one after the last
 * createStep() declaration.
 */
function appendDisableTransitions(
	source: string,
	filePath: string,
	drafts: NewTransitionDraft[],
	stepVarNames: Map<string, string>,
): string {
	// Build transition object strings from the drafts
	// Each string is self-contained with the correct 8-space indent so they
	// can be joined with ',\n' without adding extra leading spaces.
	const transitionObjs: string[] = [];
	for (const draft of drafts) {
		const fromVar = stepVarNames.get(draft.fromStepId);
		if (!fromVar) continue;
		for (const toId of draft.toStepIds) {
			const toVar = stepVarNames.get(toId);
			if (!toVar) continue;
			transitionObjs.push(
				`        {\n            fromStep: ${fromVar},\n            toStep: ${toVar},\n            type: TransitionType.disable,\n        }`,
			);
		}
	}
	if (transitionObjs.length === 0) return source;

	const sf = ts.createSourceFile(
		filePath,
		source,
		ts.ScriptTarget.ES2022,
		/* setParentNodes */ true,
	);

	let insertPos = -1;
	let insertText = "";
	let foundGenerateTransitions = false;

	function visit(node: ts.Node): void {
		if (foundGenerateTransitions) return;
		if (ts.isCallExpression(node)) {
			const expr = node.expression;
			const isGenTrans =
				ts.isPropertyAccessExpression(expr) &&
				expr.name.text === "generateTransitions";

			if (
				isGenTrans &&
				node.arguments.length > 0 &&
				ts.isArrayLiteralExpression(node.arguments[0])
			) {
				foundGenerateTransitions = true;
				const arr = node.arguments[0] as ts.ArrayLiteralExpression;

				if (arr.elements.length === 0) {
					// generateTransitions([]) → insert all objects
					insertPos = arr.getStart(sf) + 1;
					insertText = "\n" + transitionObjs.join(",\n") + "\n    ";
				} else {
					// append after last element
					const lastEl = arr.elements[arr.elements.length - 1];
					insertPos = lastEl.getEnd();
					insertText = ",\n" + transitionObjs.join(",\n");
				}
			}
		}
		ts.forEachChild(node, visit);
	}

	visit(sf);

	if (!foundGenerateTransitions) {
		// No generateTransitions call found — create one after last createStep
		const lastStepEnd = findLastCreateStepEnd(source, filePath);
		if (lastStepEnd < 0) return source;

		const I = "    "; // 4-space indent
		const body =
			"\n\n" +
			I +
			"// Disable transitions added by flex-viewer\n" +
			I +
			"await serviceCreationHelper.generateTransitions([\n" +
			transitionObjs.join(",\n") +
			"\n    ]);";

		return source.slice(0, lastStepEnd) + body + source.slice(lastStepEnd);

		return source.slice(0, lastStepEnd) + body + source.slice(lastStepEnd);
	}

	if (insertPos < 0) return source;
	return source.slice(0, insertPos) + insertText + source.slice(insertPos);
}

// ─────────────────────────────────────────────────────────────
// Topological sort
// ─────────────────────────────────────────────────────────────

/**
 * Sort new-step drafts so that steps referenced in other steps' nextStepIds
 * are declared first (bottom-up, matching seed-file convention).
 */
function topologicalSort(drafts: NewStepDraft[]): NewStepDraft[] {
	if (drafts.length <= 1) return [...drafts];

	const idToIdx = new Map<string, number>(drafts.map((d, i) => [d.tempId, i]));

	// in-degree and adjacency: if step A references step B in its nextStepIds,
	// then B must come before A → edge B→A (B is a dependency of A).
	const inDegree = new Array<number>(drafts.length).fill(0);
	const adj: number[][] = drafts.map(() => [] as number[]);

	for (let i = 0; i < drafts.length; i++) {
		const allRefs = [
			...(drafts[i].fields.nextStepIds ?? []),
			...(drafts[i].fields.synchronousNextStepIds ?? []),
		];
		for (const refId of allRefs) {
			const j = idToIdx.get(refId);
			if (j !== undefined) {
				// j must come before i
				adj[j].push(i);
				inDegree[i]++;
			}
		}
	}

	const queue: number[] = [];
	for (let i = 0; i < drafts.length; i++) {
		if (inDegree[i] === 0) queue.push(i);
	}

	const result: NewStepDraft[] = [];
	while (queue.length > 0) {
		const i = queue.shift()!;
		result.push(drafts[i]);
		for (const j of adj[i]) {
			if (--inDegree[j] === 0) queue.push(j);
		}
	}

	// If cyclic references remain, just append them in original order
	const placed = new Set(result.map((d) => d.tempId));
	for (const d of drafts) {
		if (!placed.has(d.tempId)) result.push(d);
	}

	return result;
}

// ─────────────────────────────────────────────────────────────
// Utilities
// ─────────────────────────────────────────────────────────────

function escSingleQuote(s: string): string {
	return s.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
}

/**
 * Detect the indentation of the first property in an object literal.
 * Falls back to 8 spaces if it can't be determined.
 */
function detectIndent(source: string, obj: ts.ObjectLiteralExpression): string {
	if (obj.properties.length === 0) return "        ";
	const firstStart = obj.properties[0].getFullStart();
	const lineStart = source.lastIndexOf("\n", firstStart) + 1;
	const match = source.slice(lineStart).match(/^(\s+)/);
	return match ? match[1] : "        ";
}

// ─────────────────────────────────────────────────────────────
// Parameter object formatting
// ─────────────────────────────────────────────────────────────

function formatParamObject(
	obj: Record<string, unknown>,
	depth: number,
): string {
	const indent = "    ".repeat(depth);
	const inner = "    ".repeat(depth + 1);
	const entries = Object.entries(obj);
	if (entries.length === 0) return "{}";
	const lines = entries.map(
		([k, v]) => `${inner}${k}: ${formatParamValue(v, depth + 1)}`,
	);
	return `{\n${lines.join(",\n")},\n${indent}}`;
}

function formatParamValue(v: unknown, depth: number): string {
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
		const items = v.map(
			(item) =>
				`${"    ".repeat(depth + 1)}${formatParamValue(item, depth + 1)}`,
		);
		return `[\n${items.join(",\n")},\n${indent}]`;
	}
	if (typeof v === "object" && v !== null) {
		return formatParamObject(v as Record<string, unknown>, depth);
	}
	return JSON.stringify(v);
}

// ─────────────────────────────────────────────────────────────
// Public API — block deletion and connection removal
// ─────────────────────────────────────────────────────────────

type Replacement = { start: number; end: number; text: string };

/**
 * Deletes step declarations and removes all their references from the seed
 * file.  Also removes specific connection entries.
 *
 * Operations are applied in a single pass (all replacements collected
 * back-to-front, then applied) to avoid offset invalidation.
 */
export function deleteBlocksAndRemoveConnections(
	filePath: string,
	deletedSteps: DeletedBlockDraft[],
	removedConnections: RemovedConnectionDraft[],
): void {
	if (deletedSteps.length === 0 && removedConnections.length === 0) return;

	let source = fs.readFileSync(filePath, "utf-8");

	// 1. Remove specific connection entries first (before step declarations
	//    are deleted, so the file structure is still intact for lookups).
	for (const removal of removedConnections) {
		source = removeConnectionEntry(source, filePath, removal);
	}

	// 2. For each deleted step: remove its declaration, then scrub every
	//    reference from other steps' nextSteps / synchronousNextSteps arrays
	//    and from generateTransitions() calls.
	for (const deleted of deletedSteps) {
		source = deleteStepDeclaration(source, filePath, deleted.variableName);
		source = removeVarFromAllNextSteps(source, filePath, deleted.variableName);
	}

	fs.writeFileSync(filePath, source, "utf-8");
}

// ─────────────────────────────────────────────────────────────
// deleteStepDeclaration
// ─────────────────────────────────────────────────────────────

/**
 * Removes the entire VariableStatement that declares `varName`.
 * Includes leading whitespace/newlines (getFullStart → getEnd).
 */
function deleteStepDeclaration(
	source: string,
	filePath: string,
	varName: string,
): string {
	const sf = ts.createSourceFile(
		filePath,
		source,
		ts.ScriptTarget.ES2022,
		true,
	);

	let stmtStart = -1;
	let stmtEnd = -1;

	function visit(node: ts.Node): void {
		if (stmtStart >= 0) return;
		// Look for: const varName = ...
		if (ts.isVariableStatement(node)) {
			for (const decl of node.declarationList.declarations) {
				if (ts.isIdentifier(decl.name) && decl.name.text === varName) {
					stmtStart = node.getFullStart();
					stmtEnd = node.getEnd();
					return;
				}
			}
		}
		ts.forEachChild(node, visit);
	}

	visit(sf);

	if (stmtStart < 0) return source; // variable not found
	return source.slice(0, stmtStart) + source.slice(stmtEnd);
}

// ─────────────────────────────────────────────────────────────
// removeVarFromAllNextSteps
// ─────────────────────────────────────────────────────────────

/**
 * Finds every `nextSteps`, `synchronousNextSteps` array literal in the file
 * AND every `generateTransitions([...])` array and removes all elements that
 * reference `varName` (either as a bare identifier or as the `step:` / `fromStep:` /
 * `toStep:` property inside an object literal).
 */
function removeVarFromAllNextSteps(
	source: string,
	filePath: string,
	varName: string,
): string {
	// Collect all replacements first, then apply back-to-front.
	const replacements: Replacement[] = [];

	const sf = ts.createSourceFile(
		filePath,
		source,
		ts.ScriptTarget.ES2022,
		true,
	);

	function matchesVar(expr: ts.Expression): boolean {
		// Direct identifier
		if (ts.isIdentifier(expr) && expr.text === varName) return true;
		// await expr (e.g. await someStep) — unlikely in nextSteps but handle it
		if (
			ts.isAwaitExpression(expr) &&
			ts.isIdentifier(expr.expression) &&
			expr.expression.text === varName
		)
			return true;
		return false;
	}

	/**
	 * Returns true if the expression is an object literal whose `step`,
	 * `fromStep`, or `toStep` property value equals varName.
	 * e.g. { step: varName, type: TransitionType.disable }
	 *      { fromStep: varName, toStep: ..., type: ... }
	 */
	function objectRefersToVar(expr: ts.Expression): boolean {
		if (!ts.isObjectLiteralExpression(expr)) return false;
		return expr.properties.some((p) => {
			if (!ts.isPropertyAssignment(p) || !ts.isIdentifier(p.name)) return false;
			const propName = p.name.text;
			if (
				propName !== "step" &&
				propName !== "fromStep" &&
				propName !== "toStep"
			)
				return false;
			return matchesVar(p.initializer);
		});
	}

	function collectFromArray(arr: ts.ArrayLiteralExpression): void {
		const elems = arr.elements;
		for (let i = 0; i < elems.length; i++) {
			const el = elems[i];
			if (!matchesVar(el) && !objectRefersToVar(el)) continue;

			if (elems.length === 1) {
				// Only element → remove content between '[' and ']'
				replacements.push({
					start: arr.getStart(sf) + 1,
					end: arr.getEnd() - 1,
					text: "",
				});
			} else if (i < elems.length - 1) {
				// Not last → remove from this element's full start to next element's full start
				replacements.push({
					start: el.getFullStart(),
					end: elems[i + 1].getFullStart(),
					text: "",
				});
			} else {
				// Last element → remove from prev element's end to this element's end
				replacements.push({
					start: elems[i - 1].getEnd(),
					end: el.getEnd(),
					text: "",
				});
			}
		}
	}

	function visit(node: ts.Node): void {
		// 1. Property assignments: nextSteps / synchronousNextSteps
		if (
			ts.isPropertyAssignment(node) &&
			ts.isIdentifier(node.name) &&
			(node.name.text === "nextSteps" ||
				node.name.text === "synchronousNextSteps") &&
			ts.isArrayLiteralExpression(node.initializer)
		) {
			collectFromArray(node.initializer);
		}

		// 2. generateTransitions([...]) call
		if (
			ts.isCallExpression(node) &&
			ts.isPropertyAccessExpression(node.expression) &&
			node.expression.name.text === "generateTransitions" &&
			node.arguments.length > 0 &&
			ts.isArrayLiteralExpression(node.arguments[0])
		) {
			collectFromArray(node.arguments[0] as ts.ArrayLiteralExpression);
		}

		ts.forEachChild(node, visit);
	}

	visit(sf);

	if (replacements.length === 0) return source;

	// Apply back-to-front so earlier offsets are not invalidated.
	replacements.sort((a, b) => b.start - a.start);
	let result = source;
	for (const r of replacements) {
		result = result.slice(0, r.start) + r.text + result.slice(r.end);
	}
	return result;
}

// ─────────────────────────────────────────────────────────────
// removeConnectionEntry
// ─────────────────────────────────────────────────────────────

/**
 * Removes a specific element from a specific step's nextSteps /
 * synchronousNextSteps array.
 *
 * - removal.synchronous  → look in synchronousNextSteps
 * - removal.isDisable    → look in nextSteps for { step: toVar, type: TransitionType.disable }
 * - otherwise            → look in nextSteps for bare identifier toVar
 */
function removeConnectionEntry(
	source: string,
	filePath: string,
	removal: RemovedConnectionDraft,
): string {
	const fromVar = removal.fromVariableName;
	const toVar = removal.toVariableName;
	if (!fromVar || !toVar) return source;

	const propName = removal.synchronous ? "synchronousNextSteps" : "nextSteps";

	const sf = ts.createSourceFile(
		filePath,
		source,
		ts.ScriptTarget.ES2022,
		true,
	);

	let result = source;

	function visit(node: ts.Node): void {
		// Find the VariableDeclaration for fromVar
		if (
			ts.isVariableDeclaration(node) &&
			ts.isIdentifier(node.name) &&
			node.name.text === fromVar &&
			node.initializer
		) {
			// Locate the createStep argument object
			const argRef: { value: ts.ObjectLiteralExpression | null } = {
				value: null,
			};
			function findArg(n: ts.Node): void {
				if (argRef.value) return;
				if (
					ts.isCallExpression(n) &&
					n.arguments.length > 0 &&
					ts.isObjectLiteralExpression(n.arguments[0])
				) {
					const expr = n.expression;
					const isCS =
						(ts.isPropertyAccessExpression(expr) &&
							expr.name.text === "createStep") ||
						(ts.isIdentifier(expr) && expr.text === "createStep");
					if (isCS) argRef.value = n.arguments[0] as ts.ObjectLiteralExpression;
				}
				ts.forEachChild(n, findArg);
			}
			findArg(node.initializer);

			const obj = argRef.value;
			if (!obj) return;

			// Find the target property
			const prop = obj.properties.find(
				(p): p is ts.PropertyAssignment =>
					ts.isPropertyAssignment(p) &&
					ts.isIdentifier(p.name) &&
					p.name.text === propName,
			);
			if (!prop || !ts.isArrayLiteralExpression(prop.initializer)) return;

			const arr = prop.initializer;
			const elems = arr.elements;

			for (let i = 0; i < elems.length; i++) {
				const el = elems[i];
				let matches = false;

				if (removal.isDisable) {
					// Match { step: toVar, type: TransitionType.disable } objects
					if (ts.isObjectLiteralExpression(el)) {
						const stepProp = el.properties.find(
							(p): p is ts.PropertyAssignment =>
								ts.isPropertyAssignment(p) &&
								ts.isIdentifier(p.name) &&
								p.name.text === "step" &&
								ts.isIdentifier(p.initializer) &&
								p.initializer.text === toVar,
						);
						if (stepProp) matches = true;
					}
				} else {
					// Match bare identifier or { step: toVar } without disable
					if (ts.isIdentifier(el) && el.text === toVar) {
						matches = true;
					} else if (ts.isObjectLiteralExpression(el)) {
						const stepProp = el.properties.find(
							(p): p is ts.PropertyAssignment =>
								ts.isPropertyAssignment(p) &&
								ts.isIdentifier(p.name) &&
								p.name.text === "step" &&
								ts.isIdentifier(p.initializer) &&
								p.initializer.text === toVar,
						);
						if (stepProp) matches = true;
					}
				}

				if (!matches) continue;

				// Compute removal range
				let removeStart: number;
				let removeEnd: number;

				if (elems.length === 1) {
					removeStart = arr.getStart(sf) + 1;
					removeEnd = arr.getEnd() - 1;
				} else if (i < elems.length - 1) {
					removeStart = el.getFullStart();
					removeEnd = elems[i + 1].getFullStart();
				} else {
					removeStart = elems[i - 1].getEnd();
					removeEnd = el.getEnd();
				}

				result = result.slice(0, removeStart) + result.slice(removeEnd);
				return; // only remove first match per call
			}
		}
		ts.forEachChild(node, visit);
	}

	visit(sf);
	return result;
}
