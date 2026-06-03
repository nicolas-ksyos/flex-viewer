# Task T8 — Wire everything together + `useEditMode` hook

## Goal
Extract all edit-mode state and logic into a `useEditMode` custom hook, then wire `EditableWorkflowCanvas`, `EditSidebar`, and the `BlockSettingsPopover` (via canvas callbacks) into `App.tsx`, replacing the layout placeholders left by T3. After this task the full edit mode flow is functional end-to-end.

## Dependencies
All previous tasks must be complete:
- **T1** — types
- **T2** — server endpoint
- **T3** — edit toggle + placeholder layout in App
- **T4** — canvas static renderer
- **T5** — drag-and-drop on canvas
- **T6** — sidebar
- **T7** — 'i' icon + popover

## Files to read (before starting)
- `src/client/App.tsx` — current state after T3; this task replaces the placeholders
- `src/client/components/edit/EditableWorkflowCanvas.tsx` — final props after T4+T5+T7
- `src/client/components/edit/EditSidebar.tsx` — props interface from T6
- `src/shared/types.ts` — all new types from T1

## Files to create / modify

| File | Action |
|------|--------|
| `src/client/hooks/useEditMode.ts` | **Create new** — encapsulates all edit mode state and logic |
| `src/client/App.tsx` | Replace placeholder divs with real components; use `useEditMode` hook; remove inline edit state added in T3 |

## Acceptance criteria
- `useEditMode` hook exports: `isEditMode`, `pendingChanges`, `enterEditMode`, `exitEditMode`, `recordBlockMove`, `recordFieldChange`, `saveChanges`, `discardChanges`, `saving`, `saveError`.
- `recordBlockMove(stepId, stepName, newGridX, newGridY)` records or overwrites the `x`/`y` entry for that step in `pendingChanges`.
- `recordFieldChange(stepId, stepName, field, value)` records or overwrites the specific field entry for that step.
- For both record functions: if a pending change for `stepId` already exists, the new fields are **merged** (not replaced) — so a block that has been moved AND had its name changed shows both changes in one `StepPendingChange`.
- `saveChanges(selectedSeed)` calls `PATCH /api/seeds/:fileName`, on success calls `exitEditMode()`.
- `discardChanges()` calls `exitEditMode()`.
- `exitEditMode()` resets `isEditMode`, `pendingChanges`, `saving`, and `saveError`.
- When edit mode is active, `App.tsx` renders `<EditableWorkflowCanvas>` (not `<WorkflowView>`).
- When edit mode is active, `App.tsx` renders `<EditSidebar>` in the right column.
- The Edit/View button (from T3) calls `enterEditMode()` / `exitEditMode()`.
- After a successful save, the file watcher automatically re-parses the seed; the app switches back to view mode showing updated positions.
- When the user selects a different seed (via `handleSelectSeed`), edit mode resets: `exitEditMode()` is called.
- No TypeScript errors.

## Implementation notes

### `src/client/hooks/useEditMode.ts`

```ts
import { useState, useCallback } from 'react';
import type {
    StepPendingChange,
    EditableStepFields,
    SeedPatchRequest,
    SeedPatchResponse,
} from '../../shared/types';

export interface UseEditModeReturn {
    isEditMode: boolean;
    pendingChanges: StepPendingChange[];
    enterEditMode: () => void;
    exitEditMode: () => void;
    recordBlockMove: (stepId: string, stepName: string, newGridX: number, newGridY: number) => void;
    recordFieldChange: (stepId: string, stepName: string, field: keyof EditableStepFields, value: string | number | null | undefined) => void;
    saveChanges: (selectedSeed: string) => Promise<void>;
    discardChanges: () => void;
    saving: boolean;
    saveError: string | null;
}

export function useEditMode(): UseEditModeReturn {
    const [isEditMode, setIsEditMode] = useState(false);
    const [pendingChanges, setPendingChanges] = useState<StepPendingChange[]>([]);
    const [saving, setSaving] = useState(false);
    const [saveError, setSaveError] = useState<string | null>(null);

    const exitEditMode = useCallback(() => {
        setIsEditMode(false);
        setPendingChanges([]);
        setSaving(false);
        setSaveError(null);
    }, []);

    const enterEditMode = useCallback(() => setIsEditMode(true), []);

    /** Merge fields into an existing pending change, or create a new one. */
    const mergeChange = useCallback((stepId: string, stepName: string, fields: EditableStepFields) => {
        setPendingChanges((prev) => {
            const idx = prev.findIndex((c) => c.stepId === stepId);
            if (idx >= 0) {
                const updated = [...prev];
                updated[idx] = {
                    ...updated[idx],
                    fields: { ...updated[idx].fields, ...fields },
                };
                return updated;
            }
            return [...prev, { stepId, stepName, fields }];
        });
    }, []);

    const recordBlockMove = useCallback(
        (stepId: string, stepName: string, newGridX: number, newGridY: number) =>
            mergeChange(stepId, stepName, { x: newGridX, y: newGridY }),
        [mergeChange]
    );

    const recordFieldChange = useCallback(
        (stepId: string, stepName: string, field: keyof EditableStepFields, value: string | number | null | undefined) =>
            mergeChange(stepId, stepName, { [field]: value }),
        [mergeChange]
    );

    const saveChanges = useCallback(async (selectedSeed: string) => {
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
            exitEditMode();
        } catch (err) {
            setSaveError(err instanceof Error ? err.message : 'Save failed');
        } finally {
            setSaving(false);
        }
    }, [pendingChanges, exitEditMode]);

    const discardChanges = useCallback(() => exitEditMode(), [exitEditMode]);

    return {
        isEditMode,
        pendingChanges,
        enterEditMode,
        exitEditMode,
        recordBlockMove,
        recordFieldChange,
        saveChanges,
        discardChanges,
        saving,
        saveError,
    };
}
```

