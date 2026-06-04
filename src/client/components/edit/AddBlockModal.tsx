import { useState, useEffect, useCallback } from "react";
import type {
	ParsedWorkflowStep,
	ParsedWorkflowActivity,
	NewStepDraft,
	BlockParameterSchemas,
} from "../../../shared/types";
import { BLOCK_NAMES } from "../../../shared/blockTypes";
import { generateVariableName } from "../../hooks/useEditMode";
import { ParameterEditor } from "./ParameterEditor";

// ─────────────────────────────────────────────────────────────
// Props
// ─────────────────────────────────────────────────────────────

interface AddBlockModalProps {
	existingSteps: ParsedWorkflowStep[];
	allActivities?: ParsedWorkflowActivity[];
	blockParameterSchemas?: BlockParameterSchemas;
	onAdd: (draft: Omit<NewStepDraft, "kind">) => void;
	onCancel: () => void;
}

// ─────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────

function findFreePosition(
	existingSteps: ParsedWorkflowStep[],
	baseX: number,
	baseY: number,
): { x: number; y: number } {
	const occupied = new Set(
		existingSteps.map((s) => `${s.displayOptions.x},${s.displayOptions.y}`),
	);
	let x = baseX;
	const y = baseY;
	while (occupied.has(`${x},${y}`)) {
		x += 1;
	}
	return { x, y };
}

// ─────────────────────────────────────────────────────────────
// Shared input / label styles
// ─────────────────────────────────────────────────────────────

const labelStyle: React.CSSProperties = {
	display: "block",
	fontSize: 12,
	fontWeight: 600,
	color: "#374151",
	marginBottom: 4,
};

const inputStyle: React.CSSProperties = {
	width: "100%",
	padding: "7px 10px",
	fontSize: 13,
	border: "1px solid #d1d5db",
	borderRadius: 6,
	boxSizing: "border-box",
	color: "#111827",
	background: "white",
	outline: "none",
};

const sectionStyle: React.CSSProperties = {
	marginBottom: 18,
};

const sectionHeadingStyle: React.CSSProperties = {
	fontSize: 11,
	fontWeight: 700,
	textTransform: "uppercase",
	letterSpacing: "0.06em",
	color: "#6b7280",
	marginBottom: 10,
	paddingBottom: 4,
	borderBottom: "1px solid #f3f4f6",
};

// ─────────────────────────────────────────────────────────────
// Multi-step checkbox list component
// ─────────────────────────────────────────────────────────────

function StepCheckboxList({
	label,
	steps,
	selectedIds,
	excludeIds,
	onChange,
}: {
	label: string;
	steps: ParsedWorkflowStep[];
	selectedIds: string[];
	excludeIds?: string[];
	onChange: (ids: string[]) => void;
}) {
	const filtered = excludeIds
		? steps.filter((s) => !excludeIds.includes(s.id))
		: steps;

	const toggle = useCallback(
		(id: string) => {
			onChange(
				selectedIds.includes(id)
					? selectedIds.filter((x) => x !== id)
					: [...selectedIds, id],
			);
		},
		[selectedIds, onChange],
	);

	return (
		<div style={{ marginBottom: 12 }}>
			<label style={labelStyle}>{label}</label>
			{filtered.length === 0 ? (
				<p style={{ fontSize: 12, color: "#9ca3af", margin: 0 }}>
					No steps available.
				</p>
			) : (
				<div
					style={{
						maxHeight: 120,
						overflowY: "auto",
						border: "1px solid #e5e7eb",
						borderRadius: 6,
						background: "#fafafa",
					}}
				>
					{filtered.map((step) => (
						<label
							key={step.id}
							style={{
								display: "flex",
								alignItems: "center",
								gap: 8,
								padding: "5px 10px",
								cursor: "pointer",
								fontSize: 12,
								color: "#374151",
								borderBottom: "1px solid #f3f4f6",
							}}
						>
							<input
								type="checkbox"
								checked={selectedIds.includes(step.id)}
								onChange={() => toggle(step.id)}
								style={{ flexShrink: 0 }}
							/>
							<span>
								{step.name}
								<span style={{ color: "#9ca3af", marginLeft: 4 }}>
									(x:{step.displayOptions.x}, y:{step.displayOptions.y})
								</span>
							</span>
						</label>
					))}
				</div>
			)}
		</div>
	);
}

// ─────────────────────────────────────────────────────────────
// Main modal
// ─────────────────────────────────────────────────────────────

