import { useState } from 'react';
import { Alert, Box, Button, FormLabel, TextInput } from '@ksyos/design-system';

interface ConfigPanelProps {
    clientSafePath: string;
    onSave: (path: string) => Promise<void>;
    error: string | null;
}

export function ConfigPanel({ clientSafePath, onSave, error }: ConfigPanelProps) {
    const [inputPath, setInputPath] = useState(clientSafePath);
    const [saving, setSaving] = useState(false);
    const [localError, setLocalError] = useState<string | null>(null);

    const handleSave = async () => {
        setSaving(true);
        setLocalError(null);
        try { await onSave(inputPath); }
        catch (err) { setLocalError(err instanceof Error ? err.message : 'Failed to save'); }
        finally { setSaving(false); }
    };

    return (
        <Box py={4} px={6} bg="white" sx={{ borderBottom: '1px solid', borderColor: 'gray200' }}>
            <FormLabel>ClientSafe Codebase Path</FormLabel>
            <Box display="flex" alignItems="center" gap={2} mt={1.5}>
                <TextInput
                    value={inputPath}
                    onChange={(e) => setInputPath(e.target.value)}
                    placeholder="/path/to/ClientSafeWeb"
                    onEnterKeyPress={handleSave}
                    style={{ flex: 1 }}
                />
                <Button
                    color="primary"
                    onClick={handleSave}
                    isDisabled={saving || inputPath === clientSafePath}
                    isLoading={saving}
                    loadingText="Saving..."
                >
                    Save
                </Button>
            </Box>
            {(localError ?? error) && (
                <Alert appearance="danger" hasIcon>{localError ?? error}</Alert>
            )}
        </Box>
    );
}
