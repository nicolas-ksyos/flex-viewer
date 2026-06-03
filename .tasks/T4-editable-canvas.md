# Task T4 — EditableWorkflowCanvas: block renderer

## Goal
Create `src/client/components/edit/EditableWorkflowCanvas.tsx` — a custom canvas component that renders workflow blocks in a grid based on their `displayOptions.x` / `displayOptions.y` integer coordinates. The blocks must visually match the appearance of the read-only `WorkflowGraph` blocks as closely as possible. This task covers static rendering only; drag interaction is added in T5.

## Dependencies
- **T1** must be complete — uses `ParsedWorkflowDefinition`, `ParsedWorkflowStep`, `EditableStepFields`, `StepPendingChange`.

## Files to read (before starting)
- `src/shared/types.ts` — `ParsedWorkflowDefinition`, `ParsedWorkflowStep`, `StepPendingChange`
- `src/client/components/WorkflowView.tsx` — understand what the read-only view renders (the wrapper)
- `src/client/styles/index.css` — check for any existing CSS variables or utility classes

**External reference (read-only, do not modify):**
- `/Users/nicolaskrul/repos/cs/workflow-vervolg/src/frontend/components/pages/services/workflowGraph/WorkflowGraph.tsx` (or `.ts`) — inspect visually to understand block appearance, colors, and labels. If the file is too large, look for a `WorkflowNode` or `WorkflowBlock` sub-component in the same directory.

## Files to create / modify

| File | Action |
|------|--------|
| `src/client/components/edit/EditableWorkflowCanvas.tsx` | **Create new** |
| `src/client/components/edit/EditableWorkflowCanvas.css` | **Create new** — grid overlay and canvas styles |

## Acceptance criteria
- Component renders all `workflow.steps` as positioned blocks.
- Block position: `left = step.displayOptions.x * CELL_WIDTH`, `top = step.displayOptions.y * CELL_HEIGHT` (absolute within a relative container).
- Each block visually conveys: the step label (or name), the block type badge, and the block name.
- Blocks are color-coded by block type (see color map below).
- Pending changes for a step are reflected visually — if a step has a pending x/y change, render it at the pending position rather than the original.
- Transitions between steps are rendered as SVG lines connecting block centers.
- Canvas container is large enough to show all blocks without clipping (size = `(maxX + 2) * CELL_WIDTH × (maxY + 2) * CELL_HEIGHT`).
- The component is scrollable if the canvas is larger than the viewport.
- Grid overlay CSS class `canvas--dragging` exists (used in T5) but is not active in this task.
- No TypeScript errors.

## Implementation notes

### Constants
```ts
export const CELL_WIDTH = 220;   // pixels per grid column
export const CELL_HEIGHT = 130;  // pixels per grid row
const BLOCK_WIDTH = 180;
const BLOCK_HEIGHT = 90;
// Offset so block center aligns to grid cell center:
const BLOCK_OFFSET_X = (CELL_WIDTH - BLOCK_WIDTH) / 2;   // 20
const BLOCK_OFFSET_Y = (CELL_HEIGHT - BLOCK_HEIGHT) / 2; // 20
```

### Component props
```tsx
interface EditableWorkflowCanvasProps {
    workflow: ParsedWorkflowDefinition;
    pendingChanges: StepPendingChange[];
    // Callbacks for T5 (drag) and T7 (info icon) — accept no-op stubs in this task:
    onBlockMouseDown?: (e: React.MouseEvent, step: ParsedWorkflowStep) => void;
    onInfoIconClick?: (step: ParsedWorkflowStep) => void;
    draggingStepId?: string | null;
    draggingPosition?: { x: number; y: number } | null; // pixel position while dragging
    showGrid?: boolean;
}
```

### Computing effective position
```ts
function effectivePosition(
    step: ParsedWorkflowStep,
    pendingChanges: StepPendingChange[],
    draggingStepId: string | null | undefined,
    draggingPosition: { x: number; y: number } | null | undefined,
): { pixelX: number; pixelY: number } {
    if (draggingStepId === step.id && draggingPosition) {
        return { pixelX: draggingPosition.x, pixelY: draggingPosition.y };
    }
    const pending = pendingChanges.find((c) => c.stepId === step.id);
    const gx = pending?.fields.x ?? step.displayOptions.x;
    const gy = pending?.fields.y ?? step.displayOptions.y;
    return {
        pixelX: gx * CELL_WIDTH + BLOCK_OFFSET_X,
        pixelY: gy * CELL_HEIGHT + BLOCK_OFFSET_Y,
    };
}
```

### Block appearance — color by type
Match the WorkflowGraph's color scheme as closely as possible (inspect the external component). Suggested defaults if the source is not readable:

```ts
const BLOCK_TYPE_COLORS: Record<string, { bg: string; border: string; text: string }> = {
    start:     { bg: '#d1fae5', border: '#10b981', text: '#065f46' },
    action:    { bg: '#fee2e2', border: '#ef4444', text: '#991b1b' },
    choice:    { bg: '#fef9c3', border: '#eab308', text: '#713f12' },
    activity:  { bg: '#dbeafe', border: '#3b82f6', text: '#1e3a8a' },
    scheduled: { bg: '#f3e8ff', border: '#a855f7', text: '#581c87' },
    general:   { bg: '#f3f4f6', border: '#9ca3af', text: '#1f2937' },
};
```

