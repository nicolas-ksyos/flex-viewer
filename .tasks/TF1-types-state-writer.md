# Task TF1 — New types, useEditMode extension, seed writer for delete/remove

## Goal
Add `DeletedBlockDraft` and `RemovedConnectionDraft` to the pending-change system.
Extend `useEditMode` with methods for recording and undoing these.
Extend the seed writer to handle block deletion and connection removal.

## Files to read first
- `src/shared/types.ts`
- `src/client/hooks/useEditMode.ts`
- `src/server/seedWriterNew.ts` (full)
- `src/server/seedWriter.ts` (for AST patterns)
- `src/server/routes/seedRoutes.ts`

---

## A. `src/shared/types.ts` — new types

```ts
/** A pending deletion of an existing workflow step */
export interface DeletedBlockDraft {
  kind: 'delete-step';
  stepId: string;
  stepName: string;
  variableName: string;         // TS variable in seed file (e.g. 'closeProcessStep')
  impactedStepIds: string[];    // IDs of steps whose nextSteps reference this block
  impactedStepNames: string[];  // display names of impacted steps
}

/** Removal of an existing connection (nextSteps or synchronousNextSteps entry) */
export interface RemovedConnectionDraft {
  kind: 'remove-connection';
  tempId: string;
  fromStepId: string;
  fromStepName: string;
  fromVariableName: string;   // TS variable of the source step
  toStepId: string;
  toStepName: string;
  toVariableName: string;     // TS variable of the target step
  synchronous: boolean;
  isDisable: boolean;         // true = TransitionType.disable entry
}
```

Add both to `PendingChangeItem` union:
```ts
export type PendingChangeItem =
  | StepEditDraft
  | NewStepDraft
  | NewConnectionDraft
  | NewTransitionDraft
  | DeletedBlockDraft        // ← ADD
  | RemovedConnectionDraft;  // ← ADD
```

Also add to `SeedPatchRequest`:
```ts
export interface SeedPatchRequest {
  changes: StepPendingChange[];
  newSteps?: NewStepDraft[];
  newConnections?: NewConnectionDraft[];
  newTransitions?: NewTransitionDraft[];
  deletedSteps?: DeletedBlockDraft[];        // ← ADD
  removedConnections?: RemovedConnectionDraft[];  // ← ADD
  stepVarNames?: Array<{ id: string; variableName: string }>;
}
```

---

## B. `src/client/hooks/useEditMode.ts` — new methods

Add to `UseEditModeReturn`:
```ts
recordBlockDeletion: (step: ParsedWorkflowStep, workflow: ParsedWorkflowDefinition) => void;
undoBlockDeletion: (stepId: string) => void;
recordConnectionRemoval: (draft: Omit<RemovedConnectionDraft, 'kind'>) => void;
undoConnectionRemoval: (tempId: string) => void;
```

Implementation:

```ts
const recordBlockDeletion = useCallback(
  (step: ParsedWorkflowStep, workflow: ParsedWorkflowDefinition) => {
    // Find all steps whose nextSteps/transitions reference this step
    const impacted = workflow.transitions
      .filter(t => t.toStepId === step.id)
      .map(t => workflow.steps.find(s => s.id === t.fromStepId))
      .filter((s): s is ParsedWorkflowStep => s !== undefined && s.id !== step.id);
    const uniqueImpacted = impacted.filter((s, i, a) => a.findIndex(x => x.id === s.id) === i);

    setPendingChanges(prev => {
      // Remove any existing edit/move for this step
      const filtered = prev.filter(c => !(c.kind === 'edit' && c.stepId === step.id));
      const draft: DeletedBlockDraft = {
        kind: 'delete-step',
        stepId: step.id,
        stepName: step.name,
        variableName: step.variableName ?? generateVariableName(step.name),
        impactedStepIds: uniqueImpacted.map(s => s.id),
        impactedStepNames: uniqueImpacted.map(s => s.name),
      };
      return [...filtered, draft];
    });
  },
  []
);

const undoBlockDeletion = useCallback(
  (stepId: string) =>
    setPendingChanges(prev => prev.filter(c => !(c.kind === 'delete-step' && c.stepId === stepId))),
  []
);

const recordConnectionRemoval = useCallback(
  (draft: Omit<RemovedConnectionDraft, 'kind'>) =>
    setPendingChanges(prev => [...prev, { kind: 'remove-connection', ...draft }]),
  []
);

const undoConnectionRemoval = useCallback(
  (tempId: string) =>
    setPendingChanges(prev => prev.filter(c => !(c.kind === 'remove-connection' && c.tempId === tempId))),
  []
);
```