### `src/client/App.tsx` changes

1. **Remove** the inline `isEditMode` and `pendingChanges` state added in T3.
2. **Add** `useEditMode` import and call.
3. **Replace** the edit-mode placeholder divs with real components.
4. **Update** `handleSelectSeed` to call `exitEditMode()` when a new seed is selected.
5. **Update** the Edit/View button to call `enterEditMode()` / `exitEditMode()`.

```tsx
// Add import:
import { useEditMode } from './hooks/useEditMode';
import { EditableWorkflowCanvas } from './components/edit/EditableWorkflowCanvas';
import { EditSidebar } from './components/edit/EditSidebar';

// Inside App():
const {
    isEditMode,
    pendingChanges,
    enterEditMode,
    exitEditMode,
    recordBlockMove,
    recordFieldChange,
    saveChanges,
    discardChanges,
} = useEditMode();

// Update handleSelectSeed:
const handleSelectSeed = useCallback(async (fileName: string) => {
    exitEditMode();               // ← replaces setIsEditMode(false) + setPendingChanges([])
    setSelectedSeed(fileName);
    setParseResult(null);
    setActiveWorkflowIndex(0);
    await updateConfig({ lastSelectedSeed: fileName });
    await startWatching(fileName);
}, [updateConfig, startWatching, exitEditMode]);

// Update the Edit button:
<Button
    variant={isEditMode ? 'primary' : 'ghost'}
    size="small"
    onClick={() => isEditMode ? exitEditMode() : enterEditMode()}
    disabled={!currentWorkflow}
>
    {isEditMode ? 'View mode' : 'Edit'}
</Button>
```

### Edit-mode layout (replaces placeholder from T3)

```tsx
{isEditMode && currentWorkflow ? (
    <>
        {parseResult.workflows.length > 1 && (
            <WorkflowTabs workflows={parseResult.workflows} activeIndex={activeWorkflowIndex} onSelect={setActiveWorkflowIndex} />
        )}
        <Box display="flex" flex={1} overflow="hidden">
            <Box flex={1} overflow="auto" position="relative">
                <EditableWorkflowCanvas
                    workflow={currentWorkflow.workflow}
                    pendingChanges={pendingChanges}
                    onBlockMove={(stepId, newGridX, newGridY) => {
                        const step = currentWorkflow.workflow.steps.find((s) => s.id === stepId);
                        if (step) recordBlockMove(stepId, step.name, newGridX, newGridY);
                    }}
                    onInfoFieldChange={(step, field, value) =>
                        recordFieldChange(step.id, step.name, field, value)
                    }
                />
            </Box>
            <EditSidebar
                pendingChanges={pendingChanges}
                selectedSeed={selectedSeed!}
                onSaveSuccess={exitEditMode}
                onDiscard={discardChanges}
            />
        </Box>
    </>
) : (
    // existing view-mode render block (WorkflowView, DiagnosticsPanel, etc.)
)}
```

### Note on EditSidebar's save logic
`EditSidebar` (T6) manages its own saving state internally and calls `onSaveSuccess` on success. In T8 we pass `exitEditMode` as `onSaveSuccess`. The sidebar does not need `saveChanges` from the hook — it makes the fetch call itself. This is a deliberate duplication of the fetch logic for simplicity; if it needs to be consolidated later, move it entirely into the hook and pass `onSave` as `() => saveChanges(selectedSeed!)` to the sidebar.

**Alternative clean approach:** remove the fetch from the sidebar (T6) and instead pass an `onSave` async callback:
```tsx
// In EditSidebar: call props.onSave() instead of doing fetch directly
// In App.tsx: onSave={() => saveChanges(selectedSeed!)}
```
Either approach is acceptable; choose whichever is cleaner given the T6 implementation.

## Codebase context

**All props for `EditableWorkflowCanvas` (assembled from T4+T5+T7):**
```ts
interface EditableWorkflowCanvasProps {
    workflow: ParsedWorkflowDefinition;
    pendingChanges: StepPendingChange[];
    onBlockMove: (stepId: string, newGridX: number, newGridY: number) => void;
    onInfoFieldChange: (step: ParsedWorkflowStep, field: keyof EditableStepFields, value: string | number | null) => void;
}
```

**All props for `EditSidebar` (from T6):**
```ts
interface EditSidebarProps {
    pendingChanges: StepPendingChange[];
    selectedSeed: string;
    onSaveSuccess: () => void;
    onDiscard: () => void;
}
```

**`useEditMode` hook is the single source of truth for:**
- Whether edit mode is active
- All pending changes (position + field edits merged per step)
- Save/discard actions
- Error/loading state

**File watcher behaviour:** After a successful PATCH write, `fileWatcher.ts` detects the change and broadcasts a `workflowUpdate` WebSocket message. `useWebSocket` in App.tsx already handles this and calls `setParseResult(lastResult)`. The updated positions will appear automatically in view mode after `exitEditMode()` switches back.
