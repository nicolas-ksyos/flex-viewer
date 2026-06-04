# Task TZ4 — BlockSettingsPopover: typed parameter editor

## Goal
In BlockSettingsPopover, when a `BlockParameterSchema` is available for the block type,
render proper typed form fields for the `parameters` object instead of the raw JSON pre block.
Add `onParametersChange` callback to enable saving.

## Dependencies
TZ1 (schemas available from API), TZ2 (types + parameters in EditableStepFields).

## Files to read first
- `src/client/components/edit/BlockSettingsPopover.tsx` — full current file
- `src/shared/types.ts` — BlockParameterSchema, BlockParameterField, ParameterFieldType
- `src/client/components/edit/EditableWorkflowCanvas.tsx` — how popover is rendered

## Files to modify
- `src/client/components/edit/BlockSettingsPopover.tsx` — add parameter editor section
- `src/client/components/edit/EditableWorkflowCanvas.tsx` — pass schema + onParametersChange
- `src/client/components/CanvasPane.tsx` — thread blockParameterSchemas + onParametersChange

---

## A. BlockSettingsPopover changes

### New prop
```tsx
blockParameterSchema?: BlockParameterSchema;  // from TZ2 shared types
onParametersChange?: (params: Record<string, unknown> | null) => void;
```

### Replace raw JSON with typed editor

Find the `{step.parameters && (` section that renders the `<pre>` JSON block.

Replace it with:
```tsx
{/* Parameters section */}
{(blockParameterSchema?.hasEditor || step.parameters) && (
  <>
    <div style={{ borderTop: '1px solid #f3f4f6', margin: '10px 0' }} />
    <div style={{ fontSize: 11, fontWeight: 600, color: '#374151', marginBottom: 8 }}>
      Parameters
      {!blockParameterSchema?.hasEditor && (
        <span style={{ fontWeight: 400, color: '#9ca3af', fontSize: 10, marginLeft: 6 }}>(raw JSON)</span>
      )}
    </div>

    {blockParameterSchema?.hasEditor && blockParameterSchema.fields.length > 0 ? (
      <ParameterEditor
        fields={blockParameterSchema.fields}
        parameters={step.parameters ?? {}}
        allSteps={allSteps ?? []}
        allActivities={allActivities ?? []}
        onChange={onParametersChange ?? (() => {})}
      />
    ) : (
      /* Fallback: read-only JSON for blocks without a schema */
      step.parameters && (
        <pre style={{
          fontSize: 10, background: '#f9fafb', padding: 6, borderRadius: 4,
          overflowX: 'auto', maxHeight: 120, margin: 0, whiteSpace: 'pre-wrap',
        }}>
          {JSON.stringify(step.parameters, null, 2)}
        </pre>
      )
    )}
  </>
)}
```

### `ParameterEditor` component (inline in BlockSettingsPopover.tsx)

```tsx
function ParameterEditor({
  fields,
  parameters,
  allSteps,
  allActivities,
  onChange,
}: {
  fields: BlockParameterField[];
  parameters: Record<string, unknown>;
  allSteps: ParsedWorkflowStep[];
  allActivities: ParsedWorkflowActivity[];
  onChange: (params: Record<string, unknown>) => void;
}) {
  const handleFieldChange = (key: string, value: unknown) => {
    onChange({ ...parameters, [key]: value });
  };

  return (
    <div>
      {fields.map((field) => (
        <ParameterField
          key={field.key}
          field={field}
          value={parameters[field.key]}
          allSteps={allSteps}
          allActivities={allActivities}
          onChange={(v) => handleFieldChange(field.key, v)}
        />
      ))}
    </div>
  );
}
```

### `ParameterField` component — renders one field based on type

