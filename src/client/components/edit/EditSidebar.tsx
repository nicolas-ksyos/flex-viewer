import { useState } from "react";
import { Box, Button, Heading, Text } from "@ksyos/design-system";
import type {
	StepPendingChange,
	SeedPatchRequest,
	SeedPatchResponse,
} from "../../../shared/types";

// ─────────────────────────────────────────────────────────────
// Toggle button icon (panel collapse / expand)
// ─────────────────────────────────────────────────────────────

function SidebarToggleButton({
	isVisible,
	onToggle,
}: {
	isVisible: boolean;
	onToggle: () => void;
}) {
	return (
		<button
			onClick={onToggle}
			title={isVisible ? "Hide sidebar" : "Show sidebar"}
			aria-label={isVisible ? "Hide changes sidebar" : "Show changes sidebar"}
			style={{
				display: "flex",
				alignItems: "center",
				justifyContent: "center",
				flexShrink: 0,
				width: 24,
				height: 24,
				padding: 0,
				background: "none",
				border: "1px solid var(--kds-color-gray-200)",
				borderRadius: 4,
				cursor: "pointer",
				color: "var(--kds-color-gray-600)",
			}}
		>
			{/* Chevron pointing right (close) or left (open) */}
			<svg
				width="12"
				height="12"
				viewBox="0 0 12 12"
				fill="none"
				xmlns="http://www.w3.org/2000/svg"
			>
				{isVisible ? (
					// ›  — collapse to right
					<polyline
						points="4,2 8,6 4,10"
						stroke="currentColor"
						strokeWidth="1.5"
						strokeLinecap="round"
						strokeLinejoin="round"
					/>
				) : (
					// ‹  — expand to left
					<polyline
						points="8,2 4,6 8,10"
						stroke="currentColor"
						strokeWidth="1.5"
						strokeLinecap="round"
						strokeLinejoin="round"
					/>
				)}
			</svg>
		</button>
	);
}

// ─────────────────────────────────────────────────────────────
// Per-block change entry
// ─────────────────────────────────────────────────────────────

function ChangeEntry({
	change,
	onRemove,
	onMouseEnter,
	onMouseLeave,
}: {
	change: StepPendingChange;
	onRemove: () => void;
	onMouseEnter: () => void;
	onMouseLeave: () => void;
}) {
	const fields = Object.entries(change.fields).filter(
		([, v]) => v !== undefined,
	);

	return (
		<Box
			mb={2}
			p={2}
			style={{
				background: "var(--kds-color-gray-50)",
				borderRadius: 6,
				position: "relative",
			}}
			onMouseEnter={onMouseEnter}
			onMouseLeave={onMouseLeave}
		>
			{/* × remove button — top right */}
			<button
				onClick={onRemove}
				title="Remove changes for this block"
				aria-label="Remove changes for this block"
				style={{
					position: "absolute",
					top: 4,
					right: 4,
					width: 18,
					height: 18,
					display: "flex",
					alignItems: "center",
					justifyContent: "center",
					padding: 0,
					background: "none",
					border: "none",
					cursor: "pointer",
					fontSize: 14,
					lineHeight: 1,
					color: "var(--kds-color-gray-400)",
					borderRadius: 3,
				}}
				onMouseEnter={(e) => {
					(e.currentTarget as HTMLButtonElement).style.color =
						"var(--kds-color-gray-700)";
				}}
				onMouseLeave={(e) => {
					(e.currentTarget as HTMLButtonElement).style.color =
						"var(--kds-color-gray-400)";
				}}
			>
				×
			</button>

			{/* Step name — leave room for the × button */}
			<Text size="sm" style={{ fontWeight: 600, paddingRight: 20 }}>
				{change.stepName}
			</Text>

			{/* Changed fields */}
			{fields.map(([field, value]) => (
				<Text key={field} size="xs" color="subtle">
					{field}:{" "}
					<span
						style={{
							color: "var(--kds-color-gray-900)",
							fontFamily: "monospace",
						}}
					>
						{JSON.stringify(value)}
					</span>
				</Text>
			))}
		</Box>
	);
}

// ─────────────────────────────────────────────────────────────
// Main sidebar component
// ─────────────────────────────────────────────────────────────

