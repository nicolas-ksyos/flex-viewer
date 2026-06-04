import { useState, useEffect, useCallback } from "react";
import type {
	ParsedWorkflowStep,
	ParsedWorkflowTransition,
	NewTransitionDraft,
} from "../../../shared/types";

// ─────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────

interface AddTransitionModalProps {
	existingSteps: ParsedWorkflowStep[];
	existingTransitions: ParsedWorkflowTransition[];
	newStepDrafts?: { tempId: string; name: string }[];
	onAdd: (draft: Omit<NewTransitionDraft, "kind">) => void;
	onCancel: () => void;
}

// ─────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────

function stepLabel(
	step: ParsedWorkflowStep | { tempId: string; name: string } | undefined,
): string {
	if (!step) return "(unknown)";
	if ("id" in step) return step.name;
	return step.name;
}

function resolveStepName(
	stepId: string,
	allSteps: Array<ParsedWorkflowStep | { tempId: string; name: string }>,
): string {
	const s = allSteps.find((s) =>
		"id" in s ? s.id === stepId : s.tempId === stepId,
	);
	if (!s) return `(${stepId.slice(0, 8)}…)`;
	return "id" in s ? s.name : s.name;
}

// ─────────────────────────────────────────────────────────────
// Sub-components
// ─────────────────────────────────────────────────────────────

interface ExistingTransitionsPanelProps {
	fromStepId: string;
	existingTransitions: ParsedWorkflowTransition[];
	allSteps: Array<ParsedWorkflowStep | { tempId: string; name: string }>;
}

function ExistingTransitionsPanel({
	fromStepId,
	existingTransitions,
	allSteps,
}: ExistingTransitionsPanelProps) {
	const outgoing = existingTransitions.filter(
		(t) => t.fromStepId === fromStepId,
	);
	const disableTransitions = outgoing.filter((t) => t.type === "disable");
	const otherTransitions = outgoing.filter((t) => t.type !== "disable");

	if (outgoing.length === 0) {
		return (
			<p
				style={{
					margin: 0,
					fontSize: 12,
					color: "#9ca3af",
					fontStyle: "italic",
				}}
			>
				No existing connections from this step.
			</p>
		);
	}

	return (
		<div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
			{disableTransitions.length > 0 && (
				<div>
					<p
						style={{
							margin: "0 0 4px",
							fontSize: 11,
							fontWeight: 600,
							color: "#EE1111",
							textTransform: "uppercase",
							letterSpacing: "0.04em",
						}}
					>
						Existing disable transitions
					</p>
					<div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
						{disableTransitions.map((t) => (
							<div
								key={t.id}
								style={{
									display: "flex",
									alignItems: "center",
									gap: 6,
									fontSize: 12,
									color: "#EE1111",
								}}
							>
								<span style={{ flexShrink: 0 }}>⊘</span>
								<span>{resolveStepName(t.toStepId, allSteps)}</span>
								<span
									style={{
										fontSize: 10,
										color: "#fca5a5",
										fontStyle: "italic",
									}}
								>
									(already disabled)
								</span>
							</div>
						))}
					</div>
				</div>
			)}

			{otherTransitions.length > 0 && (
				<div>
					<p
						style={{
							margin: "0 0 4px",
							fontSize: 11,
							fontWeight: 600,
							color: "#6b7280",
							textTransform: "uppercase",
							letterSpacing: "0.04em",
						}}
					>
						All connections from this step
					</p>
					<div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
						{outgoing.map((t) => {
							const isDisable = t.type === "disable";
							return (
								<div
									key={t.id}
									style={{
										display: "flex",
										alignItems: "center",
										gap: 6,
										fontSize: 12,
										color: isDisable ? "#EE1111" : "#374151",
									}}
								>
									<span style={{ flexShrink: 0 }}>{isDisable ? "⊘" : "→"}</span>
									<span>{resolveStepName(t.toStepId, allSteps)}</span>
									<span
										style={{
											fontSize: 10,
											color: "#9ca3af",
											fontStyle: "italic",
										}}
									>
										[
										{isDisable
											? "disable"
											: t.synchronous
												? "sync, enable"
												: "async, enable"}
										]
									</span>
								</div>
							);
						})}
					</div>
				</div>
			)}
		</div>
	);
}

