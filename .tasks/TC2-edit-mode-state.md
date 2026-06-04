# Task TC2 — useEditMode hook extension

## Goal
Extend `useEditMode.ts` to handle all four `PendingChangeItem` kinds (edit, new-step, new-connection, new-transition). The existing `StepPendingChange[]` state is replaced by `PendingChangeItem[]`.

## Dependencies
TC1 must be complete (`PendingChangeItem`, `NewStepDraft`, etc. available in types).

## Files to read first
- `src/client/hooks/useEditMode.ts`
- `src/shared/types.ts` (after TC1)

## Files to modify
- `src/client/hooks/useEditMode.ts`

---

## Changes

### State
Replace `const [pendingChanges, setPendingChanges] = useState<StepPendingChange[]>([])` with:
```ts
const [pendingChanges, setPendingChanges] = useState<PendingChangeItem[]>([]);
```

### Existing methods — adapt signatures
- `recordBlockMove(step, x, y)` → now creates/updates a `StepEditDraft` with `kind: 'edit'`
- `recordFieldChange(step, field, value)` → same, `kind: 'edit'`  
- `removeStepChange(stepId)` → removes items where `(item.kind === 'edit' && item.stepId === stepId) || (item.kind === 'new-step' && item.tempId === stepId)`

### New methods to add
```ts
addNewStep: (draft: Omit<NewStepDraft, 'kind'>) => void;
addNewConnection: (draft: Omit<NewConnectionDraft, 'kind'>) => void;
addNewTransition: (draft: Omit<NewTransitionDraft, 'kind'>) => void;
removeNewItem: (tempId: string) => void; // removes new-step / new-connection / new-transition by tempId
```

### Helper — generate variable name from step name
```ts
function generateVariableName(stepName: string): string {
  // "Perform some activity" → "performSomeActivityStep"
  const camel = stepName
    .toLowerCase()
    .replace(/[^a-zA-Z0-9\s]/g, '')
    .trim()
    .split(/\s+/)
    .map((w, i) => i === 0 ? w : w.charAt(0).toUpperCase() + w.slice(1))
    .join('');
  return camel + 'Step';
}
```

### `computeDisplayWorkflow` utility (export from the hook or a separate file)
This function merges real parsed workflow with pending new-step drafts for canvas rendering:
```ts
export function computeDisplayWorkflow(
  workflow: ParsedWorkflowDefinition,
  pendingChanges: PendingChangeItem[],
): ParsedWorkflowDefinition {
  const newSteps: ParsedWorkflowStep[] = pendingChanges
    .filter((c): c is NewStepDraft => c.kind === 'new-step')
    .map((draft) => ({
      id: draft.tempId,
      name: draft.fields.name,
      label: draft.fields.label ?? draft.fields.name,
      displayOptions: { x: draft.fields.x, y: draft.fields.y },
      serviceWorkflowBlock: {
        id: draft.tempId + '-block',
        name: draft.fields.block,
        type: BLOCK_TYPE_MAP[draft.fields.block] ?? 'general',
      },
      allowedPerformer: draft.fields.allowedPerformer ?? null,
      parameters: null,
      performerNeedsTask: draft.fields.performerNeedsTask ?? false,
      serviceId: workflow.steps[0]?.serviceId ?? '',
      isRerunnable: false,
      variableName: draft.variableName,
      isNew: true, // flag for visual differentiation
    }));

  // Build new transitions from new-connection and new-transition drafts
  const newTransitions: ParsedWorkflowTransition[] = [
    ...pendingChanges
      .filter((c): c is NewConnectionDraft => c.kind === 'new-connection')
      .flatMap((draft) =>
        draft.toStepIds.map((toId) => ({
          id: `${draft.tempId}-${toId}`,
          fromStepId: draft.fromStepId,
          toStepId: toId,
          type: 'enable',
          onlyIfOutputEquals: null,
          synchronous: draft.synchronous,
          serviceId: workflow.steps[0]?.serviceId ?? '',
          isNew: true,
        })),
      ),
    ...pendingChanges
      .filter((c): c is NewTransitionDraft => c.kind === 'new-transition')
      .flatMap((draft) =>
        draft.toStepIds.map((toId) => ({
          id: `${draft.tempId}-${toId}`,
          fromStepId: draft.fromStepId,
          toStepId: toId,
          type: 'disable',
          onlyIfOutputEquals: null,
          synchronous: false,
          serviceId: workflow.steps[0]?.serviceId ?? '',
          isNew: true,
        })),
      ),
  ];

  return {
    ...workflow,
    steps: [...workflow.steps, ...newSteps],
    transitions: [...workflow.transitions, ...newTransitions],
  };
}
```

Note: `isNew` is not on the interface yet — add `isNew?: boolean` to `ParsedWorkflowStep` and `ParsedWorkflowTransition` in `src/shared/types.ts`.

## Acceptance criteria
- `pendingChanges` state is `PendingChangeItem[]`
- All existing edit methods work as before (StepEditDraft with `kind: 'edit'`)
- `addNewStep`, `addNewConnection`, `addNewTransition`, `removeNewItem` are available
- `computeDisplayWorkflow` exported and merges drafts correctly
- `tsc --noEmit` passes
