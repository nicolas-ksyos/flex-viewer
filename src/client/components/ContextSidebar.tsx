import { useState } from "react";
import { Box, Button, Text } from "@ksyos/design-system";
import type {
	ParsedWorkflowStep,
	ParsedWorkflowTransition,
	ParsedWorkflowDefinition,
	EditableStepFields,
	PendingChangeItem,
	StepEditDraft,
	NewStepDraft,
	NewConnectionDraft,
	NewTransitionDraft,
	DeletedBlockDraft,
	RemovedConnectionDraft,
	SeedPatchRequest,
	SeedPatchResponse,
	BlockParameterSchemas,
} from "../../shared/types";
import { generateVariableName } from "../hooks/useEditMode";
import { PendingChangesPanel } from "./edit/PendingChangesPanel";
import { BlockDetailPanel } from "./BlockDetailPanel";
import { WorkflowOverviewPanel } from "./WorkflowOverviewPanel";
import { ConvertMigrationForm } from "./ConvertMigrationForm";

// ─────────────────────────────────────────────────────────────
// Props
// ─────────────────────────────────────────────────────────────

export interface ContextSidebarProps {
	isEditMode: boolean;

	// File context
	selectedSeed: string;

	// Workflow data
	workflow?: ParsedWorkflowDefinition;
	serviceName?: string;
	serviceCode?: string | null;
	blockParameterSchemas?: BlockParameterSchemas;

	// Block selection
	selectedStepId: string | null;

	// Edit mode — pending changes
	pendingChanges: PendingChangeItem[];
	onSaveSuccess: () => void;
	onDiscard: () => void;
	onRemoveStepChange: (stepId: string) => void;
	onRemoveNewItem?: (tempId: string) => void;
	onStepHover: (stepId: string | null) => void;
	allSteps?: ParsedWorkflowStep[];
	allTransitions?: ParsedWorkflowTransition[];

	// Block field editing (edit mode + block selected)
	onInfoFieldChange?: (
		step: ParsedWorkflowStep,
		field: keyof EditableStepFields,
		value: string | number | boolean | null,
	) => void;
	onParametersChange?: (
		step: ParsedWorkflowStep,
		params: Record<string, unknown> | null,
	) => void;
	onAddConnection?: (draft: Omit<NewConnectionDraft, "kind">) => void;
	onRemoveConnection?: (draft: Omit<RemovedConnectionDraft, "kind">) => void;
	onUndoRemoveConnection?: (tempId: string) => void;

	// Sidebar visibility
	isSidebarVisible: boolean;
	onToggleSidebar: () => void;

	// Header action callbacks
	onEdit: () => void;
	onClone: () => void;
	onConvertSuccess: (migrationFileName: string) => void;
}

// ─────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────

function fileBadge(fileName: string): {
	text: string;
	bg: string;
	color: string;
} {
	if (/^\d{4}-/.test(fileName)) {
		return { text: "migration", bg: "#f0fdf4", color: "#166534" };
	}
	return { text: "seed", bg: "#eff6ff", color: "#1e40af" };
}

function truncateFileName(name: string, max = 28): string {
	if (name.length <= max) return name;
	return "…" + name.slice(-(max - 1));
}

// ─────────────────────────────────────────────────────────────
// ContextSidebar
// ─────────────────────────────────────────────────────────────