// ─────────────────────────────────────────────────────────────
// Main component
// ─────────────────────────────────────────────────────────────

export function AddTransitionModal({
	existingSteps,
	existingTransitions,
	newStepDrafts = [],
	onAdd,
	onCancel,
}: AddTransitionModalProps) {
	const [fromStepId, setFromStepId] = useState<string>("");
	const [toStepIds, setToStepIds] = useState<Set<string>>(new Set());

	// ── All selectable steps ──────────────────────────────────
	const allSteps: Array<ParsedWorkflowStep | { tempId: string; name: string }> =
		[...existingSteps, ...newStepDrafts];

	// ── Close on Escape ──────────────────────────────────────
	useEffect(() => {
		const handler = (e: KeyboardEvent) => {
			if (e.key === "Escape") onCancel();
		};
		window.addEventListener("keydown", handler);
		return () => window.removeEventListener("keydown", handler);
	}, [onCancel]);

	// ── Target step toggle ────────────────────────────────────
	const toggleToStep = useCallback((id: string) => {
		setToStepIds((prev) => {
			const next = new Set(prev);
			if (next.has(id)) {
				next.delete(id);
			} else {
				next.add(id);
			}
			return next;
		});
	}, []);

	// When from-step changes, remove it from toStepIds if present
	const handleFromChange = (id: string) => {
		setFromStepId(id);
		setToStepIds((prev) => {
			if (!prev.has(id)) return prev;
			const next = new Set(prev);
			next.delete(id);
			return next;
		});
	};

	// ── Validation ────────────────────────────────────────────
	const isValid = fromStepId !== "" && toStepIds.size > 0;

	// ── Add handler ───────────────────────────────────────────
	const handleAdd = () => {
		if (!isValid) return;
		const tempId = `new-trans-${Date.now()}`;
		onAdd({ tempId, fromStepId, toStepIds: Array.from(toStepIds) });
	};

	// ── Determine target steps (all except from-step) ─────────
	const targetableSteps = allSteps.filter((s) => {
		const id = "id" in s ? s.id : s.tempId;
		return id !== fromStepId;
	});

	// ── Existing-disable set for "already disabled" hint ─────
	const alreadyDisabledIds = new Set(
		existingTransitions
			.filter((t) => t.fromStepId === fromStepId && t.type === "disable")
			.map((t) => t.toStepId),
	);

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
					width: 480,
					maxWidth: "92vw",
					maxHeight: "90vh",
					overflowY: "auto",
					display: "flex",
					flexDirection: "column",
					gap: 16,
				}}
			>
				{/* Title */}
				<h2
					style={{
						margin: 0,
						fontSize: 16,
						fontWeight: 600,
						color: "#111827",
					}}
				>
					Add disable transition
				</h2>

				{/* Warning banner */}
				<div
					style={{
						padding: "10px 12px",
						background: "#fff1f2",
						border: "1px solid #fecaca",
						borderRadius: 6,
						display: "flex",
						gap: 8,
						alignItems: "flex-start",
					}}
				>
					<span style={{ fontSize: 15, lineHeight: 1.2, flexShrink: 0 }}>
						⊘
					</span>
					<span style={{ fontSize: 13, color: "#991b1b", lineHeight: 1.5 }}>
						When the source step completes, it will{" "}
						<strong>prevent the target step(s) from executing</strong>. Shown as{" "}
						<span style={{ color: "#EE1111", fontWeight: 600 }}>
							red arrows
						</span>{" "}
						on the canvas.
					</span>
				</div>

				{/* From step */}
				<div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
					<label style={{ fontSize: 13, fontWeight: 500, color: "#374151" }}>
						When this step completes…
					</label>
					<select
						value={fromStepId}
						onChange={(e) => handleFromChange(e.target.value)}
						style={{
							padding: "8px 10px",
							fontSize: 13,
							border: "1px solid #d1d5db",
							borderRadius: 6,
							background: "white",
							color: fromStepId ? "#111827" : "#9ca3af",
							outline: "none",
							width: "100%",
							boxSizing: "border-box",
						}}
					>
						<option value="">— select a step —</option>
						{allSteps.map((s) => {
							const id = "id" in s ? s.id : s.tempId;
							return (
								<option key={id} value={id}>
									{stepLabel(s)}
									{"id" in s
										? ` (${s.displayOptions.x}, ${s.displayOptions.y})`
										: " (new)"}
								</option>
							);
						})}
					</select>
				</div>

				{/* Existing transitions panel — shown when a from-step is selected */}
				{fromStepId && (
					<div
						style={{
							padding: "10px 12px",
							background: "#f9fafb",
							border: "1px solid #e5e7eb",
							borderRadius: 6,
							fontSize: 12,
						}}
					>
						<p
							style={{
								margin: "0 0 8px",
								fontSize: 12,
								fontWeight: 600,
								color: "#374151",
							}}
						>
							Existing connections from "{resolveStepName(fromStepId, allSteps)}
							"
						</p>
						<ExistingTransitionsPanel
							fromStepId={fromStepId}
							existingTransitions={existingTransitions}
							allSteps={allSteps}
						/>
					</div>
				)}

				{/* Target steps */}
				<div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
					<label style={{ fontSize: 13, fontWeight: 500, color: "#374151" }}>
						…disable these steps
					</label>
					{!fromStepId ? (
						<p
							style={{
								margin: 0,
								fontSize: 12,
								color: "#9ca3af",
								fontStyle: "italic",
							}}
						>
							Select a source step first.
						</p>
					) : targetableSteps.length === 0 ? (
						<p
							style={{
								margin: 0,
								fontSize: 12,
								color: "#9ca3af",
								fontStyle: "italic",
							}}
						>
							No other steps available.
						</p>
					) : (
						<div
							style={{
								border: "1px solid #d1d5db",
								borderRadius: 6,
								maxHeight: 200,
								overflowY: "auto",
							}}
						>
							{targetableSteps.map((s) => {
								const id = "id" in s ? s.id : s.tempId;
								const checked = toStepIds.has(id);
								const alreadyDisabled = alreadyDisabledIds.has(id);

								return (
									<label
										key={id}
										style={{
											display: "flex",
											alignItems: "center",
											gap: 10,
											padding: "8px 12px",
											cursor: "pointer",
											borderBottom: "1px solid #f3f4f6",
											background: checked ? "#fff1f2" : "white",
											transition: "background 0.1s",
										}}
									>
										<input
											type="checkbox"
											checked={checked}
											onChange={() => toggleToStep(id)}
											style={{ flexShrink: 0, accentColor: "#EE1111" }}
										/>
										<div
											style={{
												flex: 1,
												minWidth: 0,
												display: "flex",
												flexDirection: "column",
												gap: 1,
											}}
										>
											<span
												style={{
													fontSize: 13,
													color: "#111827",
													overflow: "hidden",
													textOverflow: "ellipsis",
													whiteSpace: "nowrap",
												}}
											>
												{stepLabel(s)}
											</span>
											{"id" in s && (
												<span style={{ fontSize: 11, color: "#9ca3af" }}>
													x:{s.displayOptions.x}, y:{s.displayOptions.y}
												</span>
											)}
										</div>
										{alreadyDisabled && (
											<span
												style={{
													fontSize: 10,
													color: "#EE1111",
													fontStyle: "italic",
													flexShrink: 0,
												}}
											>
												already disabled
											</span>
										)}
									</label>
								);
							})}
						</div>
					)}
				</div>

				{/* Summary of selection */}
				{toStepIds.size > 0 && (
					<div
						style={{
							padding: "8px 12px",
							background: "#fff1f2",
							border: "1px solid #fecaca",
							borderRadius: 6,
							fontSize: 12,
							color: "#991b1b",
						}}
					>
						<strong>{resolveStepName(fromStepId, allSteps)}</strong> will
						disable{" "}
						{Array.from(toStepIds)
							.map((id) => (
								<strong key={id}>{resolveStepName(id, allSteps)}</strong>
							))
							.reduce<React.ReactNode[]>((acc, el, i) => {
								if (i === 0) return [el];
								return [...acc, ", ", el];
							}, [])}
						.
					</div>
				)}

				{/* Footer */}
				<div
					style={{
						display: "flex",
						justifyContent: "flex-end",
						gap: 8,
						paddingTop: 4,
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
							background: isValid ? "#EE1111" : "#fca5a5",
							color: "white",
							fontSize: 14,
							fontWeight: 500,
							transition: "background 0.15s",
						}}
					>
						Add
					</button>
				</div>
			</div>
		</>
	);
}
