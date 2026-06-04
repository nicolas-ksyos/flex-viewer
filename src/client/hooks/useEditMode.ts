import { useState, useCallback } from "react";
import type {
	EditableStepFields,
	ParsedWorkflowStep,
	ParsedWorkflowDefinition,
	ParsedWorkflowTransition,
	PendingChangeItem,
	StepEditDraft,
	NewStepDraft,
	NewConnectionDraft,
	NewTransitionDraft,
} from "../../shared/types";
import { BLOCK_TYPE_MAP } from "../../shared/blockTypes";

// ─────────────────────────────────────────────────────────────
// Helpers — compare a pending field value against the original
// step value so no-op changes can be pruned automatically.
// ─────────────────────────────────────────────────────────────

function getOriginalValue(
	step: ParsedWorkflowStep,
	field: keyof EditableStepFields,
): unknown {
	switch (field) {
		case "x":
			return step.displayOptions.x;
		case "y":
			return step.displayOptions.y;
		case "name":
			return step.name;
		case "label":
			return step.label;
		case "allowedPerformer":
			return step.allowedPerformer;
		case "type":
			// treat undefined and '' as equivalent originals
			return step.type ?? "";
		case "block":
			return step.serviceWorkflowBlock.name;
		case "performerNeedsTask":
			return step.performerNeedsTask;
		case "parameters":
			// Never auto-prune parameters — object comparison is complex and
			// any change should always be preserved as a pending change.
			return null;
		default:
			return undefined;
	}
}

/**
 * Returns a copy of `fields` with any entry whose value already matches the
 * original step value removed.  If nothing remains, the caller should drop
 * the whole pending-change entry.
 */
function pruneMatchingOriginal(
	fields: EditableStepFields,
	step: ParsedWorkflowStep,
): EditableStepFields {
	const result: EditableStepFields = {};
	for (const [key, value] of Object.entries(fields) as [
		keyof EditableStepFields,
		unknown,
	][]) {
		if (value === undefined) continue;
		const original = getOriginalValue(step, key);
		if (value !== original) {
			(result as Record<string, unknown>)[key] = value;
		}
	}
	return result;
}

// ─────────────────────────────────────────────────────────────
// Public helpers — exported for use in components
// ─────────────────────────────────────────────────────────────

/**
 * Convert a step name to a camelCase TypeScript variable name.
 * e.g. "Perform some activity" → "performSomeActivityStep"
 */
export function generateVariableName(name: string): string {
	const camel = name
		.toLowerCase()
		.replace(/[^a-z0-9\s]/g, "")
		.trim()
		.split(/\s+/)
		.filter(Boolean)
		.map((w, i) => (i === 0 ? w : w.charAt(0).toUpperCase() + w.slice(1)))
		.join("");
	return (camel || "new") + "Step";
}

/**
 * Merge real parsed workflow with pending new-item drafts so the canvas
 * can render the full "in-progress" workflow without requiring a save.
 *
 * New steps appear at their specified coordinates.
 * New connections and transitions appear as dashed arrows.
 */
export function computeDisplayWorkflow(
	workflow: ParsedWorkflowDefinition,
	pendingChanges: PendingChangeItem[],
): ParsedWorkflowDefinition {
	const newStepDrafts = pendingChanges.filter(
		(c): c is NewStepDraft => c.kind === "new-step",
	);
	const newConnDrafts = pendingChanges.filter(
		(c): c is NewConnectionDraft => c.kind === "new-connection",
	);
	const newTransDrafts = pendingChanges.filter(
		(c): c is NewTransitionDraft => c.kind === "new-transition",
	);

	const newSteps: ParsedWorkflowStep[] = newStepDrafts.map((draft) => ({
		id: draft.tempId,
		name: draft.fields.name,
		label: draft.fields.label ?? draft.fields.name,
		displayOptions: { x: draft.fields.x, y: draft.fields.y },
		serviceWorkflowBlock: {
			id: draft.tempId + "-block",
			name: draft.fields.block,
			type: BLOCK_TYPE_MAP[draft.fields.block] ?? "general",
		},
		allowedPerformer: draft.fields.allowedPerformer ?? null,
		parameters: null,
		performerNeedsTask: draft.fields.performerNeedsTask ?? false,
		serviceId: workflow.steps[0]?.serviceId ?? "",
		isRerunnable: false,
		variableName: draft.variableName,
		isNew: true,
	}));

	const allSteps = [...workflow.steps, ...newSteps];
	const stepById = new Map(allSteps.map((s) => [s.id, s]));

	const newTransitions: ParsedWorkflowTransition[] = [
		...newConnDrafts.flatMap((draft) =>
			draft.toStepIds
				.filter((id) => stepById.has(id))
				.map((toId) => ({
					id: `${draft.tempId}-${toId}`,
					fromStepId: draft.fromStepId,
					toStepId: toId,
					type: "enable" as const,
					onlyIfOutputEquals: null,
					synchronous: draft.synchronous,
					serviceId: workflow.steps[0]?.serviceId ?? "",
					isNew: true,
				})),
		),
		...newTransDrafts.flatMap((draft) =>
			draft.toStepIds
				.filter((id) => stepById.has(id))
				.map((toId) => ({
					id: `${draft.tempId}-${toId}`,
					fromStepId: draft.fromStepId,
					toStepId: toId,
					type: "disable" as const,
					onlyIfOutputEquals: null,
					synchronous: false,
					serviceId: workflow.steps[0]?.serviceId ?? "",
					isNew: true,
				})),
		),
	];

	return {
		...workflow,
		steps: allSteps,
		transitions: [...workflow.transitions, ...newTransitions],
	};
}

