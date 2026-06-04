# Task TZ5 — App.tsx final wiring

## Goal
Wire blockParameterSchemas and onParametersChange through App.tsx into CanvasPane calls.
Handle parameters changes in useEditMode. Connect Refresh button callback.

## Dependencies
TZ1-TZ4 all complete.

## Files to read first (ALL, completely)
- `src/client/App.tsx`
- `src/client/hooks/useEditMode.ts`
- `src/client/components/CanvasPane.tsx`

## Changes

### App.tsx
1. Import and use `useBlockParameters` hook
2. Thread `blockParameterSchemas` to both CanvasPane calls
3. Add `onParametersChange` callback:
   ```ts
   onParametersChange={(step, params) => {
     // Use recordFieldChange with the parameters field
     recordFieldChange(step, 'parameters', params as any);
   }}
   ```
   Pass to edit-mode CanvasPane only.

### useEditMode.ts — skip parameters in pruning
The `pruneMatchingOriginal` function compares pending fields to originals. Parameters are complex objects — add a guard to never prune `parameters`:
```ts
case 'parameters': return null; // never prune, always keep as pending change
```
(Return `null` meaning "no original to compare against" so the field always stays in pending changes.)

## Acceptance criteria
- Refresh button fetches fresh schemas and updates the popover fields
- Changing a parameter field in the popover adds it to pendingChanges
- Saving writes updated parameters to seed file
- No TypeScript errors
