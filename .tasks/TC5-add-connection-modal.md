# Task TC5 — Add Connection modal

## Goal
Create `AddConnectionModal.tsx` — a modal for adding a `nextSteps` or `synchronousNextSteps` link between two existing (or newly created) steps. Shows existing connections from the source step for context.

## Dependencies
TC1, TC2.

## Files to create
- `src/client/components/edit/AddConnectionModal.tsx`

---

## Modal structure

Title: "Add connection"

Fields:
1. **From step** — searchable select of all steps (existing + new drafts). Required.
2. **To step(s)** — multi-select of all steps. Cannot include the "From" step. Required (at least 1).
3. **Synchronous** — toggle/checkbox. Default: false. Label: "Synchronous (fires immediately when step completes)".

### Existing connections panel
Below the from-step selector, show a read-only list of the selected step's EXISTING `nextSteps` and `synchronousNextSteps`:
```
Existing connections from "{stepName}":
  → Step A  [enable, async]
  → Step B  [enable, sync]
  → Step C  [disable]
```
This helps the user understand what already exists before adding more.

### Props
```tsx
interface AddConnectionModalProps {
  existingSteps: ParsedWorkflowStep[];
  existingTransitions: ParsedWorkflowTransition[];
  newStepDrafts: NewStepDraft[];    // also selectable as from/to
  onAdd: (draft: Omit<NewConnectionDraft, 'kind'>) => void;
  onCancel: () => void;
}
```

### Validation
- From step + at least one To step required
- "Add" disabled until valid

## Acceptance criteria
- From/To pickers show all existing + new pending steps
- Existing connections shown for context when From step is selected
- Synchronous toggle works
- Escape/Cancel dismisses
- On Add, calls `onAdd` with `{ tempId, fromStepId, toStepIds, synchronous }`
