import type React from "react";
import { useState, useEffect } from "react";
import "./EditableWorkflowCanvas.css";
import type {
	ParsedWorkflowDefinition,
	ParsedWorkflowStep,
	ParsedWorkflowTransition,
	StepPendingChange,
	EditableStepFields,
} from "../../../shared/types";
import { BlockSettingsPopover } from "./BlockSettingsPopover";

// ─────────────────────────────────────────────────────────────
// Grid / block sizing constants
// ─────────────────────────────────────────────────────────────

export const CELL_WIDTH = 220; // pixels per grid column
export const CELL_HEIGHT = 130; // pixels per grid row
const BLOCK_WIDTH = 180;
const BLOCK_HEIGHT = 90;
// Offset so the block is centred inside its grid cell
const BLOCK_OFFSET_X = (CELL_WIDTH - BLOCK_WIDTH) / 2; // 20
const BLOCK_OFFSET_Y = (CELL_HEIGHT - BLOCK_HEIGHT) / 2; // 20

// ─────────────────────────────────────────────────────────────
// Visual style map — colours and shapes match the read-only
// WorkflowGraph (no process-step status = default colours).
//
// Source mapping from helpers.ts:
//   purple  → #FF37F0   white    → #FAFAFA
//   blue    → #3C3CFF   lightblue→ #E0E8FF
//   orange  → #FF9A1E   black    → #322A24
// ─────────────────────────────────────────────────────────────

type BlockShape = "rect" | "ellipse" | "diamond";

interface BlockStyle {
	bg: string;
	border: string;
	text: string;
	shape: BlockShape;
	borderWidth: number;
}

const BLOCK_TYPE_STYLES: Record<string, BlockStyle> = {
	start: {
		bg: "#FAFAFA",
		border: "#FF37F0",
		text: "#322A24",
		shape: "ellipse",
		borderWidth: 4,
	},
	activity: {
		bg: "#E0E8FF",
		border: "#3C3CFF",
		text: "#322A24",
		shape: "rect",
		borderWidth: 8,
	},
	action: {
		bg: "#E0E8FF",
		border: "#3C3CFF",
		text: "#322A24",
		shape: "rect",
		borderWidth: 8,
	},
	choice: {
		bg: "#FAFAFA",
		border: "#FF37F0",
		text: "#322A24",
		shape: "diamond",
		borderWidth: 4, // matches general/scheduled
	},
	general: {
		bg: "#FAFAFA",
		border: "#FF37F0",
		text: "#322A24",
		shape: "rect",
		borderWidth: 4,
	},
	scheduled: {
		bg: "#FAFAFA",
		border: "#FF37F0",
		text: "#322A24",
		shape: "rect",
		borderWidth: 4,
	},
	systemAction: {
		bg: "#FAFAFA",
		border: "#FF37F0",
		text: "#322A24",
		shape: "rect",
		borderWidth: 4,
	},
};

const DEFAULT_STYLE: BlockStyle = {
	bg: "#FAFAFA",
	border: "#CCCCCC",
	text: "#322A24",
	shape: "rect",
	borderWidth: 4,
};

// ─────────────────────────────────────────────────────────────
// Drag state
// ─────────────────────────────────────────────────────────────

interface DragState {
	stepId: string;
	startMouseX: number;
	startMouseY: number;
	startPixelX: number;
	startPixelY: number;
}

// ─────────────────────────────────────────────────────────────
// Component props
// ─────────────────────────────────────────────────────────────

