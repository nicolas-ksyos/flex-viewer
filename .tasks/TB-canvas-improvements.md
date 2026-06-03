# Task TB — Canvas toolbar (zoom + highlight)

## Goal
Add zoom support to `EditableWorkflowCanvas` and create a new `CanvasToolbar` component (zoom in/out/fit buttons). Toolbar is positioned absolutely at top-left of the canvas container — always visible when a seed is loaded (wired by TE). Also add `highlightedStepId` prop for sidebar hover highlighting.

## Files to read first
- `src/client/components/edit/EditableWorkflowCanvas.tsx`
- `src/client/components/WorkflowView.tsx`
- `src/shared/types.ts`

## Files to create / modify
- **Create** `src/client/components/CanvasToolbar.tsx`
- **Modify** `src/client/components/edit/EditableWorkflowCanvas.tsx` — add zoomLevel + highlightedStepId props

---

## CanvasToolbar.tsx

```tsx
interface CanvasToolbarProps {
  zoomLevel: number;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onFitToScreen: () => void;
}

const ZOOM_STEP = 0.25;
const MIN_ZOOM = 0.25;
const MAX_ZOOM = 2.0;

export function CanvasToolbar({ zoomLevel, onZoomIn, onZoomOut, onFitToScreen }: CanvasToolbarProps) {
  return (
    <div style={{
      position: 'absolute', top: 12, left: 12, zIndex: 10,
      display: 'flex', alignItems: 'center', gap: 4,
      background: 'white', border: '1px solid var(--kds-color-gray-200)',
      borderRadius: 8, padding: '4px 8px', boxShadow: '0 1px 4px rgba(0,0,0,0.08)',
    }}>
      <button onClick={onZoomOut} disabled={zoomLevel <= MIN_ZOOM} title="Zoom out"
              style={toolbarBtnStyle}>−</button>
      <span style={{ fontSize: 11, color: '#6b7280', minWidth: 36, textAlign: 'center' }}>
        {Math.round(zoomLevel * 100)}%
      </span>
      <button onClick={onZoomIn} disabled={zoomLevel >= MAX_ZOOM} title="Zoom in"
              style={toolbarBtnStyle}>+</button>
      <div style={{ width: 1, height: 16, background: '#e5e7eb', margin: '0 2px' }} />
      <button onClick={onFitToScreen} title="Fit to screen" style={toolbarBtnStyle}>⊡</button>
    </div>
  );
}

const toolbarBtnStyle: React.CSSProperties = {
  background: 'none', border: 'none', cursor: 'pointer',
  fontSize: 16, lineHeight: 1, padding: '2px 4px',
  borderRadius: 4, color: '#374151',
};
```

Export `ZOOM_STEP`, `MIN_ZOOM`, `MAX_ZOOM` for use in App.tsx.

Also export a helper:
```ts
export function computeCanvasSize(
  steps: ParsedWorkflowStep[],
  pendingChanges: StepPendingChange[]
): { width: number; height: number } {
  if (steps.length === 0) return { width: 440, height: 260 };
  const maxGX = Math.max(...steps.map((s) => {
    const p = pendingChanges.find((c) => c.stepId === s.id);
    return p?.fields.x ?? s.displayOptions.x;
  }));
  const maxGY = Math.max(...steps.map((s) => {
    const p = pendingChanges.find((c) => c.stepId === s.id);
    return p?.fields.y ?? s.displayOptions.y;
  }));
  return {
    width: (maxGX + 2) * 220,   // CELL_WIDTH = 220
    height: (maxGY + 2) * 130,  // CELL_HEIGHT = 130
  };
}
```

---

## EditableWorkflowCanvas.tsx changes

### Add props
```ts
interface EditableWorkflowCanvasProps {
  // ... existing ...
  zoomLevel?: number;           // default 1.0
  highlightedStepId?: string | null;  // step to highlight (from sidebar hover)
}
```

### Apply zoom
Wrap the inner canvas div with a zoom container. The outer scrollable div stays unchanged. Apply scale on the content:

```tsx
// In the return statement, wrap the inner position:relative div:
<div style={{ position: 'relative', overflow: 'auto', flex: 1 }}>
  {/* Zoom wrapper — create a spacer the size of the scaled canvas, then absolutely position the scaled content */}
  <div style={{ width: canvasWidth * (zoomLevel ?? 1), height: canvasHeight * (zoomLevel ?? 1), position: 'relative' }}>
    <div style={{
      position: 'absolute', top: 0, left: 0,
      width: canvasWidth, height: canvasHeight,
      transform: `scale(${zoomLevel ?? 1})`,
      transformOrigin: 'top left',
    }}>
      {/* existing SVG + block layers */}
    </div>
  </div>
</div>
```

Note: the outer `className={isDraggingAny ? 'canvas--dragging' : ''}` should be on the outermost scrollable div, not the zoomed div.

### Apply highlight
In `WorkflowBlock`, accept `isHighlighted` prop and apply a subtle visual:
```ts
// When isHighlighted:
boxShadow: '0 0 0 3px rgba(59, 130, 246, 0.35), 0 1px 4px rgba(0,0,0,0.08)'
```

Pass `isHighlighted={highlightedStepId === step.id}` to each block.

## Acceptance criteria
- `CanvasToolbar` renders 4 controls: zoom out (−), zoom %, zoom in (+), fit (⊡)
- Zoom out/in disabled at MIN/MAX zoom
- `EditableWorkflowCanvas` renders content scaled by `zoomLevel` with correct scroll area
- Highlighted block gets a subtle blue glow
- TypeScript compiles without errors