interface EditSidebarProps {
	pendingChanges: StepPendingChange[];
	selectedSeed: string;
	onSaveSuccess: () => void;
	/** Called when the user clicks Cancel — exits edit mode without saving. */
	onDiscard: () => void;
	/** Called when the × button on a change entry is clicked. */
	onRemoveStepChange: (stepId: string) => void;
	/** Called with a stepId when the user hovers over a change entry, null on leave. */
	onStepHover: (stepId: string | null) => void;
	// ── Sidebar toggle (wired by TE/App.tsx) ──────────────────
	/** Whether the sidebar is currently expanded. Controls the toggle icon direction. */
	isSidebarVisible?: boolean;
	/** Called when the toggle button is clicked. */
	onToggleSidebar?: () => void;
}

export function EditSidebar({
	pendingChanges,
	selectedSeed,
	onSaveSuccess,
	onDiscard,
	onRemoveStepChange,
	onStepHover,
	isSidebarVisible = true,
	onToggleSidebar,
}: EditSidebarProps) {
	const [saving, setSaving] = useState(false);
	const [saveError, setSaveError] = useState<string | null>(null);

	const handleSave = async () => {
		setSaving(true);
		setSaveError(null);
		try {
			const body: SeedPatchRequest = { changes: pendingChanges };
			const res = await fetch(
				`/api/seeds/${encodeURIComponent(selectedSeed)}`,
				{
					method: "PATCH",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify(body),
				},
			);
			const data: SeedPatchResponse = await res.json();
			if (!res.ok || !data.success) {
				throw new Error(data.error ?? `Server error ${res.status}`);
			}
			onSaveSuccess();
		} catch (err) {
			setSaveError(err instanceof Error ? err.message : "Save failed");
		} finally {
			setSaving(false);
		}
	};

	const hasChanges = pendingChanges.length > 0;

	return (
		<Box
			display="flex"
			flexDirection="column"
			style={{ height: "100%", width: "100%" }}
		>
			{/* ── Header ───────────────────────────────────────────── */}
			<Box
				px={3}
				py={3}
				flexShrink={0}
				display="flex"
				alignItems="center"
				gap={2}
				style={{ borderBottom: "1px solid var(--kds-color-gray-100)" }}
			>
				{/* Toggle button — left of title */}
				{onToggleSidebar && (
					<SidebarToggleButton
						isVisible={isSidebarVisible}
						onToggle={onToggleSidebar}
					/>
				)}

				<Heading size="xsmall" as="h2" style={{ flex: 1, margin: 0 }}>
					Pending changes
				</Heading>
			</Box>

			{/* ── Scrollable changes list ───────────────────────────── */}
			<Box flex={1} px={3} py={2} style={{ overflowY: "auto" }}>
				{!hasChanges ? (
					<Text color="subtle" size="sm">
						No changes yet. Drag blocks or edit settings.
					</Text>
				) : (
					pendingChanges.map((change) => (
						<ChangeEntry
							key={change.stepId}
							change={change}
							onRemove={() => onRemoveStepChange(change.stepId)}
							onMouseEnter={() => onStepHover(change.stepId)}
							onMouseLeave={() => onStepHover(null)}
						/>
					))
				)}
			</Box>

			{/* ── Sticky footer: Cancel + Save (side by side) ──────── */}
			<Box
				px={3}
				py={3}
				flexShrink={0}
				style={{ borderTop: "1px solid var(--kds-color-gray-200)" }}
			>
				{saveError && (
					<Text
						size="xs"
						color="danger"
						style={{ marginBottom: 8, display: "block" }}
					>
						{saveError}
					</Text>
				)}

				<Box display="flex" gap={2}>
					{/* Cancel — always visible */}
					<Button
						variant="outline"
						color="neutral"
						size="small"
						onClick={onDiscard}
						isDisabled={saving}
						style={{ flex: 1 }}
					>
						Cancel
					</Button>

					{/* Save — only shown when there are pending changes */}
					{hasChanges && (
						<Button
							variant="solid"
							color="primary"
							size="small"
							onClick={handleSave}
							isDisabled={saving}
							style={{ flex: 1 }}
						>
							{saving
								? "Saving…"
								: `Save ${pendingChanges.length} change${pendingChanges.length !== 1 ? "s" : ""}`}
						</Button>
					)}
				</Box>
			</Box>
		</Box>
	);
}
