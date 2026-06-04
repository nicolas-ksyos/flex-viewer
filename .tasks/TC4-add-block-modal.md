# Task TC4 — Add Block modal

## Goal
Create `AddBlockModal.tsx` — a modal for configuring a new workflow step. On "Add", creates a `NewStepDraft` and passes it to the parent. Includes auto-position suggestion based on connected steps.

## Dependencies
TC1 (types), TC2 (useEditMode with addNewStep + generateVariableName).

## Files to read first
- `src/shared/types.ts` — `NewStepDraft`, `NewStepFields`
- `src/shared/blockTypes.ts` — `BLOCK_NAMES` for the block selector
- `src/client/components/CloneModal.tsx` — reference for modal styling

## Files to create
- `src/client/components/edit/AddBlockModal.tsx`

---

## Modal structure

Title: "Add new block"

Fields:
1. **Block type** — `<select>` populated with `BLOCK_NAMES` (sorted). Required.
2. **Name** — text input. Required. Used to auto-generate the variable name (shown as preview below the field: "Variable: performSomethingStep").
3. **Label** — text input. Optional. Defaults to same as name.
4. **Position X** — number input. Required. Default: auto-suggested (see below).
5. **Position Y** — number input. Required. Default: auto-suggested.
6. **Allowed performer** — text input. Optional.
7. **Needs task** — checkbox. Default: false.
8. **Connects FROM (optional)** — multi-select list of existing steps. These steps will have the new block added to their `nextSteps`. Each step shown as `{name} (x:{x}, y:{y})`.
9. **Connects TO (optional)** — multi-select list of existing steps. The new block's `nextSteps` will contain these steps.
10. **Synchronous connections** — checkbox next to "Connects FROM/TO". When checked, uses `synchronousNextSteps` instead.

### Auto-position suggestion
When a step is selected in "Connects FROM":
- Look at that step's position (x, y)
- Suggest x: fromStep.x + 1, y: fromStep.y
- If that position is occupied, suggest the next free column

### Variable name preview
Below the Name field, show: `Variable name: {generated}` in small muted text.
The generated name is the camelCase-from-name + "Step" (same logic as `generateVariableName`).

### Validation
- Block type + Name + X + Y are required
- "Add" button disabled until all required fields filled
- Name must not be empty
- X and Y must be valid integers >= 0

### Props
```tsx
interface AddBlockModalProps {
  existingSteps: ParsedWorkflowStep[];  // for position check + connects-from/to picker
  onAdd: (draft: Omit<NewStepDraft, 'kind'>) => void;
  onCancel: () => void;
}
```

### On Add
Generate `tempId` (e.g. `crypto.randomUUID()` or `Date.now().toString(36)`) and call `onAdd({ tempId, fields, variableName })`.

If "Connects FROM" steps are selected, also create `NewConnectionDraft` entries — but since `AddBlockModal` should only be responsible for the block itself, pass the connection info as part of `fields.prevStepIds` and `fields.nextStepIds` for the parent to handle.

## Acceptance criteria
- All fields render correctly
- Block type dropdown uses BLOCK_NAMES
- Variable name preview updates as user types name
- Auto-position updates when "Connects FROM" selection changes
- Add button disabled until required fields filled
- Pressing Escape or Cancel dismisses without adding
- On Add, calls `onAdd` with correctly structured draft
