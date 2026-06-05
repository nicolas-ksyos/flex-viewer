import { useRef } from "react";
import type React from "react";
import type {
	ParsedWorkflowStep,
	ParsedWorkflowTransition,
	ParsedWorkflowActivity,
	EditableStepFields,
	NewConnectionDraft,
	RemovedConnectionDraft,
	BlockParameterSchema,
} from "../../shared/types";
import { BLOCK_NAMES } from "../../shared/blockTypes";
import { ParameterEditor } from "./edit/ParameterEditor";

// ─────────────────────────────────────────────────────────────
// Shared field styles
// ─────────────────────────────────────────────────────────────

const smallLabelStyle: React.CSSProperties = {
	display: "block",
	fontSize: 11,
	color: "#6b7280",
	marginBottom: 2,
	fontWeight: 500,
};

const inputStyle: React.CSSProperties = {
	width: "100%",
	padding: "4px 6px",
	fontSize: 12,
	border: "1px solid #d1d5db",
	borderRadius: 4,
	boxSizing: "border-box",
	outline: "none",
	fontFamily: "inherit",
};

const readOnlyValueStyle: React.CSSProperties = {
	display: "block",
	fontSize: 12,
	color: "#374151",
	fontFamily: "monospace",
	padding: "2px 0",
};

// ─────────────────────────────────────────────────────────────
// Changed-field highlight wrapper
// ─────────────────────────────────────────────────────────────

function ChangedFieldWrapper({
	isChanged,
	children,
}: {
	isChanged: boolean;
	children: React.ReactNode;
}) {
	if (!isChanged) return <>{children}</>;
	return (
		<div
			style={{
				background: "#fffbeb",
				borderLeft: "3px solid #f59e0b",
				paddingLeft: 8,
				marginLeft: -8,
				borderRadius: "0 4px 4px 0",
			}}
		>
			{children}
		</div>
	);
}

// ─────────────────────────────────────────────────────────────
// Field sub-components
// ─────────────────────────────────────────────────────────────

function FieldRow({
	label,
	value,
	onChange,
	editable = true,
	placeholder,
}: {
	label: string;
	value: string;
	onChange?: (v: string) => void;
	editable?: boolean;
	placeholder?: string;
}) {
	return (
		<div style={{ marginBottom: 8 }}>
			<label style={smallLabelStyle}>{label}</label>
			{editable ? (
				<input
					type="text"
					value={value}
					placeholder={placeholder ?? ""}
					onChange={(e) => onChange?.(e.target.value)}
					style={inputStyle}
				/>
			) : (
				<span style={readOnlyValueStyle}>
					{value || <em style={{ color: "#9ca3af" }}>—</em>}
				</span>
			)}
		</div>
	);
}

function NumberField({
	label,
	value,
	onChange,
	editable = true,
}: {
	label: string;
	value: number;
	onChange?: (v: number) => void;
	editable?: boolean;
}) {
	return (
		<div style={{ marginBottom: 8 }}>
			<label style={smallLabelStyle}>{label}</label>
			{editable ? (
				<input
					type="number"
					value={value}
					min={0}
					onChange={(e) => {
						const n = parseInt(e.target.value, 10);
						if (!isNaN(n)) onChange?.(n);
					}}
					style={inputStyle}
				/>
			) : (
				<span style={readOnlyValueStyle}>{value}</span>
			)}
		</div>
	);
}

function CheckboxField({
	label,
	checked,
	onChange,
	editable = true,
	note,
}: {
	label: string;
	checked: boolean;
	onChange?: (v: boolean) => void;
	editable?: boolean;
	note?: string;
}) {
	return (
		<div
			style={{
				display: "flex",
				alignItems: "center",
				gap: 8,
				marginBottom: 8,
				opacity: editable ? 1 : 0.6,
			}}
		>
			<input
				type="checkbox"
				checked={checked}
				disabled={!editable}
				onChange={(e) => onChange?.(e.target.checked)}
				style={{
					cursor: editable ? "pointer" : "default",
					width: 14,
					height: 14,
					flexShrink: 0,
				}}
			/>
			<label
				style={{
					fontSize: 12,
					color: "#374151",
					cursor: editable ? "pointer" : "default",
				}}
			>
				{label}
				{note && (
					<span style={{ color: "#9ca3af", marginLeft: 4 }}>{note}</span>
				)}
			</label>
		</div>
	);
}

