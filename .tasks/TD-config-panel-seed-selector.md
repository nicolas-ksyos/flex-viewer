# Task TD — Move seed selector into config panel

## Goal
Move the `SeedSelector` dropdown into `ConfigPanel.tsx` so the seed selection is part of the settings panel (shown/hidden when the gear button is pressed). Remove the standalone `SeedSelector` from the main body area of App.tsx.

## Files to read first
- `src/client/components/ConfigPanel.tsx`
- `src/client/components/SeedSelector.tsx`
- `src/client/App.tsx` (specifically the SeedSelector block in main)

## Files to modify
- `src/client/components/ConfigPanel.tsx` — add seed selector support
- `src/client/App.tsx` — remove standalone SeedSelector block, pass seed props to ConfigPanel

---

## ConfigPanel.tsx changes

### New props
```tsx
interface ConfigPanelProps {
  clientSafePath: string;
  onSave: (path: string) => Promise<void>;
  error: string | null;
  // Seed selector props (optional — only shown when clientSafePath is set)
  seeds?: SeedFileInfo[];
  selectedSeed?: string | null;
  seedsLoading?: boolean;
  onSeedSelect?: (fileName: string) => void;
}
```

Import `SeedSelector` and `SeedFileInfo`:
```ts
import { SeedSelector } from './SeedSelector';
import type { SeedFileInfo } from '../../shared/types';
```

### Layout addition
After the existing path input row (below the Save button group), add a divider and the seed selector when seeds are provided:
```tsx
{seeds && onSeedSelect && (
  <>
    <Box mt={4} style={{ borderTop: '1px solid var(--kds-color-gray-100)', paddingTop: 16 }}>
      <SeedSelector
        seeds={seeds}
        selectedSeed={selectedSeed ?? null}
        loading={seedsLoading ?? false}
        onSelect={onSeedSelect}
      />
    </Box>
  </>
)}
```

---

## App.tsx changes

1. Remove this entire block from App.tsx main area:
```tsx
{config?.clientSafePath && (
  <Box px={6} py={3} display="flex" alignItems="center" gap={3} flexShrink={0}>
    <SeedSelector seeds={seeds} selectedSeed={selectedSeed} loading={seedsLoading} onSelect={handleSelectSeed} />
  </Box>
)}
```

2. Update the `<ConfigPanel>` call to pass seed props:
```tsx
{showConfig && (
  <ConfigPanel
    clientSafePath={config?.clientSafePath ?? ''}
    onSave={handleSaveConfig}
    error={configError}
    seeds={seeds}
    selectedSeed={selectedSeed}
    seedsLoading={seedsLoading}
    onSeedSelect={handleSelectSeed}
  />
)}
```

3. Remove the `SeedSelector` import from App.tsx (no longer used there).

## Acceptance criteria
- Seed selector appears inside ConfigPanel below the path input.
- No SeedSelector rendered in the main body area.
- Selecting a seed from within ConfigPanel works correctly.
- TypeScript compiles without errors.
