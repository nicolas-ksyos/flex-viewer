import { useState } from "react";
import { Box, Button, Text } from "@ksyos/design-system";
import type {
	MigrationConvertRequest,
	MigrationConvertResponse,
} from "../../shared/types";

// ─────────────────────────────────────────────────────────────
// Derive migration name from a seed filename
// e.g. "124_1_orthoptics_service.ts" → "orthoptics-service"
// ─────────────────────────────────────────────────────────────

function deriveMigrationName(seedFileName: string): string {
	// Remove directory prefix if any, then strip extension
	const base = seedFileName.split("/").pop() ?? seedFileName;
	const noExt = base.replace(/\.ts$/, "");
	// Strip leading numeric prefix like "124_1_" or "088_"
	const noPrefix = noExt.replace(/^\d+_\d*_?/, "");
	// Replace underscores with hyphens, lowercase
	return noPrefix.replace(/_/g, "-").toLowerCase();
}

// ─────────────────────────────────────────────────────────────
// Props
// ─────────────────────────────────────────────────────────────

export interface ConvertMigrationFormProps {
	seedFileName: string;
	/** Called with the new migration filename on success */
	onSuccess: (migrationFileName: string) => void;
	/** Called when user cancels */
	onCancel: () => void;
}

// ─────────────────────────────────────────────────────────────
// ConvertMigrationForm
// ─────────────────────────────────────────────────────────────

export function ConvertMigrationForm({
	seedFileName,
	onSuccess,
	onCancel,
}: ConvertMigrationFormProps) {
	const [migrationNumber, setMigrationNumber] = useState("");
	const [migrationName, setMigrationName] = useState(() =>
		deriveMigrationName(seedFileName),
	);
	const [converting, setConverting] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [successFile, setSuccessFile] = useState<string | null>(null);

	const handleConvert = async () => {
		setConverting(true);
		setError(null);
		try {
			const body: MigrationConvertRequest = {
				seedFileName,
				...(migrationNumber.trim()
					? { migrationNumber: migrationNumber.trim() }
					: {}),
				...(migrationName.trim()
					? { migrationName: migrationName.trim() }
					: {}),
			};
			const res = await fetch("/api/migrations/convert", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify(body),
			});
			const data: MigrationConvertResponse = await res.json();
			if (!res.ok || !data.success) {
				throw new Error(data.error ?? `Server error ${res.status}`);
			}
			const fileName = data.migrationFileName ?? "migration file";
			setSuccessFile(fileName);
			setTimeout(() => onSuccess(fileName), 3000);
		} catch (err) {
			setError(err instanceof Error ? err.message : "Conversion failed");
		} finally {
			setConverting(false);
		}
	};

	// ── Success state ──────────────────────────────────────────
	if (successFile) {
		return (
			<Box
				p={3}
				style={{
					background: "#f0fdf4",
					border: "1px solid #bbf7d0",
					borderRadius: 6,
				}}
			>
				<Text size="sm" style={{ color: "#166534", fontWeight: 600 }}>
					✓ Created: {successFile}
				</Text>
				<Text size="xs" color="subtle" style={{ marginTop: 4 }}>
					Redirecting in 3 s…
				</Text>
			</Box>
		);
	}

	// ── Form ──────────────────────────────────────────────────
	return (
		<Box
			p={3}
			style={{
				background: "#f5f3ff",
				border: "1px solid #ddd6fe",
				borderRadius: 6,
			}}
		>
			<Text
				size="sm"
				style={{
					fontWeight: 600,
					color: "#4c1d95",
					marginBottom: 10,
					display: "block",
				}}
			>
				Convert to Migration
			</Text>

			{/* Migration # */}
			<div style={{ marginBottom: 8 }}>
				<label
					style={{
						display: "block",
						fontSize: 11,
						color: "#6b7280",
						marginBottom: 2,
						fontWeight: 500,
					}}
				>
					Migration #
				</label>
				<input
					type="text"
					value={migrationNumber}
					placeholder="auto-detected"
					onChange={(e) => setMigrationNumber(e.target.value)}
					style={{
						width: "100%",
						padding: "4px 6px",
						fontSize: 12,
						border: "1px solid #c4b5fd",
						borderRadius: 4,
						boxSizing: "border-box",
						background: "white",
						outline: "none",
						fontFamily: "inherit",
					}}
				/>
			</div>

			{/* File name */}
			<div style={{ marginBottom: 10 }}>
				<label
					style={{
						display: "block",
						fontSize: 11,
						color: "#6b7280",
						marginBottom: 2,
						fontWeight: 500,
					}}
				>
					File name
				</label>
				<input
					type="text"
					value={migrationName}
					onChange={(e) => setMigrationName(e.target.value)}
					style={{
						width: "100%",
						padding: "4px 6px",
						fontSize: 12,
						border: "1px solid #c4b5fd",
						borderRadius: 4,
						boxSizing: "border-box",
						background: "white",
						outline: "none",
						fontFamily: "inherit",
					}}
				/>
			</div>

			{/* Warning */}
			<div
				style={{
					background: "#fffbeb",
					border: "1px solid #fde68a",
					borderRadius: 4,
					padding: "6px 8px",
					marginBottom: 10,
					fontSize: 11,
					color: "#92400e",
					display: "flex",
					gap: 6,
					alignItems: "flex-start",
				}}
			>
				<span style={{ flexShrink: 0 }}>⚠</span>
				<span>
					Review transitions and <code>deleteSeedData</code> after conversion
				</span>
			</div>

			{/* Error */}
			{error && (
				<Text
					size="xs"
					color="danger"
					style={{ display: "block", marginBottom: 8 }}
				>
					{error}
				</Text>
			)}

			{/* Actions */}
			<div style={{ display: "flex", gap: 8 }}>
				<Button
					variant="outline"
					color="neutral"
					size="small"
					onClick={onCancel}
					isDisabled={converting}
					style={{ flex: 1 }}
				>
					Cancel
				</Button>
				<button
					onClick={handleConvert}
					disabled={converting}
					style={{
						flex: 1,
						padding: "6px 12px",
						fontSize: 12,
						fontWeight: 600,
						background: converting ? "#a78bfa" : "#7c3aed",
						color: "white",
						border: "none",
						borderRadius: 6,
						cursor: converting ? "wait" : "pointer",
					}}
				>
					{converting ? "Converting…" : "Convert →"}
				</button>
			</div>
		</Box>
	);
}