```tsx
function ParameterField({
  field, value, allSteps, allActivities, onChange,
}: {
  field: BlockParameterField;
  value: unknown;
  allSteps: ParsedWorkflowStep[];
  allActivities: ParsedWorkflowActivity[];
  onChange: (v: unknown) => void;
}) {
  const fieldLabel = (
    <label style={{ display: 'block', fontSize: 11, color: '#6b7280', marginBottom: 2, fontWeight: 500 }}>
      {field.key}
      {field.required && <span style={{ color: '#ef4444', marginLeft: 2 }}>*</span>}
    </label>
  );

  const inputStyle: React.CSSProperties = {
    width: '100%', padding: '4px 6px', fontSize: 12,
    border: '1px solid #d1d5db', borderRadius: 4, boxSizing: 'border-box',
    background: 'white',
  };

  switch (field.type) {
    case 'string':
      return (
        <div style={{ marginBottom: 8 }}>
          {fieldLabel}
          <input type="text" value={String(value ?? '')} onChange={(e) => onChange(e.target.value)} style={inputStyle}/>
        </div>
      );

    case 'number':
      return (
        <div style={{ marginBottom: 8 }}>
          {fieldLabel}
          <input type="number" value={value != null ? Number(value) : ''} onChange={(e) => onChange(e.target.valueAsNumber || 0)} style={inputStyle}/>
        </div>
      );

    case 'boolean':
      return (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
          <input type="checkbox" checked={Boolean(value)} onChange={(e) => onChange(e.target.checked)} style={{ width: 14, height: 14 }}/>
          <label style={{ fontSize: 12, color: '#374151', cursor: 'pointer' }}>{field.key}</label>
        </div>
      );

    case 'enum':
      return (
        <div style={{ marginBottom: 8 }}>
          {fieldLabel}
          <select value={String(value ?? '')} onChange={(e) => onChange(e.target.value)} style={inputStyle}>
            <option value="">— select —</option>
            {(field.enumValues ?? []).map((v) => <option key={v} value={v}>{v}</option>)}
          </select>
        </div>
      );

    case 'activity-id':
      return (
        <div style={{ marginBottom: 8 }}>
          {fieldLabel}
          <select value={String(value ?? '')} onChange={(e) => onChange(e.target.value)} style={inputStyle}>
            <option value="">— select activity —</option>
            {allActivities.map((a) => <option key={a.id} value={a.id}>{a.label || a.name}</option>)}
          </select>
        </div>
      );

    case 'step-id':
      return (
        <div style={{ marginBottom: 8 }}>
          {fieldLabel}
          <select value={String(value ?? '')} onChange={(e) => onChange(e.target.value)} style={inputStyle}>
            <option value="">— select step —</option>
            {allSteps.map((s) => <option key={s.id} value={s.id}>{s.label || s.name}</option>)}
          </select>
        </div>
      );

    case 'activity-id-array': {
      const selected = Array.isArray(value) ? value as string[] : [];
      return (
        <div style={{ marginBottom: 8 }}>
          {fieldLabel}
          <div style={{ maxHeight: 80, overflowY: 'auto', border: '1px solid #e5e7eb', borderRadius: 4, padding: '4px 6px' }}>
            {allActivities.map((a) => (
              <label key={a.id} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, cursor: 'pointer', padding: '1px 0' }}>
                <input type="checkbox" checked={selected.includes(a.id)}
                       onChange={(e) => {
                         const next = e.target.checked ? [...selected, a.id] : selected.filter((x) => x !== a.id);
                         onChange(next);
                       }}/>
                {a.label || a.name}
              </label>
            ))}
          </div>
        </div>
      );
    }

    case 'step-id-array': {
      const selected = Array.isArray(value) ? value as string[] : [];
      return (
        <div style={{ marginBottom: 8 }}>
          {fieldLabel}
          <div style={{ maxHeight: 80, overflowY: 'auto', border: '1px solid #e5e7eb', borderRadius: 4, padding: '4px 6px' }}>
            {allSteps.map((s) => (
              <label key={s.id} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, cursor: 'pointer', padding: '1px 0' }}>
                <input type="checkbox" checked={selected.includes(s.id)}
                       onChange={(e) => {
                         const next = e.target.checked ? [...selected, s.id] : selected.filter((x) => x !== s.id);
                         onChange(next);
                       }}/>
                {s.label || s.name}
              </label>
            ))}
          </div>
        </div>
      );
    }

    case 'string-array': {
      const items = Array.isArray(value) ? (value as string[]).join(', ') : String(value ?? '');
      return (
        <div style={{ marginBottom: 8 }}>
          {fieldLabel}
          <input type="text" value={items}
                 placeholder="comma-separated values"
                 onChange={(e) => onChange(e.target.value.split(',').map((s) => s.trim()).filter(Boolean))}
                 style={inputStyle}/>
        </div>
      );
    }

    case 'object':
    default: {
      // Render raw JSON for nested objects or unknown types
      const jsonText = value != null ? JSON.stringify(value, null, 2) : '';
      return (
        <div style={{ marginBottom: 8 }}>
          {fieldLabel}
          <textarea
            value={jsonText}
            rows={3}
            onChange={(e) => {
              try { onChange(JSON.parse(e.target.value)); } catch {}
            }}
            style={{ ...inputStyle, resize: 'vertical', fontFamily: 'monospace' }}
          />
        </div>
      );
    }
  }
}
```

### New props passed through

`BlockSettingsPopover` needs `allActivities?: ParsedWorkflowActivity[]` for activity selectors.
Add it to `BlockSettingsPopoverProps`.

Import `ParsedWorkflowActivity` from shared types.

## B. EditableWorkflowCanvas threading

Add to `EditableWorkflowCanvasProps`:
```ts
blockParameterSchemas?: BlockParameterSchemas;
allActivities?: ParsedWorkflowActivity[];
onParametersChange?: (step: ParsedWorkflowStep, params: Record<string, unknown> | null) => void;
```

When rendering `<BlockSettingsPopover>`, add:
```tsx
blockParameterSchema={blockParameterSchemas?.[popStep.serviceWorkflowBlock.name]}
allActivities={allActivities ?? []}
onParametersChange={(params) => onParametersChange?.(popStep, params)}
```

## C. CanvasPane threading

Add to `CanvasPaneProps`:
```ts
blockParameterSchemas?: BlockParameterSchemas;
onParametersChange?: (step: ParsedWorkflowStep, params: Record<string, unknown> | null) => void;
```

Pass to `EditableWorkflowCanvas`. Also pass `workflow.activities` as `allActivities`.

## Acceptance criteria
- For blocks with a schema (e.g. fixedIntervalScheduler): shows typed fields (number input for intervalNumber, dropdown for intervalType)
- For blocks without a schema: shows existing JSON pre block
- Editing a field calls onParametersChange with the updated parameters object
- activity-id and step-id fields show dropdowns with current workflow items
- tsc --noEmit passes
