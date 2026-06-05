import { Box, Text } from "@ksyos/design-system";
import type {
	StepEditDraft,
	NewStepDraft,
	NewConnectionDraft,
	NewTransitionDraft,
	DeletedBlockDraft,
	RemovedConnectionDraft,
	PendingChangeItem,
	ParsedWorkflowStep,
} from "../../../shared/types";

// ─────────────────────────────────────────────────────────────
// New-item entry (additions / deletions / removals)
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
// Per-block edit entry
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
			<Text size="sm" style={{ fontWeight: 600, paddingRight: 20 }}>
				{change.stepName}
			</Text>
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
// PendingChangesPanel
// ─────────────────────────────────────────────────────────────

export interface PendingChangesPanelProps {
	pendingChanges: PendingChangeItem[];
	allSteps?: ParsedWorkflowStep[];
	onRemoveStepChange: (stepId: string) => void;
	onRemoveNewItem?: (tempId: string) => void;
	onStepHover: (stepId: string | null) => void;
}

export function PendingChangesPanel({
	pendingChanges,
	allSteps = [],
	onRemoveStepChange,
	onRemoveNewItem,
	onStepHover,
}: PendingChangesPanelProps) {
	const stepName = (id: string) =>
		allSteps.find((s) => s.id === id)?.name ?? id;

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
	const deletedStepItems = pendingChanges.filter(
		(c): c is DeletedBlockDraft => c.kind === "delete-step",
	);
	const removedConnItems = pendingChanges.filter(
		(c): c is RemovedConnectionDraft => c.kind === "remove-connection",
	);

	const hasAdditions =
		newStepItems.length + newConnItems.length + newTransItems.length > 0;
	const hasEdits = editChanges.length > 0;
	const hasDeletions = deletedStepItems.length + removedConnItems.length > 0;
	const hasChanges = pendingChanges.length > 0;

	if (!hasChanges) {
		return (
			<Text color="subtle" size="sm">
				No changes yet. Drag blocks or click a block to edit settings.
			</Text>
		);
	}

	return (
		<>
			{/* ── Additions ──────────────────────────────────────── */}
			{hasAdditions && (
				<div style={{ marginBottom: hasDeletions || hasEdits ? 12 : 0 }}>
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

			{/* ── Deletions ─────────────────────────────────────── */}
			{hasDeletions && (
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
						Deletions
					</Text>
					{deletedStepItems.map((draft) => (
						<NewItemEntry
							key={draft.stepId}
							badge={{ text: "DELETE", color: "#dc2626" }}
							label={draft.stepName}
							detail={
								draft.impactedStepNames.length > 0
									? `Impacts: ${draft.impactedStepNames.join(", ")}`
									: "No dependencies impacted"
							}
							onRemove={() => onRemoveNewItem?.(draft.stepId)}
						/>
					))}
					{removedConnItems.map((draft) => (
						<NewItemEntry
							key={draft.tempId}
							badge={{ text: "REMOVE", color: "#f59e0b" }}
							label={`${draft.fromStepName} → ${draft.toStepName}`}
							detail={
								draft.isDisable
									? "disable"
									: draft.synchronous
										? "sync"
										: "async"
							}
							onRemove={() => onRemoveNewItem?.(draft.tempId)}
						/>
					))}
				</div>
			)}

			{/* ── Edits ──────────────────────────────────────────── */}
			{hasEdits && (
				<div>
					{(hasAdditions || hasDeletions) && (
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
	);
}