function BlockReadOnlyField({
	label,
	value,
}: {
	label: string;
	value: string;
}) {
	return (
		<div style={{ marginBottom: 8 }}>
			<label style={smallLabelStyle}>{label}</label>
			<span style={readOnlyValueStyle}>
				{value || <em style={{ color: "#9ca3af" }}>—</em>}
			</span>
		</div>
	);
}

function BlockEnumField({
	label,
	value,
	onChange,
}: {
	label: string;
	value: string;
	onChange: (v: string) => void;
}) {
	const options = BLOCK_NAMES.includes(value)
		? BLOCK_NAMES
		: [value, ...BLOCK_NAMES];
	return (
		<div style={{ marginBottom: 8 }}>
			<label style={smallLabelStyle}>{label}</label>
			<select
				value={value}
				onChange={(e) => onChange(e.target.value)}
				style={{ ...inputStyle, background: "white", cursor: "pointer" }}
			>
				{options.map((name) => (
					<option key={name} value={name}>
						{name}
					</option>
				))}
			</select>
		</div>
	);
}

function StepCheckList({
	steps,
	currentStepId,
	connectedStepIds,
	onChange,
}: {
	steps: ParsedWorkflowStep[];
	currentStepId: string;
	connectedStepIds: Set<string>;
	onChange: (stepId: string, checked: boolean) => void;
}) {
	const candidates = steps.filter((s) => s.id !== currentStepId);
	if (candidates.length === 0) {
		return (
			<span style={{ fontSize: 11, color: "#9ca3af" }}>No other steps</span>
		);
	}
	return (
		<div
			style={{
				maxHeight: 110,
				overflowY: "auto",
				border: "1px solid #e5e7eb",
				borderRadius: 4,
				padding: "4px 6px",
			}}
		>
			{candidates.map((s) => {
				const already = connectedStepIds.has(s.id);
				return (
					<label
						key={s.id}
						style={{
							display: "flex",
							alignItems: "center",
							gap: 6,
							fontSize: 11,
							cursor: already ? "default" : "pointer",
							padding: "2px 0",
							color: already ? "#9ca3af" : "#374151",
						}}
					>
						<input
							type="checkbox"
							checked={already}
							disabled={already}
							onChange={(e) => onChange(s.id, e.target.checked)}
							style={{ flexShrink: 0 }}
						/>
						{s.name}
					</label>
				);
			})}
		</div>
	);
}

// ─────────────────────────────────────────────────────────────
// BlockDetailPanel props
// ─────────────────────────────────────────────────────────────

export interface BlockDetailPanelProps {
	step: ParsedWorkflowStep;
	/** Pending fields for this step. Empty object if no changes. */
	pendingFields: EditableStepFields;
	/** If true, fields are shown as editable inputs. */
	editable: boolean;
	onFieldChange?: (
		field: keyof EditableStepFields,
		value: string | number | boolean | null,
	) => void;
	allSteps?: ParsedWorkflowStep[];
	allTransitions?: ParsedWorkflowTransition[];
	blockParameterSchema?: BlockParameterSchema;
	onParametersChange?: (params: Record<string, unknown> | null) => void;
	allActivities?: ParsedWorkflowActivity[];
	onAddConnection?: (draft: Omit<NewConnectionDraft, "kind">) => void;
	onRemoveConnection?: (draft: Omit<RemovedConnectionDraft, "kind">) => void;
	onUndoRemoveConnection?: (tempId: string) => void;
	pendingRemovedConnectionKeys?: Set<string>;
}

