import type React from "react";

// ─────────────────────────────────────────────────────────────
// Block legend items — colours and shapes mirror BLOCK_TYPE_STYLES
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
// Connection legend items — line types from TransitionLines
// ─────────────────────────────────────────────────────────────

interface ConnectionItem {
	label: string;
	color: string;
}

const CONNECTION_ITEMS: ConnectionItem[] = [
	{ label: "Synchronous", color: "#FF37F0" },
	{ label: "Async", color: "#FF9A1E" },
	{ label: "Disable", color: "#EE1111" },
];

// ─────────────────────────────────────────────────────────────
// Line indicator — small SVG arrow for connection entries
// ─────────────────────────────────────────────────────────────

function LineIndicator({ color }: { color: string }) {
	const markerId = `leg-arrow-${color.replace("#", "")}`;
	return (
		<svg
			width="36"
			height="14"
			viewBox="0 0 36 14"
			style={{ flexShrink: 0, display: "block" }}
		>
			<defs>
				<marker
					id={markerId}
					markerWidth="6"
					markerHeight="5"
					refX="5"
					refY="2.5"
					orient="auto"
				>
					<polygon points="0 0, 6 2.5, 0 5" fill={color} />
				</marker>
			</defs>
			<line
				x1="2"
				y1="7"
				x2="30"
				y2="7"
				stroke={color}
				strokeWidth="2"
				markerEnd={`url(#${markerId})`}
			/>
		</svg>
	);
}

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
				minWidth: 420,
			}}
		>
			{/* Header */}
			<div
				style={{
					display: "flex",
					justifyContent: "space-between",
					alignItems: "center",
					marginBottom: 12,
				}}
			>
				<span style={{ fontSize: 12, fontWeight: 600, color: "#374151" }}>
					Legend
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

			{/* Two-column body */}
			<div style={{ display: "flex", gap: 20, alignItems: "flex-start" }}>
				{/* Left column — Block types */}
				<div style={{ minWidth: 140 }}>
					<div
						style={{
							fontSize: 11,
							fontWeight: 600,
							color: "#6b7280",
							textTransform: "uppercase",
							letterSpacing: "0.05em",
							marginBottom: 8,
						}}
					>
						Block types
					</div>
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
							<span style={{ fontSize: 12, color: "#374151" }}>
								{item.label}
							</span>
						</div>
					))}
				</div>

				{/* Vertical divider */}
				<div
					style={{
						width: 1,
						background: "#e5e7eb",
						alignSelf: "stretch",
						flexShrink: 0,
					}}
				/>

				{/* Right column — Connections */}
				<div style={{ minWidth: 160 }}>
					<div
						style={{
							fontSize: 11,
							fontWeight: 600,
							color: "#6b7280",
							textTransform: "uppercase",
							letterSpacing: "0.05em",
							marginBottom: 8,
						}}
					>
						Connections
					</div>
					{CONNECTION_ITEMS.map((item) => (
						<div
							key={item.label}
							style={{
								display: "flex",
								alignItems: "center",
								gap: 8,
								marginBottom: 6,
							}}
						>
							<LineIndicator color={item.color} />
							<span style={{ fontSize: 12, color: "#374151" }}>
								{item.label}
							</span>
						</div>
					))}
				</div>
			</div>
		</div>
	);
}
