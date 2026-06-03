# Task TX-A — EditableWorkflowCanvas: read-only mode

## Goal
Add a `readOnly` prop to `EditableWorkflowCanvas`. When true: no drag, no 'i' icon, default cursor. This makes the component suitable for view mode.

## File to modify
`src/client/components/edit/EditableWorkflowCanvas.tsx`

## Changes
1. Add `readOnly?: boolean` to `EditableWorkflowCanvasProps` (default false).
2. In `WorkflowBlock`: when `readOnly` is true: `cursor: 'default'` instead of `'grab'`, suppress the `onMouseDown` handler, suppress the 'i' icon entirely.
3. In the canvas root: when `readOnly`, skip registering the window mousemove/mouseup listeners (no drag at all).
4. Pass `readOnly` down from canvas to each `WorkflowBlock`.

No other changes. TypeScript must compile without new errors.
