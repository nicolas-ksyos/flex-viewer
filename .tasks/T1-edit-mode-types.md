# Task T1 — Shared types for edit mode

## Goal
Add all new TypeScript types required by the edit mode feature to `src/shared/types.ts`, and extract the `BLOCK_TYPE_MAP` constant into a new shared file `src/shared/blockTypes.ts` so it can be used by both the server-side seed writer (T2) and the client-side block settings popover (T7) without duplication.

## Dependencies
None — this is the foundation all other tasks depend on.

## Files to read (before starting)
- `src/shared/types.ts` — understand existing type shapes; add new types here
- `src/server/seedAstParser.ts` — contains the `BLOCK_TYPE_MAP` constant (lines ~22–120); copy it to the new shared file and update the import

## Files to create / modify

| File | Action |
|------|--------|
| `src/shared/types.ts` | Add 4 new interfaces (see below) |
| `src/shared/blockTypes.ts` | **Create new** — exports `BLOCK_TYPE_MAP` and `BLOCK_NAMES` |
| `src/server/seedAstParser.ts` | Replace inline `BLOCK_TYPE_MAP` declaration with import from `../shared/blockTypes.js` |

## Acceptance criteria
- `src/shared/blockTypes.ts` exists and exports `BLOCK_TYPE_MAP` (Record<string,string>) and `BLOCK_NAMES` (string[]).
- `src/shared/types.ts` exports `EditableStepFields`, `StepPendingChange`, `SeedPatchRequest`, `SeedPatchResponse`.
- `src/server/seedAstParser.ts` no longer declares `BLOCK_TYPE_MAP` inline; it imports from `../shared/blockTypes.js`.
- TypeScript compiler reports no new errors (`npm run build` or `tsc --noEmit`).

## Implementation notes

### Types to add to `src/shared/types.ts`

```ts
/** All step properties that can be edited in the seed file. */
export interface EditableStepFields {
  x?: number;
  y?: number;
  name?: string;
  label?: string;
  allowedPerformer?: string | null;
  type?: string;
  block?: string;
}

/**
 * One pending change for a named step.
 * `stepName` matches the `name:` property value in the seed file — used by the
 * server writer to locate the right createStep() call.
 * `stepId` is the parsed ID — used by the client for keying/deduplication.
 */
export interface StepPendingChange {
  stepName: string;
  stepId: string;
  fields: EditableStepFields;
}

/** Body sent to PATCH /api/seeds/:fileName */
export interface SeedPatchRequest {
  changes: StepPendingChange[];
}

/** Response from PATCH /api/seeds/:fileName */
export interface SeedPatchResponse {
  success: boolean;
  error?: string;
}
```

### New file `src/shared/blockTypes.ts`

```ts
/**
 * Block-name → block-type mapping.
 * Shared between the server (seedAstParser) and the client (BlockSettingsPopover).
 * Source of truth: originally extracted from the ClientSafe DB seed + migrations.
 */
export const BLOCK_TYPE_MAP: Record<string, string> = {
  // Copy the full BLOCK_TYPE_MAP object from src/server/seedAstParser.ts here.
  // Do not abbreviate — copy every entry.
};

/** Sorted list of all valid block names, for use in dropdowns. */
export const BLOCK_NAMES: string[] = Object.keys(BLOCK_TYPE_MAP).sort();
```

### Update `src/server/seedAstParser.ts`

Replace the inline `const BLOCK_TYPE_MAP: Record<string, string> = { ... }` block with:

```ts
import { BLOCK_TYPE_MAP } from '../shared/blockTypes.js';
```

Note the `.js` extension — required because the server runs as ESM (`"type": "module"` in package.json) and tsx resolves `.js` to `.ts` at runtime.

The rest of `seedAstParser.ts` is **unchanged** — `BLOCK_TYPE_MAP` is used internally in `buildStep()`.

## Codebase context

**Current `src/shared/types.ts` structure (abbreviated):**
```ts
export interface ParsedWorkflowStep {
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
// ... plus ParsedWorkflowDefinition, ParsedWorkflow, SeedParseResult, ViewerConfig, WsMessage etc.
```

**`BLOCK_TYPE_MAP` in `seedAstParser.ts` starts at line ~22** with entries like:
```ts
const BLOCK_TYPE_MAP: Record<string, string> = {
    accessForRequester: 'general',
    canPerformActivity: 'choice',
    cancelProcess: 'action',
    manualStart: 'start',
    performActivity: 'activity',
    fixedIntervalScheduler: 'scheduled',
    // ... ~90 more entries
};
```
Copy all entries; do not abbreviate.
