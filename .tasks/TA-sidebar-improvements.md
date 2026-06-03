# Task TA — Sidebar improvements

## Goal
Improve `EditSidebar.tsx` and `useEditMode.ts` with: true-change detection (auto-remove no-op changes), per-block remove button, hover-to-highlight callback, Cancel button moved next to Save, and a toggle-ready structure. The sidebar toggle itself is wired in TE.

## Files to read first
- `src/client/components/edit/EditSidebar.tsx`
- `src/client/hooks/useEditMode.ts`
- `src/shared/types.ts`

## Files to modify
- `src/client/hooks/useEditMode.ts`
- `src/client/components/edit/EditSidebar.tsx`

---

## useEditMode.ts changes

### 1. Update recordBlockMove signature — accept full step + auto-prune
Replace `recordBlockMove(stepId, stepName, newGridX, newGridY)` with:

```ts
recordBlockMove: (step: ParsedWorkflowStep, newGridX: number, newGridY: number) => void;
```

Import `ParsedWorkflowStep` from `../../shared/types`.

Implementation: after merging x/y, check if the resulting pending fields for this step are all equal to the original step values. If so, remove the entry entirely.

```ts
const recordBlockMove = useCallback(
  (step: ParsedWorkflowStep, newGridX: number, newGridY: number) => {
    setPendingChanges((prev) => {
      const idx = prev.findIndex((c) => c.stepId === step.id);
      const existing = idx >= 0 ? prev[idx].fields : {};
      const merged: EditableStepFields = { ...existing, x: newGridX, y: newGridY };
      const pruned = pruneMatchingOriginal(merged, step);
      if (Object.keys(pruned).length === 0) {
        return prev.filter((c) => c.stepId !== step.id);
      }
      if (idx >= 0) {
        const updated = [...prev];
        updated[idx] = { ...updated[idx], fields: pruned };
        return updated;
      }
      return [...prev, { stepId: step.id, stepName: step.name, fields: pruned }];
    });
  },
  []
);
```

### 2. Update recordFieldChange signature similarly
```ts
recordFieldChange: (step: ParsedWorkflowStep, field: keyof EditableStepFields, value: string | number | null | undefined) => void;
```

Same auto-prune logic after merging.

### 3. pruneMatchingOriginal helper (module-level)
```ts
function pruneMatchingOriginal(
  fields: EditableStepFields,
  step: ParsedWorkflowStep
): EditableStepFields {
  const result: EditableStepFields = {};
  for (const [key, value] of Object.entries(fields) as [keyof EditableStepFields, unknown][]) {
    const original = getOriginalValue(step, key);
    if (value !== original) {
      (result as Record<string, unknown>)[key] = value;
    }
  }
  return result;
}

function getOriginalValue(step: ParsedWorkflowStep, field: keyof EditableStepFields): unknown {
  switch (field) {
    case 'x': return step.displayOptions.x;
    case 'y': return step.displayOptions.y;
    case 'name': return step.name;
    case 'label': return step.label;
    case 'allowedPerformer': return step.allowedPerformer;
    case 'type': return step.type ?? '';
    case 'block': return step.serviceWorkflowBlock.name;
    default: return undefined;
  }
}
```

### 4. Add removeStepChange
```ts
removeStepChange: (stepId: string) => void;
```
Implementation: `setPendingChanges((prev) => prev.filter((c) => c.stepId !== stepId))`.

### 5. Export interface updates
Add `removeStepChange` to `UseEditModeReturn`. Update `recordBlockMove` and `recordFieldChange` signatures.

---

## EditSidebar.tsx changes

### New props
```tsx
interface EditSidebarProps {
  pendingChanges: StepPendingChange[];
  selectedSeed: string;
  onSaveSuccess: () => void;
  onDiscard: () => void;
  onRemoveStepChange: (stepId: string) => void;
  onStepHover: (stepId: string | null) => void;
  // toggle button props — rendered in header, wired by App.tsx in TE
  isSidebarVisible?: boolean;       // used by toggle button
  onToggleSidebar?: () => void;     // called when toggle button clicked
}
```