Import `ParsedWorkflowDefinition`, `DeletedBlockDraft`, `RemovedConnectionDraft` from shared types.

---

## C. `src/server/seedWriterNew.ts` — block deletion and connection removal

### C1. New public function `deleteBlocksAndRemoveConnections`

```ts
export function deleteBlocksAndRemoveConnections(
  filePath: string,
  deletedSteps: DeletedBlockDraft[],
  removedConnections: RemovedConnectionDraft[],
): void {
  if (deletedSteps.length === 0 && removedConnections.length === 0) return;

  let source = fs.readFileSync(filePath, 'utf-8');

  // Process connection removals first (before step deletions)
  for (const removal of removedConnections) {
    source = removeConnectionEntry(source, filePath, removal);
  }

  // Then process step deletions
  for (const deleted of deletedSteps) {
    source = deleteStepDeclaration(source, filePath, deleted.variableName);
    // Remove all references to the deleted var from other steps' nextSteps
    source = removeVarFromAllNextSteps(source, filePath, deleted.variableName);
  }

  fs.writeFileSync(filePath, source, 'utf-8');
}
```

### C2. `deleteStepDeclaration(source, filePath, varName)` 

Find the variable declaration `const {varName} = ...` and remove the entire statement including any leading newlines/whitespace.

Use TypeScript AST to find the position:
- Walk to find `VariableStatement` containing a `VariableDeclaration` where `name.text === varName`
- Get the full start (`node.getFullStart()`) to end of statement
- Remove that range from the source string

### C3. `removeVarFromAllNextSteps(source, filePath, varName)`

Walk the AST and for every `nextSteps` or `synchronousNextSteps` array literal:
- Find elements that are `Identifier` nodes with `text === varName`
- Find elements that are `PropertyAccessExpression` or `CallExpression` containing varName (for `{ step: varName, ... }` objects)
- Collect `Replacement { start, end, newText: '' }` for each match
- Handle trailing/leading commas and whitespace

### C4. `removeConnectionEntry(source, filePath, removal)`

Find the source step by `removal.fromVariableName`, locate its `nextSteps` or `synchronousNextSteps` array (based on `removal.synchronous`), and remove the element matching `removal.toVariableName`.

For disable connections: also look in `generateTransitions([...])` calls.

### C5. Update `src/server/routes/seedRoutes.ts` PATCH handler

After existing operations, call `deleteBlocksAndRemoveConnections`:
```ts
if (body.deletedSteps?.length || body.removedConnections?.length) {
  deleteBlocksAndRemoveConnections(
    filePath,
    body.deletedSteps ?? [],
    body.removedConnections ?? [],
  );
}
```

Import `deleteBlocksAndRemoveConnections` from `'../seedWriterNew.js'`.

---

## D. `src/client/components/edit/EditSidebar.tsx` — include delete/remove in PATCH body

In `handleSave`, extend the request body:
```ts
const deletedSteps = pendingChanges.filter(c => c.kind === 'delete-step') as DeletedBlockDraft[];
const removedConnections = pendingChanges.filter(c => c.kind === 'remove-connection') as RemovedConnectionDraft[];

body = {
  ...body,
  ...(deletedSteps.length > 0 ? { deletedSteps } : {}),
  ...(removedConnections.length > 0 ? { removedConnections } : {}),
};
```

## Acceptance criteria
- Types compile, no new errors
- `deleteBlocksAndRemoveConnections` removes the step declaration and its references
- `SeedPatchRequest` includes `deletedSteps` and `removedConnections`
