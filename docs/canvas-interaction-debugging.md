# Canvas Interaction Debugging — Drag and Connection Issues

## Context

The flex-viewer canvas renders workflow blocks as absolutely-positioned divs inside a
CSS-transformed viewport (pan + zoom). Blocks can be dragged to new grid positions.
Connection handles appear on block edges in edit mode; dragging from one to another
creates a new transition line.

Three rounds of debugging were required to reach a working implementation. This
document records what was reported, what was tried, why each attempt failed, and what
finally fixed everything. The lessons at the end generalise beyond this codebase.

---

## Issues Reported

### Round 1 — Initial reports

| # | Symptom |
|---|---------|
| 1 | Clicking a block immediately started dragging it instead of selecting it. |
| 2 | Mouseup events during a block drag were not reliably firing. |
| 3 | Clicking again after a drag reset the block to its original grid position when the mouse moved. |
| 4 | The temporary dashed connection line during a connection drag was offset ~1.5 block heights below the pointer. |
| 5 | No visible indicator showing which block was a valid connection drop target. |

### Round 2 — After first fix attempt

| # | Symptom |
|---|---------|
| 1 | Block drag still did not release the block on mouseup. |
| 2 | Clicking again after dragging reset the block position when the mouse moved again. |
| 3 | A third click then committed the wrong position. |
| 4 | Dragging a connection line and releasing on a target block created nothing. |
| 5 | Connection lines also could not be created by any interaction. |

---

## Solutions Reviewed

### Fix attempt 1 — "pending drag" state + useEffect listeners

**What changed**

- Introduced a `pendingDrag` state alongside the existing `dragState`.
- `handleBlockMouseDown` set `pendingDrag` instead of immediately setting `dragState`.
- A `useEffect` watched `pendingDrag` and promoted it to `dragState` once mouse
  movement exceeded a 4 px threshold; a window `mouseup` during that window cleared
  it without committing (treating it as a click).
- A second `useEffect` watched `dragState` and attached the move/commit window
  listeners only while dragging.
- Coordinate calculation for connection drag was fixed from `(e.clientX - panX) / zoom`
  to `(e.clientX - rect.left) / zoom` using the canvas element's actual bounding rect.
- `isConnectionDropTarget` prop added to `WorkflowBlock`; green glow applied to all
  three shape variants; the SVG indicator replaced with a dashed border rect.

**Why it did not fully work**

The `useEffect`-based listener management introduced an **async re-mount gap**.

React `useEffect` runs *after* the browser has painted. The sequence was:

1. `mousedown` on block → `setPendingDrag(...)` (state enqueued, not yet applied)
2. React schedules a re-render
3. **<-- any mouseup here is missed because no window listeners are attached yet**
4. Re-render completes → `pendingDrag` effect runs → listeners attached

On the block drag path, the movement threshold crossing triggered
`setDragState(pendingDrag)` + `setPendingDrag(null)`. Before the next render (which
would attach the `dragState` effect's listeners and remove the `pendingDrag` effect's
listeners), there was a second gap where neither set of listeners existed.

On the connection drag path, `handleConnectionHandleMouseDown` set `connectionDrag`
state and returned. The connection drag `useEffect` only ran after the next render.
A short press-and-release — or releasing quickly on the target block — would fire
`mouseup` before the effect had registered any listener.

Both gaps are unpredictable. On fast hardware or with certain input devices they
appeared inconsistently, which made the bugs hard to isolate.

---

### Fix attempt 2 — Closure-based listeners attached synchronously in mousedown

**What changed**

All `useEffect`-based listener management was removed for both block drag and
connection drag. Instead, `window.addEventListener` calls were placed **directly
inside the mousedown handler functions** so they are synchronous with the gesture
start.

```
handleBlockMouseDown (mousedown handler)
  → sets closure vars: startMouseX/Y, startPixelX/Y, stepId, crossed = false
  → window.addEventListener("mousemove", handleMouseMove)   <-- synchronous
  → window.addEventListener("mouseup",   handleMouseUp)     <-- synchronous

handleMouseMove
  → checks if crossed; if not and movement < 4px, returns early
  → once movement ≥ 4px: crossed = true, setActiveDragStepId, setDragPixel

handleMouseUp
  → removes both listeners
  → if crossed: commits position via onBlockMove
  → always: setActiveDragStepId(null), setDragPixel(null)
```

