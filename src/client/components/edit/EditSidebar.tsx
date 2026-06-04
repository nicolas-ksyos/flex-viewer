import { useState } from "react";
import { Box, Button, Heading, Text } from "@ksyos/design-system";
import type {
	StepEditDraft,
	NewStepDraft,
	NewConnectionDraft,
	NewTransitionDraft,
	DeletedBlockDraft,
	RemovedConnectionDraft,
	PendingChangeItem,
	SeedPatchRequest,
	SeedPatchResponse,
	ParsedWorkflowStep,
} from "../../../shared/types";
import { generateVariableName } from "../../hooks/useEditMode";

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
// New-item entry (additions not yet in the seed file)
// ─────────────────────────────────────────────────────────────

function NewItemEntry({
	badge,
	label,
	detail,
	onRemove,
}: {
	badge: { text: string; color: string };
	label: string;
	detail: string;
	onRemove: () => void;
}) {
	return (
		<Box
			mb={2}
			p={2}
			style={{
				background: "var(--kds-color-gray-50)",
				borderRadius: 6,
				position: "relative",
			}}
		>
			{/* × remove button */}
			<button
				onClick={onRemove}
				title="Remove"
				aria-label="Remove"
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
			>
				×
			</button>

			{/* Badge + label */}
			<div
				style={{
					display: "flex",
					alignItems: "center",
					gap: 6,
					paddingRight: 20,
					marginBottom: 2,
				}}
			>
				<span
					style={{
						background: badge.color,
						color: "white",
						fontSize: 9,
						fontWeight: 700,
						padding: "1px 5px",
						borderRadius: 3,
						letterSpacing: "0.05em",
						flexShrink: 0,
					}}
				>
					{badge.text}
				</span>
				<Text size="sm" style={{ fontWeight: 600 }}>
					{label}
				</Text>
			</div>
			<Text size="xs" color="subtle">
				{detail}
			</Text>
		</Box>
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
	change: StepEditDraft;
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
	pendingChanges: PendingChangeItem[];
	selectedSeed: string;
	onSaveSuccess: () => void;
	/** Called when the user clicks Cancel — exits edit mode without saving. */
	onDiscard: () => void;
	/** Called when the × button on an edit-change entry is clicked. */
	onRemoveStepChange: (stepId: string) => void;
	/** Called when the × button on a new-item entry is clicked. */
	onRemoveNewItem?: (tempId: string) => void;
	/** Called with a stepId when the user hovers over a change entry, null on leave. */
	onStepHover: (stepId: string | null) => void;
	/** All steps in the current workflow (for resolving step names in connection/transition labels). */
	allSteps?: ParsedWorkflowStep[];
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
	onRemoveNewItem,
	onStepHover,
	allSteps = [],
	isSidebarVisible = true,
	onToggleSidebar,
}: EditSidebarProps) {
	const [saving, setSaving] = useState(false);
	const [saveError, setSaveError] = useState<string | null>(null);

	// Helper: look up a step's name from its ID
	const stepName = (id: string) =>
		allSteps.find((s) => s.id === id)?.name ?? id;

	const handleSave = async () => {
		setSaving(true);
		setSaveError(null);
		try {
			const editItems = pendingChanges.filter(
				(c): c is StepEditDraft => c.kind === "edit",
			);
			const newSteps = pendingChanges.filter(
				(c): c is NewStepDraft => c.kind === "new-step",
			);
			const newConnections = pendingChanges.filter(
				(c): c is NewConnectionDraft => c.kind === "new-connection",
			);
			const newTransitions = pendingChanges.filter(
				(c): c is NewTransitionDraft => c.kind === "new-transition",
			);
			const deletedSteps = pendingChanges.filter(
				(c): c is DeletedBlockDraft => c.kind === "delete-step",
			);
			const removedConnections = pendingChanges.filter(
				(c): c is RemovedConnectionDraft => c.kind === "remove-connection",
			);
			const body: SeedPatchRequest = {
				changes: editItems.map((c) => ({
					stepId: c.stepId,
					stepName: c.stepName,
					fields: c.fields,
				})),
				...(newSteps.length > 0 ? { newSteps } : {}),
				...(newConnections.length > 0 ? { newConnections } : {}),
				...(newTransitions.length > 0 ? { newTransitions } : {}),
				...(deletedSteps.length > 0 ? { deletedSteps } : {}),
				...(removedConnections.length > 0 ? { removedConnections } : {}),
				// Send ALL steps: use parsed variableName when available, otherwise
				// derive one from the step name. This ensures every step ID in
				// nextStepIds / synchronousNextStepIds can be resolved server-side.
				stepVarNames: allSteps.map((s) => ({
					id: s.id,
					variableName: s.variableName ?? generateVariableName(s.name),
				})),
			};
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

	const editChanges = pendingChanges.filter(
		(c): c is StepEditDraft => c.kind === "edit",
	);
	const newStepItems = pendingChanges.filter(
		(c): c is NewStepDraft => c.kind === "new-step",
	);
	const newConnItems = pendingChanges.filter(
		(c): c is NewConnectionDraft => c.kind === "new-connection",
	);
	const newTransItems = pendingChanges.filter(
		(c): c is NewTransitionDraft => c.kind === "new-transition",
	);
	const hasAdditions =
		newStepItems.length + newConnItems.length + newTransItems.length > 0;
	const hasEdits = editChanges.length > 0;
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
					<>
						{/* ── Additions section ─────────────────────────── */}
						{hasAdditions && (
							<div style={{ marginBottom: hasEdits ? 12 : 0 }}>
								<Text
									size="xs"
									color="subtle"
									style={{
										fontWeight: 600,
										textTransform: "uppercase",
										letterSpacing: "0.05em",
										marginBottom: 6,
										display: "block",
									}}
								>
									Additions
								</Text>

								{newStepItems.map((draft) => (
									<NewItemEntry
										key={draft.tempId}
										badge={{ text: "NEW", color: "#22c55e" }}
										label={draft.fields.name}
										detail={`${draft.fields.block} at (${draft.fields.x}, ${draft.fields.y})`}
										onRemove={() => onRemoveNewItem?.(draft.tempId)}
									/>
								))}

								{newConnItems.map((draft) => {
									const fromName = stepName(draft.fromStepId);
									const toNames = draft.toStepIds.map(stepName).join(", ");
									return (
										<NewItemEntry
											key={draft.tempId}
											badge={{
												text: draft.synchronous ? "SYNC" : "CONN",
												color: "#3b82f6",
											}}
											label="Connection"
											detail={`${fromName} → ${toNames} [${draft.synchronous ? "sync" : "async"}]`}
											onRemove={() => onRemoveNewItem?.(draft.tempId)}
										/>
									);
								})}

								{newTransItems.map((draft) => {
									const fromName = stepName(draft.fromStepId);
									const toNames = draft.toStepIds.map(stepName).join(", ");
									return (
										<NewItemEntry
											key={draft.tempId}
											badge={{ text: "DISABLE", color: "#EE1111" }}
											label="Disable transition"
											detail={`${fromName} disables ${toNames}`}
											onRemove={() => onRemoveNewItem?.(draft.tempId)}
										/>
									);
								})}
							</div>
						)}

						{/* ── Edits section ─────────────────────────────── */}
						{hasEdits && (
							<div>
								{hasAdditions && (
									<Text
										size="xs"
										color="subtle"
										style={{
											fontWeight: 600,
											textTransform: "uppercase",
											letterSpacing: "0.05em",
											marginBottom: 6,
											display: "block",
										}}
									>
										Edits
									</Text>
								)}
								{editChanges.map((change) => (
									<ChangeEntry
										key={change.stepId}
										change={change}
										onRemove={() => onRemoveStepChange(change.stepId)}
										onMouseEnter={() => onStepHover(change.stepId)}
										onMouseLeave={() => onStepHover(null)}
									/>
								))}
							</div>
						)}
					</>
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
