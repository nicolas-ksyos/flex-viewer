# Task TC6 — Add Transition (disable) modal

## Goal
Create `AddTransitionModal.tsx` — a modal for adding `TransitionType.disable` transitions. When step A completes, it will disable step(s) B. Shows existing transitions from the source step for context.

## Dependencies
TC1, TC2.

## Files to create
- `src/client/components/edit/AddTransitionModal.tsx`

---

## Modal structure

Title: "Add disable transition"

Explanation text (subtle): "A disable transition prevents the target step from executing when the source step completes. Rendered as a red arrow in the workflow."

Fields:
1. **From step** (source) — select of all steps. Label: "When this step completes...". Required.
2. **Disable step(s)** — multi-select of all steps except the "From" step. Label: "...disable these steps". Required.

### Existing transitions panel
When a From step is selected, show its existing disable transitions:
```
Existing disable transitions from "{stepName}":
  ⊘ Step A (already disabled when this step runs)
```
And also show ALL transitions (connections + disable) for context — same format as AddConnectionModal.

### Props
```tsx
interface AddTransitionModalProps {
  existingSteps: ParsedWorkflowStep[];
  existingTransitions: ParsedWorkflowTransition[];
  newStepDrafts: NewStepDraft[];
  onAdd: (draft: Omit<NewTransitionDraft, 'kind'>) => void;
  onCancel: () => void;
}
```

## Acceptance criteria
- From/To pickers work
- Existing disable transitions shown for selected From step
- On Add, calls `onAdd` with `{ tempId, fromStepId, toStepIds }`
- Red color used for the disable concept throughout the modal
