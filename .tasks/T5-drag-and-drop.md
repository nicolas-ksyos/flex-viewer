# Task T5 — Drag-and-drop + grid overlay

## Goal
Extend `EditableWorkflowCanvas` with mouse-based drag-and-drop behaviour. When the user clicks and holds a block, it follows the cursor; on release it snaps to the nearest integer grid cell and emits the new (x, y) coordinates via a callback. While any block is being dragged, the canvas grid overlay is visible; it hides on release. The 'i' info icon on the dragged block is suppressed during dragging.

## Dependencies
- **T1** must be complete — uses `StepPendingChange`, `EditableStepFields`.
- **T4** must be complete — this task modifies `EditableWorkflowCanvas.tsx`.

## Files to read (before starting)
- `src/client/components/edit/EditableWorkflowCanvas.tsx` — the component built in T4
- `src/client/components/edit/EditableWorkflowCanvas.css` — add `.canvas--dragging` styles if not already present
- `src/shared/types.ts` — `ParsedWorkflowStep`

## Files to create / modify

| File | Action |
|------|--------|
| `src/client/components/edit/EditableWorkflowCanvas.tsx` | Add drag state, mouse event handlers, dragging-block visual, grid show/hide |
| `src/client/components/edit/EditableWorkflowCanvas.css` | Confirm grid overlay styles exist (added in T4); add `cursor: grabbing` rule |

## Acceptance criteria
- Pressing and holding the mouse button on a block starts a drag.
- The dragged block visually follows the cursor (pixel-accurate tracking, not snapped during drag).
- All other blocks remain stationary during the drag.
- The grid background is visible on the canvas while dragging and hidden after release.
- On mouseup, the block snaps to the nearest integer grid cell: `Math.round(pixelX / CELL_WIDTH)`, `Math.round(pixelY / CELL_HEIGHT)`.
- The resulting grid coordinates are clamped to `>= 0`.
- `onBlockMove(stepId, newGridX, newGridY)` is called exactly once on release.
- The dragged block's 'i' icon (T7's `isInfoIconVisible` prop) is `false` while `draggingStepId === step.id`.
- If the block is released on the same cell it started on, `onBlockMove` is still called (idempotent — the caller deduplicates).
- Global `mousemove` / `mouseup` listeners are attached to `window` during drag and removed on release to handle mouse leaving the canvas boundary.
- No memory leaks: event listeners are cleaned up in the `useEffect` return.

## Implementation notes

### Drag state
Add local state to `EditableWorkflowCanvas`:

```ts
interface DragState {
    stepId: string;
    startMouseX: number;   // client coords at drag start
    startMouseY: number;
    startPixelX: number;   // block's top-left pixel at drag start
    startPixelY: number;
}

const [dragState, setDragState] = useState<DragState | null>(null);
const [dragPixel, setDragPixel] = useState<{ x: number; y: number } | null>(null);
```

### onMouseDown (on each block)
```ts
const handleBlockMouseDown = (e: React.MouseEvent, step: ParsedWorkflowStep) => {
    e.preventDefault(); // prevent text selection
    const { pixelX, pixelY } = effectivePosition(step, pendingChanges, null, null);
    setDragState({
        stepId: step.id,
        startMouseX: e.clientX,
        startMouseY: e.clientY,
        startPixelX: pixelX,
        startPixelY: pixelY,
    });
    setDragPixel({ x: pixelX, y: pixelY });
};
```

### Global mouse handlers (via useEffect)
```ts
useEffect(() => {
    if (!dragState) return;

    const handleMouseMove = (e: MouseEvent) => {
        const dx = e.clientX - dragState.startMouseX;
        const dy = e.clientY - dragState.startMouseY;
        setDragPixel({
            x: dragState.startPixelX + dx,
            y: dragState.startPixelY + dy,
        });
    };

    const handleMouseUp = (e: MouseEvent) => {
        const dx = e.clientX - dragState.startMouseX;
        const dy = e.clientY - dragState.startMouseY;
        const newPixelX = dragState.startPixelX + dx;
        const newPixelY = dragState.startPixelY + dy;

        // Snap to nearest grid cell (from block's top-left + BLOCK_OFFSET)
        const newGridX = Math.max(0, Math.round((newPixelX - BLOCK_OFFSET_X) / CELL_WIDTH));
        const newGridY = Math.max(0, Math.round((newPixelY - BLOCK_OFFSET_Y) / CELL_HEIGHT));

        onBlockMove(dragState.stepId, newGridX, newGridY);
        setDragState(null);
        setDragPixel(null);
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    return () => {
        window.removeEventListener('mousemove', handleMouseMove);
        window.removeEventListener('mouseup', handleMouseUp);
    };
}, [dragState, onBlockMove]);
```

### Passing drag state down to blocks
Pass `draggingStepId={dragState?.stepId ?? null}` and `draggingPosition={dragPixel}` to the block renderer so it uses the live pixel position for the dragged block.

The dragged block should render with elevated z-index and a `cursor: grabbing` style:
```ts
const isDragging = draggingStepId === step.id;
const zIndex = isDragging ? 100 : 1;
const cursor = isDragging ? 'grabbing' : 'grab';
const opacity = isDragging ? 0.85 : 1;
const boxShadow = isDragging
    ? '0 8px 24px rgba(0,0,0,0.18)'
    : '0 1px 4px rgba(0,0,0,0.08)';
```

### Grid overlay activation
Pass `showGrid={dragState !== null}` to the canvas outer div's className:
```tsx
<div
    style={{ position: 'relative', overflow: 'auto', flex: 1 }}
    className={dragState ? 'canvas--dragging' : undefined}
>
```

### Updated component props
Add to `EditableWorkflowCanvasProps`:
```ts
onBlockMove: (stepId: string, newGridX: number, newGridY: number) => void;
```
(This was a no-op stub in T4; it now requires an actual callback.)

### CSS addition (`EditableWorkflowCanvas.css`)
```css
.canvas--dragging * {
    cursor: grabbing !important;
}
```

### Important: canvas scroll offset
The canvas lives inside a scrollable container. Mouse coordinates from `e.clientX/Y` are viewport-relative, but block positions are canvas-relative. To compute the correct offset, the `startPixelX/Y` stored at drag-start is already in canvas coordinates (computed from grid position). The `dx/dy` delta is purely in client space, which is the same regardless of scroll — this is correct because we're tracking the *delta* from mouse start, not absolute coordinates. No scroll compensation is needed.

## Codebase context

**Constants from T4:**
```ts
export const CELL_WIDTH = 220;
export const CELL_HEIGHT = 130;
const BLOCK_WIDTH = 180;
const BLOCK_HEIGHT = 90;
const BLOCK_OFFSET_X = 20;   // (CELL_WIDTH - BLOCK_WIDTH) / 2
const BLOCK_OFFSET_Y = 20;   // (CELL_HEIGHT - BLOCK_HEIGHT) / 2
```

**`effectivePosition` from T4:**
```ts
function effectivePosition(
    step: ParsedWorkflowStep,
    pendingChanges: StepPendingChange[],
    draggingStepId: string | null | undefined,
    draggingPosition: { x: number; y: number } | null | undefined,
): { pixelX: number; pixelY: number }
```
This function is already defined in `EditableWorkflowCanvas.tsx` from T4. Just call it in the block renderer, passing the live drag state.

**`onBlockMove` callback signature** (consumed in T8 by `useEditMode.recordChange`):
```ts
onBlockMove: (stepId: string, newGridX: number, newGridY: number) => void
```
