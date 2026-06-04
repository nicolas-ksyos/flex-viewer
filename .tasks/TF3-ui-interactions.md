# Task TF3 — UI: delete button on blocks, editable connections in popover

## Goal
1. Add a delete/trash button on each block in edit mode (hover overlay, next to 'i' icon)
2. In `BlockSettingsPopover`, add × remove buttons on existing outgoing connections
3. Update `EditSidebar` to show deletions and removed connections sections

## Dependencies
TF1 — new types and useEditMode methods.

## Files to read first
- `src/client/components/edit/EditableWorkflowCanvas.tsx` (WorkflowBlock section, info icon)
- `src/client/components/edit/BlockSettingsPopover.tsx` (connections section)
- `src/client/components/edit/EditSidebar.tsx`
- `src/shared/types.ts`

---

## A. Delete button on WorkflowBlock

Add to `WorkflowBlockProps`:
```ts
onDeleteClick?: () => void;
isDeleted?: boolean;
```

When `!readOnly && isHovered && !isDragging && !isDeleted`:
- Show a trash icon button at `top: 4, right: 26` (to the left of the 'i' icon):
```tsx
<button
  onMouseDown={(e) => e.stopPropagation()}
  onClick={(e) => { e.stopPropagation(); onDeleteClick?.(); }}
  style={{
    position: 'absolute', top: 4, right: 26,
    width: 18, height: 18, borderRadius: '50%',
    border: '1px solid #dc2626', background: 'rgba(255,255,255,0.85)',
    cursor: 'pointer', display: 'flex', alignItems: 'center',
    justifyContent: 'center', padding: 0, zIndex: 2, color: '#dc2626', opacity: 0.8,
  }}
  title="Delete block"
  aria-label="Delete block"
>
  {/* Trash SVG icon 10×10 */}
  <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
    <rect x="1" y="3" width="8" height="6" rx="0.5" stroke="currentColor" strokeWidth="1.2"/>
    <line x1="3" y1="3" x2="3" y2="9" stroke="currentColor" strokeWidth="1"/>
    <line x1="5" y1="3" x2="5" y2="9" stroke="currentColor" strokeWidth="1"/>
    <line x1="7" y1="3" x2="7" y2="9" stroke="currentColor" strokeWidth="1"/>
    <line x1="0" y1="2" x2="10" y2="2" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
    <path d="M3.5 2V1.5C3.5 1.22 3.72 1 4 1H6C6.28 1 6.5 1.22 6.5 1.5V2" stroke="currentColor" strokeWidth="1"/>
  </svg>
</button>
```

When `isDeleted`: show an "Undo" button instead — small circular ↩ icon:
```tsx
{isDeleted && !readOnly && isHovered && (
  <button
    onMouseDown={(e) => e.stopPropagation()}
    onClick={(e) => { e.stopPropagation(); onDeleteClick?.(); }}
    style={{ position: 'absolute', top: 4, right: 26, ... color: '#6b7280', border: '1px solid #9ca3af' }}
    title="Undo deletion"
  >↩</button>
)}
```

Pass `onDeleteClick` and `isDeleted` from the canvas, calling:
- If not deleted: `recordBlockDeletion(step, workflow)` — passed as new canvas callback `onDeleteBlock`
- If deleted: `undoBlockDeletion(step.id)` — passed as `onUndoDeleteBlock`

Add to `EditableWorkflowCanvasProps`:
```ts
onDeleteBlock?: (step: ParsedWorkflowStep) => void;
onUndoDeleteBlock?: (stepId: string) => void;
```

---

## B. `BlockSettingsPopover` — × remove buttons on existing connections

In the "Current outgoing" connections section, add an × button on each connection row:

