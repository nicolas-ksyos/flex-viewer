# Task TX-C — CanvasPane component

## Goal
Create `src/client/components/CanvasPane.tsx` — a self-contained component that owns zoom state, auto-fit on load, the CanvasToolbar, and the zoom wrapper. It renders `EditableWorkflowCanvas` in either read-only (view) or interactive (edit) mode. App.tsx uses this one component for both modes.

## Dependencies
TX-A and TX-B must be complete (readOnly prop on canvas, legend props on toolbar).

## Files to read first
- `src/client/components/edit/EditableWorkflowCanvas.tsx` — final props
- `src/client/components/CanvasToolbar.tsx` — final props (after TX-B)
- `src/client/components/WorkflowLegend.tsx` — created in TX-B
- `src/shared/types.ts`

## Create: `src/client/components/CanvasPane.tsx`

```tsx
interface CanvasPaneProps {
  workflow: ParsedWorkflowDefinition;
  mode: 'view' | 'edit';
  // Edit-mode only:
  pendingChanges?: StepPendingChange[];
  highlightedStepId?: string | null;
  onBlockMove?: (stepId: string, newGridX: number, newGridY: number) => void;
  onInfoFieldChange?: (step: ParsedWorkflowStep, field: keyof EditableStepFields, value: string | number | null) => void;
}
```

### Internals
- `const [zoomLevel, setZoomLevel] = useState(1.0)`
- `const [showLegend, setShowLegend] = useState(false)`
- `const containerRef = useRef<HTMLDivElement>(null)`
- zoom handlers: `handleZoomIn`, `handleZoomOut`, `handleFitToScreen` (same logic as currently in App.tsx)
- **Auto-fit on load**: `useEffect(() => { handleFitToScreen(); }, [workflow])` — but since the container needs to be in the DOM, use `setTimeout(() => handleFitToScreen(), 0)` inside the effect so the layout has rendered.

### Rendering structure
```tsx
<div style={{ flex: 1, position: 'relative', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
  <CanvasToolbar
    zoomLevel={zoomLevel}
    onZoomIn={handleZoomIn}
    onZoomOut={handleZoomOut}
    onFitToScreen={handleFitToScreen}
    showLegend={showLegend}
    onToggleLegend={() => setShowLegend((v) => !v)}
  />
  {showLegend && <WorkflowLegend onClose={() => setShowLegend(false)} />}

  {/* Scroll container */}
  <div ref={containerRef} style={{ flex: 1, overflow: 'auto', position: 'relative' }}>
    {/* Spacer for correct scrollbar size at zoom != 1 */}
    <div style={{ width: naturalW * zoomLevel, height: naturalH * zoomLevel, flexShrink: 0 }} />
    {/* Scaled canvas */}
    <div style={{ position: 'absolute', top: 0, left: 0, transformOrigin: 'top left', transform: `scale(${zoomLevel})` }}>
      <EditableWorkflowCanvas
        workflow={workflow}
        pendingChanges={pendingChanges ?? []}
        readOnly={mode === 'view'}
        highlightedStepId={highlightedStepId}
        onBlockMove={onBlockMove ?? (() => {})}
        onInfoFieldChange={onInfoFieldChange ?? (() => {})}
      />
    </div>
  </div>
</div>
```

Where `naturalW/H` come from `computeCanvasSize(workflow.steps, pendingChanges ?? [])` (imported from CanvasToolbar).

### handleFitToScreen
```ts
const handleFitToScreen = useCallback(() => {
  if (!containerRef.current) { setZoomLevel(1.0); return; }
  const { width: cw, height: ch } = computeCanvasSize(workflow.steps, pendingChanges ?? []);
  const { clientWidth, clientHeight } = containerRef.current;
  const fit = Math.min(clientWidth / cw, clientHeight / ch, MAX_ZOOM);
  setZoomLevel(Math.max(MIN_ZOOM, parseFloat(fit.toFixed(2))));
}, [workflow.steps, pendingChanges]);
```

### Auto-fit on workflow change
```ts
useEffect(() => {
  const id = setTimeout(() => handleFitToScreen(), 50);
  return () => clearTimeout(id);
}, [workflow]); // re-fit when workflow changes (new seed loaded)
```

## Acceptance criteria
- `CanvasPane` renders with toolbar + zoom wrapper + canvas
- readOnly mode: no drag cursors, no info icons
- Legend toggles via toolbar button
- Auto-fit runs after mount and whenever `workflow` prop changes
- Props forwarded correctly to EditableWorkflowCanvas
- TypeScript compiles without new errors