export function ContextSidebar({
	isEditMode,
	selectedSeed,
	workflow,
	serviceName,
	serviceCode,
	blockParameterSchemas,
	selectedStepId,
	pendingChanges,
	onSaveSuccess,
	onDiscard,
	onRemoveStepChange,
	onRemoveNewItem,
	onStepHover,
	allSteps = [],
	allTransitions = [],
	onInfoFieldChange,
	onParametersChange,
	onAddConnection,
	onRemoveConnection,
	onUndoRemoveConnection,
	onEdit,
	onClone,
	onConvertSuccess,
}: ContextSidebarProps) {
	const [saving, setSaving] = useState(false);
	const [saveError, setSaveError] = useState<string | null>(null);
	const [showConvertForm, setShowConvertForm] = useState(false);

	const badge = fileBadge(selectedSeed);
	const hasChanges = pendingChanges.length > 0;

	// Resolve selected step
	const selectedStep = selectedStepId
		? allSteps.find((s) => s.id === selectedStepId)
		: null;

	// Pending fields for selected step
	const selectedStepPendingFields: EditableStepFields = selectedStep
		? (pendingChanges.find(
				(c): c is StepEditDraft =>
					c.kind === "edit" && c.stepId === selectedStep.id,
			)?.fields ?? {})
		: {};

	// Removed connection keys for selected step
	const pendingRemovedConnectionKeys = new Set(
		pendingChanges
			.filter(
				(c): c is RemovedConnectionDraft => c.kind === "remove-connection",
			)
			.map((c) => `${c.fromStepId}-${c.toStepId}`),
	);

	// Block parameter schema for selected step
	const blockSchema = selectedStep
		? blockParameterSchemas?.[selectedStep.serviceWorkflowBlock.name]
		: undefined;

	// Count of pending changes NOT for the selected step (for the dim summary)
	const otherPendingCount = selectedStep
		? pendingChanges.filter((c) => {
				if (c.kind === "edit") return c.stepId !== selectedStep.id;
				return true;
			}).length
		: 0;

	// ── Save logic (mirrored from EditSidebar) ─────────────────
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

	// ── Render ─────────────────────────────────────────────────
	return (
		<Box
			display="flex"
			flexDirection="column"
			style={{ height: "100%", width: "100%" }}
		>
			{/* ── HEADER ───────────────────────────────────────── */}
			<Box
				px={3}
				pt={3}
				pb={2}
				flexShrink={0}
				style={{ borderBottom: "1px solid var(--kds-color-gray-100)" }}
			>
				{/* Filename + badge row */}
				<div
					style={{
						display: "flex",
						alignItems: "center",
						gap: 6,
						marginBottom: isEditMode ? 6 : 8,
					}}
				>
					<span
						title={selectedSeed}
						style={{
							fontWeight: 600,
							flex: 1,
							overflow: "hidden",
							textOverflow: "ellipsis",
							whiteSpace: "nowrap",
							fontSize: 12,
						}}
					>
						{truncateFileName(selectedSeed)}
					</span>
					<span
						style={{
							background: badge.bg,
							color: badge.color,
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
				</div>

				{isEditMode ? (
					/* ── Edit mode header ──────────────────────── */
					<>
						{/* "● Editing" status */}
						<div
							style={{
								display: "flex",
								alignItems: "center",
								gap: 5,
								marginBottom: 8,
							}}
						>
							<span
								style={{
									width: 6,
									height: 6,
									borderRadius: "50%",
									background: "#f59e0b",
									flexShrink: 0,
								}}
							/>
							<Text size="xs" style={{ color: "#b45309", fontWeight: 500 }}>
								Editing
							</Text>
						</div>
						{saveError && (
							<Text
								size="xs"
								color="danger"
								style={{ marginBottom: 8, display: "block" }}
							>
								{saveError}
							</Text>
						)}
						<div style={{ display: "flex", gap: 2 }}>
							<Button
								variant="outline"
								color="neutral"
								size="small"
								onClick={onDiscard}
								isDisabled={saving}
								style={{ flex: 1 }}
							>
								Discard
							</Button>
							{hasChanges && (
								<Button
									variant="solid"
									color="primary"
									size="small"
									onClick={handleSave}
									isDisabled={saving}
									style={{ flex: 1 }}
								>
									{saving ? "Saving…" : `Save ${pendingChanges.length}`}
								</Button>
							)}
						</div>
					</>
				) : (
					/* ── View mode header ──────────────────────── */
					<>
						{/* Edit + Clone row */}
						<div style={{ display: "flex", gap: 6, marginBottom: 6 }}>
							<button
								onClick={onEdit}
								title="Edit workflow"
								style={{
									flex: 1,
									display: "flex",
									alignItems: "center",
									justifyContent: "center",
									gap: 5,
									padding: "5px 8px",
									fontSize: 12,
									fontWeight: 600,
									background: "#eff6ff",
									color: "#1d4ed8",
									border: "1px solid #bfdbfe",
									borderRadius: 6,
									cursor: "pointer",
								}}
							>
								{/* Pencil icon */}
								<svg width="11" height="11" viewBox="0 0 12 12" fill="none">
									<path
										d="M8.5 1.5l2 2L3 11H1V9L8.5 1.5z"
										stroke="currentColor"
										strokeWidth="1.2"
										strokeLinejoin="round"
										fill="none"
									/>
									<path d="M7 3l2 2" stroke="currentColor" strokeWidth="1.2" />
								</svg>
								Edit
							</button>
							<button
								onClick={onClone}
								title="Clone seed file"
								style={{
									flex: 1,
									display: "flex",
									alignItems: "center",
									justifyContent: "center",
									gap: 5,
									padding: "5px 8px",
									fontSize: 12,
									fontWeight: 600,
									background: "white",
									color: "#374151",
									border: "1px solid var(--kds-color-gray-200)",
									borderRadius: 6,
									cursor: "pointer",
								}}
							>
								{/* Clone icon */}
								<svg width="11" height="11" viewBox="0 0 12 12" fill="none">
									<rect
										x="3.5"
										y="0.5"
										width="7"
										height="8.5"
										rx="1"
										stroke="currentColor"
										strokeWidth="1.2"
										fill="none"
									/>
									<rect
										x="1"
										y="3"
										width="7"
										height="8.5"
										rx="1"
										stroke="currentColor"
										strokeWidth="1.2"
										fill="white"
									/>
								</svg>
								Clone
							</button>
						</div>

						{/* Convert button or form */}
						{showConvertForm ? (
							<ConvertMigrationForm
								seedFileName={selectedSeed}
								onSuccess={(fileName) => {
									setShowConvertForm(false);
									onConvertSuccess(fileName);
								}}
								onCancel={() => setShowConvertForm(false)}
							/>
						) : (
							<button
								onClick={() => setShowConvertForm(true)}
								title="Convert seed to migration file"
								style={{
									width: "100%",
									display: "flex",
									alignItems: "center",
									justifyContent: "center",
									gap: 6,
									padding: "5px 8px",
									fontSize: 11,
									fontWeight: 600,
									background: "#ede9fe",
									color: "#6d28d9",
									border: "1px solid #ddd6fe",
									borderRadius: 6,
									cursor: "pointer",
								}}
							>
								→ Convert to Migration
							</button>
						)}
					</>
				)}
			</Box>

			{/* ── CONTENT ──────────────────────────────────────── */}
			<Box flex={1} style={{ overflowY: "auto" }}>
				{selectedStep ? (
					/* ── Block selected ───────────────────────── */
					<>
						<Box
							px={3}
							pt={2}
							pb={1}
							flexShrink={0}
							style={{ borderBottom: "1px solid var(--kds-color-gray-100)" }}
						>
							<Text
								size="xs"
								color="subtle"
								style={{
									fontWeight: 600,
									textTransform: "uppercase",
									letterSpacing: "0.05em",
									display: "block",
								}}
							>
								{isEditMode ? "Edit block" : "Block details"}
							</Text>
						</Box>

						<BlockDetailPanel
							step={selectedStep}
							pendingFields={selectedStepPendingFields}
							editable={isEditMode}
							onFieldChange={
								isEditMode && onInfoFieldChange
									? (field, value) =>
											onInfoFieldChange(selectedStep, field, value)
									: undefined
							}
							allSteps={allSteps}
							allTransitions={allTransitions}
							blockParameterSchema={blockSchema}
							onParametersChange={
								isEditMode && onParametersChange
									? (params) => onParametersChange(selectedStep, params)
									: undefined
							}
							allActivities={workflow?.activities}
							onAddConnection={isEditMode ? onAddConnection : undefined}
							onRemoveConnection={isEditMode ? onRemoveConnection : undefined}
							onUndoRemoveConnection={
								isEditMode ? onUndoRemoveConnection : undefined
							}
							pendingRemovedConnectionKeys={pendingRemovedConnectionKeys}
						/>

						{/* Dim summary of other pending changes when in edit mode */}
						{isEditMode && otherPendingCount > 0 && (
							<Box
								px={3}
								pb={3}
								style={{ borderTop: "1px solid var(--kds-color-gray-50)" }}
							>
								<Text
									size="xs"
									color="subtle"
									style={{ marginTop: 8, display: "block" }}
								>
									{otherPendingCount} other pending change
									{otherPendingCount !== 1 ? "s" : ""}
								</Text>
							</Box>
						)}
					</>
				) : isEditMode ? (
					/* ── Edit mode, no selection ──────────────── */
					<Box px={3} pt={2} pb={3} style={{ borderTop: "none" }}>
						<Text
							size="xs"
							color="subtle"
							style={{
								fontWeight: 600,
								textTransform: "uppercase",
								letterSpacing: "0.05em",
								marginBottom: 8,
								display: "block",
							}}
						>
							Pending changes
						</Text>
						<PendingChangesPanel
							pendingChanges={pendingChanges}
							allSteps={allSteps}
							onRemoveStepChange={onRemoveStepChange}
							onRemoveNewItem={onRemoveNewItem}
							onStepHover={onStepHover}
						/>
					</Box>
				) : workflow ? (
					/* ── View mode, no selection ──────────────── */
					<WorkflowOverviewPanel
						workflow={workflow}
						serviceName={serviceName ?? ""}
						serviceCode={serviceCode ?? null}
					/>
				) : null}
			</Box>
		</Box>
	);
}
