# Task TC9 — App.tsx wiring

## Goal
Wire all new creation components into App.tsx and CanvasPane: modals open/close, creation callbacks connect to useEditMode, PATCH request includes new items, canvas uses computeDisplayWorkflow.

## Dependencies
All TC1–TC8 complete.

## Files to read first (all of them, completely):
- `src/client/App.tsx`
- `src/client/components/CanvasPane.tsx`
- `src/client/hooks/useEditMode.ts`
- `src/client/components/edit/EditSidebar.tsx`
- `src/client/components/edit/AddBlockModal.tsx`
- `src/client/components/edit/AddConnectionModal.tsx`
- `src/client/components/edit/AddTransitionModal.tsx`
- `src/client/components/edit/CreationToolbar.tsx`

## Changes

### App.tsx
1. Destructure new methods from useEditMode: `addNewStep`, `addNewConnection`, `addNewTransition`, `removeNewItem`
2. Pass `onAddBlock`, `onAddConnection`, `onAddTransition` to `<CanvasPane mode="edit">`
3. Pass `onRemoveNewItem={removeNewItem}` to `<EditSidebar>`
4. State: `showAddBlock`, `showAddConnection`, `showAddTransition` (or manage inside CanvasPane)
5. Render modals at App level (or inside CanvasPane — choose based on z-index needs; App level is safer)
6. Modal `existingSteps` = `currentWorkflow.workflow.steps`
7. Modal `newStepDrafts` = new-step items from pendingChanges
8. On Add Block: call `addNewStep(draft)` + if draft.fields.prevStepIds/nextStepIds, also call `addNewConnection` for each
9. Update PATCH request body to include `newSteps`, `newConnections`, `newTransitions`

### CanvasPane.tsx
1. Accept `onAddBlock?`, `onAddConnection?`, `onAddTransition?` in props
2. Pass to `CreationToolbar` (only rendered when these are provided + mode === 'edit')
3. Use `computeDisplayWorkflow(workflow, pendingChanges)` as the workflow passed to `EditableWorkflowCanvas`

### EditSidebar save logic (if save is done inside EditSidebar)
Extend fetch body to include new items from pendingChanges:
```ts
const newSteps = pendingChanges.filter(c => c.kind === 'new-step') as NewStepDraft[];
const newConnections = pendingChanges.filter(c => c.kind === 'new-connection') as NewConnectionDraft[];
const newTransitions = pendingChanges.filter(c => c.kind === 'new-transition') as NewTransitionDraft[];
const body = {
  changes: pendingChanges.filter(c => c.kind === 'edit').map(c => ({ stepId: c.stepId, stepName: c.stepName, fields: c.fields })),
  newSteps,
  newConnections,
  newTransitions,
};
```

## Acceptance criteria
- Clicking "Block" in creation toolbar opens AddBlockModal
- Filling form + clicking Add: new step appears on canvas with dashed border and NEW badge
- New step appears in sidebar under "Pending additions"
- Same for connections and transitions
- Clicking Save successfully writes all items to the seed file
- File watcher re-parses and shows updated workflow in view mode
- tsc --noEmit passes
