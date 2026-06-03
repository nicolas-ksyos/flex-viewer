# Task T6 — Edit changes sidebar

## Goal
Create `src/client/components/edit/EditSidebar.tsx` — a sidebar component that displays all pending step changes grouped by block name, and provides Save and Discard buttons at the bottom. The Save button calls `PATCH /api/seeds/:fileName`; on success the caller exits edit mode. The Discard button clears changes and exits edit mode without saving.

## Dependencies
- **T1** must be complete — uses `StepPendingChange`, `SeedPatchRequest`, `SeedPatchResponse`.
- **T2** must be complete — Save button calls the endpoint built in T2.

## Files to read (before starting)
- `src/shared/types.ts` — `StepPendingChange`, `SeedPatchRequest`, `SeedPatchResponse`
- `src/client/App.tsx` — understand `selectedSeed` (the fileName used in the PATCH URL)
- `src/client/components/StepDetailPanel.tsx` — reference for how the design system Drawer/Box/Text/Button are used

## Files to create / modify

| File | Action |
|------|--------|
| `src/client/components/edit/EditSidebar.tsx` | **Create new** |

## Acceptance criteria
- Sidebar renders a list of pending changes; when the list is empty it shows a placeholder ("No changes yet. Drag blocks or edit settings.").
- Each pending change entry shows: the step name, and a list of changed fields with their new values (e.g. "x: 3", "y: 1", "label: 'New label'").
- If the same step has multiple field changes, they appear in one group (one entry per step).
- "Save" button is at the bottom of the sidebar, always visible (sticky footer or always-visible bottom bar).
- "Discard" button appears above Save (or at the top of the sidebar as a secondary action).
- Clicking Save: disables both buttons, shows a spinner or loading indicator, calls `PATCH /api/seeds/:fileName`, then calls `onSaveSuccess()` on success or shows an inline error on failure.
- Clicking Discard: calls `onDiscard()` immediately with no network request.
- If `saving` is true: both buttons are disabled.
- If `saveError` is not null: display the error string in red above the Save button.
- No TypeScript errors.

## Implementation notes

### Props interface
```tsx
interface EditSidebarProps {
    pendingChanges: StepPendingChange[];
    selectedSeed: string;               // e.g. "124_3_orthopticsFollowUp_service.ts"
    onSaveSuccess: () => void;          // called after successful PATCH; caller exits edit mode
    onDiscard: () => void;              // called when Discard is clicked
}
```

The component manages its own `saving` and `saveError` state internally.

### Save logic
```ts
const [saving, setSaving] = useState(false);
const [saveError, setSaveError] = useState<string | null>(null);

const handleSave = async () => {
    setSaving(true);
    setSaveError(null);
    try {
        const body: SeedPatchRequest = { changes: pendingChanges };
        const res = await fetch(`/api/seeds/${encodeURIComponent(selectedSeed)}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
        });
        const data: SeedPatchResponse = await res.json();
        if (!res.ok || !data.success) {
            throw new Error(data.error ?? `Server error ${res.status}`);
        }
        onSaveSuccess();
    } catch (err) {
        setSaveError(err instanceof Error ? err.message : 'Save failed');
    } finally {
        setSaving(false);
    }
};
```

### Layout structure
```tsx
<Box
    display="flex"
    flexDirection="column"
    height="100%"
    style={{ width: 300, borderLeft: '1px solid var(--kds-color-gray-200)' }}
>
    {/* Header */}
    <Box px={4} py={3} flexShrink={0} style={{ borderBottom: '1px solid var(--kds-color-gray-100)' }}>
        <Heading size="xsmall" as="h2">Pending changes</Heading>
        <Button variant="ghost" size="small" onClick={onDiscard} disabled={saving}
                style={{ marginTop: 4 }}>
            ✕ Discard all &amp; exit
        </Button>
    </Box>

    {/* Changes list — scrollable */}
    <Box flex={1} overflowY="auto" px={3} py={2}>
        {pendingChanges.length === 0 ? (
            <Text color="subtle" size="sm">
                No changes yet. Drag blocks or edit settings.
            </Text>
        ) : (
            pendingChanges.map((change) => (
                <ChangeEntry key={change.stepId} change={change} />
            ))
        )}
    </Box>

    {/* Save footer — always visible */}
    <Box px={4} py={3} flexShrink={0} style={{ borderTop: '1px solid var(--kds-color-gray-200)' }}>
        {saveError && (
            <Text color="danger" size="sm" style={{ marginBottom: 8 }}>{saveError}</Text>
        )}
        <Button
            variant="primary"
            size="small"
            onClick={handleSave}
            disabled={saving || pendingChanges.length === 0}
            style={{ width: '100%' }}
        >
            {saving ? 'Saving…' : `Save ${pendingChanges.length} change${pendingChanges.length !== 1 ? 's' : ''}`}
        </Button>
    </Box>
</Box>
```

### `ChangeEntry` sub-component
```tsx
function ChangeEntry({ change }: { change: StepPendingChange }) {
    const fields = Object.entries(change.fields).filter(([, v]) => v !== undefined);
    return (
        <Box mb={3} p={2} bg="gray50" borderRadius="sm">
            <Text weight="semibold" size="sm" style={{ marginBottom: 4 }}>
                {change.stepName}
            </Text>
            {fields.map(([field, value]) => (
                <Text key={field} size="xs" color="subtle">
                    {field}: <span style={{ color: 'var(--kds-color-gray-900)', fontFamily: 'monospace' }}>
                        {JSON.stringify(value)}
                    </span>
                </Text>
            ))}
        </Box>
    );
}
```

### Design system components to use
Use `Box`, `Text`, `Heading`, `Button`, `Spinner` from `@ksyos/design-system`. These are all already used in other components — follow the same import pattern as `StepDetailPanel.tsx`.

## Codebase context

**`StepPendingChange` (from T1):**
```ts
interface StepPendingChange {
    stepName: string;   // 'Perform something'
    stepId: string;     // UUID
    fields: EditableStepFields;  // { x?: number; y?: number; name?: string; ... }
}
```

**`SeedPatchRequest` (from T1):**
```ts
interface SeedPatchRequest {
    changes: StepPendingChange[];
}
```

**`SeedPatchResponse` (from T1):**
```ts
interface SeedPatchResponse {
    success: boolean;
    error?: string;
}
```

**API endpoint (from T2):** `PATCH /api/seeds/:fileName`
The filename is the seed file's base name (e.g. `"124_3_orthopticsFollowUp_service.ts"`), not a full path.
Use `encodeURIComponent(selectedSeed)` in the fetch URL to handle special characters.

**CSS variables available:** `var(--kds-color-gray-200)`, `var(--kds-color-gray-100)`, `var(--kds-color-gray-900)`. Check `src/client/styles/index.css` for others.
