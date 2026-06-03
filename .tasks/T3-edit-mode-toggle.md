# Task T3 — Edit mode toggle + layout scaffold in App

## Goal
Add an "Edit" button to the right side of the navigation bar and introduce `isEditMode` state in `App.tsx`. When edit mode is active, the main area layout changes to a two-column split: the workflow canvas on the left (flex: 1) and a sidebar placeholder on the right (300px). The actual canvas and sidebar components are stubbed here and wired in T8.

## Dependencies
- **T1** must be complete (imports `StepPendingChange` type for the stub state).

## Files to read (before starting)
- `src/client/App.tsx` — full file; this task modifies it
- `src/shared/types.ts` — `StepPendingChange` (new type from T1)

## Files to create / modify

| File | Action |
|------|--------|
| `src/client/App.tsx` | Add `isEditMode` state, Edit/View button in navbar, layout split for edit mode |

## Acceptance criteria
- An "Edit" button appears on the right side of the navbar, to the left of the existing settings icon button.
- Clicking "Edit" when a seed is loaded sets `isEditMode = true` and the button label changes to "View" (or uses a visual indicator — see notes).
- Clicking "View" (or the same button in active state) sets `isEditMode = false`.
- When `isEditMode = false`: layout is unchanged from today (renders `<WorkflowView>`).
- When `isEditMode = true`: the main content area is a horizontal flex row with two children:
  - Left child (flex: 1, overflow: auto): a placeholder `<div data-testid="edit-canvas-placeholder">` for now.
  - Right child (width: 300px, flex-shrink: 0, border-left): a placeholder `<div data-testid="edit-sidebar-placeholder">`.
- The Edit button is disabled / not shown when no seed is loaded (`!currentWorkflow`).
- DiagnosticsPanel and the "Last parsed" timestamp are hidden in edit mode (they clutter the layout; re-enable in T8 if desired).

## Implementation notes

### Button placement
The existing right-hand navbar section is:
```tsx
<Box display="flex" alignItems="center" gap={2} style={{ marginLeft: 'auto' }}>
    <Badge ... />
    <IconButton icon="settings" ... />
</Box>
```

Add a `<Button>` before the IconButton:
```tsx
{currentWorkflow && (
    <Button
        variant={isEditMode ? 'primary' : 'ghost'}
        size="small"
        onClick={() => setIsEditMode((v) => !v)}
    >
        {isEditMode ? 'View mode' : 'Edit'}
    </Button>
)}
```

Use the design-system `Button` component (already imported in App.tsx).

### State
Add alongside the existing `useState` calls:
```ts
const [isEditMode, setIsEditMode] = useState(false);
const [pendingChanges, setPendingChanges] = useState<StepPendingChange[]>([]);
```

`pendingChanges` is initialised here but not yet wired to anything — T8 will connect it. Declare it now so the type is available for passing to placeholders.

When `selectedSeed` changes (user picks a different seed), reset edit mode:
```ts
const handleSelectSeed = useCallback(async (fileName: string) => {
    setIsEditMode(false);      // ← add this line
    setPendingChanges([]);     // ← add this line
    // ... rest of existing handleSelectSeed body
}, [...]);
```

### Layout in edit mode
Replace the `<>...</>` fragment that currently wraps WorkflowTabs + WorkflowView + DiagnosticsPanel with:

```tsx
{isEditMode ? (
    <Box display="flex" flex={1} overflow="hidden">
        {/* Canvas — replaced by EditableWorkflowCanvas in T8 */}
        <Box flex={1} overflow="auto" position="relative">
            <div data-testid="edit-canvas-placeholder" style={{ padding: 24 }}>
                Edit canvas goes here
            </div>
        </Box>
        {/* Sidebar — replaced by EditSidebar in T8 */}
        <Box
            width="300px"
            flexShrink={0}
            style={{ borderLeft: '1px solid var(--kds-color-gray-200)', overflowY: 'auto' }}
        >
            <div data-testid="edit-sidebar-placeholder" style={{ padding: 16 }}>
                Edit sidebar goes here
            </div>
        </Box>
    </Box>
) : (
    <>
        {parseResult.workflows.length > 1 && (
            <WorkflowTabs ... />
        )}
        {currentWorkflow && <WorkflowView workflow={currentWorkflow.workflow} />}
        {parseResult.parsedAt && <Text ... />}
        <DiagnosticsPanel ... />
    </>
)}
```

### WorkflowTabs in edit mode
WorkflowTabs (tab switching between workflows) should stay visible in edit mode above the split area. Keep it outside the conditional if `parseResult.workflows.length > 1`.

## Codebase context

**Full current `src/client/App.tsx`:**
```tsx
import { useState, useEffect, useCallback } from 'react';
import { Alert, Badge, Box, Button, Heading, IconButton, Spinner, Text } from '@ksyos/design-system';
// ... imports

export function App() {
    const { config, loading, error, updateConfig } = useConfig();
    const { seeds, loading: seedsLoading, fetchSeeds, startWatching } = useSeeds(config?.clientSafePath);
    const { connected, lastResult, lastError } = useWebSocket();

    const [selectedSeed, setSelectedSeed] = useState<string | null>(null);
    const [parseResult, setParseResult] = useState<SeedParseResult | null>(null);
    const [activeWorkflowIndex, setActiveWorkflowIndex] = useState(0);
    const [showConfig, setShowConfig] = useState(false);

    // ... effects and handlers

    const currentWorkflow = parseResult?.workflows[activeWorkflowIndex];

    return (
        <>
            <Box as="header" bg="white" px={6} py={3} display="flex" alignItems="center" gap={4}
                 flexShrink={0} style={{ borderBottom: '1px solid var(--kds-color-gray-200)' }}>
                <KsyosLogo />
                <Heading size="xsmall" as="h1" style={{ whiteSpace: 'nowrap' }}>Flex Workflow Viewer</Heading>
                <Box display="flex" alignItems="center" gap={2} style={{ marginLeft: 'auto' }}>
                    <Badge text={connected ? 'Live' : 'Reconnecting…'} color={connected ? 'green' : 'red'} size="small" />
                    <IconButton icon="settings" labelText="Config" variant="ghost" onClick={() => setShowConfig(!showConfig)} />
                </Box>
            </Box>
            {/* ... rest of render */}
        </>
    );
}
```

**Design-system `Button` variants available:** `primary`, `secondary`, `ghost`, `danger`.
`Button` is already imported in App.tsx.
