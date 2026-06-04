import { useEffect, useState } from "react";
import type {
	ParsedWorkflowTransition,
	ParsedWorkflowStep,
	NewConnectionDraft,
	NewTransitionDraft,
	RemovedConnectionDraft,
} from "../../../shared/types";

export interface ConnectionEditResult {
	removal: Omit<RemovedConnectionDraft, "kind">;
	/** Set when the new connection is of enable type */
	newConnection?: Omit<NewConnectionDraft, "kind">;
	/** Set when the new connection is of disable type */
	newTransition?: Omit<NewTransitionDraft, "kind">;
}

interface ConnectionEditModalProps {
	transition: ParsedWorkflowTransition;
	allSteps: ParsedWorkflowStep[];
	onSave: (result: ConnectionEditResult) => void;
	onCancel: () => void;
}

export function ConnectionEditModal({
	transition,
	allSteps,
	onSave,
	onCancel,
}: ConnectionEditModalProps) {
	const [transitionType, setTransitionType] = useState<"enable" | "disable">(
		transition.type === "disable" ? "disable" : "enable",
	);
	const [synchronous, setSynchronous] = useState(transition.synchronous);
	const [onlyIfOutputEquals, setOnlyIfOutputEquals] = useState(
		transition.onlyIfOutputEquals ?? "",
	);

	// Close on Escape
	useEffect(() => {
		const h = (e: KeyboardEvent) => {
			if (e.key === "Escape") onCancel();
		};
		window.addEventListener("keydown", h);
		return () => window.removeEventListener("keydown", h);
	}, [onCancel]);

	const fromStep = allSteps.find((s) => s.id === transition.fromStepId);
	const toStep = allSteps.find((s) => s.id === transition.toStepId);

	const handleSave = () => {
		const removal: Omit<RemovedConnectionDraft, "kind"> = {
			tempId: `rm-edit-${Date.now()}`,
			fromStepId: transition.fromStepId,
			fromStepName: fromStep?.name ?? "",
			fromVariableName: fromStep?.variableName ?? "",
			toStepId: transition.toStepId,
			toStepName: toStep?.name ?? "",
			toVariableName: toStep?.variableName ?? "",
			synchronous: transition.synchronous,
			isDisable: transition.type === "disable",
		};

		const result: ConnectionEditResult = { removal };

		if (transitionType === "disable") {
			result.newTransition = {
				tempId: `new-edit-${Date.now()}`,
				fromStepId: transition.fromStepId,
				toStepIds: [transition.toStepId],
			};
		} else {
			result.newConnection = {
				tempId: `new-edit-${Date.now()}`,
				fromStepId: transition.fromStepId,
				toStepIds: [transition.toStepId],
				synchronous,
			};
		}

		onSave(result);
		onCancel();
	};

	const inputStyle: React.CSSProperties = {
		width: "100%",
		padding: "6px 8px",
		borderRadius: 6,
		border: "1px solid #d1d5db",
		fontSize: 13,
		boxSizing: "border-box",
		background: "white",
	};

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
					transform: "translate(-50%,-50%)",
					zIndex: 1001,
					background: "white",
					borderRadius: 12,
					boxShadow: "0 20px 48px rgba(0,0,0,0.2)",
					padding: 24,
					minWidth: 380,
					maxWidth: 480,
				}}
			>
				<h2 style={{ margin: "0 0 4px", fontSize: 16, fontWeight: 600 }}>
					Edit connection
				</h2>
				<p style={{ margin: "0 0 16px", fontSize: 12, color: "#6b7280" }}>
					{fromStep?.name ?? transition.fromStepId}
					{" → "}
					{toStep?.name ?? transition.toStepId}
				</p>

				{/* Type selector */}
				<div style={{ marginBottom: 14 }}>
					<label
						style={{
							display: "block",
							fontSize: 12,
							color: "#374151",
							marginBottom: 4,
							fontWeight: 500,
						}}
					>
						Connection type
					</label>
					<select
						value={transitionType}
						onChange={(e) =>
							setTransitionType(e.target.value as "enable" | "disable")
						}
						style={inputStyle}
					>
						<option value="enable">Enable — trigger the target step</option>
						<option value="disable">Disable — prevent the target step</option>
					</select>
				</div>

				{/* Synchronous toggle — only for enable */}
				{transitionType === "enable" && (
					<div style={{ marginBottom: 14 }}>
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
								checked={synchronous}
								onChange={(e) => setSynchronous(e.target.checked)}
								style={{ width: 14, height: 14 }}
							/>
							Synchronous (fires immediately when step completes)
						</label>
					</div>
				)}

				{/* onlyIfOutputEquals — only for enable */}
				{transitionType === "enable" && (
					<div style={{ marginBottom: 20 }}>
						<label
							style={{
								display: "block",
								fontSize: 12,
								color: "#374151",
								marginBottom: 4,
								fontWeight: 500,
							}}
						>
							Only if output equals{" "}
							<span style={{ fontWeight: 400, color: "#9ca3af" }}>
								(optional)
							</span>
						</label>
						<input
							type="text"
							value={onlyIfOutputEquals}
							onChange={(e) => setOnlyIfOutputEquals(e.target.value)}
							placeholder="e.g. true, false — leave empty for unconditional"
							style={inputStyle}
						/>
					</div>
				)}

				{/* Footer buttons */}
				<div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
					<button
						onClick={onCancel}
						style={{
							padding: "8px 16px",
							borderRadius: 6,
							border: "1px solid #d1d5db",
							background: "white",
							cursor: "pointer",
							fontSize: 14,
							color: "#374151",
						}}
					>
						Cancel
					</button>
					<button
						onClick={handleSave}
						style={{
							padding: "8px 16px",
							borderRadius: 6,
							border: "none",
							background: "#3b82f6",
							color: "white",
							cursor: "pointer",
							fontSize: 14,
							fontWeight: 500,
						}}
					>
						Save
					</button>
				</div>
			</div>
		</>
	);
}
