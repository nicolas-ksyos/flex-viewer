# Task TX-B — Legend button in CanvasToolbar

## Goal
Add a legend toggle button as the leftmost item in `CanvasToolbar`, and create a `WorkflowLegend` overlay component that shows block-type colours from our canvas.

## Files to create / modify
- `src/client/components/CanvasToolbar.tsx` — add `showLegend` + `onToggleLegend` props + legend button
- **Create** `src/client/components/WorkflowLegend.tsx` — the legend overlay panel

## CanvasToolbar changes

### New props
```ts
interface CanvasToolbarProps {
  zoomLevel: number;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onFitToScreen: () => void;
  showLegend?: boolean;
  onToggleLegend?: () => void;
}
```

### Legend button — add as FIRST button before the zoom-out button, with a divider after it
Use the 📋 character or a grid/list icon. A clean Unicode option: `⊞` (U+229E) or just the text "≡" or a simple SVG. Use `≡` (three horizontal lines) for "legend/key":

```tsx
{/* Legend toggle — leftmost */}
{onToggleLegend && (
  <>
    <button
      onClick={onToggleLegend}
      title={showLegend ? 'Hide legend' : 'Show legend'}
      style={showLegend ? { ...toolbarBtnStyle, background: '#f3f4f6' } : toolbarBtnStyle}
    >
      <svg width="14" height="14" viewBox="0 0 14 14" fill="none" xmlns="http://www.w3.org/2000/svg" style={{ display: 'block' }}>
        <rect x="1" y="2" width="4" height="4" rx="1" fill="currentColor" opacity="0.7"/>
        <rect x="1" y="8" width="4" height="4" rx="1" fill="currentColor" opacity="0.7"/>
        <rect x="7" y="3.5" width="6" height="1.5" rx="0.75" fill="currentColor"/>
        <rect x="7" y="9.5" width="6" height="1.5" rx="0.75" fill="currentColor"/>
      </svg>
    </button>
    <div style={{ width: 1, height: 16, background: '#e5e7eb', margin: '0 4px', flexShrink: 0 }} />
  </>
)}
```

## WorkflowLegend.tsx

The legend shows the block types used in our `EditableWorkflowCanvas` with their colours and shapes. It appears as an absolutely-positioned overlay panel below the toolbar.

```tsx
// Block type data matching BLOCK_TYPE_STYLES in EditableWorkflowCanvas
const LEGEND_ITEMS = [
  { type: 'start',        label: 'Start',         bg: '#FAFAFA', border: '#FF37F0', shape: 'ellipse'  },
  { type: 'activity',     label: 'Activity',       bg: '#E0E8FF', border: '#3C3CFF', shape: 'rect'    },
  { type: 'action',       label: 'Action',         bg: '#E0E8FF', border: '#3C3CFF', shape: 'rect'    },
  { type: 'choice',       label: 'Choice',         bg: '#FAFAFA', border: '#FF37F0', shape: 'diamond' },
  { type: 'general',      label: 'General',        bg: '#FAFAFA', border: '#FF37F0', shape: 'rect'    },
  { type: 'scheduled',    label: 'Scheduled',      bg: '#FAFAFA', border: '#FF37F0', shape: 'rect'    },
  { type: 'systemAction', label: 'System action',  bg: '#FAFAFA', border: '#FF37F0', shape: 'rect'    },
];
```

Render as a floating panel, `position: absolute, top: 48, left: 12, zIndex: 20`:
- White background, shadow, rounded corners, 200px wide
- Each row: small shape indicator (rect/ellipse/diamond) 12×12px + label text
- Shape indicators use the bg/border colors
- Close button (×) or clicking the toolbar button again closes it

```tsx
interface WorkflowLegendProps {
  onClose: () => void;
}

export function WorkflowLegend({ onClose }: WorkflowLegendProps) {
  return (
    <div style={{
      position: 'absolute', top: 48, left: 12, zIndex: 20,
      background: 'white', border: '1px solid var(--kds-color-gray-200, #e5e7eb)',
      borderRadius: 8, boxShadow: '0 4px 16px rgba(0,0,0,0.12)',
      padding: '12px 14px', width: 200,
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
        <span style={{ fontSize: 12, fontWeight: 600, color: '#374151' }}>Block types</span>
        <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 16, color: '#9ca3af', padding: 0, lineHeight: 1 }}>×</button>
      </div>
      {LEGEND_ITEMS.map((item) => (
        <div key={item.type} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
          <ShapeIndicator bg={item.bg} border={item.border} shape={item.shape as any} />
          <span style={{ fontSize: 12, color: '#374151' }}>{item.label}</span>
        </div>
      ))}
    </div>
  );
}

function ShapeIndicator({ bg, border, shape }: { bg: string; border: string; shape: 'rect' | 'ellipse' | 'diamond' }) {
  const base: React.CSSProperties = { width: 14, height: 14, background: bg, border: `2px solid ${border}`, flexShrink: 0 };
  if (shape === 'ellipse') return <div style={{ ...base, borderRadius: '50%' }} />;
  if (shape === 'diamond') return (
    <div style={{ width: 14, height: 14, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ width: 10, height: 10, background: bg, border: `2px solid ${border}`, transform: 'rotate(45deg)' }} />
    </div>
  );
  return <div style={{ ...base, borderRadius: 2 }} />;
}
```

## How the legend is rendered
The `WorkflowLegend` is rendered by the parent (`CanvasPane`) inside the `position: relative` canvas wrapper, as a sibling to `CanvasToolbar`. `CanvasToolbar` receives `showLegend` and `onToggleLegend` props; the actual `WorkflowLegend` panel is rendered conditionally by the parent.

TypeScript must compile without new errors.
