# Task TC3 — Creation toolbar component

## Goal
Create `CreationToolbar.tsx` — a second toolbar positioned to the RIGHT of the existing `CanvasToolbar`, visible only in edit mode. Contains three buttons: Block, Connection, Transition (each opens a corresponding modal — stubs for now).

## Dependencies
TC1 for types.

## Files to read first
- `src/client/components/CanvasToolbar.tsx` — match styling exactly
- `src/client/components/CanvasPane.tsx`

## Files to create/modify
- **Create** `src/client/components/edit/CreationToolbar.tsx`
- **Modify** `src/client/components/CanvasPane.tsx` — render CreationToolbar when `mode === 'edit'`

---

## CreationToolbar.tsx

Same visual style as CanvasToolbar (white background, border, rounded, shadow). Positioned `position: absolute, top: 12, left: {toolbarWidth + 16}px` — to the right of CanvasToolbar.

Props:
```tsx
interface CreationToolbarProps {
  onAddBlock: () => void;
  onAddConnection: () => void;
  onAddTransition: () => void;
}
```

Three buttons with icons + labels:
- **Block**: `+⬜` icon + "Block" label — click calls `onAddBlock`
- **Connection**: `→` arrow icon + "Connection" label
- **Transition**: `⊘` or stop-sign-like icon + "Transition" label

Use the same `toolbarBtnStyle` pattern as `CanvasToolbar`. Each button is `display: flex, alignItems: center, gap: 4, padding: 4px 8px`.

SVG icons (inline, 12×12):
- Block: `<rect x="1" y="1" width="10" height="10" rx="1" stroke="currentColor" strokeWidth="1.5" fill="none"/>` with a small `+`
- Connection: arrow right `<path d="M1 6h10M7 2l4 4-4 4" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round"/>`
- Transition (disable): `<circle cx="6" cy="6" r="5" stroke="#EE1111" strokeWidth="1.5" fill="none"/><line x1="3" y1="3" x2="9" y2="9" stroke="#EE1111" strokeWidth="1.5"/>`

A divider separates Block from Connection/Transition buttons.

## CanvasPane changes

When `mode === 'edit'`:
- Add three state booleans: `showAddBlock`, `showAddConnection`, `showAddTransition`
- Add `CreationToolbar` props: `onAddBlock`, `onAddConnection`, `onAddTransition`
- Render `<CreationToolbar>` positioned right of the existing `CanvasToolbar`
- Pass `onAddBlock={() => setShowAddBlock(true)}` etc.

Pass `showAddBlock`, `showAddConnection`, `showAddTransition` and close handlers to CanvasPane's parent via new props, OR manage the modals inside CanvasPane directly (pass creation callbacks from App.tsx through CanvasPane as optional props).

**Simplest approach**: Add to `CanvasPaneProps`:
```ts
onAddBlock?: () => void;
onAddConnection?: () => void;
onAddTransition?: () => void;
```

And in CanvasPane, only render `CreationToolbar` when those callbacks are provided (i.e., in edit mode).

## Acceptance criteria
- CreationToolbar renders right of CanvasToolbar in edit mode
- Three buttons visible with icons and labels
- Clicking each calls the corresponding callback
- Visual style matches CanvasToolbar
- Hidden in view mode