### Layout changes

**Header**: Row with [toggle icon button] [title "Pending changes"] — toggle button to the LEFT of the title
```tsx
<Box px={4} py={3} flexShrink={0} display="flex" alignItems="center" gap={2}
     style={{ borderBottom: '1px solid var(--kds-color-gray-100)' }}>
  {/* Toggle button — stays visible even when sidebar collapses (handled by App TE) */}
  {onToggleSidebar && (
    <button onClick={onToggleSidebar} style={iconButtonStyle} title={isSidebarVisible ? 'Hide sidebar' : 'Show sidebar'}>
      {isSidebarVisible ? '◀' : '▶'}
    </button>
  )}
  <Heading size="xsmall" as="h2" style={{ flex: 1 }}>Pending changes</Heading>
</Box>
```

**Scrollable list**: unchanged structure but `ChangeEntry` gets new props.

**Footer**: TWO buttons side by side — Cancel (ghost/outline) and Save (primary). Save only rendered when `pendingChanges.length > 0`.
```tsx
<Box px={4} py={3} flexShrink={0} display="flex" gap={2}
     style={{ borderTop: '1px solid var(--kds-color-gray-200)' }}>
  {saveError && <Text size="xs" color="danger" style={{ marginBottom: 8, display: 'block', width: '100%' }}>{saveError}</Text>}
  <Button variant="outline" color="neutral" size="small" onClick={onDiscard} isDisabled={saving} style={{ flex: 1 }}>
    Cancel
  </Button>
  {pendingChanges.length > 0 && (
    <Button variant="solid" color="primary" size="small" onClick={handleSave} isDisabled={saving} style={{ flex: 1 }}>
      {saving ? 'Saving…' : `Save ${pendingChanges.length}`}
    </Button>
  )}
</Box>
```

### ChangeEntry with cross icon + hover
```tsx
function ChangeEntry({
  change,
  onRemove,
  onMouseEnter,
  onMouseLeave,
}: {
  change: StepPendingChange;
  onRemove: () => void;
  onMouseEnter: () => void;
  onMouseLeave: () => void;
}) {
  const fields = Object.entries(change.fields).filter(([, v]) => v !== undefined);
  return (
    <Box
      mb={2} p={2}
      style={{ background: 'var(--kds-color-gray-50)', borderRadius: 6, position: 'relative' }}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
    >
      {/* Cross icon top-right */}
      <button
        onClick={onRemove}
        style={{
          position: 'absolute', top: 4, right: 4,
          background: 'none', border: 'none', cursor: 'pointer',
          fontSize: 14, lineHeight: 1, color: '#9ca3af', padding: '0 2px',
        }}
        title="Remove changes for this block"
        aria-label="Remove changes"
      >×</button>
      <Text size="sm" style={{ fontWeight: 600, paddingRight: 20 }}>{change.stepName}</Text>
      {fields.map(([field, value]) => (
        <Text key={field} size="xs" color="subtle">
          {field}: <span style={{ color: 'var(--kds-color-gray-900)', fontFamily: 'monospace' }}>{JSON.stringify(value)}</span>
        </Text>
      ))}
    </Box>
  );
}
```

Pass `onRemoveStepChange` and `onStepHover` down to each `ChangeEntry`.

## Acceptance criteria
- `pendingChanges` auto-removes entries whose fields all match original step values after a move or field edit.
- `removeStepChange(stepId)` removes an entry.
- Sidebar footer has Cancel (always) + Save (only when changes exist), side by side.
- Each change entry has a × button that calls `onRemoveStepChange`.
- Hovering a change entry calls `onStepHover(stepId)` / `onStepHover(null)`.
- TypeScript compiles without new errors.
