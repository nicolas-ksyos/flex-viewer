import type React from "react";
import type {
	ParsedWorkflowStep,
	PendingChangeItem,
	StepEditDraft,
} from "../../shared/types";

// ─────────────────────────────────────────────────────────────
// Zoom constants — exported so App.tsx can reuse them
// ─────────────────────────────────────────────────────────────

export const ZOOM_STEP = 0.25;
export const MIN_ZOOM = 0.25;
export const MAX_ZOOM = 20.0;

// ─────────────────────────────────────────────────────────────
// computeCanvasSize — exported for fit-to-screen calculation
// ─────────────────────────────────────────────────────────────

const CELL_WIDTH = 220; // must match EditableWorkflowCanvas constant
const CELL_HEIGHT = 130;

export function computeCanvasSize(
	steps: ParsedWorkflowStep[],
	pendingChanges: PendingChangeItem[],
): { width: number; height: number } {
	if (steps.length === 0) return { width: 440, height: 260 };
	const edits = pendingChanges.filter(
		(c): c is StepEditDraft => c.kind === "edit",
	);
	const maxGX = Math.max(
		...steps.map((s) => {
			const p = edits.find((c) => c.stepId === s.id);
			return p?.fields.x ?? s.displayOptions.x;
		}),
	);
	const maxGY = Math.max(
		...steps.map((s) => {
			const p = edits.find((c) => c.stepId === s.id);
			return p?.fields.y ?? s.displayOptions.y;
		}),
	);
	return {
		width: (maxGX + 2) * CELL_WIDTH,
		height: (maxGY + 2) * CELL_HEIGHT,
	};
}

// ─────────────────────────────────────────────────────────────
// CanvasToolbar component
// ─────────────────────────────────────────────────────────────

interface CanvasToolbarProps {
	zoomLevel: number;
	onZoomIn: () => void;
	onZoomOut: () => void;
	onFitToScreen: () => void;
	showLegend?: boolean;
	onToggleLegend?: () => void;
	/** Called when the Edit button is clicked (no-op when isEditMode is true). */
	onEdit?: () => void;
	/** Called when the Clone button is clicked. */
	onClone?: () => void;
	/** When true the Edit button is muted and non-clickable. */
	isEditMode?: boolean;
}

const toolbarBtnStyle: React.CSSProperties = {
	background: "none",
	border: "none",
	cursor: "pointer",
	fontSize: 16,
	lineHeight: 1,
	padding: "2px 6px",
	borderRadius: 4,
	color: "#374151",
	display: "flex",
	alignItems: "center",
	justifyContent: "center",
};

const toolbarBtnDisabledStyle: React.CSSProperties = {
	...toolbarBtnStyle,
	opacity: 0.35,
	cursor: "default",
};

