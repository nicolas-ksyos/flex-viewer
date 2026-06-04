/**
 * ParameterEditor.tsx
 *
 * Shared typed parameter form used in both BlockSettingsPopover (edit existing)
 * and AddBlockModal (create new).
 */
import type React from "react";
import type {
	BlockParameterField,
	ParsedWorkflowStep,
	ParsedWorkflowActivity,
} from "../../../shared/types";

// ─────────────────────────────────────────────────────────────
// Shared sub-component styles
// ─────────────────────────────────────────────────────────────

const paramLabelStyle: React.CSSProperties = {
	display: "block",
	fontSize: 11,
	color: "#6b7280",
	marginBottom: 2,
	fontWeight: 500,
};

const paramInputStyle: React.CSSProperties = {
	width: "100%",
	padding: "4px 6px",
	fontSize: 12,
	border: "1px solid #d1d5db",
	borderRadius: 4,
	boxSizing: "border-box" as const,
	background: "white",
	fontFamily: "inherit",
};

// ─────────────────────────────────────────────────────────────
// ParameterEditor
// ─────────────────────────────────────────────────────────────

interface ParameterEditorProps {
	fields: BlockParameterField[];
	parameters: Record<string, unknown>;
	allSteps: ParsedWorkflowStep[];
	allActivities: ParsedWorkflowActivity[];
	onChange: (params: Record<string, unknown>) => void;
}

export function ParameterEditor({
	fields,
	parameters,
	allSteps,
	allActivities,
	onChange,
}: ParameterEditorProps) {
	const handleFieldChange = (key: string, value: unknown) => {
		onChange({ ...parameters, [key]: value });
	};
	return (
		<div>
			{fields.map((field) => (
				<ParameterField
					key={field.key}
					field={field}
					value={parameters[field.key]}
					allSteps={allSteps}
					allActivities={allActivities}
					onChange={(v) => handleFieldChange(field.key, v)}
				/>
			))}
		</div>
	);
}

// ─────────────────────────────────────────────────────────────
// ParameterField — renders one field based on its type
// ─────────────────────────────────────────────────────────────

