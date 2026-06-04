# Plan: Edit Mode — Create New Workflow Objects

## Feature overview
A secondary "creation" toolbar in edit mode allows users to add new Blocks, Connections, and Transitions to a workflow. New items appear immediately on the canvas (as pending changes with a "NEW" badge) and are written to the seed file on Save.

## Three creation types

| Button | What it creates | Seed file output |
|--------|----------------|-----------------|
| **Block** | A new `createStep()` step | `const xxxStep = await serviceCreationHelper.createStep({...})` |
| **Connection** | A `nextSteps` or `synchronousNextSteps` link between two steps | Appends to `nextSteps: [...]` or `synchronousNextSteps: [...]` on source step |
| **Transition** | A `TransitionType.disable` link from step A to step B | Appends `{ step: B, type: TransitionType.disable }` to A's `nextSteps` |

## Architecture decisions

### 1. Variable name extraction in parser
The seed writer must write `nextSteps: [myStepVar]` (variable names, not IDs). The parser already tracks `stepVarToId` internally. Add `variableName?: string` to `ParsedWorkflowStep` and expose it through all layers.

### 2. Pending changes data model extension
`pendingChanges` expands from `StepPendingChange[]` to `PendingChangeItem[]` — a union of three kinds:
- `{ kind: 'edit', ...StepPendingChange }` (existing behavior, unchanged)
- `{ kind: 'new-step', tempId, fields, variableName }` (new block)
- `{ kind: 'new-connection', tempId, fromStepId, toStepIds[], synchronous }` (new connection)
- `{ kind: 'new-transition', tempId, fromStepId, toStepIds[] }` (disable transition)

### 3. Canvas rendering of new steps
A `computeDisplayWorkflow(workflow, pendingItems)` utility merges real steps + new-step drafts into a single display workflow. New steps are rendered with a dashed border + "NEW" label.

### 4. Seed writer — variable ordering
New steps are appended AFTER the last existing `createStep` call in the file. When multiple new steps reference each other, they are topologically sorted. The writer then patches existing steps' `nextSteps` arrays.

### 5. BlockName enum handling
The seed writer emits `BlockName.xxx` not a plain string. A mapping from block name string → `BlockName.xxx` enum member is derived by inspecting the import in the seed file.

## Task list & dependency graph

```
TC1 (types + parser varName)
  └─► TC2 (useEditMode extension)
  └─► TC3 (creation toolbar)
  └─► TC8 (seed writer extension)
  
TC2
  └─► TC4 (Add Block modal)
  └─► TC5 (Add Connection modal)
  └─► TC6 (Add Transition modal)
  
TC4 + TC5 + TC6
  └─► TC7 (canvas + sidebar for new items)

TC7 + TC8
  └─► TC9 (App wiring)
```

### Execution waves
- **Wave 1**: TC1
- **Wave 2**: TC2 + TC3 + TC8 (parallel)
- **Wave 3**: TC4 + TC5 + TC6 (parallel)
- **Wave 4**: TC7 (parallel with TC8 if TC8 not done)
- **Wave 5**: TC9

## New files
```
src/shared/types.ts              (extended — PendingChangeItem union)
src/client/components/edit/
  CreationToolbar.tsx            (new toolbar component)
  AddBlockModal.tsx
  AddConnectionModal.tsx
  AddTransitionModal.tsx
src/client/hooks/useEditMode.ts  (extended)
src/server/seedWriterNew.ts      (new — appendStepToSeedFile etc.)
```

## Modified files
```
src/server/seedAstParser.ts     (expose variableName on ParsedWorkflowStep)
src/client/components/edit/EditableWorkflowCanvas.tsx (render new steps)
src/client/components/edit/EditSidebar.tsx             (NEW badges + groups)
src/client/components/CanvasPane.tsx                   (pass creation props)
src/client/App.tsx                                     (wire creation callbacks)
```