export interface EditableWorkflowCanvasProps {
	workflow: ParsedWorkflowDefinition;
	pendingChanges: StepPendingChange[];
	/** Fired on mouseup after a drag; caller updates pendingChanges */
	onBlockMove: (stepId: string, newGridX: number, newGridY: number) => void;
	/** Called when the 'i' icon is clicked — external notification (optional) */
	onInfoIconClick?: (step: ParsedWorkflowStep) => void;
	/** Called when a field is edited in the settings popover */
	onInfoFieldChange?: (
		step: ParsedWorkflowStep,
		field: keyof EditableStepFields,
		value: string | number | null,
	) => void;
	/** CSS transform scale applied to the canvas content (default: 1) */
	zoomLevel?: number;
	/** Step ID to highlight with a subtle blue glow (from sidebar hover) */
	highlightedStepId?: string | null;
	/** When true: no drag, no 'i' icon, default cursor. Use for view mode. */
	readOnly?: boolean;
}

// ─────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────

/** Returns the pixel top-left corner of the block (not the cell). */
function effectivePosition(
	step: ParsedWorkflowStep,
	pendingChanges: StepPendingChange[],
	draggingStepId?: string | null,
	draggingPosition?: { x: number; y: number } | null,
): { pixelX: number; pixelY: number } {
	// While dragging: use live pixel position directly
	if (draggingStepId === step.id && draggingPosition) {
		return { pixelX: draggingPosition.x, pixelY: draggingPosition.y };
	}
	// Otherwise apply pending grid change (or fall back to original)
	const pending = pendingChanges.find((c) => c.stepId === step.id);
	const gx = pending?.fields.x ?? step.displayOptions.x;
	const gy = pending?.fields.y ?? step.displayOptions.y;
	return {
		pixelX: gx * CELL_WIDTH + BLOCK_OFFSET_X,
		pixelY: gy * CELL_HEIGHT + BLOCK_OFFSET_Y,
	};
}

/** Block center in pixels. */
function blockCenter(pixelX: number, pixelY: number) {
	return { cx: pixelX + BLOCK_WIDTH / 2, cy: pixelY + BLOCK_HEIGHT / 2 };
}

// ─────────────────────────────────────────────────────────────
// BlockInfo — center + shape data used by TransitionLines
// ─────────────────────────────────────────────────────────────

interface BlockInfo {
	cx: number;
	cy: number;
	shape: BlockShape;
	halfW: number; // effective half-width for edge calculation
	halfH: number; // effective half-height for edge calculation
}

// Gap in px between arrowhead tip and shape edge
const ARROW_GAP = 3;

/**
 * Returns the point on the block's shape boundary in the given direction
 * from the block's centre, pulled back by ARROW_GAP so the arrowhead sits
 * just outside the shape rather than overlapping the border.
 */
function shapeEdgePoint(
	cx: number,
	cy: number,
	dirX: number,
	dirY: number,
	shape: BlockShape,
	halfW: number,
	halfH: number,
): { x: number; y: number } {
	const len = Math.sqrt(dirX * dirX + dirY * dirY);
	if (len < 0.001) return { x: cx, y: cy };
	const nx = dirX / len;
	const ny = dirY / len;

	let t: number;
	if (shape === "ellipse") {
		// Parametric intersection: t = 1 / sqrt(nx²/a² + ny²/b²)
		t =
			1 / Math.sqrt((nx * nx) / (halfW * halfW) + (ny * ny) / (halfH * halfH));
	} else if (shape === "diamond") {
		// Diamond boundary: |x|/halfW + |y|/halfH = 1
		t = 1 / (Math.abs(nx) / halfW + Math.abs(ny) / halfH);
	} else {
		// Rect: find nearest axis boundary
		const tx = nx !== 0 ? Math.abs(halfW / nx) : Infinity;
		const ty = ny !== 0 ? Math.abs(halfH / ny) : Infinity;
		t = Math.min(tx, ty);
	}

	return { x: cx + nx * (t - ARROW_GAP), y: cy + ny * (t - ARROW_GAP) };
}

// ─────────────────────────────────────────────────────────────
// WorkflowBlock — renders a single step as a positioned div
// ─────────────────────────────────────────────────────────────

