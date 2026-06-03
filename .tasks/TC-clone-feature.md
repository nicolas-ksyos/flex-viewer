# Task TC — Clone feature

## Goal
Add a `POST /api/seeds/clone` server endpoint and a `CloneModal` React component. The server copies a seed file to a new name in the same directory. The modal is triggered from App.tsx (wired in TE).

## Files to read first
- `src/server/routes/seedRoutes.ts`
- `src/client/hooks/useSeeds.ts`
- `src/shared/types.ts`

## Files to create / modify
- **Modify** `src/server/routes/seedRoutes.ts` — add POST /seeds/clone
- **Create** `src/client/components/CloneModal.tsx`
- **Modify** `src/client/hooks/useSeeds.ts` — expose fetchSeeds for refresh

---

## Server: POST /api/seeds/clone

```ts
router.post('/seeds/clone', (req, res) => {
  const config = readConfig();
  if (!config.clientSafePath) {
    res.status(400).json({ error: 'ClientSafe path not configured' });
    return;
  }

  const { sourceFileName, newFileName } = req.body as { sourceFileName: string; newFileName: string };

  if (!sourceFileName || !newFileName) {
    res.status(400).json({ error: 'sourceFileName and newFileName are required' });
    return;
  }
  if (newFileName === sourceFileName) {
    res.status(400).json({ error: 'New filename must differ from source' });
    return;
  }

  const seedsDir = path.join(config.clientSafePath, 'src', 'backend', 'seeds');
  const sourcePath = path.join(seedsDir, sourceFileName);
  const destPath = path.join(seedsDir, newFileName);

  // Security: ensure both paths resolve within seedsDir
  if (!sourcePath.startsWith(seedsDir) || !destPath.startsWith(seedsDir)) {
    res.status(400).json({ error: 'Invalid file path' });
    return;
  }

  try {
    if (!fs.existsSync(sourcePath)) {
      res.status(404).json({ error: `Source file not found: ${sourceFileName}` });
      return;
    }
    if (fs.existsSync(destPath)) {
      res.status(409).json({ error: `File already exists: ${newFileName}` });
      return;
    }
    fs.copyFileSync(sourcePath, destPath);
    res.json({ success: true, fileName: newFileName });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});
```

Add `import fs from 'node:fs';` at the top if not already present.

---

## CloneModal.tsx

```tsx
interface CloneModalProps {
  sourceFileName: string;
  onClone: (newFileName: string) => Promise<void>;
  onCancel: () => void;
}

export function CloneModal({ sourceFileName, onClone, onCancel }: CloneModalProps) {
  const [newName, setNewName] = useState(sourceFileName);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isValid = newName.trim() !== '' && newName.trim() !== sourceFileName;

  const handleClone = async () => {
    setLoading(true);
    setError(null);
    try {
      await onClone(newName.trim());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Clone failed');
    } finally {
      setLoading(false);
    }
  };

  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onCancel(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onCancel]);

  return (
    <>
      {/* Backdrop */}
      <div onClick={onCancel} style={{
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 1000,
      }} />
      {/* Dialog */}
      <div style={{
        position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%, -50%)',
        zIndex: 1001, background: 'white', borderRadius: 12,
        boxShadow: '0 20px 48px rgba(0,0,0,0.2)',
        padding: 24, minWidth: 400, maxWidth: 520,
      }}>
        <h2 style={{ margin: '0 0 16px', fontSize: 16, fontWeight: 600 }}>
          Enter name for the seed file
        </h2>
        <input
          type="text"
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && isValid) handleClone(); }}
          autoFocus
          style={{
            width: '100%', padding: '8px 12px', fontSize: 14,
            border: '1px solid #d1d5db', borderRadius: 6,
            boxSizing: 'border-box', marginBottom: 8,
            outline: 'none',
          }}
        />
        {error && (
          <p style={{ color: '#ef4444', fontSize: 13, margin: '0 0 8px' }}>{error}</p>
        )}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 16 }}>
          <button onClick={onCancel} style={secondaryBtnStyle} disabled={loading}>
            Cancel
          </button>
          <button onClick={handleClone} disabled={!isValid || loading}
                  style={{ ...primaryBtnStyle, opacity: (!isValid || loading) ? 0.5 : 1 }}>
            {loading ? 'Cloning…' : 'Clone'}
          </button>
        </div>
      </div>
    </>
  );
}

const primaryBtnStyle: React.CSSProperties = {
  padding: '8px 16px', borderRadius: 6, border: 'none', cursor: 'pointer',
  background: '#3b82f6', color: 'white', fontSize: 14, fontWeight: 500,
};
const secondaryBtnStyle: React.CSSProperties = {
  padding: '8px 16px', borderRadius: 6,
  border: '1px solid #d1d5db', cursor: 'pointer',
  background: 'white', color: '#374151', fontSize: 14,
};
```

---

## useSeeds.ts changes

Read the current `useSeeds.ts` and check if `fetchSeeds` is already exposed in the return value. If it is already (as `_fetchSeeds` in App.tsx), just make sure it's accessible. If it isn't exposed, add it to the returned object. App.tsx (TE) will call `fetchSeeds()` after a successful clone to refresh the list.

## Acceptance criteria
- `POST /api/seeds/clone` copies the file successfully, returns 409 if dest exists.
- `CloneModal` renders with pre-filled input; Clone button disabled when name is unchanged or empty.
- Escape key closes the modal.
- `fetchSeeds` is accessible from `useSeeds` hook return value.
- TypeScript compiles without errors.
