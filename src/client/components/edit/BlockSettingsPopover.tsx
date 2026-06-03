import { useEffect, useRef } from "react";
import type {
	ParsedWorkflowStep,
	EditableStepFields,
} from "../../../shared/types";
import { BLOCK_NAMES } from "../../../shared/blockTypes";

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
			<label
				style={{
					display: "block",
					fontSize: 11,
					color: "#6b7280",
					marginBottom: 2,
					fontWeight: 500,
				}}
			>
				{label}
			</label>
			{editable ? (
				<input
					type="text"
					value={value}
					placeholder={placeholder ?? ""}
					onChange={(e) => onChange?.(e.target.value)}
					style={{
						width: "100%",
						padding: "4px 6px",
						fontSize: 12,
						border: "1px solid #d1d5db",
						borderRadius: 4,
						boxSizing: "border-box",
						outline: "none",
						fontFamily: "inherit",
					}}
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

function BlockEnumField({
	label,
	value,
	onChange,
}: {
	label: string;
	value: string;
	onChange: (v: string) => void;
}) {
	// If the current value isn't in BLOCK_NAMES (shouldn't happen, but be safe)
	const options = BLOCK_NAMES.includes(value)
		? BLOCK_NAMES
		: [value, ...BLOCK_NAMES];

	return (
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
				{label}
			</label>
			<select
				value={value}
				onChange={(e) => onChange(e.target.value)}
				style={{
					width: "100%",
					padding: "4px 6px",
					fontSize: 12,
					border: "1px solid #d1d5db",
					borderRadius: 4,
					background: "white",
					cursor: "pointer",
					fontFamily: "inherit",
				}}
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

// ─────────────────────────────────────────────────────────────
// BlockSettingsPopover
// ─────────────────────────────────────────────────────────────

export interface BlockSettingsPopoverProps {
	step: ParsedWorkflowStep;
	pendingFields: EditableStepFields;
	onFieldChange: (
		field: keyof EditableStepFields,
		value: string | number | null,
	) => void;
	onClose: () => void;
	position: { top: number; left: number };
}

export function BlockSettingsPopover({
	step,
	pendingFields,
	onFieldChange,
	onClose,
	position,
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
		// Use capture so we catch the event before React's synthetic event system
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

	return (
		<div
			ref={ref}
			style={{
				position: "absolute",
				top: position.top,
				left: position.left,
				zIndex: 200,
				background: "white",
				border: "1px solid #e5e7eb",
				borderRadius: 8,
				boxShadow: "0 8px 24px rgba(0,0,0,0.12)",
				width: 280,
				maxHeight: 480,
				overflowY: "auto",
				padding: 16,
			}}
			// Prevent click inside from triggering canvas mousedown (drag, etc.)
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

			{/* Editable string fields */}
			<FieldRow
				label="name"
				value={currentName}
				onChange={(v) => onFieldChange("name", v)}
				editable
			/>
			<FieldRow
				label="label"
				value={currentLabel}
				onChange={(v) => onFieldChange("label", v)}
				editable
			/>
			<FieldRow
				label="allowedPerformer"
				value={currentAllowedPerformer}
				placeholder="(none)"
				onChange={(v) => onFieldChange("allowedPerformer", v || null)}
				editable
			/>
			<FieldRow
				label="type"
				value={currentType}
				placeholder="(none)"
				onChange={(v) => onFieldChange("type", v)}
				editable
			/>

			{/* Editable block enum */}
			<BlockEnumField
				label="block"
				value={currentBlock}
				onChange={(v) => onFieldChange("block", v)}
			/>

			{/* Divider */}
			<div
				style={{
					borderTop: "1px solid #f3f4f6",
					margin: "10px 0",
				}}
			/>

			{/* Read-only fields */}
			<FieldRow
				label="x (set via drag)"
				value={String(
					pendingFields.x !== undefined
						? pendingFields.x
						: step.displayOptions.x,
				)}
				editable={false}
			/>
			<FieldRow
				label="y (set via drag)"
				value={String(
					pendingFields.y !== undefined
						? pendingFields.y
						: step.displayOptions.y,
				)}
				editable={false}
			/>
			<FieldRow
				label="performerNeedsTask"
				value={String(step.performerNeedsTask)}
				editable={false}
			/>
			<FieldRow
				label="isRerunnable"
				value={String(step.isRerunnable)}
				editable={false}
			/>

			{/* Parameters read-only JSON */}
			{step.parameters && Object.keys(step.parameters).length > 0 && (
				<div style={{ marginTop: 4 }}>
					<label
						style={{
							display: "block",
							fontSize: 11,
							color: "#6b7280",
							marginBottom: 2,
							fontWeight: 500,
						}}
					>
						parameters (read-only)
					</label>
					<pre
						style={{
							fontSize: 10,
							background: "#f9fafb",
							border: "1px solid #e5e7eb",
							padding: "6px 8px",
							borderRadius: 4,
							overflowX: "auto",
							maxHeight: 120,
							margin: "4px 0 0",
							whiteSpace: "pre-wrap",
							wordBreak: "break-all",
							color: "#374151",
						}}
					>
						{JSON.stringify(step.parameters, null, 2)}
					</pre>
				</div>
			)}
		</div>
	);
}
