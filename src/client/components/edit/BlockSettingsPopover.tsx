import { useEffect, useRef } from "react";
import type {
	ParsedWorkflowStep,
	ParsedWorkflowTransition,
	ParsedWorkflowActivity,
	EditableStepFields,
	NewConnectionDraft,
	BlockParameterSchema,
	BlockParameterField,
} from "../../../shared/types";
import { BLOCK_NAMES } from "../../../shared/blockTypes";

// ─────────────────────────────────────────────────────────────
// Shared styles
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

// ─────────────────────────────────────────────────────────────
// Sub-components
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
				<span
					style={{
						display: "block",
						fontSize: 12,
						color: "#374151",
						fontFamily: "monospace",
						padding: "2px 0",
					}}
				>
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
}: {
	label: string;
	value: number;
	onChange: (v: number) => void;
}) {
	return (
		<div style={{ marginBottom: 8 }}>
			<label style={smallLabelStyle}>{label}</label>
			<input
				type="number"
				value={value}
				min={0}
				onChange={(e) => {
					const n = parseInt(e.target.value, 10);
					if (!isNaN(n)) onChange(n);
				}}
				style={inputStyle}
			/>
		</div>
	);
}

function CheckboxField({
	label,
	checked,
	onChange,
}: {
	label: string;
	checked: boolean;
	onChange: (v: boolean) => void;
}) {
	return (
		<div
			style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}
		>
			<input
				type="checkbox"
				checked={checked}
				onChange={(e) => onChange(e.target.checked)}
				style={{ cursor: "pointer", width: 14, height: 14, flexShrink: 0 }}
			/>
			<label style={{ fontSize: 12, color: "#374151", cursor: "pointer" }}>
				{label}
			</label>
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

/** Compact scrollable checkbox list for picking steps */
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

import { ParameterEditor } from "./ParameterEditor";

// ─────────────────────────────────────────────────────────────
// BlockSettingsPopover
// ─────────────────────────────────────────────────────────────

export interface BlockSettingsPopoverProps {
	step: ParsedWorkflowStep;
	pendingFields: EditableStepFields;
	onFieldChange: (
		field: keyof EditableStepFields,
		value: string | number | boolean | null,
	) => void;
	onClose: () => void;
	position: { top: number; left: number };
	/** All steps in the workflow — needed to show connection picker */
	allSteps?: ParsedWorkflowStep[];
	/** All transitions — needed to show existing connections */
	allTransitions?: ParsedWorkflowTransition[];
	/** Called when user checks a new connection in the popover */
	onAddConnection?: (draft: Omit<NewConnectionDraft, "kind">) => void;
	/** Block parameter schema from the analyzer — drives typed parameter editor */
	blockParameterSchema?: BlockParameterSchema;
	/** Called when parameters are changed via the typed editor */
	onParametersChange?: (params: Record<string, unknown> | null) => void;
	/** All activities in the workflow — needed for activity-id parameter fields */
	allActivities?: ParsedWorkflowActivity[];
}

export function BlockSettingsPopover({
	step,
	pendingFields,
	onFieldChange,
	onClose,
	position,
	allSteps,
	allTransitions,
	onAddConnection,
	blockParameterSchema,
	onParametersChange,
	allActivities,
}: BlockSettingsPopoverProps) {
	const ref = useRef<HTMLDivElement>(null);

	// Close on Escape
	useEffect(() => {
		const handler = (e: KeyboardEvent) => {
			if (e.key === "Escape") onClose();
		};
		window.addEventListener("keydown", handler);
		return () => window.removeEventListener("keydown", handler);
	}, [onClose]);

	// Close on outside mousedown
	useEffect(() => {
		const handler = (e: MouseEvent) => {
			if (ref.current && !ref.current.contains(e.target as Node)) {
				onClose();
			}
		};
		document.addEventListener("mousedown", handler, true);
		return () => document.removeEventListener("mousedown", handler, true);
	}, [onClose]);

	// Resolve current values: pending fields take priority over step values
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

	// Pre-compute connected step ID sets for the connection pickers
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

	return (
		<div
			ref={ref}
			data-role="block-settings-popover"
			style={{
				position: "absolute",
				top: position.top,
				left: position.left,
				zIndex: 200,
				background: "white",
				border: "1px solid #e5e7eb",
				borderRadius: 8,
				boxShadow: "0 8px 24px rgba(0,0,0,0.12)",
				width: 340,
				maxHeight: 580,
				overflowY: "auto",
				padding: 16,
			}}
			onMouseDown={(e) => e.stopPropagation()}
		>
			{/* Header */}
			<div
				style={{
					display: "flex",
					justifyContent: "space-between",
					alignItems: "center",
					marginBottom: 12,
					paddingBottom: 8,
					borderBottom: "1px solid #f3f4f6",
				}}
			>
				<strong style={{ fontSize: 13, color: "#111827" }}>
					Step settings
				</strong>
				<button
					onClick={onClose}
					style={{
						background: "none",
						border: "none",
						cursor: "pointer",
						fontSize: 18,
						lineHeight: 1,
						color: "#6b7280",
						padding: "0 2px",
					}}
					aria-label="Close settings"
				>
					×
				</button>
			</div>

			{/* ── Block type ─────────────────────────────────────── */}
			<BlockEnumField
				label="Block type"
				value={currentBlock}
				onChange={(v) => onFieldChange("block", v)}
			/>

			{/* ── Name & Label ────────────────────────────────────── */}
			<FieldRow
				label="Name"
				value={currentName}
				onChange={(v) => onFieldChange("name", v)}
				editable
			/>
			<FieldRow
				label="Label"
				value={currentLabel}
				onChange={(v) => onFieldChange("label", v)}
				editable
			/>

			{/* ── Allowed performer & type ─────────────────────────── */}
			<FieldRow
				label="Allowed performer"
				value={currentAllowedPerformer}
				placeholder="(none)"
				onChange={(v) => onFieldChange("allowedPerformer", v || null)}
				editable
			/>
			<FieldRow
				label="Type"
				value={currentType}
				placeholder="(none)"
				onChange={(v) => onFieldChange("type", v)}
				editable
			/>

			{/* ── Position (editable number inputs) ───────────────── */}
			<div style={{ display: "flex", gap: 8 }}>
				<div style={{ flex: 1 }}>
					<NumberField
						label="X position"
						value={currentX}
						onChange={(v) => onFieldChange("x", v)}
					/>
				</div>
				<div style={{ flex: 1 }}>
					<NumberField
						label="Y position"
						value={currentY}
						onChange={(v) => onFieldChange("y", v)}
					/>
				</div>
			</div>

			{/* ── Booleans ─────────────────────────────────────────── */}
			<CheckboxField
				label="Performer needs task"
				checked={currentPerformerNeedsTask}
				onChange={(v) => onFieldChange("performerNeedsTask", v)}
			/>
			{/* isRerunnable — read-only (not in seed file; set by the framework) */}
			<div
				style={{
					display: "flex",
					alignItems: "center",
					gap: 8,
					marginBottom: 8,
					opacity: 0.6,
				}}
			>
				<input
					type="checkbox"
					checked={step.isRerunnable}
					disabled
					style={{ width: 14, height: 14, flexShrink: 0 }}
				/>
				<label style={{ fontSize: 12, color: "#374151" }}>
					Is rerunnable (read-only)
				</label>
			</div>

			{/* ── Parameters ──────────────────────────────────────── */}
			{(blockParameterSchema?.hasEditor ||
				(step.parameters && Object.keys(step.parameters).length > 0)) && (
				<>
					<div
						style={{ borderTop: "1px solid #f3f4f6", margin: "10px 0 8px" }}
					/>
					<div
						style={{
							fontSize: 12,
							fontWeight: 600,
							color: "#374151",
							marginBottom: 8,
							display: "flex",
							alignItems: "center",
							gap: 6,
						}}
					>
						Parameters
						{!blockParameterSchema?.hasEditor && (
							<span style={{ fontWeight: 400, color: "#9ca3af", fontSize: 10 }}>
								(raw JSON — no schema available)
							</span>
						)}
					</div>

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
							onChange={onParametersChange ?? (() => {})}
						/>
					) : (
						/* Fallback: raw JSON for blocks without a schema */
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
				</>
			)}

			{/* ── Connections ──────────────────────────────────────── */}
			{allSteps && allSteps.length > 1 && (
				<>
					<div
						style={{ borderTop: "1px solid #f3f4f6", margin: "12px 0 10px" }}
					/>
					<div
						style={{
							fontSize: 12,
							fontWeight: 600,
							color: "#374151",
							marginBottom: 10,
						}}
					>
						Connections
					</div>

					{/* Existing outgoing connections */}
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
								return (
									<div
										key={t.id}
										style={{ fontSize: 11, color, marginBottom: 3 }}
									>
										→ {target?.name ?? t.toStepId}{" "}
										<span
											style={{
												background: color + "22",
												border: `1px solid ${color}`,
												borderRadius: 3,
												padding: "0 4px",
												fontSize: 10,
											}}
										>
											{tag}
										</span>
									</div>
								);
							})}
						</div>
					)}

					{/* Add new async connections */}
					{onAddConnection && (
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
