# Task TX-D — App.tsx: use CanvasPane for both modes

## Goal
Simplify App.tsx by replacing the view-mode and edit-mode canvas wrappers with a single `<CanvasPane>` component. Remove all inline zoom state/handlers/refs from App.tsx (they move into CanvasPane).

## Dependencies
TX-C must be complete (CanvasPane exists).

## Files to read first
- `src/client/App.tsx` — full current file
- `src/client/components/CanvasPane.tsx` — just created

## Changes

### Remove from App.tsx
- `const [zoomLevel, setZoomLevel] = useState(1.0)`
- `const canvasContainerRef = useRef<HTMLDivElement>(null)`
- `handleZoomIn`, `handleZoomOut`, `handleFitToScreen` callbacks
- All imports of `CanvasToolbar`, `computeCanvasSize`, `ZOOM_STEP`, `MIN_ZOOM`, `MAX_ZOOM`
- The `WorkflowView` import and usage (replaced by CanvasPane)

### Add
- `import { CanvasPane } from './components/CanvasPane'`

### Replace view/edit mode canvas rendering
The current code has a big `{isEditMode && currentWorkflow ? <editLayout> : <viewLayout>}` block. Replace the two inner canvas sections with:

**Edit mode left column** (replaces the `<Box flex={1} position="relative" ...>` with toolbar + zoom wrapper + EditableWorkflowCanvas):
```tsx
<CanvasPane
  workflow={currentWorkflow.workflow}
  mode="edit"
  pendingChanges={pendingChanges}
  highlightedStepId={highlightedStepId}
  onBlockMove={(stepId, newGridX, newGridY) => {
    const step = currentWorkflow.workflow.steps.find((s) => s.id === stepId);
    if (step) recordBlockMove(step, newGridX, newGridY);
  }}
  onInfoFieldChange={(step, field, value) => recordFieldChange(step, field, value)}
/>
```

**View mode** (replaces the `<Box flex={1} position="relative" ...>` with toolbar + zoom wrapper + WorkflowView):
```tsx
<CanvasPane
  workflow={currentWorkflow.workflow}
  mode="view"
/>
```

Both are direct children of their respective flex containers. The sidebar toggle button and the edit sidebar `<div>` remain as siblings in the edit mode row.

### Simplify the overall conditional
The final structure should be:
```tsx
{isEditMode && currentWorkflow ? (
  <Box display="flex" flex={1} overflow="hidden" style={{ position: 'relative' }}>
    {/* Sidebar toggle button (absolute positioned) */}
    ...existing toggle button...
    {/* Canvas */}
    <CanvasPane mode="edit" workflow={...} pendingChanges={...} ... />
    {/* Sidebar */}
    <div style={{ width: sidebarVisible ? 300 : 0, ... }}>
      {sidebarVisible && <EditSidebar ... />}
    </div>
  </Box>
) : (
  <>
    {parseResult.workflows.length > 1 && <WorkflowTabs ... />}
    {currentWorkflow && (
      <CanvasPane mode="view" workflow={currentWorkflow.workflow} />
    )}
    {parseResult.parsedAt && <Text ...>Last parsed: ...</Text>}
    <DiagnosticsPanel ... />
  </>
)}
```

## Acceptance criteria
- App.tsx has no inline zoom state, zoom handlers, or canvas refs
- View mode renders EditableWorkflowCanvas (via CanvasPane) instead of WorkflowView
- Edit mode renders same CanvasPane in edit mode
- Auto-fit runs when seed loads (handled by CanvasPane)
- Legend works in both modes via toolbar button
- WorkflowView and its import can be removed if no longer used
- TypeScript compiles without new errors
