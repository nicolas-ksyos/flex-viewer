# Task TC8 — Seed writer: append new steps and connections

## Goal
Extend the seed writer to handle `NewStepDraft`, `NewConnectionDraft`, and `NewTransitionDraft` from pending changes. Write them to the seed file in the correct order.

## Dependencies
TC1 (variable names on ParsedWorkflowStep, new draft types).

## Files to read first
- `src/server/seedWriter.ts` — existing patchSeedFile
- `src/server/seedAstParser.ts` — understand the file structure
- `src/server/routes/seedRoutes.ts` — the PATCH endpoint

## Files to create/modify
- **Create** `src/server/seedWriterNew.ts` — new functions for adding steps/connections
- **Modify** `src/server/routes/seedRoutes.ts` — extend PATCH to handle new items

---

## A. New file `src/server/seedWriterNew.ts`

### Key function: `appendNewItemsToSeedFile(filePath, newSteps, newConnections, newTransitions, existingStepVarNames)`

Where `existingStepVarNames: Map<string, string>` maps `stepId → variableName`.

### Strategy for new steps

1. Read source file
2. Find the LAST `createStep` call in the file (or the position just before the last line of the seed function body)
3. For each new step, generate:
```ts
    // {step.fields.name}
    const {varName} = await serviceCreationHelper.createStep({
        block: BlockName.{blockName},
        name: '{name}',
        x: {x},
        y: {y},
{optionalLabel}        {optionalAllowedPerformer}        {optionalPerformerNeedsTask}        {optionalNextSteps}    });
```

4. Topological sort among new steps (if new step A references new step B in nextSteps, B must come first)

5. Insert all new step declarations AFTER the last existing `createStep` call (before `serviceCreationHelper.createWorkflow(` or similar)

### Strategy for new connections (nextSteps additions)

Use the existing `patchSeedFile` approach — find the source step by name and:
- If `nextSteps: [...]` already exists, append the new variable names
- If it doesn't exist, insert `nextSteps: [{varNames}],` as a new property

For `synchronousNextSteps`, same pattern.

### BlockName enum handling

The block names in `BLOCK_NAMES` match the keys in `BlockName` enum used in seed files.
Generate `BlockName.xxx` by using the block name directly: `BlockName.performActivity`.

BUT — check if `BlockName` is already imported in the file. If not, the new step will use a string literal with a comment: `block: 'performActivity', // NOTE: add BlockName import`.

Actually, since all seed files import `BlockName` from `@common/enums` (based on analysis), always use `BlockName.xxx` format.

### Handling prevStepIds (blocks that should connect TO the new step)

For each existing step whose ID is in `fields.prevStepIds`:
- Use `patchSeedFile` logic to add the new step's variable name to that step's `nextSteps`

### Handling nextStepIds (new step connects TO these)

Include in the generated `nextSteps: [existingStepVar1, existingStepVar2]` of the new step.

### TransitionType.disable

For `NewTransitionDraft`:
- Find the source step (by name via existing patchSeedFile approach)
- In its `nextSteps: [...]`, append `{ step: {targetVar}, type: TransitionType.disable }`

### Handling `uuidv4` pre-declared IDs

Some steps declare `const myStepId = uuidv4()` and use it in `parameters`. For newly created steps that don't have this requirement, don't generate the uuidv4 pre-declaration. The `serviceCreationHelper.createStep` auto-generates the ID.

### Extended PATCH route body

```ts
interface SeedPatchRequest {
  changes: StepPendingChange[];         // existing edits
  newSteps?: NewStepDraft[];           // new blocks
  newConnections?: NewConnectionDraft[]; // new connections
  newTransitions?: NewTransitionDraft[]; // new disable transitions
}
```

The route first calls `patchSeedFile` for existing edits, then `appendNewItemsToSeedFile` for new items.

---

## Important: insertion position

Find the last `await serviceCreationHelper.createStep({` call and insert after its closing `});`. Do NOT insert after the very last line of the file — find the structured insertion point.

Use TypeScript AST to find the position:
```ts
// Find all createStep calls, get the end position of the last one
const lastCreateStepEnd = /* position after last createStep's closing }); */;
// Insert new step declarations starting at this position
```

## Acceptance criteria
- New steps are appended after last existing createStep in correct TS syntax
- `BlockName.xxx` enum format used
- `nextSteps` referencing other steps uses variable names
- Existing steps' `nextSteps` updated when `prevStepIds` provided
- `TransitionType.disable` correctly inserted for NewTransitionDraft
- File watcher detects the change and re-parses
- `tsc --noEmit` on server passes
