# Task TE — App.tsx integration

## Goal
Wire all improvements into App.tsx: sidebar toggle (floating when closed), canvas toolbar (zoom state), Clone button + modal, and updated hook call signatures. Read all modified files from TA-TD before editing.

## Files to read first (MANDATORY — read all before changing anything)
- `src/client/App.tsx`
- `src/client/hooks/useEditMode.ts` (updated by TA)
- `src/client/components/edit/EditSidebar.tsx` (updated by TA)
- `src/client/components/edit/EditableWorkflowCanvas.tsx` (updated by TB)
- `src/client/components/CanvasToolbar.tsx` (created by TB)
- `src/client/components/CloneModal.tsx` (created by TC)
- `src/client/hooks/useSeeds.ts` (updated by TC)
- `src/client/components/ConfigPanel.tsx` (updated by TD)

## Files to modify
- `src/client/App.tsx`

---

## Changes to implement

### 1. Add imports
```ts
import { CanvasToolbar } from './components/CanvasToolbar';
import { CloneModal } from './components/CloneModal';
```

### 2. Add state
```ts
const [sidebarVisible, setSidebarVisible] = useState(true);
const [zoomLevel, setZoomLevel] = useState(1.0);
const [showCloneModal, setShowCloneModal] = useState(false);
```

### 3. Zoom handlers
```ts
const ZOOM_STEP = 0.25;
const MIN_ZOOM = 0.25;
const MAX_ZOOM = 2.0;

const handleZoomIn = useCallback(() =>
  setZoomLevel((z) => Math.min(MAX_ZOOM, Math.round((z + ZOOM_STEP) * 100) / 100)), []);
const handleZoomOut = useCallback(() =>
  setZoomLevel((z) => Math.max(MIN_ZOOM, Math.round((z - ZOOM_STEP) * 100) / 100)), []);
const handleFitToScreen = useCallback(() => {
  // Import computeCanvasSize from CanvasToolbar or wherever it was placed
  // For now, reset to 1.0 as fallback; TE agent should read the actual export location from TB
  setZoomLevel(1.0);
}, []);
```

For fit-to-screen: import `computeCanvasSize` from wherever TB placed it. Use a `containerRef` on the canvas wrapper `Box` to get dimensions:
```ts
const canvasContainerRef = useRef<HTMLDivElement>(null);
const handleFitToScreen = useCallback(() => {
  if (!currentWorkflow || !canvasContainerRef.current) { setZoomLevel(1.0); return; }
  const { width: cw, height: ch } = computeCanvasSize(
    currentWorkflow.workflow.steps, pendingChanges
  );
  const { clientWidth, clientHeight } = canvasContainerRef.current;
  const fit = Math.min(clientWidth / cw, clientHeight / ch, MAX_ZOOM);
  setZoomLevel(Math.max(MIN_ZOOM, Math.round(fit * 100) / 100));
}, [currentWorkflow, pendingChanges]);
```

### 4. highlightedStepId state
```ts
const [highlightedStepId, setHighlightedStepId] = useState<string | null>(null);
```

### 5. Clone handler
```ts
const handleClone = useCallback(async (newFileName: string) => {
  const res = await fetch('/api/seeds/clone', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sourceFileName: selectedSeed, newFileName }),
  });
  const data = await res.json();
  if (!res.ok || !data.success) throw new Error(data.error ?? 'Clone failed');
  setShowCloneModal(false);
  await fetchSeeds(); // refresh seed list (from useSeeds)
  await handleSelectSeed(newFileName); // select new file
  enterEditMode(); // enter edit mode
}, [selectedSeed, fetchSeeds, handleSelectSeed, enterEditMode]);
```

(Read the actual exported name from useSeeds — it may be `fetchSeeds` or `refetch`.)

### 6. Update hook call signatures (TA changed recordBlockMove/recordFieldChange)
In the EditableWorkflowCanvas `onBlockMove` and `onInfoFieldChange` props:
```tsx
onBlockMove={(stepId, newGridX, newGridY) => {
  const step = currentWorkflow.workflow.steps.find((s) => s.id === stepId);
  if (step) recordBlockMove(step, newGridX, newGridY);  // ← pass full step object
}}
onInfoFieldChange={(step, field, value) =>
  recordFieldChange(step, field, value)  // ← pass full step object
}
```