The connection drag handler followed the same pattern, using a closure `let
lastHoverTargetId` instead of the previous ref approach.

**Why it still did not work**

The listeners were now attached at the right time. But `mouseup` fired over blocks
and still never reached the window handlers. The gesture remained permanently stuck.

The root cause was in a completely different place and is described in the next
section.

---

## Root Cause and Final Fix

### The one-line cause

```ts
// WorkflowBlock — handleMouseUp (the bug)
const handleMouseUp = (e: React.MouseEvent) => {
  e.stopPropagation();  // <-- this line killed all window mouseup listeners
  ...
};
```

### Why `e.stopPropagation()` prevents `window` mouseup listeners from firing

React 17 changed event delegation: React no longer attaches its single event listener
to `document` — it attaches to the **root DOM container** (e.g. `<div id="root">`).

When you call `e.stopPropagation()` on a React synthetic event, React also calls
`stopPropagation()` on the **underlying native DOM event** (`e.nativeEvent`). This is
by design in React's synthetic event implementation.

The native DOM bubbling chain is:

```
block div
  → ... intermediate divs ...
    → React root container   <-- React's listener fires here
      → document
        → window             <-- our window.addEventListener targets
```

When React's listener fires at the root container and React dispatches the synthetic
event through the virtual tree, `WorkflowBlock.handleMouseUp` runs and calls
`e.stopPropagation()`. React immediately calls `nativeEvent.stopPropagation()`. At
this point the native event has reached the root container but has **not yet propagated
to `window`**. The call marks the native event as stopped. The browser does not
dispatch it further.

Consequence: every `window.addEventListener("mouseup", ...)` handler registered by the
drag and connection-drag closures received nothing, because:

- Block drag: when the user releases the mouse over the dragged block (which follows the
  cursor), the dragged block's React `onMouseUp` fires and stops the event.
- Connection drag: when the user releases the mouse over the target block, the target
  block's React `onMouseUp` fires and stops the event.

In both cases the gesture ended over a block, the event was swallowed at the React
root, and the window handlers were never called.

### Why the canvas background deselect was not affected

The canvas background `onMouseUp` checks `e.target === canvasInnerRef.current`.
`e.target` is the original event target, not the element the handler is attached to.
A mouseup that bubbles from a block div always has `e.target` = the block element,
which is never the canvas background div. The deselect branch was never entered by
bubbled events, so no guard from `stopPropagation` was needed there.

### The fix

Remove `e.stopPropagation()` from `WorkflowBlock.handleMouseUp`.

```ts
// WorkflowBlock — handleMouseUp (fixed)
const handleMouseUp = (e: React.MouseEvent) => {
  // No stopPropagation — see docs/canvas-interaction-debugging.md
  if (mouseDownPosRef.current) {
    const dx = e.clientX - mouseDownPosRef.current.x;
    const dy = e.clientY - mouseDownPosRef.current.y;
    if (Math.sqrt(dx * dx + dy * dy) < 4) {
      onBlockClick?.();
    }
    mouseDownPosRef.current = null;
  }
};
```

This single change unblocked both the block drag mouseup handler and the connection
drag mouseup handler, because the native event can now propagate from the React root
to `window` unimpeded.

---

## Additional Fixes Applied in Round 1 (still present)

These were correct diagnoses and remain part of the current implementation.

### Connection drag coordinate offset

**Problem:** The connection drag preview line was consistently offset from the pointer.

**Cause:** The coordinate conversion used `panX`/`panY` CSS translate values but not
the viewport container's own position in the page:

```ts
// wrong
const canvasX = (e.clientX - panX) / zoom;
const canvasY = (e.clientY - panY) / zoom;
```

