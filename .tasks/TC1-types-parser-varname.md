# Task TC1 — Shared types extension + parser variable names

## Goal
Two things in one task (no other tasks depend on partial results):
1. Add `variableName?: string` to `ParsedWorkflowStep` — the TS variable name from the seed file (e.g. `closeProcessStep`)
2. Add new shared types for the pending-changes data model: `NewStepDraft`, `NewConnectionDraft`, `NewTransitionDraft`, `PendingChangeItem` union

## Files to read first
- `src/shared/types.ts`
- `src/server/seedAstParser.ts` — look for `buildStep`, `stepVarToId`, and where `varName` is passed

## Files to modify
- `src/shared/types.ts`
- `src/server/seedAstParser.ts`

---

## A. New types in `src/shared/types.ts`

### 1. Add `variableName` to `ParsedWorkflowStep`
```ts
export interface ParsedWorkflowStep {
  // ... existing fields unchanged ...
  variableName?: string; // TS variable name from seed file, e.g. 'closeProcessStep'
}
```

### 2. New draft types
```ts
/** Fields for a new step being created in the editor */
export interface NewStepFields {
  block: string;          // block name (e.g. 'performActivity')
  name: string;
  label?: string;
  x: number;
  y: number;
  allowedPerformer?: string | null;
  performerNeedsTask?: boolean;
  /** IDs of existing steps this step connects TO (nextSteps) */
  nextStepIds?: string[];
  /** IDs of existing steps that should connect TO this new step */
  prevStepIds?: string[];
  /** IDs of existing steps this step connects TO synchronously */
  synchronousNextStepIds?: string[];
}

/** A new step pending to be added to the workflow */
export interface NewStepDraft {
  kind: 'new-step';
  /** Client-side temporary ID (not a real DB UUID) */
  tempId: string;
  fields: NewStepFields;
  /** Auto-generated camelCase variable name for seed file */
  variableName: string;
}

/** A new connection (nextSteps link) between existing steps */
export interface NewConnectionDraft {
  kind: 'new-connection';
  tempId: string;
  fromStepId: string;   // existing step ID
  toStepIds: string[];  // existing step IDs
  synchronous: boolean;
}

/** A new disable-type transition */
export interface NewTransitionDraft {
  kind: 'new-transition';
  tempId: string;
  fromStepId: string;   // existing step ID — will have TransitionType.disable added to nextSteps
  toStepIds: string[];  // existing step IDs — each gets { step: X, type: TransitionType.disable }
}

/** Edit to an existing step (existing behavior) */
export interface StepEditDraft {
  kind: 'edit';
  stepId: string;
  stepName: string;
  fields: EditableStepFields;
}

/**
 * Union of all pending-change kinds.
 * Replaces the old StepPendingChange in edit mode state.
 */
export type PendingChangeItem =
  | StepEditDraft
  | NewStepDraft
  | NewConnectionDraft
  | NewTransitionDraft;
```

### 3. Keep `StepPendingChange` for backward compat (keep existing type, add StepEditDraft as alias)
The existing `StepPendingChange` is used by `seedWriter.ts`. Keep it, but add the new union. The existing code paths continue using `StepPendingChange`.

---

## B. Parser: expose `variableName` on `ParsedWorkflowStep`

In `seedAstParser.ts`, find where `buildStep` returns a `WorkflowStep` and where `varName` is passed. Set `variableName` on the step object:

1. Look for the call site around line 559–566 where `result.step` is assigned and `varName` is available:
```ts
if (varName) {
    stepVarToId.set(varName, result.step.id);
    variables.set(varName, result.step);
    result.step.variableName = varName;  // ← ADD THIS
}
```

2. In `buildStep` (around line 856), the function returns `{ step, stepActivities, pendingTransitions }`. The step is a `WorkflowStep` object. After the step is built, the caller sets `variableName` on it (step 1 above). No change needed inside `buildStep` itself.

3. The `WorkflowStep` interface in `seedAstParser.ts` is the internal type. The `ParsedWorkflowStep` is the external shared type. Both need `variableName?: string`. The parser maps internal to external in the `workflows: result` return — ensure `variableName` is passed through.

---

## Acceptance criteria
- `ParsedWorkflowStep.variableName` is populated when the parser runs on a seed file
- The existing seed parse API (`/api/seeds/:fileName/parse`) returns `variableName` for each step
- New types `NewStepDraft`, `NewConnectionDraft`, `NewTransitionDraft`, `StepEditDraft`, `PendingChangeItem` are exported from `src/shared/types.ts`
- `tsc --noEmit` passes with no new errors