interface WorkflowBlockProps {
	step: ParsedWorkflowStep;
	pixelX: number;
	pixelY: number;
	isDragging: boolean;
	isHovered: boolean;
	isHighlighted: boolean;
	readOnly: boolean;
	onMouseDown: (e: React.MouseEvent) => void;
	onMouseEnter: () => void;
	onMouseLeave: () => void;
	onInfoIconClick: () => void;
}

function WorkflowBlock({
	step,
	pixelX,
	pixelY,
	isDragging,
	isHovered,
	isHighlighted,
	readOnly,
	onMouseDown,
	onMouseEnter,
	onMouseLeave,
	onInfoIconClick,
}: WorkflowBlockProps) {
	const styles =
		BLOCK_TYPE_STYLES[step.serviceWorkflowBlock.type] ?? DEFAULT_STYLE;
	const label = step.label || step.name;
	const blockName = step.serviceWorkflowBlock.name;

	// Outer wrapper — absolutely positioned on the canvas.
	// position: 'absolute' also acts as the containing block for the 'i' icon (T7).
	const outerStyle: React.CSSProperties = {
		position: "absolute",
		left: pixelX,
		top: pixelY,
		width: BLOCK_WIDTH,
		height: BLOCK_HEIGHT,
		cursor: readOnly ? "default" : isDragging ? "grabbing" : "grab",
		userSelect: "none",
		// Elevate dragging block above siblings
		zIndex: isDragging ? 100 : 1,
		opacity: isDragging ? 0.85 : 1,
		// boxShadow intentionally omitted — each shape applies its own shadow
		// so the shadow follows the actual shape (circle/diamond/rect) rather
		// than the rectangular 180×90 bounding box.
		willChange: isDragging ? "left, top" : undefined,
	};

	// Centred text layer sits above the shape layer
	const textLayerStyle: React.CSSProperties = {
		position: "absolute",
		inset: 0,
		display: "flex",
		flexDirection: "column",
		alignItems: "center",
		justifyContent: "center",
		padding: "6px 10px",
		zIndex: 1,
		pointerEvents: "none", // mouse events handled by outer wrapper
	};

	const blockNameStyle: React.CSSProperties = {
		fontSize: 10,
		color: styles.text,
		opacity: 0.6,
		marginBottom: 2,
		textAlign: "center",
		whiteSpace: "nowrap",
		overflow: "hidden",
		textOverflow: "ellipsis",
		maxWidth: "100%",
	};

	const labelStyle: React.CSSProperties = {
		fontSize: 12,
		fontWeight: 600,
		color: styles.text,
		textAlign: "center",
		lineHeight: 1.3,
		overflow: "hidden",
		maxHeight: 36, // ~2 lines
		wordBreak: "break-word",
		maxWidth: "100%",
	};

	const textContent = (
		<div style={textLayerStyle}>
			<span style={blockNameStyle}>{blockName}</span>
			<span style={labelStyle}>{label}</span>
		</div>
	);

	// 'i' info icon — shown on hover, hidden while dragging or in read-only mode
	const infoIcon =
		!readOnly && isHovered && !isDragging ? (
			<button
				onMouseDown={(e) => e.stopPropagation()}
				onClick={(e) => {
					e.stopPropagation();
					onInfoIconClick();
				}}
				style={{
					position: "absolute",
					top: 4,
					right: 4,
					width: 18,
					height: 18,
					borderRadius: "50%",
					border: "1px solid currentColor",
					background: "rgba(255,255,255,0.85)",
					cursor: "pointer",
					fontSize: 10,
					fontWeight: "bold",
					display: "flex",
					alignItems: "center",
					justifyContent: "center",
					padding: 0,
					lineHeight: 1,
					color: "inherit",
					opacity: 0.75,
					zIndex: 2,
				}}
				title="Step settings"
				aria-label="Open step settings"
			>
				i
			</button>
		) : null;

	const sharedOuterProps = {
		style: outerStyle,
		onMouseDown: readOnly ? undefined : onMouseDown,
		onMouseEnter,
		onMouseLeave,
	};

	// ── Ellipse (start) ──────────────────────────────────────
	// The boxShadow is on the inner circle div (which has borderRadius:50%) so
	// the shadow and highlight ring are circular, not rectangular.
	if (styles.shape === "ellipse") {
		return (
			<div
				style={outerStyle}
				onMouseDown={readOnly ? undefined : onMouseDown}
				onMouseEnter={onMouseEnter}
				onMouseLeave={onMouseLeave}
			>
				<div
					style={{
						position: "absolute",
						inset: 0,
						borderRadius: "50%",
						backgroundColor: styles.bg,
						border: `${styles.borderWidth}px solid ${styles.border}`,
						// box-shadow respects border-radius, so this produces a circular shadow
						boxShadow: isDragging
							? "0 8px 24px rgba(0,0,0,0.18)"
							: isHighlighted
								? "0 0 0 3px rgba(59,130,246,0.35), 0 1px 4px rgba(0,0,0,0.08)"
								: "0 1px 4px rgba(0,0,0,0.08)",
					}}
				/>
				{textContent}
				{infoIcon}
			</div>
		);
	}

	// ── Diamond (choice) ─────────────────────────────────────
	// SVG <polygon> with a proper stroke draws the border exactly along
	// the diamond edge. The polygon points are inset by half the stroke
	// width so the stroke stays within the block bounding box.
	// filter:drop-shadow on the outer wrapper follows the SVG shape.
	if (styles.shape === "diamond") {
		const shadowFilter = isDragging
			? "drop-shadow(0 8px 24px rgba(0,0,0,0.18))"
			: isHighlighted
				? "drop-shadow(0 0 4px rgba(59,130,246,0.6))"
				: "drop-shadow(0 1px 3px rgba(0,0,0,0.10))";
		// Inset polygon points by half stroke-width so the stroke is fully visible
		const b = styles.borderWidth / 2;
		const w = BLOCK_WIDTH;
		const h = BLOCK_HEIGHT;
		const pts = `${w / 2},${b} ${w - b},${h / 2} ${w / 2},${h - b} ${b},${h / 2}`;
		return (
			<div
				style={{ ...outerStyle, filter: shadowFilter }}
				onMouseDown={readOnly ? undefined : onMouseDown}
				onMouseEnter={onMouseEnter}
				onMouseLeave={onMouseLeave}
			>
				<svg
					width={BLOCK_WIDTH}
					height={BLOCK_HEIGHT}
					style={{ position: "absolute", inset: 0 }}
				>
					<polygon
						points={pts}
						fill={styles.bg}
						stroke={styles.border}
						strokeWidth={styles.borderWidth}
						strokeLinejoin="miter"
					/>
				</svg>
				{textContent}
				{infoIcon}
			</div>
		);
	}

	// ── Rectangle (default) ──────────────────────────────────
	// boxShadow lives on the inner background div (same dimensions as outer),
	// keeping the pattern consistent across all three shapes.
	return (
		<div {...sharedOuterProps}>
			<div
				style={{
					position: "absolute",
					inset: 0,
					backgroundColor: styles.bg,
					border: `${styles.borderWidth}px solid ${styles.border}`,
					boxShadow: isDragging
						? "0 8px 24px rgba(0,0,0,0.18)"
						: isHighlighted
							? "0 0 0 3px rgba(59,130,246,0.35), 0 1px 4px rgba(0,0,0,0.08)"
							: "0 1px 4px rgba(0,0,0,0.08)",
				}}
			/>
			{textContent}
			{infoIcon}
		</div>
	);
}

