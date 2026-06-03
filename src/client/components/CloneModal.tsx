import { useState, useEffect } from "react";

interface CloneModalProps {
	sourceFileName: string;
	onClone: (newFileName: string) => Promise<void>;
	onCancel: () => void;
	pendingChangesCount?: number; // number of steps with unsaved changes
}

export function CloneModal({
	sourceFileName,
	onClone,
	onCancel,
	pendingChangesCount,
}: CloneModalProps) {
	const [newName, setNewName] = useState(sourceFileName);
	const [loading, setLoading] = useState(false);
	const [error, setError] = useState<string | null>(null);

	const trimmed = newName.trim();
	const isValid = trimmed !== "" && trimmed !== sourceFileName;

	const handleClone = async () => {
		if (!isValid) return;
		setLoading(true);
		setError(null);
		try {
			await onClone(trimmed);
		} catch (err) {
			setError(err instanceof Error ? err.message : "Clone failed");
		} finally {
			setLoading(false);
		}
	};

	// Close on Escape
	useEffect(() => {
		const handler = (e: KeyboardEvent) => {
			if (e.key === "Escape") onCancel();
		};
		window.addEventListener("keydown", handler);
		return () => window.removeEventListener("keydown", handler);
	}, [onCancel]);

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
					minWidth: 400,
					maxWidth: 520,
					width: "90vw",
				}}
				// Prevent backdrop click from firing when clicking inside dialog
				onClick={(e) => e.stopPropagation()}
			>
				<h2
					style={{
						margin: "0 0 16px",
						fontSize: 16,
						fontWeight: 600,
						color: "#111827",
					}}
				>
					Enter name for the seed file
				</h2>

				<input
					type="text"
					value={newName}
					onChange={(e) => setNewName(e.target.value)}
					onKeyDown={(e) => {
						if (e.key === "Enter" && isValid && !loading) handleClone();
					}}
					autoFocus
					style={{
						width: "100%",
						padding: "8px 12px",
						fontSize: 14,
						border: `1px solid ${error ? "#ef4444" : "#d1d5db"}`,
						borderRadius: 6,
						boxSizing: "border-box",
						outline: "none",
						color: "#111827",
					}}
				/>

				{pendingChangesCount !== undefined && pendingChangesCount > 0 && (
					<div
						style={{
							marginTop: 10,
							padding: "8px 12px",
							background: "#fffbeb",
							border: "1px solid #fde68a",
							borderRadius: 6,
							display: "flex",
							gap: 8,
							alignItems: "flex-start",
						}}
					>
						<span style={{ fontSize: 16, lineHeight: 1.2, flexShrink: 0 }}>
							⚠️
						</span>
						<span style={{ fontSize: 13, color: "#92400e", lineHeight: 1.4 }}>
							You have{" "}
							<strong>
								{pendingChangesCount} unsaved change
								{pendingChangesCount !== 1 ? "s" : ""}
							</strong>
							. These will be transferred to the clone.
						</span>
					</div>
				)}

				{error && (
					<p
						style={{
							color: "#ef4444",
							fontSize: 13,
							margin: "8px 0 0",
						}}
					>
						{error}
					</p>
				)}

				<div
					style={{
						display: "flex",
						justifyContent: "flex-end",
						gap: 8,
						marginTop: 20,
					}}
				>
					<button
						onClick={onCancel}
						disabled={loading}
						style={{
							padding: "8px 16px",
							borderRadius: 6,
							border: "1px solid #d1d5db",
							cursor: loading ? "not-allowed" : "pointer",
							background: "white",
							color: "#374151",
							fontSize: 14,
							opacity: loading ? 0.6 : 1,
						}}
					>
						Cancel
					</button>

					<button
						onClick={handleClone}
						disabled={!isValid || loading}
						style={{
							padding: "8px 16px",
							borderRadius: 6,
							border: "none",
							cursor: !isValid || loading ? "not-allowed" : "pointer",
							background: "#3b82f6",
							color: "white",
							fontSize: 14,
							fontWeight: 500,
							opacity: !isValid || loading ? 0.5 : 1,
						}}
					>
						{loading ? "Cloning…" : "Clone"}
					</button>
				</div>
			</div>
		</>
	);
}