function ParameterField({
	field,
	value,
	allSteps,
	allActivities,
	onChange,
}: {
	field: BlockParameterField;
	value: unknown;
	allSteps: ParsedWorkflowStep[];
	allActivities: ParsedWorkflowActivity[];
	onChange: (v: unknown) => void;
}) {
	const fieldLabel = (
		<label style={paramLabelStyle}>
			{field.key}
			{field.required && (
				<span style={{ color: "#ef4444", marginLeft: 2 }}>*</span>
			)}
		</label>
	);

	switch (field.type) {
		case "string":
			return (
				<div style={{ marginBottom: 8 }}>
					{fieldLabel}
					<input
						type="text"
						value={String(value ?? "")}
						onChange={(e) => onChange(e.target.value)}
						style={paramInputStyle}
					/>
				</div>
			);

		case "number":
			return (
				<div style={{ marginBottom: 8 }}>
					{fieldLabel}
					<input
						type="number"
						value={value != null ? Number(value) : ""}
						onChange={(e) => {
							const n = parseFloat(e.target.value);
							if (!isNaN(n)) onChange(n);
						}}
						style={paramInputStyle}
					/>
				</div>
			);

		case "boolean":
			return (
				<div
					style={{
						display: "flex",
						alignItems: "center",
						gap: 8,
						marginBottom: 8,
					}}
				>
					<input
						type="checkbox"
						checked={Boolean(value)}
						onChange={(e) => onChange(e.target.checked)}
						style={{ width: 14, height: 14, cursor: "pointer" }}
					/>
					<label style={{ fontSize: 12, color: "#374151", cursor: "pointer" }}>
						{field.key}
					</label>
				</div>
			);

		case "enum": {
			const enumVals = field.enumValues ?? [];
			if (enumVals.length === 0) {
				return (
					<div style={{ marginBottom: 8 }}>
						{fieldLabel}
						<input
							type="text"
							value={String(value ?? "")}
							onChange={(e) => onChange(e.target.value)}
							style={paramInputStyle}
						/>
					</div>
				);
			}
			return (
				<div style={{ marginBottom: 8 }}>
					{fieldLabel}
					<select
						value={String(value ?? "")}
						onChange={(e) => onChange(e.target.value)}
						style={{ ...paramInputStyle, cursor: "pointer" }}
					>
						<option value="">— select —</option>
						{enumVals.map((v) => (
							<option key={v} value={v}>
								{v}
							</option>
						))}
					</select>
				</div>
			);
		}

		case "activity-id":
			return (
				<div style={{ marginBottom: 8 }}>
					{fieldLabel}
					<select
						value={String(value ?? "")}
						onChange={(e) => onChange(e.target.value)}
						style={{ ...paramInputStyle, cursor: "pointer" }}
					>
						<option value="">— select activity —</option>
						{allActivities.map((a) => (
							<option key={a.id} value={a.id}>
								{a.label || a.name}
							</option>
						))}
					</select>
				</div>
			);

		case "step-id":
			return (
				<div style={{ marginBottom: 8 }}>
					{fieldLabel}
					<select
						value={String(value ?? "")}
						onChange={(e) => onChange(e.target.value)}
						style={{ ...paramInputStyle, cursor: "pointer" }}
					>
						<option value="">— select step —</option>
						{allSteps.map((s) => (
							<option key={s.id} value={s.id}>
								{s.label || s.name}
							</option>
						))}
					</select>
				</div>
			);

		case "uuid":
			return (
				<div style={{ marginBottom: 8 }}>
					{fieldLabel}
					<input
						type="text"
						value={String(value ?? "")}
						placeholder="UUID"
						onChange={(e) => onChange(e.target.value)}
						style={{ ...paramInputStyle, fontFamily: "monospace" }}
					/>
				</div>
			);

		case "activity-id-array": {
			const selected = Array.isArray(value) ? (value as string[]) : [];
			return (
				<div style={{ marginBottom: 8 }}>
					{fieldLabel}
					<div
						style={{
							maxHeight: 80,
							overflowY: "auto",
							border: "1px solid #e5e7eb",
							borderRadius: 4,
							padding: "4px 6px",
						}}
					>
						{allActivities.length === 0 ? (
							<span style={{ fontSize: 11, color: "#9ca3af" }}>
								No activities
							</span>
						) : (
							allActivities.map((a) => (
								<label
									key={a.id}
									style={{
										display: "flex",
										alignItems: "center",
										gap: 6,
										fontSize: 11,
										cursor: "pointer",
										padding: "1px 0",
									}}
								>
									<input
										type="checkbox"
										checked={selected.includes(a.id)}
										onChange={(e) => {
											const next = e.target.checked
												? [...selected, a.id]
												: selected.filter((x) => x !== a.id);
											onChange(next);
										}}
									/>
									{a.label || a.name}
								</label>
							))
						)}
					</div>
				</div>
			);
		}

		case "step-id-array": {
			const selected = Array.isArray(value) ? (value as string[]) : [];
			return (
				<div style={{ marginBottom: 8 }}>
					{fieldLabel}
					<div
						style={{
							maxHeight: 80,
							overflowY: "auto",
							border: "1px solid #e5e7eb",
							borderRadius: 4,
							padding: "4px 6px",
						}}
					>
						{allSteps.length === 0 ? (
							<span style={{ fontSize: 11, color: "#9ca3af" }}>No steps</span>
						) : (
							allSteps.map((s) => (
								<label
									key={s.id}
									style={{
										display: "flex",
										alignItems: "center",
										gap: 6,
										fontSize: 11,
										cursor: "pointer",
										padding: "1px 0",
									}}
								>
									<input
										type="checkbox"
										checked={selected.includes(s.id)}
										onChange={(e) => {
											const next = e.target.checked
												? [...selected, s.id]
												: selected.filter((x) => x !== s.id);
											onChange(next);
										}}
									/>
									{s.label || s.name}
								</label>
							))
						)}
					</div>
				</div>
			);
		}

		case "uuid-array": {
			const items = Array.isArray(value)
				? (value as string[]).join(", ")
				: String(value ?? "");
			return (
				<div style={{ marginBottom: 8 }}>
					{fieldLabel}
					<input
						type="text"
						value={items}
						placeholder="comma-separated UUIDs"
						onChange={(e) =>
							onChange(
								e.target.value
									.split(",")
									.map((s) => s.trim())
									.filter(Boolean),
							)
						}
						style={{ ...paramInputStyle, fontFamily: "monospace" }}
					/>
				</div>
			);
		}

		case "string-array": {
			const items = Array.isArray(value)
				? (value as string[]).join(", ")
				: String(value ?? "");
			return (
				<div style={{ marginBottom: 8 }}>
					{fieldLabel}
					<input
						type="text"
						value={items}
						placeholder="comma-separated values"
						onChange={(e) =>
							onChange(
								e.target.value
									.split(",")
									.map((s) => s.trim())
									.filter(Boolean),
							)
						}
						style={paramInputStyle}
					/>
				</div>
			);
		}

		case "object":
		default: {
			const jsonText =
				value != null
					? typeof value === "string"
						? value
						: JSON.stringify(value, null, 2)
					: "";
			return (
				<div style={{ marginBottom: 8 }}>
					{fieldLabel}
					<textarea
						value={jsonText}
						rows={3}
						onChange={(e) => {
							try {
								onChange(JSON.parse(e.target.value));
							} catch {
								// allow intermediate invalid JSON while typing
							}
						}}
						style={{
							...paramInputStyle,
							resize: "vertical",
							fontFamily: "monospace",
						}}
					/>
				</div>
			);
		}
	}
}
