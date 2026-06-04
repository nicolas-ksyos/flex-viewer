import { useState, useEffect } from "react";
import type {
	ParsedWorkflowStep,
	ParsedWorkflowTransition,
	NewConnectionDraft,
} from "../../../shared/types";

// ─────────────────────────────────────────────────────────────
// Props
// ─────────────────────────────────────────────────────────────

interface AddConnectionModalProps {
	existingSteps: ParsedWorkflowStep[];
	existingTransitions: ParsedWorkflowTransition[];
	/** New step drafts that are also selectable as from/to targets */
	newStepDrafts?: Array<{ tempId: string; name: string }>;
	onAdd: (draft: Omit<NewConnectionDraft, "kind">) => void;
	onCancel: () => void;
}

// ─────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────

interface StepOption {
	id: string;
	name: string;
	label?: string;
	isNew?: boolean;
}

function buildStepOptions(
	existingSteps: ParsedWorkflowStep[],
	newStepDrafts: Array<{ tempId: string; name: string }> | undefined,
): StepOption[] {
	const opts: StepOption[] = existingSteps.map((s) => ({
		id: s.id,
		name: s.name,
		label: s.label !== s.name ? s.label : undefined,
	}));
	for (const d of newStepDrafts ?? []) {
		opts.push({ id: d.tempId, name: d.name, isNew: true });
	}
	return opts;
}

function transitionTag(t: ParsedWorkflowTransition): string {
	const sync = t.synchronous ? "sync" : "async";
	const type = t.type === "disable" ? "disable" : "enable";
	return `${sync}, ${type}`;
}

// ─────────────────────────────────────────────────────────────
// Shared styles
// ─────────────────────────────────────────────────────────────

const labelStyle: React.CSSProperties = {
	display: "block",
	fontSize: 12,
	fontWeight: 600,
	color: "#374151",
	marginBottom: 4,
};

const selectStyle: React.CSSProperties = {
	width: "100%",
	padding: "7px 10px",
	fontSize: 13,
	border: "1px solid #d1d5db",
	borderRadius: 6,
	background: "white",
	color: "#111827",
	outline: "none",
};

const sectionStyle: React.CSSProperties = {
	marginBottom: 16,
};

// ─────────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────────