### Block JSX structure
```tsx
<div
    style={{
        position: 'absolute',
        left: pixelX,
        top: pixelY,
        width: BLOCK_WIDTH,
        height: BLOCK_HEIGHT,
        backgroundColor: colors.bg,
        border: `2px solid ${colors.border}`,
        borderRadius: 8,
        boxShadow: '0 1px 4px rgba(0,0,0,0.08)',
        cursor: 'grab',
        userSelect: 'none',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        alignItems: 'center',
        padding: '8px 12px',
        boxSizing: 'border-box',
        // Position relative for 'i' icon overlay (T7):
        position: 'relative',  // NOTE: this block is already absolute on canvas; 
                               // use a wrapper div for the 'i' icon in T7
    }}
    onMouseDown={(e) => onBlockMouseDown?.(e, step)}
>
    <span style={{ fontSize: 11, color: colors.text, opacity: 0.7, marginBottom: 2 }}>
        {step.serviceWorkflowBlock.name}
    </span>
    <span style={{ fontSize: 13, fontWeight: 600, color: colors.text, textAlign: 'center', lineHeight: 1.3 }}>
        {step.label || step.name}
    </span>
    <span style={{
        fontSize: 10,
        marginTop: 4,
        padding: '1px 6px',
        borderRadius: 10,
        background: colors.border,
        color: '#fff',
    }}>
        {step.serviceWorkflowBlock.type}
    </span>
</div>
```

### Canvas outer structure
```tsx
<div
    style={{ position: 'relative', overflow: 'auto', flex: 1 }}
    className={showGrid ? 'canvas--dragging' : undefined}
>
    <div
        style={{
            position: 'relative',
            width: canvasWidth,
            height: canvasHeight,
        }}
    >
        {/* SVG layer for transitions */}
        <svg style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}
             width={canvasWidth} height={canvasHeight}>
            {workflow.transitions.map((t) => renderTransitionLine(t, ...)}
        </svg>

        {/* Block layer */}
        {workflow.steps.map((step) => (
            <WorkflowBlock key={step.id} ... />
        ))}
    </div>
</div>
```

### Transition lines (SVG)
Draw a straight line from the center of the source block to the center of the target block. Use `marker-end` for an arrowhead.

```tsx
function renderTransitionLine(transition, steps, pendingChanges) {
    const from = steps.find(s => s.id === transition.fromStepId);
    const to = steps.find(s => s.id === transition.toStepId);
    if (!from || !to) return null;

    const fx = from.displayOptions.x * CELL_WIDTH + CELL_WIDTH / 2;
    const fy = from.displayOptions.y * CELL_HEIGHT + CELL_HEIGHT / 2;
    const tx = to.displayOptions.x * CELL_WIDTH + CELL_WIDTH / 2;
    const ty = to.displayOptions.y * CELL_HEIGHT + CELL_HEIGHT / 2;

    return (
        <line key={transition.id}
              x1={fx} y1={fy} x2={tx} y2={ty}
              stroke="#9ca3af" strokeWidth={1.5}
              markerEnd="url(#arrowhead)" />
    );
}
```

Define the `<defs>` block with an arrowhead marker once in the SVG:
```svg
<defs>
  <marker id="arrowhead" markerWidth="8" markerHeight="6" refX="6" refY="3" orient="auto">
    <polygon points="0 0, 8 3, 0 6" fill="#9ca3af" />
  </marker>
</defs>
```

### Grid overlay CSS (`EditableWorkflowCanvas.css`)
```css
.canvas--dragging {
    background-image:
        linear-gradient(to right, rgba(0,0,0,0.06) 1px, transparent 1px),
        linear-gradient(to bottom, rgba(0,0,0,0.06) 1px, transparent 1px);
    background-size: 220px 130px; /* CELL_WIDTH × CELL_HEIGHT */
}
```

Import this CSS file in the component: `import './EditableWorkflowCanvas.css';`

## Codebase context

**`ParsedWorkflowDefinition`:**
```ts
interface ParsedWorkflowDefinition {
  activities: ParsedWorkflowActivity[];
  steps: ParsedWorkflowStep[];      // ← render these as blocks
  stepActivities: ParsedWorkflowStepActivity[];
  transitions: ParsedWorkflowTransition[];  // ← render as SVG lines
}

interface ParsedWorkflowStep {
  id: string;
  name: string;
  label: string;
  displayOptions: { x: number; y: number };
  serviceWorkflowBlock: { id: string; name: string; type: string };
  allowedPerformer: string | null;
  parameters: Record<string, unknown> | null;
  performerNeedsTask: boolean;
  serviceId: string;
  isRerunnable: boolean;
  type?: string;
}

interface ParsedWorkflowTransition {
  id: string;
  fromStepId: string;
  toStepId: string;
  type: string;               // 'enable', etc.
  onlyIfOutputEquals: string | null;
  synchronous: boolean;
  serviceId: string;
}
```

**`StepPendingChange` (from T1):**
```ts
interface StepPendingChange {
  stepName: string;
  stepId: string;
  fields: EditableStepFields;  // { x?, y?, name?, label?, allowedPerformer?, type?, block? }
}
```