// ─────────────────────────────────────────────────────────────
// TransitionLines — SVG overlay rendered below the blocks
// ─────────────────────────────────────────────────────────────

interface TransitionLinesProps {
	transitions: ParsedWorkflowTransition[];
	centerMap: Map<string, BlockInfo>;
	canvasWidth: number;
	canvasHeight: number;
}

function TransitionLines({
	transitions,
	centerMap,
	canvasWidth,
	canvasHeight,
}: TransitionLinesProps) {
	return (
		<svg
			style={{
				position: "absolute",
				inset: 0,
				pointerEvents: "none",
				overflow: "visible",
			}}
			width={canvasWidth}
			height={canvasHeight}
		>
			<defs>
				{/* Purple arrow — synchronous transitions */}
				<marker
					id="ewa-arrow-sync"
					markerWidth="10"
					markerHeight="8"
					refX="10"
					refY="4"
					orient="auto"
				>
					<polygon points="0 0, 10 4, 0 8" fill="#FF37F0" />
				</marker>
				{/* Orange arrow — async transitions */}
				<marker
					id="ewa-arrow-async"
					markerWidth="10"
					markerHeight="8"
					refX="10"
					refY="4"
					orient="auto"
				>
					<polygon points="0 0, 10 4, 0 8" fill="#FF9A1E" />
				</marker>
				{/* Red arrow — disable transitions */}
				<marker
					id="ewa-arrow-disable"
					markerWidth="10"
					markerHeight="8"
					refX="10"
					refY="4"
					orient="auto"
				>
					<polygon points="0 0, 10 4, 0 8" fill="#EE1111" />
				</marker>
			</defs>

			{transitions.map((t) => {
				const src = centerMap.get(t.fromStepId);
				const tgt = centerMap.get(t.toStepId);
				if (!src || !tgt) return null;

				// Derive colour and marker from type (disable takes priority) and synchronous flag
				const isDisable = t.type === "disable";
				const isSynchronous = t.synchronous;
				const strokeColor = isDisable
					? "#EE1111"
					: isSynchronous
						? "#FF37F0"
						: "#FF9A1E";
				const markerId = isDisable
					? "ewa-arrow-disable"
					: isSynchronous
						? "ewa-arrow-sync"
						: "ewa-arrow-async";

				// Self-transition: draw a small cubic-Bezier arc above the block
				if (t.fromStepId === t.toStepId) {
					const { cx, cy } = src;
					const topY = cy - BLOCK_HEIGHT / 2;
					const loopR = 18;
					const loopX1 = cx - loopR;
					const loopX2 = cx + loopR;
					const loopArcY = topY - loopR * 1.2;
					const path = `M ${loopX1} ${topY} C ${loopX1} ${loopArcY}, ${loopX2} ${loopArcY}, ${loopX2} ${topY}`;
					return (
						<path
							key={t.id}
							d={path}
							fill="none"
							stroke={strokeColor}
							strokeWidth={2}
							markerEnd={`url(#${markerId})`}
						/>
					);
				}

				// Direction vector from source centre to target centre
				const dx = tgt.cx - src.cx;
				const dy = tgt.cy - src.cy;

				// Source exit point — on source block edge, pointing toward target
				const { x: x1, y: y1 } = shapeEdgePoint(
					src.cx,
					src.cy,
					dx,
					dy,
					src.shape,
					src.halfW,
					src.halfH,
				);
				// Target entry point — on target block edge, pointing toward source
				const { x: x2, y: y2 } = shapeEdgePoint(
					tgt.cx,
					tgt.cy,
					-dx,
					-dy,
					tgt.shape,
					tgt.halfW,
					tgt.halfH,
				);

				// Midpoint for optional condition label
				const midX = (x1 + x2) / 2;
				const midY = (y1 + y2) / 2;

				return (
					<g key={t.id}>
						<line
							x1={x1}
							y1={y1}
							x2={x2}
							y2={y2}
							stroke={strokeColor}
							strokeWidth={2}
							markerEnd={`url(#${markerId})`}
						/>
						{t.onlyIfOutputEquals && (
							<text
								x={midX}
								y={midY - 6}
								fontSize={10}
								fill={strokeColor}
								textAnchor="middle"
								style={{ pointerEvents: "none", userSelect: "none" }}
							>
								{t.onlyIfOutputEquals}
							</text>
						)}
					</g>
				);
			})}
		</svg>
	);
}

