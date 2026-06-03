import { useState } from "react";
import { Alert, Box, Button, FormLabel, TextInput } from "@ksyos/design-system";
import { SeedSelector } from "./SeedSelector";
import type { SeedFileInfo } from "../../shared/types";

interface ConfigPanelProps {
	clientSafePath: string;
	onSave: (path: string) => Promise<void>;
	error: string | null;
	// Seed selector props (optional — only shown when clientSafePath is set)
	seeds?: SeedFileInfo[];
	selectedSeed?: string | null;
	seedsLoading?: boolean;
	onSeedSelect?: (fileName: string) => void;
}

export function ConfigPanel({
	clientSafePath,
	onSave,
	error,
	seeds,
	selectedSeed,
	seedsLoading,
	onSeedSelect,
}: ConfigPanelProps) {
	const [inputPath, setInputPath] = useState(clientSafePath);
	const [saving, setSaving] = useState(false);
	const [localError, setLocalError] = useState<string | null>(null);

	const handleSave = async () => {
		setSaving(true);
		setLocalError(null);
		try {
			await onSave(inputPath);
		} catch (err) {
			setLocalError(err instanceof Error ? err.message : "Failed to save");
		} finally {
			setSaving(false);
		}
	};

	return (
		<Box
			py={4}
			px={6}
			bg="white"
			sx={{ borderBottom: "1px solid", borderColor: "gray200" }}
		>
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
				<Alert appearance="danger" hasIcon>
					{localError ?? error}
				</Alert>
			)}
			{seeds && onSeedSelect && (
				<Box
					mt={4}
					style={{
						borderTop: "1px solid var(--kds-color-gray-100)",
						paddingTop: 16,
					}}
				>
					<SeedSelector
						seeds={seeds}
						selectedSeed={selectedSeed ?? null}
						loading={seedsLoading ?? false}
						onSelect={onSeedSelect}
					/>
				</Box>
			)}
		</Box>
	);
}