// ─────────────────────────────────────────────────────────────
// BlockDetailPanel
// ─────────────────────────────────────────────────────────────

export function BlockDetailPanel({
	step,
	pendingFields,
	editable,
	onFieldChange,
	allSteps,
	allTransitions,
	blockParameterSchema,
	onParametersChange,
	allActivities,
	onAddConnection,
	onRemoveConnection,
	onUndoRemoveConnection,
	pendingRemovedConnectionKeys,
}: BlockDetailPanelProps) {
	// Resolve display values: pending takes priority
	const currentName = pendingFields.name ?? step.name;
	const currentLabel = pendingFields.label ?? step.label;
	const currentBlock = pendingFields.block ?? step.serviceWorkflowBlock.name;
	const currentAllowedPerformer =
		pendingFields.allowedPerformer !== undefined
			? (pendingFields.allowedPerformer ?? "")
			: (step.allowedPerformer ?? "");
	const currentType =
		pendingFields.type !== undefined ? pendingFields.type : (step.type ?? "");
	const currentX =
		pendingFields.x !== undefined ? pendingFields.x : step.displayOptions.x;
	const currentY =
		pendingFields.y !== undefined ? pendingFields.y : step.displayOptions.y;
	const currentPerformerNeedsTask =
		pendingFields.performerNeedsTask !== undefined
			? pendingFields.performerNeedsTask
			: step.performerNeedsTask;

	// Connected step sets for connection pickers
	const outgoing = (allTransitions ?? []).filter(
		(t) => t.fromStepId === step.id,
	);
	const asyncConnectedIds = new Set(
		outgoing
			.filter((t) => !t.synchronous && t.type !== "disable")
			.map((t) => t.toStepId),
	);
	const syncConnectedIds = new Set(
		outgoing
			.filter((t) => t.synchronous && t.type !== "disable")
			.map((t) => t.toStepId),
	);

	// Check which fields have pending changes
	const changed = (field: keyof EditableStepFields) =>
		field in pendingFields && pendingFields[field] !== undefined;

	const dividerStyle: React.CSSProperties = {
		borderTop: "1px solid #f3f4f6",
		margin: "10px 0 8px",
	};

	const sectionHeadingStyle: React.CSSProperties = {
		fontSize: 12,
		fontWeight: 600,
		color: "#374151",
		marginBottom: 8,
	};

	return (
		<div style={{ padding: 12 }}>
			{/* Block type — always read-only */}
			<BlockReadOnlyField label="Block type" value={currentBlock} />

			{/* Name */}
			<ChangedFieldWrapper isChanged={editable && changed("name")}>
				<FieldRow
					label="Name"
					value={currentName}
					editable={editable}
					onChange={(v) => onFieldChange?.("name", v)}
				/>
			</ChangedFieldWrapper>

			{/* Label */}
			<ChangedFieldWrapper isChanged={editable && changed("label")}>
				<FieldRow
					label="Label"
					value={currentLabel}
					editable={editable}
					onChange={(v) => onFieldChange?.("label", v)}
				/>
			</ChangedFieldWrapper>

			{/* Allowed performer */}
			<ChangedFieldWrapper isChanged={editable && changed("allowedPerformer")}>
				<FieldRow
					label="Allowed performer"
					value={currentAllowedPerformer}
					editable={editable}
					placeholder="(none)"
					onChange={(v) => onFieldChange?.("allowedPerformer", v || null)}
				/>
			</ChangedFieldWrapper>

			{/* Type */}
			<ChangedFieldWrapper isChanged={editable && changed("type")}>
				<FieldRow
					label="Type"
					value={currentType}
					editable={editable}
					placeholder="(none)"
					onChange={(v) => onFieldChange?.("type", v)}
				/>
			</ChangedFieldWrapper>

			{/* Position */}
			<div style={{ display: "flex", gap: 8 }}>
				<div style={{ flex: 1 }}>
					<ChangedFieldWrapper isChanged={editable && changed("x")}>
						<NumberField
							label="X position"
							value={currentX}
							editable={editable}
							onChange={(v) => onFieldChange?.("x", v)}
						/>
					</ChangedFieldWrapper>
				</div>
				<div style={{ flex: 1 }}>
					<ChangedFieldWrapper isChanged={editable && changed("y")}>
						<NumberField
							label="Y position"
							value={currentY}
							editable={editable}
							onChange={(v) => onFieldChange?.("y", v)}
						/>
					</ChangedFieldWrapper>
				</div>
			</div>

			{/* performerNeedsTask */}
			<ChangedFieldWrapper
				isChanged={editable && changed("performerNeedsTask")}
			>
				<CheckboxField
					label="Performer needs task"
					checked={currentPerformerNeedsTask}
					editable={editable}
					onChange={(v) => onFieldChange?.("performerNeedsTask", v)}
				/>
			</ChangedFieldWrapper>

			{/* isRerunnable — always read-only */}
			<CheckboxField
				label="Is rerunnable"
				checked={step.isRerunnable}
				editable={false}
				note="(read-only)"
			/>

			{/* Parameters */}
			{(blockParameterSchema?.hasEditor ||
				(step.parameters && Object.keys(step.parameters).length > 0)) && (
				<>
					<div style={dividerStyle} />
					<div
						style={{
							...sectionHeadingStyle,
							display: "flex",
							alignItems: "center",
							gap: 6,
							marginBottom: 8,
						}}
					>
						Parameters
						{!blockParameterSchema?.hasEditor && (
							<span style={{ fontWeight: 400, color: "#9ca3af", fontSize: 10 }}>
								(raw JSON — no schema)
							</span>
						)}
					</div>
					<ChangedFieldWrapper isChanged={editable && changed("parameters")}>
						{blockParameterSchema?.hasEditor &&
						blockParameterSchema.fields.length > 0 ? (
							<ParameterEditor
								fields={blockParameterSchema.fields}
								parameters={
									(pendingFields.parameters !== undefined
										? pendingFields.parameters
										: step.parameters) ?? {}
								}
								allSteps={allSteps ?? []}
								allActivities={allActivities ?? []}
								onChange={
									editable ? (onParametersChange ?? (() => {})) : () => {}
								}
							/>
						) : (
							step.parameters &&
							Object.keys(step.parameters).length > 0 && (
								<pre
									style={{
										fontSize: 10,
										background: "#f9fafb",
										border: "1px solid #e5e7eb",
										padding: "6px 8px",
										borderRadius: 4,
										overflowX: "auto",
										maxHeight: 120,
										margin: 0,
										whiteSpace: "pre-wrap",
										wordBreak: "break-all",
										color: "#374151",
									}}
								>
									{JSON.stringify(step.parameters, null, 2)}
								</pre>
							)
						)}
					</ChangedFieldWrapper>
				</>
			)}

			{/* Connections */}
			{allSteps && allSteps.length > 1 && (
				<>
					<div style={dividerStyle} />
					<div style={sectionHeadingStyle}>Connections</div>

					{/* Existing outgoing */}
					{outgoing.length > 0 && (
						<div style={{ marginBottom: 10 }}>
							<label style={smallLabelStyle}>Current outgoing:</label>
							{outgoing.map((t) => {
								const target = (allSteps ?? []).find(
									(s) => s.id === t.toStepId,
								);
								const color =
									t.type === "disable"
										? "#EE1111"
										: t.synchronous
											? "#FF37F0"
											: "#FF9A1E";
								const tag =
									t.type === "disable"
										? "disable"
										: t.synchronous
											? "sync"
											: "async";
								const connKey = `${t.fromStepId}-${t.toStepId}`;
								const isPendingRemoval =
									pendingRemovedConnectionKeys?.has(connKey) ?? false;
								return (
									<div
										key={t.id}
										style={{
											display: "flex",
											alignItems: "center",
											gap: 4,
											marginBottom: 3,
											color: isPendingRemoval ? "#9ca3af" : color,
											opacity: isPendingRemoval ? 0.6 : 1,
										}}
									>
										<span
											style={{
												flex: 1,
												fontSize: 11,
												textDecoration: isPendingRemoval
													? "line-through"
													: "none",
											}}
										>
											→ {target?.name ?? t.toStepId}{" "}
											<span
												style={{
													background:
														(isPendingRemoval ? "#9ca3af" : color) + "22",
													border: `1px solid ${isPendingRemoval ? "#9ca3af" : color}`,
													borderRadius: 3,
													padding: "0 4px",
													fontSize: 10,
												}}
											>
												{tag}
											</span>
										</span>
										{editable &&
											(isPendingRemoval ? (
												<button
													onClick={() =>
														onUndoRemoveConnection?.(`rm-conn-${t.id}`)
													}
													title="Undo removal"
													style={{
														background: "none",
														border: "none",
														cursor: "pointer",
														color: "#6b7280",
														fontSize: 12,
														padding: "0 2px",
														flexShrink: 0,
														lineHeight: 1,
													}}
												>
													↩
												</button>
											) : onRemoveConnection ? (
												<button
													onClick={() =>
														onRemoveConnection({
															tempId: `rm-conn-${t.id}`,
															fromStepId: step.id,
															fromStepName: step.name,
															fromVariableName: step.variableName ?? "",
															toStepId: t.toStepId,
															toStepName: target?.name ?? t.toStepId,
															toVariableName: target?.variableName ?? "",
															synchronous: t.synchronous,
															isDisable: t.type === "disable",
														})
													}
													title="Remove this connection"
													style={{
														background: "none",
														border: "none",
														cursor: "pointer",
														color: "#9ca3af",
														fontSize: 14,
														padding: "0 2px",
														flexShrink: 0,
														lineHeight: 1,
													}}
												>
													×
												</button>
											) : null)}
									</div>
								);
							})}
						</div>
					)}

					{/* Add new connections (edit mode only) */}
					{editable && onAddConnection && (
						<>
							<div style={{ marginBottom: 8 }}>
								<label style={{ ...smallLabelStyle, marginBottom: 4 }}>
									Add next steps{" "}
									<span
										style={{
											background: "#FF9A1E22",
											border: "1px solid #FF9A1E",
											borderRadius: 3,
											padding: "0 4px",
											fontSize: 10,
											color: "#FF9A1E",
										}}
									>
										async
									</span>
									:
								</label>
								<StepCheckList
									steps={allSteps}
									currentStepId={step.id}
									connectedStepIds={asyncConnectedIds}
									onChange={(stepId, checked) => {
										if (checked) {
											onAddConnection({
												tempId: `conn-async-${Date.now()}`,
												fromStepId: step.id,
												toStepIds: [stepId],
												synchronous: false,
											});
										}
									}}
								/>
							</div>
							<div style={{ marginBottom: 8 }}>
								<label style={{ ...smallLabelStyle, marginBottom: 4 }}>
									Add synchronous next steps{" "}
									<span
										style={{
											background: "#FF37F022",
											border: "1px solid #FF37F0",
											borderRadius: 3,
											padding: "0 4px",
											fontSize: 10,
											color: "#FF37F0",
										}}
									>
										sync
									</span>
									:
								</label>
								<StepCheckList
									steps={allSteps}
									currentStepId={step.id}
									connectedStepIds={syncConnectedIds}
									onChange={(stepId, checked) => {
										if (checked) {
											onAddConnection({
												tempId: `conn-sync-${Date.now()}`,
												fromStepId: step.id,
												toStepIds: [stepId],
												synchronous: true,
											});
										}
									}}
								/>
							</div>
						</>
					)}
				</>
			)}
		</div>
	);
}