// ─────────────────────────────────────────────────────────────
// EditableWorkflowCanvas — main export
// ─────────────────────────────────────────────────────────────

export function EditableWorkflowCanvas({
	workflow,
	pendingChanges,
	onBlockMove,
	onInfoIconClick,
	onInfoFieldChange,
	zoomLevel,
	highlightedStepId,
	readOnly = false,
}: EditableWorkflowCanvasProps) {
	const zoom = zoomLevel ?? 1;

	// ── Internal drag state ───────────────────────────────────
	const [dragState, setDragState] = useState<DragState | null>(null);
	const [dragPixel, setDragPixel] = useState<{ x: number; y: number } | null>(
		null,
	);

	// ── Hover / popover state (T7) ────────────────────────────
	const [hoveredStepId, setHoveredStepId] = useState<string | null>(null);
	const [openPopoverStepId, setOpenPopoverStepId] = useState<string | null>(
		null,
	);

	// Start dragging a block
	const handleBlockMouseDown = (
		e: React.MouseEvent,
		step: ParsedWorkflowStep,
	) => {
		if (readOnly) return;
		e.preventDefault();
		e.stopPropagation(); // prevent canvas-pan handler from firing on block clicks
		const { pixelX, pixelY } = effectivePosition(
			step,
			pendingChanges,
			null,
			null,
		);
		setDragState({
			stepId: step.id,
			startMouseX: e.clientX,
			startMouseY: e.clientY,
			startPixelX: pixelX,
			startPixelY: pixelY,
		});
		setDragPixel({ x: pixelX, y: pixelY });
	};

	// Global mouse listeners — attached only while dragging.
	// Mouse deltas arrive in screen pixels; dividing by zoom converts them
	// to canvas pixels (the coordinate space blocks live in).
	useEffect(() => {
		if (!dragState) return;

		const handleMouseMove = (e: MouseEvent) => {
			const dx = (e.clientX - dragState.startMouseX) / zoom;
			const dy = (e.clientY - dragState.startMouseY) / zoom;
			setDragPixel({
				x: dragState.startPixelX + dx,
				y: dragState.startPixelY + dy,
			});
		};

		const handleMouseUp = (e: MouseEvent) => {
			const dx = (e.clientX - dragState.startMouseX) / zoom;
			const dy = (e.clientY - dragState.startMouseY) / zoom;
			const newPixelX = dragState.startPixelX + dx;
			const newPixelY = dragState.startPixelY + dy;

			// Snap to nearest integer grid cell, clamped to >= 0
			const newGridX = Math.max(
				0,
				Math.round((newPixelX - BLOCK_OFFSET_X) / CELL_WIDTH),
			);
			const newGridY = Math.max(
				0,
				Math.round((newPixelY - BLOCK_OFFSET_Y) / CELL_HEIGHT),
			);

			onBlockMove(dragState.stepId, newGridX, newGridY);
			setDragState(null);
			setDragPixel(null);
		};

		window.addEventListener("mousemove", handleMouseMove);
		window.addEventListener("mouseup", handleMouseUp);
		return () => {
			window.removeEventListener("mousemove", handleMouseMove);
			window.removeEventListener("mouseup", handleMouseUp);
		};
	}, [dragState, onBlockMove, zoom]);

	if (workflow.steps.length === 0) {
		return (
			<div style={{ padding: 24, textAlign: "center", color: "#666" }}>
				No steps found
			</div>
		);
	}

	// ── Compute effective pixel positions for every step ──────
	const activeDraggingStepId = dragState?.stepId ?? null;

	const stepPositions = workflow.steps.map((step) => ({
		step,
		...effectivePosition(step, pendingChanges, activeDraggingStepId, dragPixel),
	}));

	// ── Canvas dimensions (enough to show all blocks + 2 cell padding) ──
	const maxGX = Math.max(
		...workflow.steps.map((s) => {
			const p = pendingChanges.find((c) => c.stepId === s.id);
			return p?.fields.x ?? s.displayOptions.x;
		}),
	);
	const maxGY = Math.max(
		...workflow.steps.map((s) => {
			const p = pendingChanges.find((c) => c.stepId === s.id);
			return p?.fields.y ?? s.displayOptions.y;
		}),
	);

	const canvasWidth = (maxGX + 2) * CELL_WIDTH;
	const canvasHeight = (maxGY + 2) * CELL_HEIGHT;

	// ── Center map for transition line endpoints ──────────────
	const centerMap = new Map<string, BlockInfo>();
	for (const { step, pixelX, pixelY } of stepPositions) {
		const { cx, cy } = blockCenter(pixelX, pixelY);
		const styles =
			BLOCK_TYPE_STYLES[step.serviceWorkflowBlock.type] ?? DEFAULT_STYLE;
		let halfW: number;
		let halfH: number;
		if (styles.shape === "diamond") {
			// Full-width diamond (clip-path fills the block bounding box):
			// vertices sit at the midpoint of each edge, so half-extents equal
			// the block half-dimensions.
			halfW = BLOCK_WIDTH / 2;
			halfH = BLOCK_HEIGHT / 2;
		} else {
			// ellipse and rect: use block half-dimensions
			halfW = BLOCK_WIDTH / 2;
			halfH = BLOCK_HEIGHT / 2;
		}
		centerMap.set(step.id, { cx, cy, shape: styles.shape, halfW, halfH });
	}

	const isDraggingAny = dragState !== null;

	// Canvas renders at its natural pixel size; zoom is applied by the
	// App-level wrapper (spacer + CSS scale) so scrollbars are always correct.
	return (
		<div
			className={`editable-canvas${isDraggingAny ? " canvas--dragging" : ""}`}
			style={{ position: "relative", width: canvasWidth, height: canvasHeight }}
		>
			{/* SVG transition lines sit below the block layer */}
			<TransitionLines
				transitions={workflow.transitions}
				centerMap={centerMap}
				canvasWidth={canvasWidth}
				canvasHeight={canvasHeight}
			/>

			{/* Block layer */}
			{stepPositions.map(({ step, pixelX, pixelY }) => (
				<WorkflowBlock
					key={step.id}
					step={step}
					pixelX={pixelX}
					pixelY={pixelY}
					isDragging={activeDraggingStepId === step.id}
					isHovered={hoveredStepId === step.id}
					isHighlighted={highlightedStepId === step.id}
					readOnly={readOnly}
					onMouseDown={(e) => handleBlockMouseDown(e, step)}
					onMouseEnter={() => setHoveredStepId(step.id)}
					onMouseLeave={() => setHoveredStepId(null)}
					onInfoIconClick={() => {
						setOpenPopoverStepId((prev) => (prev === step.id ? null : step.id));
						onInfoIconClick?.(step);
					}}
				/>
			))}

			{/* Settings popover — rendered at canvas level to avoid block clipping */}
			{openPopoverStepId &&
				(() => {
					const popStep = workflow.steps.find(
						(s) => s.id === openPopoverStepId,
					);
					if (!popStep) return null;
					const pending = pendingChanges.find((c) => c.stepId === popStep.id);
					const { pixelX, pixelY } = effectivePosition(
						popStep,
						pendingChanges,
						null,
						null,
					);
					return (
						<BlockSettingsPopover
							step={popStep}
							pendingFields={pending?.fields ?? {}}
							onFieldChange={(field, value) =>
								onInfoFieldChange?.(popStep, field, value)
							}
							onClose={() => setOpenPopoverStepId(null)}
							position={{ top: pixelY, left: pixelX + BLOCK_WIDTH + 8 }}
						/>
					);
				})()}
		</div>
	);
}
