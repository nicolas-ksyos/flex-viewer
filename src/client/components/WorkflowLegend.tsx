import type React from "react";

// ─────────────────────────────────────────────────────────────
// Legend items — colours and shapes mirror BLOCK_TYPE_STYLES
// in EditableWorkflowCanvas.tsx
// ─────────────────────────────────────────────────────────────

type ShapeKind = "rect" | "ellipse" | "diamond";

interface LegendItem {
	type: string;
	label: string;
	bg: string;
	border: string;
	shape: ShapeKind;
}

const LEGEND_ITEMS: LegendItem[] = [
	{
		type: "start",
		label: "Start",
		bg: "#FAFAFA",
		border: "#FF37F0",
		shape: "ellipse",
	},
	{
		type: "activity",
		label: "Activity",
		bg: "#E0E8FF",
		border: "#3C3CFF",
		shape: "rect",
	},
	{
		type: "action",
		label: "Action",
		bg: "#E0E8FF",
		border: "#3C3CFF",
		shape: "rect",
	},
	{
		type: "choice",
		label: "Choice",
		bg: "#FAFAFA",
		border: "#FF37F0",
		shape: "diamond",
	},
	{
		type: "general",
		label: "General",
		bg: "#FAFAFA",
		border: "#FF37F0",
		shape: "rect",
	},
	{
		type: "scheduled",
		label: "Scheduled",
		bg: "#FAFAFA",
		border: "#FF37F0",
		shape: "rect",
	},
	{
		type: "systemAction",
		label: "System action",
		bg: "#FAFAFA",
		border: "#FF37F0",
		shape: "rect",
	},
];

// ─────────────────────────────────────────────────────────────
// Shape indicator
// ─────────────────────────────────────────────────────────────

function ShapeIndicator({
	bg,
	border,
	shape,
}: {
	bg: string;
	border: string;
	shape: ShapeKind;
}) {
	const baseStyle: React.CSSProperties = {
		width: 14,
		height: 14,
		background: bg,
		border: `2px solid ${border}`,
		flexShrink: 0,
	};

	if (shape === "ellipse") {
		return <div style={{ ...baseStyle, borderRadius: "50%" }} />;
	}

	if (shape === "diamond") {
		return (
			<div
				style={{
					width: 14,
					height: 14,
					flexShrink: 0,
					display: "flex",
					alignItems: "center",
					justifyContent: "center",
				}}
			>
				<div
					style={{
						width: 10,
						height: 10,
						background: bg,
						border: `2px solid ${border}`,
						transform: "rotate(45deg)",
					}}
				/>
			</div>
		);
	}

	// rect (default)
	return <div style={{ ...baseStyle, borderRadius: 2 }} />;
}

// ─────────────────────────────────────────────────────────────
// WorkflowLegend — rendered by CanvasPane as a sibling to the
// toolbar, absolutely positioned below it.
// ─────────────────────────────────────────────────────────────

interface WorkflowLegendProps {
	onClose: () => void;
}

export function WorkflowLegend({ onClose }: WorkflowLegendProps) {
	return (
		<div
			style={{
				position: "absolute",
				top: 48,
				left: 12,
				zIndex: 20,
				background: "white",
				border: "1px solid var(--kds-color-gray-200, #e5e7eb)",
				borderRadius: 8,
				boxShadow: "0 4px 16px rgba(0,0,0,0.12)",
				padding: "12px 14px",
				width: 200,
			}}
		>
			{/* Header */}
			<div
				style={{
					display: "flex",
					justifyContent: "space-between",
					alignItems: "center",
					marginBottom: 10,
				}}
			>
				<span style={{ fontSize: 12, fontWeight: 600, color: "#374151" }}>
					Block types
				</span>
				<button
					onClick={onClose}
					style={{
						background: "none",
						border: "none",
						cursor: "pointer",
						fontSize: 16,
						color: "#9ca3af",
						padding: 0,
						lineHeight: 1,
					}}
					aria-label="Close legend"
				>
					×
				</button>
			</div>

			{/* Items */}
			{LEGEND_ITEMS.map((item) => (
				<div
					key={item.type}
					style={{
						display: "flex",
						alignItems: "center",
						gap: 8,
						marginBottom: 6,
					}}
				>
					<ShapeIndicator
						bg={item.bg}
						border={item.border}
						shape={item.shape}
					/>
					<span style={{ fontSize: 12, color: "#374151" }}>{item.label}</span>
				</div>
			))}
		</div>
	);
}
