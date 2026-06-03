# Implementation Plan — Edit Mode for flex-viewer

## Goal
Add a fully functional Edit mode that lets users drag workflow blocks to new grid positions, edit block settings via a popover, review all pending changes in a sidebar, and save them back to the TypeScript seed file on disk.

## Tasks

### T1 — Shared types for edit mode
- **File:** `src/shared/types.ts` — add `EditableStepFields`, `StepPendingChange`, `SeedPatchRequest`, `SeedPatchResponse`
- **File:** `src/shared/blockTypes.ts` (new) — extract `BLOCK_TYPE_MAP` + export `BLOCK_NAMES`
- **File:** `src/server/seedAstParser.ts` — replace inline `BLOCK_TYPE_MAP` with import from `../shared/blockTypes.js`
- **Acceptance:** `tsc --noEmit` passes; `BLOCK_NAMES` is importable in both server and client
- **Context file:** `.tasks/T1-edit-mode-types.md`

### T2 — Server seed write endpoint
- **File:** `src/server/seedWriter.ts` (new) — `patchSeedFile()` using TS AST position replacement
- **File:** `src/server/routes/seedRoutes.ts` — add `PATCH /seeds/:fileName` route
- **Acceptance:** Calling the endpoint updates `x:`, `y:`, string fields in-place; rest of file unchanged
- **Context file:** `.tasks/T2-seed-writer.md`

### T3 — Edit mode toggle + layout scaffold in App
- **File:** `src/client/App.tsx` — `isEditMode` state, Edit/View button in navbar, two-column placeholder layout
- **Acceptance:** Edit button appears; toggling shows/hides split layout
- **Context file:** `.tasks/T3-edit-mode-toggle.md`

### T4 — `EditableWorkflowCanvas` block renderer
- **File:** `src/client/components/edit/EditableWorkflowCanvas.tsx` (new)
- **File:** `src/client/components/edit/EditableWorkflowCanvas.css` (new)
- **Acceptance:** Blocks render at correct absolute positions; SVG transition lines drawn; colors match WorkflowGraph
- **Context file:** `.tasks/T4-editable-canvas.md`

### T5 — Drag-and-drop + grid overlay
- **File:** `src/client/components/edit/EditableWorkflowCanvas.tsx` — add drag state + mouse handlers
- **Acceptance:** Block follows cursor; snaps to integer cell on release; grid overlay visible during drag
- **Context file:** `.tasks/T5-drag-and-drop.md`

### T6 — Edit changes sidebar
- **File:** `src/client/components/edit/EditSidebar.tsx` (new)
- **Acceptance:** Lists pending changes; Save calls PATCH and exits edit mode; Discard exits without saving
- **Context file:** `.tasks/T6-edit-sidebar.md`

### T7 — Block 'i' icon + settings popover
- **File:** `src/client/components/edit/BlockSettingsPopover.tsx` (new)
- **File:** `src/client/components/edit/EditableWorkflowCanvas.tsx` — add hover state + icon
- **Acceptance:** Hover shows 'i'; click opens popover; editable fields update pending changes; icon hidden while dragging
- **Context file:** `.tasks/T7-block-info-popover.md`

### T8 — Wire everything + `useEditMode` hook
- **File:** `src/client/hooks/useEditMode.ts` (new) — single source of truth for edit state
- **File:** `src/client/App.tsx` — replace placeholders with real components; use hook
- **Acceptance:** Full end-to-end flow: drag → sidebar shows change → Save → view mode shows new positions
- **Context file:** `.tasks/T8-wire-together.md`

## Files to Modify
- `src/shared/types.ts` — additive new interfaces
- `src/server/seedAstParser.ts` — import swap for `BLOCK_TYPE_MAP`
- `src/server/routes/seedRoutes.ts` — new PATCH route
- `src/client/App.tsx` — edit button, layout split, hook wiring

## New Files
- `src/shared/blockTypes.ts` — shared block name/type constants
- `src/server/seedWriter.ts` — AST-based seed file writer
- `src/client/hooks/useEditMode.ts` — edit mode state hook
- `src/client/components/edit/EditableWorkflowCanvas.tsx` — custom grid canvas
- `src/client/components/edit/EditableWorkflowCanvas.css` — grid overlay styles
- `src/client/components/edit/EditSidebar.tsx` — pending changes + save/discard
- `src/client/components/edit/BlockSettingsPopover.tsx` — block field editor popover

## Dependencies
```
T1  ──► T2, T3, T4
T4  ──► T5, T7
T2  ──► T6
T3 + T4 + T5 + T6 + T7  ──► T8
```

Parallel execution waves:
1. **T1** alone
2. **T2, T3, T4** in parallel
3. **T5, T6, T7** in parallel
4. **T8** alone

## Risks
1. **Block visual fidelity (T4):** Must inspect `WorkflowGraph` source at `/Users/nicolaskrul/repos/cs/workflow-vervolg/src/frontend/components/pages/services/workflowGraph/`. Fallback color map provided in T4 context file.
2. **Seed writer edge cases (T2):** Template literal values, variable-referenced names, and multiline properties need manual testing against a real seed file.
3. **Canvas scroll + drag offset (T5):** Delta-based drag calculation is scroll-safe by design — verify with a workflow that requires scrolling.
4. **Server tsconfig include path (T1):** Confirm `tsconfig.server.json` resolves `src/shared/` before closing T1.
5. **Popover edge clipping (T7):** Flip popover to the left when block is near the right edge of the canvas.
6. **WebSocket feedback loop (T8):** File watcher fires after PATCH write; ensure `exitEditMode()` is called before the re-parse result arrives, or the pending changes could conflict with incoming data.