export function CanvasToolbar({
	zoomLevel,
	onZoomIn,
	onZoomOut,
	onFitToScreen,
	showLegend,
	onToggleLegend,
	onEdit,
	onClone,
	isEditMode,
}: CanvasToolbarProps) {
	const canZoomOut = zoomLevel > MIN_ZOOM;
	const canZoomIn = zoomLevel < MAX_ZOOM;

	return (
		<div
			style={{
				position: "absolute",
				top: 12,
				left: 12,
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
			{/* Edit + Clone buttons — leftmost */}
			{(onEdit || onClone) && (
				<>
					{onEdit && (
						<button
							onClick={!isEditMode ? onEdit : undefined}
							title={isEditMode ? "Currently in edit mode" : "Edit workflow"}
							style={{
								...toolbarBtnStyle,
								display: "flex",
								alignItems: "center",
								gap: 4,
								opacity: isEditMode ? 0.4 : 1,
								cursor: isEditMode ? "default" : "pointer",
								padding: "4px 8px",
							}}
						>
							{/* Pencil icon */}
							<svg
								width="12"
								height="12"
								viewBox="0 0 12 12"
								fill="none"
								style={{ display: "block", flexShrink: 0 }}
							>
								<path
									d="M8.5 1.5l2 2L3 11H1V9L8.5 1.5z"
									stroke="currentColor"
									strokeWidth="1.2"
									strokeLinejoin="round"
									fill="none"
								/>
								<path d="M7 3l2 2" stroke="currentColor" strokeWidth="1.2" />
							</svg>
							<span style={{ fontSize: 12 }}>Edit</span>
						</button>
					)}
					{onClone && (
						<button
							onClick={onClone}
							title="Clone seed file"
							style={{
								...toolbarBtnStyle,
								display: "flex",
								alignItems: "center",
								gap: 4,
								padding: "4px 8px",
							}}
						>
							{/* Copy/clone icon */}
							<svg
								width="12"
								height="12"
								viewBox="0 0 12 12"
								fill="none"
								style={{ display: "block", flexShrink: 0 }}
							>
								<rect
									x="3.5"
									y="0.5"
									width="7"
									height="8.5"
									rx="1"
									stroke="currentColor"
									strokeWidth="1.2"
									fill="none"
								/>
								<rect
									x="1"
									y="3"
									width="7"
									height="8.5"
									rx="1"
									stroke="currentColor"
									strokeWidth="1.2"
									fill="white"
								/>
							</svg>
							<span style={{ fontSize: 12 }}>Clone</span>
						</button>
					)}
					<div
						style={{
							width: 1,
							height: 16,
							background: "#e5e7eb",
							margin: "0 4px",
							flexShrink: 0,
						}}
					/>
				</>
			)}

			{/* Legend toggle */}
			{onToggleLegend && (
				<>
					<button
						onClick={onToggleLegend}
						title={showLegend ? "Hide legend" : "Show legend"}
						style={{
							...toolbarBtnStyle,
							background: showLegend ? "#f3f4f6" : "none",
						}}
					>
						<svg
							width="14"
							height="14"
							viewBox="0 0 14 14"
							fill="none"
							xmlns="http://www.w3.org/2000/svg"
							style={{ display: "block" }}
						>
							<rect
								x="1"
								y="2"
								width="4"
								height="4"
								rx="1"
								fill="currentColor"
								opacity="0.7"
							/>
							<rect
								x="1"
								y="8"
								width="4"
								height="4"
								rx="1"
								fill="currentColor"
								opacity="0.7"
							/>
							<rect
								x="7"
								y="3.5"
								width="6"
								height="1.5"
								rx="0.75"
								fill="currentColor"
							/>
							<rect
								x="7"
								y="9.5"
								width="6"
								height="1.5"
								rx="0.75"
								fill="currentColor"
							/>
						</svg>
					</button>
					<div
						style={{
							width: 1,
							height: 16,
							background: "#e5e7eb",
							margin: "0 4px",
							flexShrink: 0,
						}}
					/>
				</>
			)}

			{/* Zoom out */}
			<button
				onClick={canZoomOut ? onZoomOut : undefined}
				disabled={!canZoomOut}
				title="Zoom out"
				style={canZoomOut ? toolbarBtnStyle : toolbarBtnDisabledStyle}
			>
				−
			</button>

			{/* Zoom level display */}
			<span
				style={{
					fontSize: 11,
					color: "#6b7280",
					minWidth: 36,
					textAlign: "center",
					fontVariantNumeric: "tabular-nums",
				}}
			>
				{Math.round(zoomLevel * 100)}%
			</span>

			{/* Zoom in */}
			<button
				onClick={canZoomIn ? onZoomIn : undefined}
				disabled={!canZoomIn}
				title="Zoom in"
				style={canZoomIn ? toolbarBtnStyle : toolbarBtnDisabledStyle}
			>
				+
			</button>

			{/* Divider */}
			<div
				style={{
					width: 1,
					height: 16,
					background: "#e5e7eb",
					margin: "0 4px",
					flexShrink: 0,
				}}
			/>

			{/* Fit to screen */}
			<button
				onClick={onFitToScreen}
				title="Fit workflow to screen"
				style={toolbarBtnStyle}
			>
				⊡
			</button>
		</div>
	);
}