`panX`/`panY` are only the CSS translate offsets of the canvas content within the
viewport container. They do not account for where the viewport container itself sits
on screen (e.g. the application header's height).

**Fix:** Use the canvas element's actual bounding rect, which already encodes pan +
viewport position after all CSS transforms:

```ts
const rect = canvasInnerRef.current?.getBoundingClientRect();
const canvasX = (e.clientX - rect.left) / zoom;
const canvasY = (e.clientY - rect.top) / zoom;
```

The `panX`/`panY` props were removed from `EditableWorkflowCanvas` entirely.

### Click triggers drag

**Problem:** Any mousedown on a block immediately started a drag.

**Fix:** The block drag handler now uses a `crossed` closure variable initialised to
`false`. The `mousemove` handler returns early until screen-space movement ≥ 4 px, at
which point `crossed = true` and the drag visuals are activated. The `mouseup` handler
checks `crossed` before calling `onBlockMove`.

### Drop target indicator

**Problem:** No visual feedback showed which block was a valid connection drop target.

**Fix:**
- `WorkflowBlock` gained an `isConnectionDropTarget` boolean prop.
- All three shape variants (rect, ellipse, diamond) apply a green `box-shadow` /
  `drop-shadow` filter when `isConnectionDropTarget` is true.
- The SVG overlay replaced a nearly-invisible 8 px circle with a dashed green border
  rectangle around the entire target block.

---

## Lessons

### 1. Never use `useEffect` to manage gesture listeners

`useEffect` runs after React has committed and painted. There is always a window
between the `setState` call that starts a gesture and the moment the effect re-runs
and attaches the listeners. Any mouseup that fires during that window is lost.

The correct pattern: attach `window.addEventListener` **synchronously inside the
mousedown handler**, before the function returns. Use closure variables to carry
mutable gesture state; use React state only for rendering.

```ts
const handleMouseDown = (e: React.MouseEvent) => {
  let crossed = false;

  const onMove = (me: MouseEvent) => { /* ... */ };
  const onUp   = (me: MouseEvent) => {
    window.removeEventListener("mousemove", onMove);
    window.removeEventListener("mouseup",   onUp);
    /* commit */
  };

  window.addEventListener("mousemove", onMove);
  window.addEventListener("mouseup",   onUp);
};
```

### 2. `e.stopPropagation()` in React 17+ also stops the native event

React 17+ attaches its single event listener to the root container, not `document`.
Calling `e.stopPropagation()` on a React synthetic event calls
`nativeEvent.stopPropagation()` as well. If the root container is below `window` in
the DOM tree — which it always is — this prevents the native event from reaching any
`window.addEventListener(...)` handlers.

**Rule:** never call `e.stopPropagation()` in a React event handler that fires during
an ongoing gesture whose window listeners you still need. Use `e.target` checks in
parent handlers instead.

### 3. Canvas coordinate conversion requires the element's bounding rect

Converting client (screen) coordinates to canvas-local coordinates when a CSS
transform is applied to the canvas container:

```
canvas-local X = (clientX - rect.left) / zoom
canvas-local Y = (clientY - rect.top)  / zoom
```

where `rect = canvasElement.getBoundingClientRect()`. This correctly accounts for
pan offset, zoom origin, and the container's position anywhere in the page. Any
formula that uses CSS translate values directly will break when the viewport container
is not at `(0, 0)` in page space.

### 4. Distinguish rendering state from gesture tracking state

Gesture tracking (threshold detection, last hover target, whether a drag is active)
changes many times per frame. Storing it in React state causes unnecessary re-renders
and, more critically, creates the async gaps described in lesson 1.

Use **closure variables or refs** for values that are read and written within a single
gesture. Use **React state** only for values that need to trigger a re-render (e.g.
the current pixel position of a dragged block, or the hover-target ID for the preview
line).

### 5. Check the full native event propagation chain before adding `stopPropagation`

Before adding `e.stopPropagation()` to any event handler, answer:

- Is there a `window.addEventListener` anywhere in the codebase that needs to receive
  this event type?
- Is that listener part of an active gesture that could be in progress when this
  handler fires?

If the answer to both is yes, use a `e.target` check in the parent handler instead of
stopping propagation in the child.
