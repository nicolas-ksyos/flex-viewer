# Task TZ3 — Client: useBlockParameters hook + Refresh button

## Goal
Create a `useBlockParameters` hook that fetches the schema from `/api/block-parameters`.
Add a "Refresh" button to the App.tsx navbar (before the Live badge) that calls POST /api/block-parameters/refresh.

## Files to read first
- `src/client/App.tsx` — navbar structure
- `src/client/hooks/useConfig.ts` — for hook pattern to follow

## Files to create / modify
- **Create** `src/client/hooks/useBlockParameters.ts`
- **Modify** `src/client/App.tsx` — add Refresh button + pass blockParameterSchemas to CanvasPane

---

## A. `src/client/hooks/useBlockParameters.ts`

```ts
import { useState, useEffect, useCallback } from 'react';
import type { BlockParameterSchemas } from '../../shared/types';

export function useBlockParameters() {
  const [schemas, setSchemas] = useState<BlockParameterSchemas>({});
  const [loading, setLoading] = useState(false);
  const [lastRefreshed, setLastRefreshed] = useState<Date | null>(null);

  const fetchSchemas = useCallback(async () => {
    try {
      const res = await fetch('/api/block-parameters');
      if (res.ok) setSchemas(await res.json());
    } catch {}
  }, []);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/block-parameters/refresh', { method: 'POST' });
      if (res.ok) {
        const data = await res.json();
        setSchemas(data.schemas ?? {});
        setLastRefreshed(new Date());
      }
    } catch {}
    finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchSchemas(); }, [fetchSchemas]);

  return { schemas, loading, lastRefreshed, refresh };
}
```

## B. App.tsx changes

1. Add hook call: `const { schemas: blockParameterSchemas, loading: schemaRefreshing, refresh: refreshSchemas } = useBlockParameters();`

2. Add Refresh button in navbar — just **before** the `<Badge text={connected ? 'Live' : 'Reconnecting…'}>` badge:

```tsx
{/* Refresh block parameter schemas */}
<button
  onClick={refreshSchemas}
  disabled={schemaRefreshing}
  title={`Refresh block parameter types from ClientSafe${lastRefreshed ? ` (last: ${lastRefreshed.toLocaleTimeString()})` : ''}`}
  style={{
    background: 'none', border: 'none', cursor: schemaRefreshing ? 'wait' : 'pointer',
    padding: '4px 6px', borderRadius: 4, color: '#6b7280', fontSize: 14, lineHeight: 1,
    opacity: schemaRefreshing ? 0.5 : 1,
    display: 'flex', alignItems: 'center',
  }}
  aria-label="Refresh block parameter schemas"
>
  {/* Refresh / reload icon */}
  <svg width="14" height="14" viewBox="0 0 14 14" fill="none"
       style={{ display: 'block', animation: schemaRefreshing ? 'spin 1s linear infinite' : 'none' }}>
    <path d="M12 7A5 5 0 1 1 7 2" stroke="currentColor" strokeWidth="1.5"
          strokeLinecap="round" fill="none"/>
    <polyline points="7,2 9.5,2 9.5,4.5" stroke="currentColor" strokeWidth="1.5"
              strokeLinecap="round" strokeLinejoin="round"/>
  </svg>
</button>
```

Add the CSS animation to `src/client/styles/index.css`:
```css
@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
```

3. Pass `blockParameterSchemas` to both `<CanvasPane>` calls (edit mode and view mode).

Add to `CanvasPaneProps` (read `CanvasPane.tsx`):
```ts
blockParameterSchemas?: BlockParameterSchemas;
```

Pass it through CanvasPane → EditableWorkflowCanvas → BlockSettingsPopover.

## Acceptance criteria
- Refresh button appears in navbar before the Live badge
- Clicking it calls POST /api/block-parameters/refresh
- Spinner animation while refreshing
- Schemas available in `blockParameterSchemas` state for downstream use
