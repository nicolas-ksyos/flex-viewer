import { useEffect, useRef } from "react";
import type {
	ParsedWorkflowTransition,
	ParsedWorkflowStep,
} from "../../../shared/types";

interface ConnectionContextMenuProps {
	transition: ParsedWorkflowTransition;
	/** Canvas-relative position to anchor the menu */
	position: { x: number; y: number };
	allSteps: ParsedWorkflowStep[];
	onEdit: () => void;
	onDelete: () => void;
	onClose: () => void;
}

export function ConnectionContextMenu({
	transition,
	position,
	allSteps,
	onEdit,
	onDelete,
	onClose,
}: ConnectionContextMenuProps) {
	const ref = useRef<HTMLDivElement>(null);

	// Close on outside click
	useEffect(() => {
		const handler = (e: MouseEvent) => {
			if (ref.current && !ref.current.contains(e.target as Node)) onClose();
		};
		document.addEventListener("mousedown", handler, true);
		return () => document.removeEventListener("mousedown", handler, true);
	}, [onClose]);

	// Close on Escape
	useEffect(() => {
		const h = (e: KeyboardEvent) => {
			if (e.key === "Escape") onClose();
		};
		window.addEventListener("keydown", h);
		return () => window.removeEventListener("keydown", h);
	}, [onClose]);

	const fromStep = allSteps.find((s) => s.id === transition.fromStepId);
	const toStep = allSteps.find((s) => s.id === transition.toStepId);
	const typeColor =
		transition.type === "disable"
			? "#EE1111"
			: transition.synchronous
				? "#FF37F0"
				: "#FF9A1E";
	const typeLabel =
		transition.type === "disable"
			? "disable"
			: transition.synchronous
				? "sync"
				: "async";

	return (
		<div
			ref={ref}
			style={{
				position: "absolute",
				top: position.y + 4,
				left: position.x + 4,
				zIndex: 300,
				background: "white",
				border: "1px solid #e5e7eb",
				borderRadius: 8,
				boxShadow: "0 8px 24px rgba(0,0,0,0.12)",
				minWidth: 200,
				overflow: "hidden",
			}}
		>
			{/* Header */}
			<div
				style={{
					padding: "8px 12px",
					background: "#f9fafb",
					borderBottom: "1px solid #e5e7eb",
					fontSize: 11,
				}}
			>
				<div style={{ fontWeight: 600, color: "#374151", marginBottom: 2 }}>
					{fromStep?.name ?? transition.fromStepId}
					<span style={{ color: typeColor, margin: "0 6px" }}>→</span>
					{toStep?.name ?? transition.toStepId}
				</div>
				<div style={{ color: typeColor, fontSize: 10 }}>[{typeLabel}]</div>
			</div>

			{/* Edit action */}
			<button
				onClick={() => {
					onEdit();
					onClose();
				}}
				style={{
					display: "block",
					width: "100%",
					padding: "9px 12px",
					textAlign: "left",
					background: "none",
					border: "none",
					borderBottom: "1px solid #f3f4f6",
					cursor: "pointer",
					fontSize: 13,
					color: "#374151",
				}}
				onMouseEnter={(e) =>
					((e.currentTarget as HTMLButtonElement).style.background = "#f3f4f6")
				}
				onMouseLeave={(e) =>
					((e.currentTarget as HTMLButtonElement).style.background = "none")
				}
			>
				✏️ Edit connection
			</button>

			{/* Delete action */}
			<button
				onClick={() => {
					onDelete();
					onClose();
				}}
				style={{
					display: "block",
					width: "100%",
					padding: "9px 12px",
					textAlign: "left",
					background: "none",
					border: "none",
					cursor: "pointer",
					fontSize: 13,
					color: "#EE1111",
				}}
				onMouseEnter={(e) =>
					((e.currentTarget as HTMLButtonElement).style.background = "#fef2f2")
				}
				onMouseLeave={(e) =>
					((e.currentTarget as HTMLButtonElement).style.background = "none")
				}
			>
				🗑️ Delete connection
			</button>
		</div>
	);
}
