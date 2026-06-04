# Task TF2 — Canvas visuals: deleted blocks, impacted blocks, exclamation marks

## Goal
In `EditableWorkflowCanvas.tsx`:
- Deleted blocks (in `pendingChanges` as `delete-step`): render with deep red overlay + "DELETED" label + lock cursor
- Impacted blocks (incoming connections to a deleted block): render with amber exclamation mark icon
- Connection lines to/from deleted blocks: dashed red
- Transition lines that are pending removal (`remove-connection`): dashed grey with strikethrough indicator

## Dependencies
TF1 — `DeletedBlockDraft`, `RemovedConnectionDraft` types.

## Files to read first
- `src/client/components/edit/EditableWorkflowCanvas.tsx` (full)
- `src/shared/types.ts`
- `src/client/hooks/useEditMode.ts` — `computeDisplayWorkflow`

---

## A. Derive deleted/impacted step IDs from pendingChanges

In `EditableWorkflowCanvas`, compute:
```ts
const deletedStepIds = new Set(
  pendingChanges
    .filter((c): c is DeletedBlockDraft => c.kind === 'delete-step')
    .map(c => c.stepId)
);

const impactedStepIds = new Set(
  pendingChanges
    .filter((c): c is DeletedBlockDraft => c.kind === 'delete-step')
    .flatMap(c => c.impactedStepIds)
);

const removedConnectionKeys = new Set(
  pendingChanges
    .filter((c): c is RemovedConnectionDraft => c.kind === 'remove-connection')
    .map(c => `${c.fromStepId}-${c.toStepId}`)
);
```

Pass these to `WorkflowBlock` and `TransitionLines`.

---

## B. `WorkflowBlock` — deleted and impacted visual states

New props:
```ts
isDeleted?: boolean;
isImpacted?: boolean;  // impacted by a deletion
```

### When `isDeleted`:
- Outer div cursor: `'not-allowed'`
- Add a semi-transparent red overlay div (`position: absolute, inset: 0, background: 'rgba(220,38,38,0.15)', borderRadius: inherited, zIndex: 1, pointerEvents: 'none'`)
- Add a "DELETED" pill badge in the top-left (red background, white text, 9px font) — replaces "NEW" badge
- Block border: `2px solid #dc2626`
- Suppress 'i' icon when deleted
- Suppress drag when deleted (`onMouseDown: undefined`)

### When `isImpacted` (but not deleted):
- Add amber exclamation mark icon (!) in top-right corner of the block — small circle, amber/orange color (`#f59e0b`), white `!` inside
- This is a DIFFERENT position than the 'i' icon (top-right) — put it at `top: 4, left: 4` (top-left)
- Style: `position: absolute, top: 4, left: 4, width: 16, height: 16, borderRadius: '50%', background: '#f59e0b', color: 'white', fontSize: 10, fontWeight: 900, display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 2, pointerEvents: 'none'`
- Content: `!`

---

## C. `TransitionLines` — visual states for deleted/removed connections

New props: `deletedStepIds: Set<string>`, `removedConnectionKeys: Set<string>`

For each transition line:
1. If `deletedStepIds.has(t.fromStepId) || deletedStepIds.has(t.toStepId)`:
   - Add `strokeDasharray="8 4"`, stroke color = `#dc2626` (red), opacity 0.6
   - This shows lines to/from deleted blocks as dashed red

2. If `removedConnectionKeys.has(`${t.fromStepId}-${t.toStepId}`)`:
   - Add `strokeDasharray="4 4"`, stroke color = `#9ca3af` (grey), opacity 0.5
   - Indicate "this connection will be removed"

---

## D. Props interface update

Add to `EditableWorkflowCanvasProps`:
- These are derived inside the component from `pendingChanges` — no new props needed externally
- Import `DeletedBlockDraft`, `RemovedConnectionDraft` from shared types

## Acceptance criteria
- Deleted blocks render with red overlay, "DELETED" badge, no drag/info icon
- Impacted blocks show amber `!` icon
- Lines to/from deleted blocks are dashed red
- Removed connections are dashed grey
- tsc passes