export function AddConnectionModal({
	existingSteps,
	existingTransitions,
	newStepDrafts,
	onAdd,
	onCancel,
}: AddConnectionModalProps) {
	const [fromStepId, setFromStepId] = useState("");
	const [toStepIds, setToStepIds] = useState<string[]>([]);
	const [synchronous, setSynchronous] = useState(false);

	// Close on Escape
	useEffect(() => {
		const handler = (e: KeyboardEvent) => {
			if (e.key === "Escape") onCancel();
		};
		window.addEventListener("keydown", handler);
		return () => window.removeEventListener("keydown", handler);
	}, [onCancel]);

	// Reset to-step selection when from-step changes
	useEffect(() => {
		setToStepIds([]);
	}, [fromStepId]);

	const allStepOptions = buildStepOptions(existingSteps, newStepDrafts);

	// To-step candidates: all steps except the selected from-step
	const toStepOptions = allStepOptions.filter((s) => s.id !== fromStepId);

	// Existing transitions from the selected from-step
	const existingFromTransitions = fromStepId
		? existingTransitions.filter((t) => t.fromStepId === fromStepId)
		: [];

	const stepNameById = new Map(allStepOptions.map((s) => [s.id, s.name]));

	const isValid = fromStepId !== "" && toStepIds.length > 0;

	function toggleToStep(stepId: string) {
		setToStepIds((prev) =>
			prev.includes(stepId)
				? prev.filter((id) => id !== stepId)
				: [...prev, stepId],
		);
	}

	function handleAdd() {
		if (!isValid) return;
		const tempId = `new-conn-${Date.now()}`;
		onAdd({ tempId, fromStepId, toStepIds, synchronous });
	}

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
					minWidth: 440,
					maxWidth: 560,
					width: "90vw",
					maxHeight: "90vh",
					overflowY: "auto",
					display: "flex",
					flexDirection: "column",
					gap: 0,
				}}
				onClick={(e) => e.stopPropagation()}
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
					Add connection
				</h2>

				{/* From step */}
				<div style={sectionStyle}>
					<label style={labelStyle}>From step</label>
					<select
						value={fromStepId}
						onChange={(e) => setFromStepId(e.target.value)}
						style={selectStyle}
						autoFocus
					>
						<option value="">— Select source step —</option>
						{allStepOptions.map((s) => (
							<option key={s.id} value={s.id}>
								{s.name}
								{s.isNew ? " (new)" : ""}
							</option>
						))}
					</select>
				</div>

				{/* Existing connections panel */}
				{fromStepId !== "" && (
					<div
						style={{
							...sectionStyle,
							background: "#f9fafb",
							border: "1px solid #e5e7eb",
							borderRadius: 6,
							padding: "10px 12px",
						}}
					>
						<p
							style={{
								margin: "0 0 6px",
								fontSize: 11,
								fontWeight: 600,
								color: "#6b7280",
								textTransform: "uppercase",
								letterSpacing: "0.04em",
							}}
						>
							Existing connections from &ldquo;
							{stepNameById.get(fromStepId) ?? fromStepId}&rdquo;
						</p>
						{existingFromTransitions.length === 0 ? (
							<p style={{ margin: 0, fontSize: 12, color: "#9ca3af" }}>
								No existing connections
							</p>
						) : (
							<ul
								style={{
									margin: 0,
									padding: 0,
									listStyle: "none",
									display: "flex",
									flexDirection: "column",
									gap: 3,
								}}
							>
								{existingFromTransitions.map((t) => {
									const isDisable = t.type === "disable";
									return (
										<li
											key={t.id}
											style={{
												display: "flex",
												alignItems: "center",
												gap: 6,
												fontSize: 12,
											}}
										>
											<span
												style={{
													color: isDisable ? "#EE1111" : "#6b7280",
													fontWeight: 600,
													fontSize: 13,
												}}
											>
												{isDisable ? "⊘" : "→"}
											</span>
											<span
												style={{ color: isDisable ? "#EE1111" : "#111827" }}
											>
												{stepNameById.get(t.toStepId) ?? t.toStepId}
											</span>
											<span
												style={{
													fontSize: 10,
													color: isDisable ? "#EE1111" : "#9ca3af",
													background: isDisable ? "#fee2e2" : "#f3f4f6",
													borderRadius: 4,
													padding: "1px 5px",
												}}
											>
												{transitionTag(t)}
											</span>
										</li>
									);
								})}
							</ul>
						)}
					</div>
				)}

				{/* To step(s) */}
				<div style={sectionStyle}>
					<label style={labelStyle}>
						To step(s)
						<span
							style={{
								fontWeight: 400,
								color: "#9ca3af",
								marginLeft: 4,
							}}
						>
							(select one or more)
						</span>
					</label>
					{toStepOptions.length === 0 ? (
						<p style={{ fontSize: 12, color: "#9ca3af", margin: 0 }}>
							{fromStepId
								? "No other steps available"
								: "Select a source step first"}
						</p>
					) : (
						<div
							style={{
								border: "1px solid #d1d5db",
								borderRadius: 6,
								maxHeight: 180,
								overflowY: "auto",
								background: "white",
							}}
						>
							{toStepOptions.map((s, idx) => {
								const checked = toStepIds.includes(s.id);
								return (
									<label
										key={s.id}
										style={{
											display: "flex",
											alignItems: "center",
											gap: 8,
											padding: "7px 10px",
											cursor: fromStepId ? "pointer" : "default",
											borderTop: idx > 0 ? "1px solid #f3f4f6" : undefined,
											background: checked ? "#eff6ff" : "transparent",
										}}
									>
										<input
											type="checkbox"
											checked={checked}
											disabled={!fromStepId}
											onChange={() => toggleToStep(s.id)}
											style={{ margin: 0, cursor: "pointer" }}
										/>
										<span
											style={{
												fontSize: 13,
												color: "#111827",
												flex: 1,
											}}
										>
											{s.name}
											{s.isNew && (
												<span
													style={{
														marginLeft: 6,
														fontSize: 10,
														background: "#dcfce7",
														color: "#166534",
														borderRadius: 4,
														padding: "1px 5px",
														fontWeight: 600,
													}}
												>
													NEW
												</span>
											)}
										</span>
									</label>
								);
							})}
						</div>
					)}
				</div>

				{/* Synchronous toggle */}
				<div
					style={{
						...sectionStyle,
						display: "flex",
						alignItems: "flex-start",
						gap: 8,
					}}
				>
					<input
						id="sync-toggle"
						type="checkbox"
						checked={synchronous}
						onChange={(e) => setSynchronous(e.target.checked)}
						style={{ marginTop: 2, cursor: "pointer" }}
					/>
					<label
						htmlFor="sync-toggle"
						style={{ fontSize: 13, color: "#374151", cursor: "pointer" }}
					>
						<strong>Synchronous</strong> — fires immediately when the source
						step completes (uses{" "}
						<code
							style={{
								fontSize: 11,
								background: "#f3f4f6",
								padding: "1px 4px",
								borderRadius: 3,
							}}
						>
							synchronousNextSteps
						</code>
						)
					</label>
				</div>

				{/* Footer */}
				<div
					style={{
						display: "flex",
						justifyContent: "flex-end",
						gap: 8,
						marginTop: 8,
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
