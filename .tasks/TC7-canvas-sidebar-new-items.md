# Task TC7 — Canvas and sidebar rendering of new items

## Goal
(A) EditableWorkflowCanvas: render new-step drafts with dashed border + "NEW" badge.
(B) EditSidebar: show new items (new steps, connections, transitions) with "NEW" badge, separate section, remove button.

## Dependencies
TC1, TC2 (computeDisplayWorkflow, PendingChangeItem).

## Files to modify
- `src/client/components/edit/EditableWorkflowCanvas.tsx`
- `src/client/components/edit/EditSidebar.tsx`

---

## A. Canvas: render new steps

The canvas already receives `pendingChanges: PendingChangeItem[]`. Use `computeDisplayWorkflow(workflow, pendingChanges)` to get the merged display workflow. New steps have `isNew: true`.

In `WorkflowBlock`, when `step.isNew`:
- Add `border-style: dashed` to the block's border
- Show a small "NEW" pill badge in the top-left corner of the block (green background, white text, 9px font)
- Do NOT show the 'i' info icon for new blocks (not yet editable this way)

New transitions (from new-connection/new-transition drafts) appear as dashed arrows:
- In `TransitionLines`, for transitions with `isNew: true`, add `strokeDasharray="6 3"` to the SVG line

---

## B. Sidebar: new items section

Add a "Pending additions" section ABOVE the existing "Pending edits" section in `EditSidebar`.

New `EditSidebarProps` additions:
```ts
onRemoveNewItem?: (tempId: string) => void;
```

For each new-step draft: show with a green "NEW" badge and the step name.
For each new-connection draft: show as "Connection: {fromName} → {toName(s)} [{sync/async}]" with green "NEW" badge.
For each new-transition draft: show as "Disable: {fromName} disables {toName(s)}" with red "DISABLE" badge.

Each entry has a × button that calls `onRemoveNewItem(tempId)`.

If there are both additions AND edits, show a "Additions" header then an "Edits" header to separate the groups.

## Acceptance criteria
- New steps render on canvas with dashed border + "NEW" badge at their specified x/y
- New connection/transition arrows render as dashed lines
- Sidebar shows new items in a separate section with appropriate badges
- Removing a new item from sidebar removes it from canvas too
