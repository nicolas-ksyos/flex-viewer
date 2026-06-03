import { useState, useCallback } from "react";
import type {
	StepPendingChange,
	EditableStepFields,
	ParsedWorkflowStep,
} from "../../shared/types";

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
// Hook
// ─────────────────────────────────────────────────────────────

export interface UseEditModeReturn {
	isEditMode: boolean;
	pendingChanges: StepPendingChange[];
	enterEditMode: () => void;
	exitEditMode: () => void;
	/**
	 * Record that a block was moved to a new grid cell.
	 * Accepts the full ParsedWorkflowStep so the hook can auto-prune the entry
	 * if the new position is identical to the original.
	 */
	recordBlockMove: (
		step: ParsedWorkflowStep,
		newGridX: number,
		newGridY: number,
	) => void;
	/**
	 * Record a field edit from the settings popover.
	 * Accepts the full ParsedWorkflowStep for the same auto-prune reason.
	 */
	recordFieldChange: (
		step: ParsedWorkflowStep,
		field: keyof EditableStepFields,
		value: string | number | null | undefined,
	) => void;
	/** Remove all pending changes for a specific step. */
	removeStepChange: (stepId: string) => void;
	discardChanges: () => void;
}

export function useEditMode(): UseEditModeReturn {
	const [isEditMode, setIsEditMode] = useState(false);
	const [pendingChanges, setPendingChanges] = useState<StepPendingChange[]>([]);

	const exitEditMode = useCallback(() => {
		setIsEditMode(false);
		setPendingChanges([]);
	}, []);

	const enterEditMode = useCallback(() => setIsEditMode(true), []);

	/**
	 * Merge `newFields` into the existing pending change for the given step,
	 * then prune any fields that now match the original step values.
	 * If nothing differs from the original, the entry is removed entirely.
	 */
	const mergeChange = useCallback(
		(step: ParsedWorkflowStep, newFields: EditableStepFields) => {
			setPendingChanges((prev) => {
				const idx = prev.findIndex((c) => c.stepId === step.id);
				const existingFields = idx >= 0 ? prev[idx].fields : {};

				// Merge new fields on top of existing ones
				const merged: EditableStepFields = { ...existingFields, ...newFields };

				// Prune fields that are back to their original values
				const pruned = pruneMatchingOriginal(merged, step);

				// If nothing real remains, remove the entry entirely
				if (Object.keys(pruned).length === 0) {
					return prev.filter((c) => c.stepId !== step.id);
				}

				if (idx >= 0) {
					const updated = [...prev];
					updated[idx] = { ...updated[idx], fields: pruned };
					return updated;
				}

				return [
					...prev,
					{ stepId: step.id, stepName: step.name, fields: pruned },
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
			value: string | number | null | undefined,
		) => mergeChange(step, { [field]: value } as EditableStepFields),
		[mergeChange],
	);

	const removeStepChange = useCallback(
		(stepId: string) =>
			setPendingChanges((prev) => prev.filter((c) => c.stepId !== stepId)),
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
		discardChanges,
	};
}
