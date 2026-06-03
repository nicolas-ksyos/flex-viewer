# Edit Mode — Plan Summary

## Feature overview
Add an "Edit" mode to the flex-viewer application. When active, edit mode replaces the read-only `WorkflowGraph` view with a custom interactive canvas where blocks can be dragged to new grid positions, and block settings (string/enum fields) can be edited via an 'i' info popover. All changes are accumulated in a sidebar and written back to the TypeScript seed file on disk via a new server endpoint.

## Architecture decisions

### 1. Custom edit canvas instead of extending WorkflowGraph
The `WorkflowGraph` component from `@frontend` (ClientSafe codebase) is read-only. We build `EditableWorkflowCanvas` independently in this repo. It renders blocks at `displayOptions.x * 220, displayOptions.y * 130` pixels using absolute positioning, visually matching the read-only blocks. Transition lines are drawn as SVG.

### 2. Pending changes as an in-memory merge map
All edits (both drag moves and field changes) are accumulated in a `StepPendingChange[]` array, keyed by `stepId`. Re-editing the same step merges into the existing entry rather than appending. This is the single source of truth in `useEditMode` hook.

### 3. Seed file write: AST-position replacement
`seedWriter.ts` uses `ts.createSourceFile` to parse the seed file AST, finds `createStep()` call argument objects by their `name:` property, collects `{ start, end, newText }` replacement pairs for changed properties, then applies them back-to-front. This preserves all formatting and comments. New properties (not yet present in the seed) are inserted before the closing brace of the step object.

### 4. BLOCK_TYPE_MAP extracted to shared module
To avoid duplicating the block name list between server and client, `BLOCK_TYPE_MAP` is moved from `seedAstParser.ts` to `src/shared/blockTypes.ts`. Both the server parser and the client dropdown import from there.

### 5. Exit edit mode on save OR discard
After save: `exitEditMode()` clears state and switches to view mode. The file watcher detects the write and re-parses automatically via WebSocket — updated positions appear without a manual refresh. After discard: same `exitEditMode()`, no server call.

### 6. Edit sidebar owns save UI, hook owns save logic
`EditSidebar` can either call the PATCH endpoint directly (T6 as written) or delegate to `useEditMode.saveChanges`. T8 notes both options; the integrating agent should pick the cleaner one given the actual implementation.

---

## Task list

| Task | Title | Depends on | Files touched |
|------|-------|-----------|---------------|
| **T1** | Shared types for edit mode | — | `src/shared/types.ts`, `src/shared/blockTypes.ts` (new), `src/server/seedAstParser.ts` |
| **T2** | Server seed write endpoint | T1 | `src/server/seedWriter.ts` (new), `src/server/routes/seedRoutes.ts` |
| **T3** | Edit mode toggle + layout scaffold | T1 | `src/client/App.tsx` |
| **T4** | `EditableWorkflowCanvas` block renderer | T1 | `src/client/components/edit/EditableWorkflowCanvas.tsx` (new), `.css` (new) |
| **T5** | Drag-and-drop + grid overlay | T1, T4 | `src/client/components/edit/EditableWorkflowCanvas.tsx` |
| **T6** | Edit changes sidebar | T1, T2 | `src/client/components/edit/EditSidebar.tsx` (new) |
| **T7** | Block 'i' icon + settings popover | T1, T4 | `src/client/components/edit/BlockSettingsPopover.tsx` (new), `EditableWorkflowCanvas.tsx` |
| **T8** | Wire everything + `useEditMode` hook | T1–T7 | `src/client/hooks/useEditMode.ts` (new), `src/client/App.tsx` |

### Dependency graph (execution waves)

```
Wave 1 (parallel):  T1
Wave 2 (parallel):  T2, T3, T4          ← all unblock after T1
Wave 3 (parallel):  T5, T6, T7          ← T5+T7 need T4; T6 needs T2
Wave 4:             T8                   ← needs all of T3–T7
```

---

## New files created by this feature

```
src/shared/blockTypes.ts
src/server/seedWriter.ts
src/client/hooks/useEditMode.ts
src/client/components/edit/
    EditableWorkflowCanvas.tsx
    EditableWorkflowCanvas.css
    EditSidebar.tsx
    BlockSettingsPopover.tsx
```

## Files modified

```
src/shared/types.ts               (additive — new interfaces only)
src/server/seedAstParser.ts       (import swap — BLOCK_TYPE_MAP moved to shared)
src/server/routes/seedRoutes.ts   (new PATCH route added)
src/client/App.tsx                (isEditMode state, Edit button, layout split)
```

---

## Risks and notes for the orchestrator

### Risk 1 — Block visual fidelity (T4)
The external `WorkflowGraph` source lives at:
`/Users/nicolaskrul/repos/cs/workflow-vervolg/src/frontend/components/pages/services/workflowGraph/`
The T4 agent must inspect it to match colors and typography. If the source is inaccessible or too complex, the fallback color map in T4 is acceptable.

### Risk 2 — Seed file write correctness (T2)
The regex/AST writer must handle edge cases:
- Template literal values (not just string literals) — do not attempt to replace these; skip with a warning.
- Properties using trailing commas, multiline values, or spread syntax.
- Steps whose `name:` property uses a variable reference instead of a literal — these cannot be matched by name and will be silently skipped.
Manual testing against a real seed file is required before merge.

### Risk 3 — Canvas scroll + drag coordinate offset (T5)
The drag delta calculation uses client-space deltas which are scroll-independent. Verify this with a seed file that requires scrolling (many steps). If blocks appear offset after drag, the canvas container's scroll position needs to be subtracted from the client coordinates at drag start.

### Risk 4 — BLOCK_TYPE_MAP import in server (T1)
`seedAstParser.ts` is compiled by `tsconfig.server.json`. Confirm the server tsconfig includes `src/shared/` in its paths/include list, or the import from `../shared/blockTypes.js` will fail at runtime. Check `tsconfig.server.json` before submitting T1.

### Risk 5 — Popover clipping (T7)
The settings popover is absolutely positioned within the canvas container. If a block is near the right/bottom edge, the popover may be clipped. T7 notes a "flip to left" strategy if near the right edge; implement this if needed using the block's pixelX + BLOCK_WIDTH vs canvas width.

### Risk 6 — Concurrent edits + file watcher feedback loop
After save, the file watcher re-parses and sends a WebSocket `workflowUpdate`. `App.tsx` applies this to `parseResult`. If the user was still in edit mode during this update (e.g., save failed but watcher fired for another reason), the `pendingChanges` may conflict with the refreshed data. The current design exits edit mode on successful save, which avoids this. Verify no re-parse arrives while the PATCH is in flight.
