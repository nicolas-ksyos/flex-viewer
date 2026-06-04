# Task TF4 — App.tsx wiring + fix post-save reload

## Goal
Wire the new delete/remove callbacks from App.tsx → CanvasPane → EditableWorkflowCanvas.
Fix the post-save workflow reload so the updated workflow displays immediately after saving.

## Dependencies
TF1 + TF2 + TF3

## Files to read first (ALL)
- `src/client/App.tsx`
- `src/client/hooks/useEditMode.ts`
- `src/client/components/CanvasPane.tsx`
- `src/client/components/edit/EditableWorkflowCanvas.tsx`
- `src/client/components/edit/BlockSettingsPopover.tsx`
- `src/client/components/edit/EditSidebar.tsx`

---

## A. Fix post-save reload

**Current issue**: `handleExitEditMode` exits edit mode immediately after the PATCH returns 200.
The file watcher then detects the write (~200-300ms later) and broadcasts `workflowUpdate`.
During that gap, view mode shows stale `parseResult`.

**Fix**: In `EditSidebar.tsx`, after a successful save, call `onSaveSuccess` but ALSO reset `parseResult` so the loading state shows until the WS update arrives.

Alternative (simpler): Add an `onSaveSuccess` variant that accepts the updated result.

Actually, the cleanest fix: after `onSaveSuccess()` is called, the App.tsx `handleExitEditMode` should reset `parseResult` to `null` briefly, triggering the "Parsing seed file..." state until the WS update arrives.

In App.tsx, modify `handleExitEditMode`:
```ts
const handleExitEditMode = useCallback(() => {
  exitEditMode();
  setSidebarVisible(true);
  setHighlightedStepId(null);
  setParseResult(null); // ← ADD: reset so loading state shows while WS update arrives
}, [exitEditMode]);
```

This is safe because the file watcher will broadcast `workflowUpdate` within ~300ms of the save, and the progress bar will show briefly.

---

## B. Thread `onDeleteBlock`, `onUndoDeleteBlock`, `onRemoveConnection`, `onUndoRemoveConnection`

### App.tsx
Destructure new methods from `useEditMode`:
```ts
const { ..., recordBlockDeletion, undoBlockDeletion, recordConnectionRemoval, undoConnectionRemoval } = useEditMode();
```

Pass to edit-mode `<CanvasPane>`:
```tsx
onDeleteBlock={(step) => recordBlockDeletion(step, currentWorkflow.workflow)}
onUndoDeleteBlock={undoBlockDeletion}
onRemoveConnection={recordConnectionRemoval}
onUndoRemoveConnection={undoConnectionRemoval}
```

Pass to `<EditSidebar>`:
```tsx
// onRemoveNewItem already handles all kinds via updated removeNewItem
```

### CanvasPane.tsx
Add to `CanvasPaneProps`:
```ts
onDeleteBlock?: (step: ParsedWorkflowStep) => void;
onUndoDeleteBlock?: (stepId: string) => void;
onRemoveConnection?: (draft: Omit<RemovedConnectionDraft, 'kind'>) => void;
onUndoRemoveConnection?: (tempId: string) => void;
```

Thread through to `EditableWorkflowCanvas`.

### EditableWorkflowCanvas.tsx
Add to `EditableWorkflowCanvasProps`:
```ts
onDeleteBlock?: (step: ParsedWorkflowStep) => void;
onUndoDeleteBlock?: (stepId: string) => void;
onRemoveConnection?: (draft: Omit<RemovedConnectionDraft, 'kind'>) => void;
onUndoRemoveConnection?: (tempId: string) => void;
```

Compute `pendingRemovedConnectionKeys` from `pendingChanges` and pass to `BlockSettingsPopover`:
```ts
const pendingRemovedConnectionKeys = useMemo(() =>
  new Set(
    pendingChanges
      .filter((c): c is RemovedConnectionDraft => c.kind === 'remove-connection')
      .map(c => `${c.fromStepId}-${c.toStepId}`)
  ),
  [pendingChanges]
);
```

Wire `onDeleteClick` on each block:
```tsx
onDeleteClick={() => {
  if (deletedStepIds.has(step.id)) {
    onUndoDeleteBlock?.(step.id);
  } else {
    onDeleteBlock?.(step);
  }
}}
isDeleted={deletedStepIds.has(step.id)}
isImpacted={impactedStepIds.has(step.id)}
```

Pass to popover:
```tsx
onRemoveConnection={onRemoveConnection}
onUndoRemoveConnection={onUndoRemoveConnection}
pendingRemovedConnectionKeys={pendingRemovedConnectionKeys}
```

---

## C. `computeDisplayWorkflow` update

Deleted steps should be shown on the canvas (with red overlay) but excluded from the effective workflow that `computeCanvasSize` uses for fit-to-screen. No change needed here — they remain in `workflow.steps` (not new drafts), just visually marked.

New connections FROM deleted steps should not be created. (handled by UI disabling the 'i' icon when deleted)

---

## Acceptance criteria
- After clicking Save: view mode shows "Parsing seed file…" briefly, then updates to show new workflow
- Delete trash icon on blocks triggers red overlay and sidebar entry
- Undo button restores block to normal
- × remove on connection in popover creates pending removal + strikethrough in popover
- tsc passes with only 3 pre-existing errors
