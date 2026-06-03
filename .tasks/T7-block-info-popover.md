# Task T7 — Block 'i' info icon + settings popover

## Goal
In edit mode, hovering over a block shows a small "i" icon in its top-right corner. Clicking the icon opens a settings popover positioned next to the block, showing all of the step's current field values. String and enum fields are editable; changes are immediately pushed into pending changes. Booleans and `parameters` are displayed read-only.

## Dependencies
- **T1** must be complete — uses `EditableStepFields`, `StepPendingChange`, and `BLOCK_NAMES`.
- **T4** must be complete — the 'i' icon is rendered inside each block in `EditableWorkflowCanvas.tsx`.

## Files to read (before starting)
- `src/client/components/edit/EditableWorkflowCanvas.tsx` — understand block structure; 'i' icon lives here
- `src/shared/types.ts` — `ParsedWorkflowStep`, `EditableStepFields`
- `src/shared/blockTypes.ts` — `BLOCK_NAMES` (enum values for the `block` dropdown)
- `src/client/components/StepDetailPanel.tsx` — reference for design system usage patterns

## Files to create / modify

| File | Action |
|------|--------|
| `src/client/components/edit/BlockSettingsPopover.tsx` | **Create new** |
| `src/client/components/edit/EditableWorkflowCanvas.tsx` | Add `InfoIcon` overlay inside each block and popover trigger |

## Acceptance criteria
- In edit mode, hovering a block shows a small circular "i" button in the block's top-right corner.
- The icon is NOT visible when the block is being dragged (`draggingStepId === step.id`).
- Clicking the icon opens `<BlockSettingsPopover>` positioned next to (to the right of, or above if near right edge) the block.
- Only one popover is open at a time; clicking a different block's icon closes the previous popover.
- The popover shows: `name`, `label`, `block` (enum), `allowedPerformer`, `type`, `performerNeedsTask` (read-only), `isRerunnable` (read-only), `parameters` (read-only JSON), `x` and `y` (read-only — changed via drag).
- String fields (`name`, `label`, `allowedPerformer`, `type`) render as `<input type="text">` elements.
- `block` renders as a `<select>` populated with `BLOCK_NAMES`.
- Read-only fields are rendered as plain text (no input).
- Editing a field immediately calls `onFieldChange(field, newValue)`.
- Pressing Escape or clicking outside the popover closes it.
- No TypeScript errors.

## Implementation notes

### 'i' icon inside each block

Add to the block `div` in `EditableWorkflowCanvas.tsx` (the block wrapper should use `position: relative`):

```tsx
// State in the parent canvas component:
const [hoveredStepId, setHoveredStepId] = useState<string | null>(null);
const [openPopoverStepId, setOpenPopoverStepId] = useState<string | null>(null);

// On each block div:
onMouseEnter={() => setHoveredStepId(step.id)}
onMouseLeave={() => setHoveredStepId(null)}

// Inside the block div (after existing block content):
{hoveredStepId === step.id && draggingStepId !== step.id && (
    <button
        onClick={(e) => {
            e.stopPropagation(); // don't trigger block drag
            setOpenPopoverStepId((prev) => prev === step.id ? null : step.id);
        }}
        style={{
            position: 'absolute',
            top: 4,
            right: 4,
            width: 18,
            height: 18,
            borderRadius: '50%',
            border: '1px solid currentColor',
            background: 'transparent',
            cursor: 'pointer',
            fontSize: 11,
            fontWeight: 'bold',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 0,
            lineHeight: 1,
            color: 'inherit',
            opacity: 0.7,
        }}
        title="Step settings"
        aria-label="Open step settings"
    >
        i
    </button>
)}
```

**Important:** Set `onMouseDown` stop-propagation on the 'i' button so clicking it doesn't start a drag:
```tsx
onMouseDown={(e) => e.stopPropagation()}
```

### Popover positioning

The popover is rendered in a portal at the canvas level (or at the App level) to avoid being clipped by the block's `overflow: hidden`. A simple approach without a portal:

Render the `<BlockSettingsPopover>` outside the block loop, as a sibling of the SVG and block layers:

```tsx
{openPopoverStepId && (() => {
    const step = workflow.steps.find(s => s.id === openPopoverStepId);
    if (!step) return null;
    const pending = pendingChanges.find(c => c.stepId === step.id);
    const { pixelX, pixelY } = effectivePosition(step, pendingChanges, null, null);
    return (
        <BlockSettingsPopover
            step={step}
            pendingFields={pending?.fields ?? {}}
            onFieldChange={(field, value) => onInfoFieldChange(step, field, value)}
            onClose={() => setOpenPopoverStepId(null)}
            position={{ top: pixelY, left: pixelX + BLOCK_WIDTH + 8 }}
        />
    );
})()}
```

### `BlockSettingsPopover` component

