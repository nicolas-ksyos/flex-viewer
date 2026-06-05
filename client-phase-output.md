# Client Phase Output

## Files Created / Modified / (Attempted) Deleted

| File | Action |
|---|---|
| `src/client/components/edit/PendingChangesPanel.tsx` | **Created** — extracted pending-changes list from EditSidebar |
| `src/client/components/BlockDetailPanel.tsx` | **Created** — panel version of BlockSettingsPopover (read + editable modes) |
| `src/client/components/WorkflowOverviewPanel.tsx` | **Created** — workflow context panel (service name/code, step counts by type, activities) |
| `src/client/components/ConvertMigrationForm.tsx` | **Created** — inline convert-to-migration form |
| `src/client/components/ContextSidebar.tsx` | **Created** — unified sidebar replacing EditSidebar |
| `src/client/components/CanvasToolbar.tsx` | **Modified** — removed Edit, Clone, isEditMode props + their button renders |
| `src/client/components/edit/EditableWorkflowCanvas.tsx` | **Modified** — removed info icon + BlockSettingsPopover; added block click/select; added canvas background deselect |
| `src/client/components/CanvasPane.tsx` | **Modified** — added onBlockClick/selectedStepId props; removed onEdit/onClone from CanvasToolbar call |
| `src/client/App.tsx` | **Modified** — added selectedStepId state; unified canvas+sidebar layout for both modes; wired ContextSidebar |
| `src/client/components/edit/EditSidebar.tsx` | **Deletion blocked** — file still exists but is no longer imported anywhere; safe to delete manually |
| `src/client/components/edit/BlockSettingsPopover.tsx` | **Deletion blocked** — file still exists but is no longer imported anywhere; safe to delete manually |

---

## TypeScript Check Result

```
src/client/components/WorkflowView.tsx(5,31): error TS2307: Cannot find module '@frontend/...'
src/server/fileWatcher.ts(8,14): error TS2503: Cannot find namespace 'chokidar'.
src/server/fileWatcher.ts(45,23): error TS7006: Parameter 'err' implicitly has an 'any' type.
```

**All 3 errors are pre-existing** (confirmed by server-phase report). Zero new TypeScript errors introduced.

---

## Prop Name Discrepancies Discovered

1. **`ParsedWorkflow.serviceCode`** — The type is `string | null` (not `string | undefined`). `ContextSidebar` handles this correctly.
2. **KDS `Text` component** does not accept a `title` HTML attribute. Fixed by wrapping in `<span title={...}>` instead.
3. **`CanvasPane` onEdit/onClone/isEditMode** — These props are kept in the interface for backward compat but no longer passed to `CanvasToolbar`. App.tsx no longer passes them.
4. **`EditableWorkflowCanvas` unused props** — `onInfoFieldChange`, `blockParameterSchemas`, `allActivities`, `onParametersChange`, `onUndoRemoveConnection` are now unused (were only consumed by the removed `BlockSettingsPopover`). Prefixed with `_` in the destructuring to satisfy TypeScript; they remain in the public interface for forward compat.

---

## Feature Summary

### Block selection
- **Click a block** → `handleMouseDown` + `handleMouseUp` in `WorkflowBlock` detect movement < 4px → fires `onBlockClick(step)`
- **Click canvas background** → `canvasMouseDownPosRef` tracks background-only mousedowns (blocks call `e.stopPropagation()`); mouseup within 4px of mousedown → fires `onBlockClick(null)` (deselect)
- **Drag a block** → mouseup movement ≥ 4px → no click fires; drag commits normally via global `window.mouseup` handler
- **Selected block highlight** — rect/ellipse: `boxShadow: '0 0 0 2px #3b82f6, 0 0 0 5px rgba(59,130,246,0.18)'`; diamond: `filter: drop-shadow(0 0 4px rgba(59,130,246,0.8))`
- Works in both read-only (view) and editable (edit) mode

### Info icon removal
- Removed from all three block shapes (ellipse, diamond, rect)
- `BlockSettingsPopover` render removed from canvas
- `openPopoverStepId` state removed

### ContextSidebar (unified)
- **View mode + no selection** → `WorkflowOverviewPanel` (service name, step counts by type with coloured dots, activity list)
- **View mode + block selected** → `BlockDetailPanel` read-only (name, block type, x/y, performerNeedsTask, parameters, connections)
- **Edit mode + no selection** → `PendingChangesPanel` (additions, deletions, edits with hover-to-highlight) + Save/Discard footer
- **Edit mode + block selected** → `BlockDetailPanel` editable with amber-highlighted changed fields + dim "N other pending changes" footer
- **Header (view mode)** — filename + seed/migration badge + `[✏ Edit]` `[⎘ Clone]` buttons + `[→ Convert to Migration]` button that expands inline to `ConvertMigrationForm`
- **Header (edit mode)** — filename + `● Editing` indicator + `[Discard]` `[Save N]` buttons

### CanvasToolbar
- Edit and Clone buttons fully removed; toolbar now shows only Legend | − | % | + | ⊡

### Convert to Migration
- Derives name from seed filename (strips `NNN_N_` prefix, replaces `_` with `-`)
- Calls `POST /api/migrations/convert` with optional number/name overrides
- Shows ⚠ warning about reviewing transitions and `deleteSeedData` after conversion
- On success: green confirmation banner, then calls `onConvertSuccess(fileName)` after 3s

---

## Deferred Items / Known Gaps

1. **EditSidebar.tsx and BlockSettingsPopover.tsx deletion** — `rm` was blocked by the system. These files are safe dead code now (no imports anywhere). Delete manually: `rm src/client/components/edit/EditSidebar.tsx src/client/components/edit/BlockSettingsPopover.tsx`

2. **`onConvertSuccess` in App.tsx** — currently only calls `console.info`. A follow-up could navigate to the new migration file or show a toast notification.

3. **`WorkflowOverviewPanel` doesn't show profiles** — The AST parser does not extract profile data (`setupProfileForService` calls), so profile names cannot be shown in the overview. This is a parser limitation, not a UI gap. A future extension could parse profiles.

4. **Block detail connections in view mode** — Connection add/remove controls are hidden in read-only mode (correct), but the connection list shows all outgoing connections. The `onRemoveConnection` / `onUndoRemoveConnection` callbacks are not wired in view mode (also correct).

5. **`CreationToolbar` in CanvasPane** — The creation toolbar (Add Block / Add Connection / Add Transition) is still wired through `CanvasPane` and still requires all three `onAddBlock/onAddConnection/onAddTransition` callbacks to be present in edit mode. This is unchanged from before.