export function AddBlockModal({
	existingSteps,
	allActivities = [],
	blockParameterSchemas,
	onAdd,
	onCancel,
}: AddBlockModalProps) {
	const [blockType, setBlockType] = useState("");
	const [name, setName] = useState("");
	const [label, setLabel] = useState("");
	const [x, setX] = useState(0);
	const [y, setY] = useState(0);
	const [allowedPerformer, setAllowedPerformer] = useState("");
	const [performerNeedsTask, setPerformerNeedsTask] = useState(false);
	const [prevStepIds, setPrevStepIds] = useState<string[]>([]);
	const [nextStepIds, setNextStepIds] = useState<string[]>([]);
	const [syncNextStepIds, setSyncNextStepIds] = useState<string[]>([]);
	const [parameters, setParameters] = useState<Record<string, unknown>>({});
	// Track whether the user has manually overridden the auto-position
	const [hasManuallySetPos, setHasManuallySetPos] = useState(false);

	// Reset parameters when block type changes
	useEffect(() => {
		setParameters({});
	}, [blockType]);

	// Auto-position: when exactly one prev step is selected, suggest x+1, y
	useEffect(() => {
		if (hasManuallySetPos) return;
		if (prevStepIds.length === 1) {
			const from = existingSteps.find((s) => s.id === prevStepIds[0]);
			if (from) {
				const { x: sugX, y: sugY } = findFreePosition(
					existingSteps,
					from.displayOptions.x + 1,
					from.displayOptions.y,
				);
				setX(sugX);
				setY(sugY);
			}
		}
	}, [prevStepIds, existingSteps, hasManuallySetPos]);

	const varName = generateVariableName(name);
	const isValid = blockType.trim() !== "" && name.trim() !== "";

	const handleAdd = () => {
		if (!isValid) return;
		const tempId = `new-step-${Date.now()}`;
		onAdd({
			tempId,
			fields: {
				block: blockType,
				name: name.trim(),
				label: label.trim() || name.trim(),
				x,
				y,
				allowedPerformer: allowedPerformer.trim() || undefined,
				performerNeedsTask,
				prevStepIds: prevStepIds.length > 0 ? prevStepIds : undefined,
				nextStepIds: nextStepIds.length > 0 ? nextStepIds : undefined,
				synchronousNextStepIds:
					syncNextStepIds.length > 0 ? syncNextStepIds : undefined,
				parameters: Object.keys(parameters).length > 0 ? parameters : undefined,
			},
			variableName: varName,
		});
	};

	// Close on Escape
	useEffect(() => {
		const h = (e: KeyboardEvent) => {
			if (e.key === "Escape") onCancel();
		};
		window.addEventListener("keydown", h);
		return () => window.removeEventListener("keydown", h);
	}, [onCancel]);

	// IDs that shouldn't appear in "next steps" (don't connect to yourself via prev)
	const excludeFromNext = prevStepIds; // optional: prevent circular picks

	return (
		<>
			{/* Backdrop */}
			<div
				onClick={onCancel}
				style={{
					position: "fixed",
					inset: 0,
					background: "rgba(0,0,0,0.4)",
					zIndex: 1000,
				}}
			/>

			{/* Dialog */}
			<div
				onClick={(e) => e.stopPropagation()}
				style={{
					position: "fixed",
					top: "50%",
					left: "50%",
					transform: "translate(-50%, -50%)",
					zIndex: 1001,
					background: "white",
					borderRadius: 12,
					boxShadow: "0 20px 48px rgba(0,0,0,0.2)",
					padding: 24,
					width: 540,
					maxWidth: "95vw",
					maxHeight: "90vh",
					overflowY: "auto",
					boxSizing: "border-box",
				}}
			>
				{/* Title */}
				<h2
					style={{
						margin: "0 0 20px",
						fontSize: 16,
						fontWeight: 600,
						color: "#111827",
					}}
				>
					Add new block
				</h2>

				{/* ── Section 1: Block settings ── */}
				<div style={sectionStyle}>
					<p style={sectionHeadingStyle}>Block settings</p>

					{/* Block type */}
					<div style={{ marginBottom: 12 }}>
						<label style={labelStyle}>
							Block type <span style={{ color: "#ef4444" }}>*</span>
						</label>
						<select
							value={blockType}
							onChange={(e) => setBlockType(e.target.value)}
							autoFocus
							style={{ ...inputStyle, cursor: "pointer" }}
						>
							<option value="">Select a block type…</option>
							{BLOCK_NAMES.map((bn) => (
								<option key={bn} value={bn}>
									{bn}
								</option>
							))}
						</select>
					</div>

					{/* Name */}
					<div style={{ marginBottom: 4 }}>
						<label style={labelStyle}>
							Name <span style={{ color: "#ef4444" }}>*</span>
						</label>
						<input
							type="text"
							value={name}
							onChange={(e) => setName(e.target.value)}
							placeholder="e.g. Perform examination"
							style={inputStyle}
						/>
					</div>
					{/* Variable name preview */}
					<p
						style={{
							fontSize: 11,
							color: "#9ca3af",
							margin: "3px 0 12px",
							fontFamily: "monospace",
						}}
					>
						Variable: {name.trim() ? varName : <em>enter name above</em>}
					</p>

					{/* Label */}
					<div style={{ marginBottom: 0 }}>
						<label style={labelStyle}>
							Label{" "}
							<span style={{ color: "#9ca3af", fontWeight: 400 }}>
								(optional, defaults to name)
							</span>
						</label>
						<input
							type="text"
							value={label}
							onChange={(e) => setLabel(e.target.value)}
							placeholder="Display label"
							style={inputStyle}
						/>
					</div>
				</div>

				{/* ── Section 2: Position ── */}
				<div style={sectionStyle}>
					<p style={sectionHeadingStyle}>Position</p>
					<div style={{ display: "flex", gap: 12 }}>
						<div style={{ flex: 1 }}>
							<label style={labelStyle}>
								X <span style={{ color: "#ef4444" }}>*</span>
							</label>
							<input
								type="number"
								min={0}
								value={x}
								onChange={(e) => {
									setX(Number(e.target.value));
									setHasManuallySetPos(true);
								}}
								style={inputStyle}
							/>
						</div>
						<div style={{ flex: 1 }}>
							<label style={labelStyle}>
								Y <span style={{ color: "#ef4444" }}>*</span>
							</label>
							<input
								type="number"
								min={0}
								value={y}
								onChange={(e) => {
									setY(Number(e.target.value));
									setHasManuallySetPos(true);
								}}
								style={inputStyle}
							/>
						</div>
					</div>
					{!hasManuallySetPos && prevStepIds.length === 1 && (
						<p style={{ fontSize: 11, color: "#6b7280", margin: "4px 0 0" }}>
							Auto-positioned based on selected prev step. Edit X/Y to override.
						</p>
					)}
				</div>

				{/* ── Section 3: Permissions ── */}
				<div style={sectionStyle}>
					<p style={sectionHeadingStyle}>Permissions</p>

					<div style={{ marginBottom: 12 }}>
						<label style={labelStyle}>
							Allowed performer{" "}
							<span style={{ color: "#9ca3af", fontWeight: 400 }}>
								(optional)
							</span>
						</label>
						<input
							type="text"
							value={allowedPerformer}
							onChange={(e) => setAllowedPerformer(e.target.value)}
							placeholder="e.g. ophthalmologist"
							style={inputStyle}
						/>
					</div>

					<label
						style={{
							display: "flex",
							alignItems: "center",
							gap: 8,
							cursor: "pointer",
							fontSize: 13,
							color: "#374151",
						}}
					>
						<input
							type="checkbox"
							checked={performerNeedsTask}
							onChange={(e) => setPerformerNeedsTask(e.target.checked)}
						/>
						Performer needs task
					</label>
				</div>

				{/* ── Section 4: Parameters (schema-driven, shown when block type has known parameters) ── */}
				{blockType &&
					blockParameterSchemas?.[blockType]?.hasEditor &&
					blockParameterSchemas[blockType].fields.length > 0 && (
						<div style={sectionStyle}>
							<p style={sectionHeadingStyle}>Parameters</p>
							<ParameterEditor
								fields={blockParameterSchemas[blockType].fields}
								parameters={parameters}
								allSteps={existingSteps}
								allActivities={allActivities}
								onChange={setParameters}
							/>
						</div>
					)}

				{/* ── Section 5: Connections ── */}
				<div style={sectionStyle}>
					<p style={sectionHeadingStyle}>Connections</p>

					<StepCheckboxList
						label="Steps that connect TO this block (prev steps)"
						steps={existingSteps}
						selectedIds={prevStepIds}
						onChange={setPrevStepIds}
					/>

					<StepCheckboxList
						label="Steps this block connects TO (next steps)"
						steps={existingSteps}
						selectedIds={nextStepIds}
						excludeIds={excludeFromNext}
						onChange={setNextStepIds}
					/>

					<StepCheckboxList
						label="Synchronous next steps"
						steps={existingSteps}
						selectedIds={syncNextStepIds}
						excludeIds={excludeFromNext}
						onChange={setSyncNextStepIds}
					/>
				</div>

				{/* ── Footer ── */}
				<div
					style={{
						display: "flex",
						justifyContent: "flex-end",
						gap: 8,
						marginTop: 4,
						paddingTop: 16,
						borderTop: "1px solid #f3f4f6",
					}}
				>
					<button
						onClick={onCancel}
						style={{
							padding: "8px 16px",
							borderRadius: 6,
							border: "1px solid #d1d5db",
							cursor: "pointer",
							background: "white",
							color: "#374151",
							fontSize: 14,
						}}
					>
						Cancel
					</button>
					<button
						onClick={handleAdd}
						disabled={!isValid}
						style={{
							padding: "8px 16px",
							borderRadius: 6,
							border: "none",
							cursor: isValid ? "pointer" : "not-allowed",
							background: "#3b82f6",
							color: "white",
							fontSize: 14,
							fontWeight: 500,
							opacity: isValid ? 1 : 0.45,
						}}
					>
						Add
					</button>
				</div>
			</div>
		</>
	);
}