```tsx
interface BlockSettingsPopoverProps {
    step: ParsedWorkflowStep;
    pendingFields: EditableStepFields;
    onFieldChange: (field: keyof EditableStepFields, value: string | number | null) => void;
    onClose: () => void;
    position: { top: number; left: number };
}

export function BlockSettingsPopover({ step, pendingFields, onFieldChange, onClose, position }: BlockSettingsPopoverProps) {
    // Close on Escape
    useEffect(() => {
        const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
        window.addEventListener('keydown', handler);
        return () => window.removeEventListener('keydown', handler);
    }, [onClose]);

    // Close on outside click
    const ref = useRef<HTMLDivElement>(null);
    useEffect(() => {
        const handler = (e: MouseEvent) => {
            if (ref.current && !ref.current.contains(e.target as Node)) onClose();
        };
        document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
    }, [onClose]);

    // Resolve current values: pendingFields take priority over step values
    const currentValues: Record<string, unknown> = {
        name: pendingFields.name ?? step.name,
        label: pendingFields.label ?? step.label,
        block: pendingFields.block ?? step.serviceWorkflowBlock.name,
        allowedPerformer: pendingFields.allowedPerformer ?? step.allowedPerformer,
        type: pendingFields.type ?? step.type ?? '',
    };

    return (
        <div
            ref={ref}
            style={{
                position: 'absolute',
                top: position.top,
                left: position.left,
                zIndex: 200,
                background: 'white',
                border: '1px solid var(--kds-color-gray-200)',
                borderRadius: 8,
                boxShadow: '0 8px 24px rgba(0,0,0,0.12)',
                width: 280,
                maxHeight: 480,
                overflowY: 'auto',
                padding: 16,
            }}
        >
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 12 }}>
                <strong style={{ fontSize: 13 }}>Step settings</strong>
                <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 16 }}>×</button>
            </div>

            <FieldRow label="name" value={currentValues.name as string}
                      onChange={(v) => onFieldChange('name', v)} editable />
            <FieldRow label="label" value={currentValues.label as string}
                      onChange={(v) => onFieldChange('label', v)} editable />
            <FieldRow label="allowedPerformer" value={currentValues.allowedPerformer as string ?? ''}
                      onChange={(v) => onFieldChange('allowedPerformer', v || null)} editable />
            <FieldRow label="type" value={currentValues.type as string}
                      onChange={(v) => onFieldChange('type', v)} editable />

            <BlockEnumField
                label="block"
                value={currentValues.block as string}
                onChange={(v) => onFieldChange('block', v)}
            />

            {/* Read-only fields */}
            <FieldRow label="x" value={String(step.displayOptions.x)} editable={false} />
            <FieldRow label="y" value={String(step.displayOptions.y)} editable={false} />
            <FieldRow label="performerNeedsTask" value={String(step.performerNeedsTask)} editable={false} />
            <FieldRow label="isRerunnable" value={String(step.isRerunnable)} editable={false} />

            {step.parameters && (
                <div style={{ marginTop: 8 }}>
                    <label style={{ fontSize: 11, color: '#6b7280' }}>parameters (read-only)</label>
                    <pre style={{ fontSize: 10, background: '#f9fafb', padding: 6, borderRadius: 4,
                                  overflowX: 'auto', maxHeight: 120, margin: '4px 0 0' }}>
                        {JSON.stringify(step.parameters, null, 2)}
                    </pre>
                </div>
            )}
        </div>
    );
}
```

### `FieldRow` sub-component
```tsx
function FieldRow({ label, value, onChange, editable = true }: {
    label: string;
    value: string;
    onChange?: (v: string) => void;
    editable?: boolean;
}) {
    return (
        <div style={{ marginBottom: 8 }}>
            <label style={{ display: 'block', fontSize: 11, color: '#6b7280', marginBottom: 2 }}>
                {label}
            </label>
            {editable ? (
                <input
                    type="text"
                    value={value}
                    onChange={(e) => onChange?.(e.target.value)}
                    style={{
                        width: '100%',
                        padding: '4px 6px',
                        fontSize: 12,
                        border: '1px solid var(--kds-color-gray-200)',
                        borderRadius: 4,
                        boxSizing: 'border-box',
                    }}
                />
            ) : (
                <span style={{ fontSize: 12, color: '#374151', fontFamily: 'monospace' }}>{value}</span>
            )}
        </div>
    );
}
```

### `BlockEnumField` sub-component
```tsx
function BlockEnumField({ label, value, onChange }: {
    label: string;
    value: string;
    onChange: (v: string) => void;
}) {
    return (
        <div style={{ marginBottom: 8 }}>
            <label style={{ display: 'block', fontSize: 11, color: '#6b7280', marginBottom: 2 }}>
                {label}
            </label>
            <select
                value={value}
                onChange={(e) => onChange(e.target.value)}
                style={{
                    width: '100%',
                    padding: '4px 6px',
                    fontSize: 12,
                    border: '1px solid var(--kds-color-gray-200)',
                    borderRadius: 4,
                }}
            >
                {BLOCK_NAMES.map((name) => (
                    <option key={name} value={name}>{name}</option>
                ))}
            </select>
        </div>
    );
}
```

### Canvas prop additions
Add to `EditableWorkflowCanvasProps`:
```ts
onInfoFieldChange: (step: ParsedWorkflowStep, field: keyof EditableStepFields, value: string | number | null) => void;
```

## Codebase context

**`EditableStepFields` (from T1):**
```ts
interface EditableStepFields {
    x?: number;
    y?: number;
    name?: string;
    label?: string;
    allowedPerformer?: string | null;
    type?: string;
    block?: string;
}
```

**`BLOCK_NAMES` (from T1's `src/shared/blockTypes.ts`):**
```ts
export const BLOCK_NAMES: string[] = Object.keys(BLOCK_TYPE_MAP).sort();
// ~90 sorted block name strings, e.g. 'accessForRequester', 'canPerformActivity', ...
```

**Import path:** `import { BLOCK_NAMES } from '@shared/blockTypes';` (Vite resolves `@shared` to `src/shared/`).

**`ParsedWorkflowStep` fields summary:**
- Editable strings: `name`, `label`, `allowedPerformer` (nullable string), `type` (optional string)
- Editable enum: `serviceWorkflowBlock.name` (the `block` field in the seed file)
- Read-only: `displayOptions.x`, `displayOptions.y`, `performerNeedsTask`, `isRerunnable`, `parameters`
