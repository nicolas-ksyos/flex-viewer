import type React from "react";

// ─────────────────────────────────────────────────────────────
// CreationToolbar
//
// A second toolbar for creating new workflow objects (Block,
// Connection, Transition). Rendered in edit mode only, to the
// right of the main CanvasToolbar.
//
// Visual style intentionally matches CanvasToolbar exactly:
// white background, 1px border, 8px border-radius, drop shadow.
// ─────────────────────────────────────────────────────────────

interface CreationToolbarProps {
	onAddBlock: () => void;
	onAddConnection: () => void;
	onAddTransition: () => void;
	/**
	 * Horizontal offset from the left edge of the canvas container.
	 * Should be set to (CanvasToolbar width + gap). Defaults to 370,
	 * which matches the CanvasToolbar width when Edit + Clone + Legend +
	 * Zoom controls + Fit are all visible.
	 */
	leftOffset?: number;
}

// ── Shared button style (mirrors CanvasToolbar) ───────────────

const btnStyle: React.CSSProperties = {
	background: "none",
	border: "none",
	cursor: "pointer",
	fontSize: 12,
	lineHeight: 1,
	padding: "4px 8px",
	borderRadius: 4,
	color: "#374151",
	display: "flex",
	alignItems: "center",
	gap: 4,
	userSelect: "none",
	whiteSpace: "nowrap",
};

const dividerStyle: React.CSSProperties = {
	width: 1,
	height: 16,
	background: "#e5e7eb",
	margin: "0 4px",
	flexShrink: 0,
};

// ── Icon components ───────────────────────────────────────────

function BlockIcon() {
	return (
		<svg
			width="12"
			height="12"
			viewBox="0 0 12 12"
			fill="none"
			style={{ display: "block", flexShrink: 0 }}
		>
			{/* Rectangle outline */}
			<rect
				x="1"
				y="1"
				width="10"
				height="10"
				rx="1.5"
				stroke="currentColor"
				strokeWidth="1.3"
				fill="none"
			/>
			{/* Plus sign */}
			<line
				x1="6"
				y1="4"
				x2="6"
				y2="8"
				stroke="currentColor"
				strokeWidth="1.3"
				strokeLinecap="round"
			/>
			<line
				x1="4"
				y1="6"
				x2="8"
				y2="6"
				stroke="currentColor"
				strokeWidth="1.3"
				strokeLinecap="round"
			/>
		</svg>
	);
}

function ConnectionIcon() {
	return (
		<svg
			width="12"
			height="12"
			viewBox="0 0 12 12"
			fill="none"
			style={{ display: "block", flexShrink: 0 }}
		>
			{/* Horizontal arrow line */}
			<path
				d="M1 6h8M6 2l4 4-4 4"
				stroke="currentColor"
				strokeWidth="1.3"
				fill="none"
				strokeLinecap="round"
				strokeLinejoin="round"
			/>
		</svg>
	);
}

function TransitionIcon() {
	return (
		<svg
			width="12"
			height="12"
			viewBox="0 0 12 12"
			fill="none"
			style={{ display: "block", flexShrink: 0 }}
		>
			{/* Circle with diagonal slash — represents "disable" */}
			<circle cx="6" cy="6" r="5" stroke="#EE1111" strokeWidth="1.3" />
			<line
				x1="3"
				y1="3"
				x2="9"
				y2="9"
				stroke="#EE1111"
				strokeWidth="1.3"
				strokeLinecap="round"
			/>
		</svg>
	);
}

// ── CreationToolbar component ─────────────────────────────────

export function CreationToolbar({
	onAddBlock,
	onAddConnection,
	onAddTransition,
	leftOffset = 370,
}: CreationToolbarProps) {
	return (
		<div
			style={{
				position: "absolute",
				top: 12,
				left: leftOffset,
				zIndex: 10,
				display: "flex",
				alignItems: "center",
				gap: 2,
				background: "white",
				border: "1px solid var(--kds-color-gray-200, #e5e7eb)",
				borderRadius: 8,
				padding: "4px 6px",
				boxShadow: "0 1px 4px rgba(0,0,0,0.08)",
				userSelect: "none",
			}}
		>
			{/* Block button */}
			<button
				onClick={onAddBlock}
				title="Add a new workflow block"
				style={btnStyle}
			>
				<BlockIcon />
				Block
			</button>

			<div style={dividerStyle} />

			{/* Connection button */}
			<button
				onClick={onAddConnection}
				title="Add a connection (nextSteps link) between steps"
				style={btnStyle}
			>
				<ConnectionIcon />
				Connection
			</button>

			{/* Transition button */}
			<button
				onClick={onAddTransition}
				title="Add a disable transition between steps"
				style={{ ...btnStyle, color: "#EE1111" }}
			>
				<TransitionIcon />
				Transition
			</button>
		</div>
	);
}