### 7. Navbar: Add Clone button
Next to the Edit button:
```tsx
{currentWorkflow && !isEditMode && (
  <Button variant="outline" color="neutral" size="small" onClick={() => setShowCloneModal(true)}>
    Clone
  </Button>
)}
```

### 8. Render CloneModal
```tsx
{showCloneModal && selectedSeed && (
  <CloneModal
    sourceFileName={selectedSeed}
    onClone={handleClone}
    onCancel={() => setShowCloneModal(false)}
  />
)}
```

### 9. Canvas toolbar wrapper
The toolbar should be in a `position: relative` wrapper. Create a canvas wrapper function/block used in BOTH view mode AND edit mode:

```tsx
// View mode canvas wrapper:
<Box flex={1} position="relative" style={{ overflow: 'hidden' }}>
  <CanvasToolbar zoomLevel={zoomLevel} onZoomIn={handleZoomIn} onZoomOut={handleZoomOut} onFitToScreen={handleFitToScreen} />
  <Box ref={canvasContainerRef} flex={1} style={{ overflow: 'auto', height: '100%' }}>
    <div style={{ transform: `scale(${zoomLevel})`, transformOrigin: 'top left', display: 'inline-block' }}>
      <WorkflowView workflow={currentWorkflow.workflow} />
    </div>
  </Box>
</Box>

// Edit mode canvas wrapper (left column):
<Box flex={1} position="relative" style={{ overflow: 'hidden' }}>
  <CanvasToolbar zoomLevel={zoomLevel} onZoomIn={handleZoomIn} onZoomOut={handleZoomOut} onFitToScreen={handleFitToScreen} />
  <Box ref={canvasContainerRef} flex={1} style={{ overflow: 'auto', height: '100%' }}>
    <EditableWorkflowCanvas
      workflow={currentWorkflow.workflow}
      pendingChanges={pendingChanges}
      zoomLevel={zoomLevel}
      highlightedStepId={highlightedStepId}
      onBlockMove={...}
      onInfoFieldChange={...}
    />
  </Box>
</Box>
```

### 10. Sidebar toggle
The sidebar should collapse to just show the toggle button. Structure:

```tsx
{/* Right column - sidebar */}
<div style={{
  position: 'relative',
  width: sidebarVisible ? 300 : 40,
  flexShrink: 0,
  transition: 'width 0.2s ease',
  borderLeft: '1px solid var(--kds-color-gray-200)',
  display: 'flex',
  flexDirection: 'column',
}}>
  {sidebarVisible ? (
    <EditSidebar
      pendingChanges={pendingChanges}
      selectedSeed={selectedSeed!}
      onSaveSuccess={exitEditMode}
      onDiscard={discardChanges}
      onRemoveStepChange={removeStepChange}
      onStepHover={setHighlightedStepId}
      isSidebarVisible={sidebarVisible}
      onToggleSidebar={() => setSidebarVisible(false)}
    />
  ) : (
    /* When collapsed: just show the toggle button */
    <button
      onClick={() => setSidebarVisible(true)}
      style={{
        position: 'absolute', top: 12, left: '50%', transform: 'translateX(-50%)',
        background: 'white', border: '1px solid var(--kds-color-gray-200)',
        borderRadius: 6, cursor: 'pointer', padding: '6px 8px',
        boxShadow: '0 1px 4px rgba(0,0,0,0.08)', fontSize: 14,
      }}
      title="Show changes sidebar"
    >
      ▶
    </button>
  )}
</div>
```

Note: expose `removeStepChange` from `useEditMode` hook (added in TA). Read the actual return value before destructuring.

### 11. Reset sidebar visibility on mode exit
In `exitEditMode` effect or when `isEditMode` becomes false: `setSidebarVisible(true)` to reset for next edit session. Add this to `handleSelectSeed` as well.

## Acceptance criteria
- Clone button appears in navbar next to Edit when a seed is loaded.
- CloneModal opens; valid new name triggers clone → refresh seeds → select new file → enter edit mode.
- Zoom toolbar appears top-left of canvas area in both view and edit modes.
- Zoom in/out changes scale; fit-to-screen resets or calculates fit zoom.
- Sidebar collapses to toggle-only strip; expanding shows full sidebar.
- Toggle button stays visible when sidebar is collapsed.
- Hovering a sidebar change entry highlights the corresponding block on the canvas.
- Per-block remove (×) works via removeStepChange from hook.
- Cancel button in sidebar footer exits edit mode without saving.
- TypeScript compiles without new errors.