// ─────────────────────────────────────────────────────────────
// Hook
// ─────────────────────────────────────────────────────────────

export interface UseEditModeReturn {
	isEditMode: boolean;
	pendingChanges: PendingChangeItem[];
	enterEditMode: () => void;
	exitEditMode: () => void;
	/**
	 * Record that a block was moved to a new grid cell.
	 * Auto-prunes the entry if the new position is identical to the original.
	 */
	recordBlockMove: (
		step: ParsedWorkflowStep,
		newGridX: number,
		newGridY: number,
	) => void;
	/**
	 * Record a field edit from the settings popover.
	 * Auto-prunes if the new value matches the original.
	 */
	recordFieldChange: (
		step: ParsedWorkflowStep,
		field: keyof EditableStepFields,
		value: string | number | boolean | null | undefined,
	) => void;
	/** Remove all pending edits for a specific existing step. */
	removeStepChange: (stepId: string) => void;
	/** Add a brand-new step draft. */
	addNewStep: (draft: Omit<NewStepDraft, "kind">) => void;
	/** Add a new nextSteps connection between steps. */
	addNewConnection: (draft: Omit<NewConnectionDraft, "kind">) => void;
	/** Add a new TransitionType.disable link. */
	addNewTransition: (draft: Omit<NewTransitionDraft, "kind">) => void;
	/** Remove a new-step / new-connection / new-transition draft by tempId. */
	removeNewItem: (tempId: string) => void;
	discardChanges: () => void;
}

export function useEditMode(): UseEditModeReturn {
	const [isEditMode, setIsEditMode] = useState(false);
	const [pendingChanges, setPendingChanges] = useState<PendingChangeItem[]>([]);

	const exitEditMode = useCallback(() => {
		setIsEditMode(false);
		setPendingChanges([]);
	}, []);

	const enterEditMode = useCallback(() => setIsEditMode(true), []);

	/**
	 * Merge `newFields` into the existing StepEditDraft for the given step,
	 * then prune any fields that now match the original step values.
	 * If nothing differs from the original, the entry is removed entirely.
	 */
	const mergeChange = useCallback(
		(step: ParsedWorkflowStep, newFields: EditableStepFields) => {
			setPendingChanges((prev) => {
				// Only look at edit-kind items when merging
				const idx = prev.findIndex(
					(c) => c.kind === "edit" && c.stepId === step.id,
				);
				const existingFields =
					idx >= 0 ? (prev[idx] as StepEditDraft).fields : {};

				const merged: EditableStepFields = { ...existingFields, ...newFields };
				const pruned = pruneMatchingOriginal(merged, step);

				if (Object.keys(pruned).length === 0) {
					// No real change remains — drop the entry
					return prev.filter(
						(c) => !(c.kind === "edit" && c.stepId === step.id),
					);
				}

				if (idx >= 0) {
					const updated = [...prev];
					updated[idx] = {
						kind: "edit",
						stepId: step.id,
						stepName: step.name,
						fields: pruned,
					} satisfies StepEditDraft;
					return updated;
				}

				return [
					...prev,
					{
						kind: "edit",
						stepId: step.id,
						stepName: step.name,
						fields: pruned,
					} satisfies StepEditDraft,
				];
			});
		},
		[],
	);

	const recordBlockMove = useCallback(
		(step: ParsedWorkflowStep, newGridX: number, newGridY: number) =>
			mergeChange(step, { x: newGridX, y: newGridY }),
		[mergeChange],
	);

	const recordFieldChange = useCallback(
		(
			step: ParsedWorkflowStep,
			field: keyof EditableStepFields,
			value: string | number | boolean | null | undefined,
		) => mergeChange(step, { [field]: value } as EditableStepFields),
		[mergeChange],
	);

	const removeStepChange = useCallback(
		(stepId: string) =>
			setPendingChanges((prev) =>
				prev.filter((c) => !(c.kind === "edit" && c.stepId === stepId)),
			),
		[],
	);

	const addNewStep = useCallback(
		(draft: Omit<NewStepDraft, "kind">) =>
			setPendingChanges((prev) => [...prev, { kind: "new-step", ...draft }]),
		[],
	);

	const addNewConnection = useCallback(
		(draft: Omit<NewConnectionDraft, "kind">) =>
			setPendingChanges((prev) => [
				...prev,
				{ kind: "new-connection", ...draft },
			]),
		[],
	);

	const addNewTransition = useCallback(
		(draft: Omit<NewTransitionDraft, "kind">) =>
			setPendingChanges((prev) => [
				...prev,
				{ kind: "new-transition", ...draft },
			]),
		[],
	);

	const removeNewItem = useCallback(
		(tempId: string) =>
			setPendingChanges((prev) =>
				prev.filter((c) => {
					if (
						c.kind === "new-step" ||
						c.kind === "new-connection" ||
						c.kind === "new-transition"
					) {
						return c.tempId !== tempId;
					}
					return true;
				}),
			),
		[],
	);

	const discardChanges = useCallback(() => exitEditMode(), [exitEditMode]);

	return {
		isEditMode,
		pendingChanges,
		enterEditMode,
		exitEditMode,
		recordBlockMove,
		recordFieldChange,
		removeStepChange,
		addNewStep,
		addNewConnection,
		addNewTransition,
		removeNewItem,
		discardChanges,
	};
}