```tsx
{allTransitions.filter(t => t.fromStepId === step.id).map(t => {
  const target = allSteps?.find(s => s.id === t.toStepId);
  const isAlreadyPendingRemoval = pendingRemovedConnectionKeys?.has(`${t.fromStepId}-${t.toStepId}`);
  
  return (
    <div key={t.id} style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 3 }}>
      <div style={{ flex: 1, fontSize: 11, color }}>
        {isAlreadyPendingRemoval ? <s>→ {name} [{tag}]</s> : `→ ${name} [${tag}]`}
      </div>
      {onRemoveConnection && !isAlreadyPendingRemoval && (
        <button
          onClick={() => onRemoveConnection({
            tempId: `rm-conn-${t.id}`,
            fromStepId: step.id,
            fromStepName: step.name,
            fromVariableName: step.variableName ?? '',
            toStepId: t.toStepId,
            toStepName: target?.name ?? t.toStepId,
            toVariableName: target?.variableName ?? '',
            synchronous: t.synchronous,
            isDisable: t.type === 'disable',
          })}
          style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#9ca3af', fontSize: 14, padding: '0 2px', lineHeight: 1 }}
          title="Remove this connection"
        >×</button>
      )}
      {onRemoveConnection && isAlreadyPendingRemoval && (
        <button
          onClick={() => onUndoRemoveConnection?.(`rm-conn-${t.id}`)}
          style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#6b7280', fontSize: 10, padding: '0 2px' }}
          title="Undo removal"
        >↩</button>
      )}
    </div>
  );
})}
```

New props on `BlockSettingsPopoverProps`:
```ts
onRemoveConnection?: (draft: Omit<RemovedConnectionDraft, 'kind'>) => void;
onUndoRemoveConnection?: (tempId: string) => void;
pendingRemovedConnectionKeys?: Set<string>; // `${fromId}-${toId}` keys
```

---

## C. `EditSidebar.tsx` — Deletions and removals sections

In the "Additions" section (or as a new "Deletions" section), add entries for:

```tsx
const deletedSteps = pendingChanges.filter((c): c is DeletedBlockDraft => c.kind === 'delete-step');
const removedConns = pendingChanges.filter((c): c is RemovedConnectionDraft => c.kind === 'remove-connection');
```

**Deletions section** (shown above additions when present):
```tsx
{deletedSteps.length > 0 && (
  <div style={{ marginBottom: 8 }}>
    <div style={sectionHeaderStyle}>Deletions</div>
    {deletedSteps.map((draft) => (
      <NewItemEntry
        key={draft.stepId}
        badge={{ text: 'DELETE', color: '#dc2626' }}
        label={draft.stepName}
        detail={
          draft.impactedStepNames.length > 0
            ? `Impacts: ${draft.impactedStepNames.join(', ')}`
            : 'No dependencies'
        }
        onRemove={() => onRemoveNewItem?.(draft.stepId)}
      />
    ))}
  </div>
)}
```

**Removed connections section** (grouped under source step):
```tsx
{removedConns.length > 0 && (
  <div style={{ marginBottom: 8 }}>
    <div style={sectionHeaderStyle}>Removed connections</div>
    {removedConns.map((draft) => (
      <NewItemEntry
        key={draft.tempId}
        badge={{ text: 'REMOVE', color: '#f59e0b' }}
        label={`${draft.fromStepName} → ${draft.toStepName}`}
        detail={draft.synchronous ? 'sync' : draft.isDisable ? 'disable' : 'async'}
        onRemove={() => onRemoveNewItem?.(draft.tempId)}
      />
    ))}
  </div>
)}
```

The existing `onRemoveNewItem` callback needs to handle `delete-step` by matching `stepId` and `remove-connection` by matching `tempId`. Update `removeNewItem` in useEditMode to also remove by `stepId` for delete-step drafts:
```ts
const removeNewItem = useCallback((idOrTempId: string) =>
  setPendingChanges(prev => prev.filter(c => {
    if (c.kind === 'new-step') return c.tempId !== idOrTempId;
    if (c.kind === 'new-connection') return c.tempId !== idOrTempId;
    if (c.kind === 'new-transition') return c.tempId !== idOrTempId;
    if (c.kind === 'delete-step') return c.stepId !== idOrTempId;
    if (c.kind === 'remove-connection') return c.tempId !== idOrTempId;
    return true;
  })),
  []
);
```

## Acceptance criteria
- Hovering a block shows trash icon (next to 'i'), clicking marks it as deleted
- Deleted block shows ↩ undo button on hover
- Popover connections have × remove buttons; removed connections shown with strikethrough
- Sidebar shows DELETED (red), REMOVE (amber) badges with details
- tsc passes
