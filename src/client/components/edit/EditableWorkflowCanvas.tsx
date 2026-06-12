import type React from "react";
import { useState, useEffect, useMemo, useRef } from "react";
import { createPortal } from "react-dom";
import "./EditableWorkflowCanvas.css";
import type {
  ParsedWorkflowDefinition,
  ParsedWorkflowStep,
  ParsedWorkflowTransition,
  ParsedWorkflowActivity,
  PendingChangeItem,
  StepEditDraft,
  EditableStepFields,
  NewConnectionDraft,
  BlockParameterSchemas,
  DeletedBlockDraft,
  RemovedConnectionDraft,
} from "../../../shared/types";
// BlockSettingsPopover removed — block details now rendered in ContextSidebar
import { ConnectionContextMenu } from "./ConnectionContextMenu";
import { ConnectionEditModal } from "./ConnectionEditModal";
import type { ConnectionEditResult } from "./ConnectionEditModal";
import { AddConnectionModal } from "./AddConnectionModal";

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
    borderWidth: 4,
  },
  action: {
    bg: "#E0E8FF",
    border: "#3C3CFF",
    text: "#322A24",
    shape: "rect",
    borderWidth: 4,
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
// Connection-drag state (drag from block border to create a link)
// ─────────────────────────────────────────────────────────────

interface ConnectionDragState {
  fromStepId: string;
  fromPixelX: number; // start point on source block edge
  fromPixelY: number;
  currentX: number; // cursor position in canvas-local px
  currentY: number;
  hoverTargetId: string | null; // step under cursor (if any)
}

// ─────────────────────────────────────────────────────────────
// Component props
// ─────────────────────────────────────────────────────────────

export interface EditableWorkflowCanvasProps {
  workflow: ParsedWorkflowDefinition;
  pendingChanges: PendingChangeItem[];
  /** Fired on mouseup after a drag; caller updates pendingChanges */
  onBlockMove: (stepId: string, newGridX: number, newGridY: number) => void;
  /** Called when a block is clicked (not dragged). Pass null when background is clicked. */
  onBlockClick?: (step: ParsedWorkflowStep | null) => void;
  /** Step ID of the currently selected block */
  selectedStepId?: string | null;
  /** Called when a field is edited via the sidebar */
  onInfoFieldChange?: (
    step: ParsedWorkflowStep,
    field: keyof EditableStepFields,
    value: string | number | boolean | null,
  ) => void;
  /** Called when a new connection is created (from the popover or drag) */
  onAddConnectionDraft?: (draft: Omit<NewConnectionDraft, "kind">) => void;
  /** Called when a disable-transition is added (from context menu edit) */
  onAddTransitionDraft?: (
    draft: Omit<import("../../../shared/types").NewTransitionDraft, "kind">,
  ) => void;
  /** Called when user clicks a transition line in edit mode */
  onTransitionClick?: (
    transition: ParsedWorkflowTransition,
    pos: { x: number; y: number },
  ) => void;
  /** Called when the trash icon is clicked to mark a block for deletion */
  onDeleteBlock?: (step: ParsedWorkflowStep) => void;
  /** Called when the undo icon is clicked to cancel a pending deletion */
  onUndoDeleteBlock?: (stepId: string) => void;
  /** Called when × is clicked on an existing connection in the popover */
  onRemoveConnection?: (draft: Omit<RemovedConnectionDraft, "kind">) => void;
  /** Called when ↩ is clicked to undo a pending connection removal */
  onUndoRemoveConnection?: (tempId: string) => void;
  /** CSS transform scale applied to the canvas content (default: 1) */
  zoomLevel?: number;
  /** Step ID to highlight with a subtle blue glow (from sidebar hover) */
  highlightedStepId?: string | null;
  /** When true: no drag, no 'i' icon, default cursor. Use for view mode. */
  readOnly?: boolean;
  /** Block parameter schemas from the analyzer — drives typed parameter editor in popover */
  blockParameterSchemas?: BlockParameterSchemas;
  /** All activities in the workflow — for activity-id parameter fields */
  allActivities?: ParsedWorkflowActivity[];
  /** Called when parameters are changed via the typed editor in the popover */
  onParametersChange?: (
    step: ParsedWorkflowStep,
    params: Record<string, unknown> | null,
  ) => void;
}

// ─────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────

/** Returns edit-kind changes only — used for position and field lookups. */
function editChanges(pendingChanges: PendingChangeItem[]): StepEditDraft[] {
  return pendingChanges.filter((c): c is StepEditDraft => c.kind === "edit");
}

/** Returns the pixel top-left corner of the block (not the cell). */
function effectivePosition(
  step: ParsedWorkflowStep,
  pendingChanges: PendingChangeItem[],
  draggingStepId?: string | null,
  draggingPosition?: { x: number; y: number } | null,
): { pixelX: number; pixelY: number } {
  // While dragging: use live pixel position directly
  if (draggingStepId === step.id && draggingPosition) {
    return { pixelX: draggingPosition.x, pixelY: draggingPosition.y };
  }
  // Otherwise apply pending grid change (or fall back to original)
  const pending = editChanges(pendingChanges).find((c) => c.stepId === step.id);
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
  /** True when this step is pending deletion */
  isDeleted: boolean;
  /** True when this step is impacted by a pending deletion (incoming dep) */
  isImpacted: boolean;
  readOnly: boolean;
  onMouseDown: (e: React.MouseEvent) => void;
  onMouseEnter: () => void;
  onMouseLeave: () => void;
  /** True when this block is selected (click-selected) */
  isSelected: boolean;
  /** True when this block is the current drop target during a connection drag */
  isConnectionDropTarget: boolean;
  /** Called when this block is clicked (not dragged) */
  onBlockClick?: () => void;
  /** Called when trash icon is clicked (mark for deletion) */
  onDeleteClick?: () => void;
  /** Called when undo icon is clicked (cancel pending deletion) */
  onUndoClick?: () => void;
  /** Called when a connection handle (edge circle) is mousedown'd */
  onConnectionHandleMouseDown?: (
    e: React.MouseEvent,
    side: "top" | "bottom" | "left" | "right",
  ) => void;
}

function WorkflowBlock({
  step,
  pixelX,
  pixelY,
  isDragging,
  isHovered,
  isHighlighted,
  isDeleted,
  isImpacted,
  isSelected,
  isConnectionDropTarget,
  readOnly,
  onMouseDown,
  onMouseEnter,
  onMouseLeave,
  onBlockClick,
  onDeleteClick,
  onUndoClick,
  onConnectionHandleMouseDown,
}: WorkflowBlockProps) {
  const mouseDownPosRef = useRef<{ x: number; y: number } | null>(null);

  // Unified mousedown: always track position for click detection;
  // only start drag when not readOnly/isDeleted.
  const handleMouseDown = (e: React.MouseEvent) => {
    mouseDownPosRef.current = { x: e.clientX, y: e.clientY };
    // Stop propagation so the canvas background doesn't see this as a background click
    e.stopPropagation();
    if (!readOnly && !isDeleted && onMouseDown) {
      onMouseDown(e);
    }
  };

  // Mouseup: detect click (small movement) vs drag.
  // NOTE: do NOT call e.stopPropagation() here. React 17+ attaches its
  // listener to the root container; stopPropagation also calls the native
  // event's stopPropagation, which would silently kill the event before it
  // reaches our window.addEventListener("mouseup", ...) drag/connection
  // handlers. The canvas background onMouseUp already guards itself with an
  // e.target check so no unwanted deselect fires.
  const handleMouseUp = (e: React.MouseEvent) => {
    if (mouseDownPosRef.current) {
      const dx = e.clientX - mouseDownPosRef.current.x;
      const dy = e.clientY - mouseDownPosRef.current.y;
      if (Math.sqrt(dx * dx + dy * dy) < 4) {
        onBlockClick?.();
      }
      mouseDownPosRef.current = null;
    }
  };
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
    cursor: isDeleted
      ? "not-allowed"
      : readOnly
        ? "default"
        : isDragging
          ? "grabbing"
          : "grab",
    userSelect: "none",
    // Elevate dragging block above siblings
    zIndex: isDragging ? 100 : 1,
    opacity: isDragging ? 0.85 : 1,
    // boxShadow intentionally omitted — each shape applies its own shadow
    // so the shadow follows the actual shape (circle/diamond/rect) rather
    // than the rectangular 180×90 bounding box.
    willChange: isDragging ? "left, top" : undefined,
  };

  // Deleted block overlay and badge
  const deletedOverlay = isDeleted ? (
    <>
      <div
        style={{
          position: "absolute",
          inset: 0,
          background: "rgba(220,38,38,0.18)",
          zIndex: 3,
          pointerEvents: "none",
          borderRadius: "inherit",
        }}
      />
      <div
        style={{
          position: "absolute",
          top: 3,
          left: 3,
          zIndex: 4,
          background: "#dc2626",
          color: "white",
          fontSize: 8,
          fontWeight: 700,
          letterSpacing: "0.05em",
          padding: "1px 4px",
          borderRadius: 3,
          pointerEvents: "none",
        }}
      >
        DELETED
      </div>
    </>
  ) : null;

  // Impacted block indicator — amber exclamation at top-left
  const impactedBadge =
    isImpacted && !isDeleted ? (
      <div
        style={{
          position: "absolute",
          top: 3,
          left: 3,
          width: 16,
          height: 16,
          borderRadius: "50%",
          background: "#f59e0b",
          color: "white",
          fontSize: 10,
          fontWeight: 900,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          zIndex: 2,
          pointerEvents: "none",
        }}
        title="This block is impacted by a pending deletion"
      >
        !
      </div>
    ) : null;

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

  // "NEW" badge — shown in top-left corner for draft steps not yet in the file
  const newBadge = step.isNew ? (
    <div
      style={{
        position: "absolute",
        top: 3,
        left: 3,
        zIndex: 2,
        background: "#22c55e",
        color: "white",
        fontSize: 8,
        fontWeight: 700,
        letterSpacing: "0.05em",
        padding: "1px 4px",
        borderRadius: 3,
        pointerEvents: "none",
      }}
    >
      NEW
    </div>
  ) : null;

  // Trash icon — shown on hover of non-deleted, non-new blocks in edit mode
  const trashIcon =
    !readOnly &&
    !step.isNew &&
    !isDeleted &&
    isHovered &&
    !isDragging &&
    onDeleteClick ? (
      <button
        onMouseDown={(e) => e.stopPropagation()}
        onClick={(e) => {
          e.stopPropagation();
          onDeleteClick();
        }}
        style={{
          position: "absolute",
          top: 4,
          right: 26,
          width: 18,
          height: 18,
          borderRadius: "50%",
          border: "1px solid #dc2626",
          background: "rgba(255,255,255,0.85)",
          cursor: "pointer",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: 0,
          color: "#dc2626",
          opacity: 0.8,
          zIndex: 2,
        }}
        title="Delete block"
        aria-label="Delete block"
      >
        <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
          <line
            x1="1"
            y1="3"
            x2="9"
            y2="3"
            stroke="currentColor"
            strokeWidth="1.2"
            strokeLinecap="round"
          />
          <rect
            x="2"
            y="3"
            width="6"
            height="5.5"
            rx="0.5"
            stroke="currentColor"
            strokeWidth="1.1"
          />
          <line
            x1="4"
            y1="3"
            x2="4"
            y2="8"
            stroke="currentColor"
            strokeWidth="0.9"
          />
          <line
            x1="6"
            y1="3"
            x2="6"
            y2="8"
            stroke="currentColor"
            strokeWidth="0.9"
          />
          <path
            d="M3.5 3V2C3.5 1.72 3.72 1.5 4 1.5H6C6.28 1.5 6.5 1.72 6.5 2V3"
            stroke="currentColor"
            strokeWidth="1"
          />
        </svg>
      </button>
    ) : null;

  // Undo icon — shown on hover of deleted blocks to cancel the pending deletion
  const undoIcon =
    !readOnly && isDeleted && isHovered && onUndoClick ? (
      <button
        onMouseDown={(e) => e.stopPropagation()}
        onClick={(e) => {
          e.stopPropagation();
          onUndoClick();
        }}
        style={{
          position: "absolute",
          top: 4,
          right: 26,
          width: 18,
          height: 18,
          borderRadius: "50%",
          border: "1px solid #9ca3af",
          background: "rgba(255,255,255,0.85)",
          cursor: "pointer",
          fontSize: 12,
          fontWeight: 700,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: 0,
          zIndex: 2,
          color: "#6b7280",
          lineHeight: 1,
        }}
        title="Undo deletion"
        aria-label="Undo deletion"
      >
        ↩
      </button>
    ) : null;

  const sharedOuterProps = {
    style: outerStyle,
    onMouseDown: handleMouseDown,
    onMouseUp: handleMouseUp,
    onMouseEnter,
    onMouseLeave,
  };

  // Connection handles — shown on hover for interactive (non-read-only, non-deleted) blocks.
  // Four small blue circles at the midpoint of each edge.
  const showHandles =
    !readOnly && !isDeleted && !step.isNew && isHovered && !isDragging;

  const handleBaseStyle: React.CSSProperties = {
    position: "absolute",
    width: 12,
    height: 12,
    borderRadius: "50%",
    background: "#3b82f6",
    border: "2px solid white",
    cursor: "crosshair",
    zIndex: 6,
    boxShadow: "0 1px 4px rgba(0,0,0,0.25)",
  };

  const connectionHandles = showHandles ? (
    <>
      {/* Top */}
      <div
        onMouseDown={(e) => {
          e.stopPropagation();
          e.preventDefault();
          onConnectionHandleMouseDown?.(e, "top");
        }}
        style={{
          ...handleBaseStyle,
          top: -6,
          left: "50%",
          transform: "translateX(-50%)",
        }}
      />
      {/* Bottom */}
      <div
        onMouseDown={(e) => {
          e.stopPropagation();
          e.preventDefault();
          onConnectionHandleMouseDown?.(e, "bottom");
        }}
        style={{
          ...handleBaseStyle,
          bottom: -6,
          left: "50%",
          transform: "translateX(-50%)",
        }}
      />
      {/* Left */}
      <div
        onMouseDown={(e) => {
          e.stopPropagation();
          e.preventDefault();
          onConnectionHandleMouseDown?.(e, "left");
        }}
        style={{
          ...handleBaseStyle,
          left: -6,
          top: "50%",
          transform: "translateY(-50%)",
        }}
      />
      {/* Right */}
      <div
        onMouseDown={(e) => {
          e.stopPropagation();
          e.preventDefault();
          onConnectionHandleMouseDown?.(e, "right");
        }}
        style={{
          ...handleBaseStyle,
          right: -6,
          top: "50%",
          transform: "translateY(-50%)",
        }}
      />
    </>
  ) : null;

  // ── Ellipse (start) ──────────────────────────────────────
  // The boxShadow is on the inner circle div (which has borderRadius:50%) so
  // the shadow and highlight ring are circular, not rectangular.
  if (styles.shape === "ellipse") {
    return (
      <div
        style={outerStyle}
        onMouseDown={handleMouseDown}
        onMouseUp={handleMouseUp}
        onMouseEnter={onMouseEnter}
        onMouseLeave={onMouseLeave}
      >
        <div
          style={{
            position: "absolute",
            inset: 0,
            borderRadius: "50%",
            backgroundColor: styles.bg,
            border: `${styles.borderWidth}px ${step.isNew ? "dashed" : "solid"} ${styles.border}`,
            boxShadow: isDragging
              ? "0 8px 24px rgba(0,0,0,0.18)"
              : isConnectionDropTarget
                ? "0 0 0 3px #22c55e, 0 0 10px rgba(34,197,94,0.45)"
                : isSelected
                  ? "0 0 0 2px #3b82f6, 0 0 0 5px rgba(59,130,246,0.18)"
                  : isHighlighted
                    ? "0 0 0 3px rgba(59,130,246,0.35), 0 1px 4px rgba(0,0,0,0.08)"
                    : "0 1px 4px rgba(0,0,0,0.08)",
          }}
        />
        {newBadge}
        {deletedOverlay}
        {impactedBadge}
        {textContent}
        {trashIcon}
        {undoIcon}
        {connectionHandles}
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
      : isConnectionDropTarget
        ? "drop-shadow(0 0 6px rgba(34,197,94,0.9))"
        : isSelected
          ? "drop-shadow(0 0 4px rgba(59,130,246,0.8))"
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
        onMouseDown={handleMouseDown}
        onMouseUp={handleMouseUp}
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
            {...(step.isNew ? { strokeDasharray: "6 3" } : {})}
          />
        </svg>
        {newBadge}
        {deletedOverlay}
        {impactedBadge}
        {textContent}
        {trashIcon}
        {undoIcon}
        {connectionHandles}
      </div>
    );
  }

  // ── Rectangle (default) ──────────────────────────────────
  return (
    <div {...sharedOuterProps}>
      <div
        style={{
          position: "absolute",
          inset: 0,
          backgroundColor: styles.bg,
          border: `${styles.borderWidth}px ${step.isNew ? "dashed" : "solid"} ${styles.border}`,
          boxShadow: isDragging
            ? "0 8px 24px rgba(0,0,0,0.18)"
            : isConnectionDropTarget
              ? "0 0 0 3px #22c55e, 0 0 10px rgba(34,197,94,0.45)"
              : isSelected
                ? "0 0 0 2px #3b82f6, 0 0 0 5px rgba(59,130,246,0.18)"
                : isHighlighted
                  ? "0 0 0 3px rgba(59,130,246,0.35), 0 1px 4px rgba(0,0,0,0.08)"
                  : "0 1px 4px rgba(0,0,0,0.08)",
        }}
      />
      {newBadge}
      {deletedOverlay}
      {impactedBadge}
      {textContent}
      {trashIcon}
      {undoIcon}
      {connectionHandles}
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
  /** IDs of steps that are pending deletion */
  deletedStepIds: Set<string>;
  /** "fromId-toId" keys for connections pending removal */
  removedConnectionKeys: Set<string>;
  /** Called when the user clicks a transition line */
  onTransitionClick?: (
    t: ParsedWorkflowTransition,
    pos: { x: number; y: number },
  ) => void;
}

function TransitionLines({
  transitions,
  centerMap,
  canvasWidth,
  canvasHeight,
  deletedStepIds,
  removedConnectionKeys,
  onTransitionClick,
}: TransitionLinesProps) {
  return (
    <svg
      style={{
        position: "absolute",
        inset: 0,
        // pointerEvents "all" so hit-area lines receive click events.
        // Individual non-interactive elements still use pointerEvents "none".
        pointerEvents: onTransitionClick ? "all" : "none",
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

        // Visual overrides for deleted endpoints or pending-removal connections
        const endpointDeleted =
          deletedStepIds.has(t.fromStepId) || deletedStepIds.has(t.toStepId);
        const connectionKey = `${t.fromStepId}-${t.toStepId}`;
        const isPendingRemoval = removedConnectionKeys.has(connectionKey);

        let strokeColor: string;
        let strokeDasharray: string | undefined;
        let strokeOpacity: number;
        let markerId: string;

        if (endpointDeleted) {
          // Lines connected to a deleted block: dashed red
          strokeColor = "#dc2626";
          strokeDasharray = "8 4";
          strokeOpacity = 0.5;
          markerId = "ewa-arrow-disable"; // reuse red arrowhead
        } else if (isPendingRemoval) {
          // Lines pending removal: dashed grey
          strokeColor = "#9ca3af";
          strokeDasharray = "4 4";
          strokeOpacity = 0.4;
          markerId = "ewa-arrow-async"; // reuse orange arrowhead (visually muted by opacity)
        } else if (t.isNew) {
          // New (draft) lines: dashed with original colour
          strokeColor = isDisable
            ? "#EE1111"
            : isSynchronous
              ? "#FF37F0"
              : "#FF9A1E";
          strokeDasharray = "6 3";
          strokeOpacity = 1;
          markerId = isDisable
            ? "ewa-arrow-disable"
            : isSynchronous
              ? "ewa-arrow-sync"
              : "ewa-arrow-async";
        } else {
          // Normal line
          strokeColor = isDisable
            ? "#EE1111"
            : isSynchronous
              ? "#FF37F0"
              : "#FF9A1E";
          strokeDasharray = undefined;
          strokeOpacity = 1;
          markerId = isDisable
            ? "ewa-arrow-disable"
            : isSynchronous
              ? "ewa-arrow-sync"
              : "ewa-arrow-async";
        }

        const lineAttrs = {
          stroke: strokeColor,
          strokeWidth: 2,
          ...(strokeDasharray ? { strokeDasharray } : {}),
          ...(strokeOpacity < 1 ? { opacity: strokeOpacity } : {}),
          markerEnd: `url(#${markerId})`,
        };

        // Self-transition: draw a small cubic-Bezier arc above the block
        if (t.fromStepId === t.toStepId) {
          const { cx, cy } = src;
          const topY = cy - BLOCK_HEIGHT / 2;
          const loopR = 18;
          const loopX1 = cx - loopR;
          const loopX2 = cx + loopR;
          const loopArcY = topY - loopR * 1.2;
          const path = `M ${loopX1} ${topY} C ${loopX1} ${loopArcY}, ${loopX2} ${loopArcY}, ${loopX2} ${topY}`;
          return <path key={t.id} d={path} fill="none" {...lineAttrs} />;
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

        // Click handler — captures viewport coords, converts to canvas-local
        const handleLineClick = onTransitionClick
          ? (e: React.MouseEvent<SVGElement>) => {
              e.stopPropagation();
              const svgRect = (e.target as SVGElement)
                .closest("svg")
                ?.getBoundingClientRect();
              if (svgRect) {
                onTransitionClick(t, {
                  x: e.clientX - svgRect.left,
                  y: e.clientY - svgRect.top,
                });
              }
            }
          : undefined;

        return (
          <g key={t.id}>
            {/* Visible line */}
            <line
              x1={x1}
              y1={y1}
              x2={x2}
              y2={y2}
              {...lineAttrs}
              style={{ pointerEvents: "none" }}
            />
            {/* Wide invisible hit-area for easier clicking */}
            {handleLineClick && (
              <line
                x1={x1}
                y1={y1}
                x2={x2}
                y2={y2}
                stroke="transparent"
                strokeWidth={14}
                style={{ pointerEvents: "stroke", cursor: "pointer" }}
                onClick={handleLineClick}
              />
            )}
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
  onBlockClick,
  selectedStepId,
  onInfoFieldChange: _onInfoFieldChange,
  onAddConnectionDraft,
  onAddTransitionDraft,
  onTransitionClick: onTransitionClickProp,
  zoomLevel,
  highlightedStepId,
  readOnly = false,
  blockParameterSchemas: _blockParameterSchemas,
  allActivities: _allActivities,
  onParametersChange: _onParametersChange,
  onDeleteBlock,
  onUndoDeleteBlock,
  onRemoveConnection,
  onUndoRemoveConnection: _onUndoRemoveConnection,
}: EditableWorkflowCanvasProps) {
  const zoom = zoomLevel ?? 1;

  // ── Context menu state (click on transition line) ─────
  const [contextMenu, setContextMenu] = useState<{
    transition: ParsedWorkflowTransition;
    pos: { x: number; y: number };
  } | null>(null);
  const [editingTransition, setEditingTransition] =
    useState<ParsedWorkflowTransition | null>(null);

  // Internal handler: opens context menu
  const handleTransitionClick = (
    t: ParsedWorkflowTransition,
    pos: { x: number; y: number },
  ) => {
    setContextMenu({ transition: t, pos });
    onTransitionClickProp?.(t, pos);
  };

  // ── Deleted / impacted / removed-connection Sets ─────────
  // Derived from pendingChanges; used by WorkflowBlock and TransitionLines
  // to apply visual overrides without altering workflow data.
  const deletedStepIds = useMemo(
    () =>
      new Set(
        pendingChanges
          .filter((c): c is DeletedBlockDraft => c.kind === "delete-step")
          .map((c) => c.stepId),
      ),
    [pendingChanges],
  );

  const impactedStepIds = useMemo(
    () =>
      new Set(
        pendingChanges
          .filter((c): c is DeletedBlockDraft => c.kind === "delete-step")
          .flatMap((c) => c.impactedStepIds),
      ),
    [pendingChanges],
  );

  const removedConnectionKeys = useMemo(
    () =>
      new Set(
        pendingChanges
          .filter(
            (c): c is RemovedConnectionDraft => c.kind === "remove-connection",
          )
          .map((c) => `${c.fromStepId}-${c.toStepId}`),
      ),
    [pendingChanges],
  );

  // ── Block-drag rendering state ────────────────────────────
  // activeDragStepId / dragPixel are only set after the movement threshold
  // (≥ 4 px screen pixels) is crossed.  All gesture tracking lives in
  // closure variables inside handleBlockMouseDown so there is no async
  // effect re-mount gap between "drag started" and "listeners live".
  const [activeDragStepId, setActiveDragStepId] = useState<string | null>(null);
  const [dragPixel, setDragPixel] = useState<{ x: number; y: number } | null>(
    null,
  );

  // ── Connection-drag state ─────────────────────────────
  const [connectionDrag, setConnectionDrag] =
    useState<ConnectionDragState | null>(null);
  const [pendingConnectionDraft, setPendingConnectionDraft] = useState<{
    fromStepId: string;
    toStepId: string;
  } | null>(null);

  // Refs for latest workflow data — used inside drag-handler closures so
  // hit-tests always see current step positions without restarting effects.
  const workflowStepsRef = useRef(workflow.steps);
  const pendingChangesRef = useRef(pendingChanges);
  useEffect(() => {
    workflowStepsRef.current = workflow.steps;
  }, [workflow.steps]);
  useEffect(() => {
    pendingChangesRef.current = pendingChanges;
  }, [pendingChanges]);

  // Ref on the canvas div — used to convert client → canvas-local coords.
  const canvasInnerRef = useRef<HTMLDivElement>(null);

  // Kept in sync so drag closures always divide by the current zoom value.
  const zoomRef = useRef(zoom);
  useEffect(() => {
    zoomRef.current = zoom;
  }, [zoom]);

  // Ref for canvas background click detection
  const canvasMouseDownPosRef = useRef<{ x: number; y: number } | null>(null);

  // ── Hover state ──────────────────────────────────────
  const [hoveredStepId, setHoveredStepId] = useState<string | null>(null);

  const onBlockMoveRef = useRef(onBlockMove);
  useEffect(() => {
    onBlockMoveRef.current = onBlockMove;
  }, [onBlockMove]);

  // ── Block drag ────────────────────────────────────────────
  // Listeners are attached synchronously in the mousedown handler so there
  // is no async re-render gap between "gesture started" and "listeners live".
  const handleBlockMouseDown = (
    e: React.MouseEvent,
    step: ParsedWorkflowStep,
  ) => {
    if (readOnly || connectionDrag) return;
    e.stopPropagation();

    const { pixelX, pixelY } = effectivePosition(
      step,
      pendingChanges,
      null,
      null,
    );
    const startMouseX = e.clientX;
    const startMouseY = e.clientY;
    const startPixelX = pixelX;
    const startPixelY = pixelY;
    const stepId = step.id;
    // Closure variable — no React state needed to track threshold.
    let crossed = false;

    const handleMouseMove = (me: MouseEvent) => {
      const dxScreen = me.clientX - startMouseX;
      const dyScreen = me.clientY - startMouseY;
      if (!crossed) {
        if (Math.sqrt(dxScreen * dxScreen + dyScreen * dyScreen) < 4) return;
        crossed = true;
        setActiveDragStepId(stepId);
      }
      const z = zoomRef.current;
      setDragPixel({
        x: startPixelX + dxScreen / z,
        y: startPixelY + dyScreen / z,
      });
    };

    const handleMouseUp = (me: MouseEvent) => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
      if (crossed) {
        const z = zoomRef.current;
        const newPixelX = startPixelX + (me.clientX - startMouseX) / z;
        const newPixelY = startPixelY + (me.clientY - startMouseY) / z;
        const newGridX = Math.max(
          0,
          Math.round((newPixelX - BLOCK_OFFSET_X) / CELL_WIDTH),
        );
        const newGridY = Math.max(
          0,
          Math.round((newPixelY - BLOCK_OFFSET_Y) / CELL_HEIGHT),
        );
        onBlockMoveRef.current(stepId, newGridX, newGridY);
      }
      setActiveDragStepId(null);
      setDragPixel(null);
    };

    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);
  };

  // ── Connection drag ───────────────────────────────────────
  // Same pattern: listeners attached immediately so a quick mousedown+up
  // sequence never misses the mouseup event.
  const handleConnectionHandleMouseDown = (
    e: React.MouseEvent,
    step: ParsedWorkflowStep,
    side: "top" | "bottom" | "left" | "right",
  ) => {
    if (readOnly || activeDragStepId !== null) return;
    e.stopPropagation();
    e.preventDefault();

    const { pixelX, pixelY } = effectivePosition(
      step,
      pendingChanges,
      null,
      null,
    );
    const cx = pixelX + BLOCK_WIDTH / 2;
    const cy = pixelY + BLOCK_HEIGHT / 2;
    let startX = cx;
    let startY = cy;
    if (side === "right") { startX = pixelX + BLOCK_WIDTH; startY = cy; }
    if (side === "left")  { startX = pixelX;                startY = cy; }
    if (side === "top")   { startX = cx;                    startY = pixelY; }
    if (side === "bottom"){ startX = cx;                    startY = pixelY + BLOCK_HEIGHT; }

    const fromStepId = step.id;
    // Closure variable — updated synchronously in mousemove, read in mouseup.
    let lastHoverTargetId: string | null = null;

    setConnectionDrag({
      fromStepId,
      fromPixelX: startX,
      fromPixelY: startY,
      currentX: startX,
      currentY: startY,
      hoverTargetId: null,
    });

    const handleMouseMove = (me: MouseEvent) => {
      const el = canvasInnerRef.current;
      const rect = el?.getBoundingClientRect();
      if (!rect) return;
      const z = zoomRef.current;
      const canvasX = (me.clientX - rect.left) / z;
      const canvasY = (me.clientY - rect.top) / z;

      const targetStep = workflowStepsRef.current.find((s) => {
        const { pixelX: sx, pixelY: sy } = effectivePosition(
          s,
          pendingChangesRef.current,
          null,
          null,
        );
        return (
          canvasX >= sx &&
          canvasX <= sx + BLOCK_WIDTH &&
          canvasY >= sy &&
          canvasY <= sy + BLOCK_HEIGHT &&
          s.id !== fromStepId
        );
      });

      lastHoverTargetId = targetStep?.id ?? null;
      setConnectionDrag((prev) =>
        prev
          ? {
              ...prev,
              currentX: canvasX,
              currentY: canvasY,
              hoverTargetId: lastHoverTargetId,
            }
          : null,
      );
    };

    const handleMouseUp = () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
      setConnectionDrag(null);
      if (lastHoverTargetId) {
        setPendingConnectionDraft({ fromStepId, toStepId: lastHoverTargetId });
      }
    };

    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);
  };

  if (workflow.steps.length === 0) {
    return (
      <div style={{ padding: 24, textAlign: "center", color: "#666" }}>
        No steps found
      </div>
    );
  }

  // ── Compute effective pixel positions for every step ──────
  const stepPositions = workflow.steps.map((step) => ({
    step,
    ...effectivePosition(step, pendingChanges, activeDragStepId, dragPixel),
  }));

  // ── Canvas dimensions (enough to show all blocks + 2 cell padding) ──
  const edits = editChanges(pendingChanges);
  const maxGX = Math.max(
    ...workflow.steps.map((s) => {
      const p = edits.find((c) => c.stepId === s.id);
      return p?.fields.x ?? s.displayOptions.x;
    }),
  );
  const maxGY = Math.max(
    ...workflow.steps.map((s) => {
      const p = edits.find((c) => c.stepId === s.id);
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

  const isDraggingAny = activeDragStepId !== null;

  // Canvas renders at its natural pixel size; zoom is applied by the
  // App-level wrapper (spacer + CSS scale) so scrollbars are always correct.
  return (
    <>
      <div
        ref={canvasInnerRef}
        className={`editable-canvas${isDraggingAny ? " canvas--dragging" : ""}`}
        style={{
          position: "relative",
          width: canvasWidth,
          height: canvasHeight,
        }}
        onMouseDown={(e) => {
          // Track background clicks for deselect (blocks stop propagation)
          if (e.target === canvasInnerRef.current) {
            canvasMouseDownPosRef.current = { x: e.clientX, y: e.clientY };
          }
        }}
        onMouseUp={(e) => {
          // Deselect if background was clicked without dragging
          if (
            e.target === canvasInnerRef.current &&
            canvasMouseDownPosRef.current
          ) {
            const dx = e.clientX - canvasMouseDownPosRef.current.x;
            const dy = e.clientY - canvasMouseDownPosRef.current.y;
            if (Math.sqrt(dx * dx + dy * dy) < 4) {
              onBlockClick?.(null);
            }
            canvasMouseDownPosRef.current = null;
          }
        }}
      >
        {/* SVG transition lines sit below the block layer */}
        <TransitionLines
          transitions={workflow.transitions}
          centerMap={centerMap}
          canvasWidth={canvasWidth}
          canvasHeight={canvasHeight}
          deletedStepIds={deletedStepIds}
          removedConnectionKeys={removedConnectionKeys}
          onTransitionClick={!readOnly ? handleTransitionClick : undefined}
        />

        {/* Block layer */}
        {stepPositions.map(({ step, pixelX, pixelY }) => (
          <WorkflowBlock
            key={step.id}
            step={step}
            pixelX={pixelX}
            pixelY={pixelY}
            isDragging={activeDragStepId === step.id}
            isHovered={hoveredStepId === step.id}
            isHighlighted={highlightedStepId === step.id}
            isDeleted={deletedStepIds.has(step.id)}
            isImpacted={impactedStepIds.has(step.id)}
            isSelected={selectedStepId === step.id}
            isConnectionDropTarget={connectionDrag?.hoverTargetId === step.id}
            readOnly={readOnly}
            onMouseDown={(e) => handleBlockMouseDown(e, step)}
            onMouseEnter={() => setHoveredStepId(step.id)}
            onMouseLeave={() => setHoveredStepId(null)}
            onBlockClick={() => onBlockClick?.(step)}
            onDeleteClick={
              onDeleteBlock ? () => onDeleteBlock(step) : undefined
            }
            onUndoClick={
              onUndoDeleteBlock ? () => onUndoDeleteBlock(step.id) : undefined
            }
            onConnectionHandleMouseDown={
              !readOnly && !deletedStepIds.has(step.id)
                ? (e, side) => handleConnectionHandleMouseDown(e, step, side)
                : undefined
            }
          />
        ))}

        {/* Connection context menu — opened when user clicks a line */}
        {contextMenu && (
          <ConnectionContextMenu
            transition={contextMenu.transition}
            position={contextMenu.pos}
            allSteps={workflow.steps}
            onEdit={() => {
              setEditingTransition(contextMenu.transition);
              setContextMenu(null);
            }}
            onDelete={() => {
              const t = contextMenu.transition;
              const fromStep = workflow.steps.find(
                (s) => s.id === t.fromStepId,
              );
              const toStep = workflow.steps.find((s) => s.id === t.toStepId);
              onRemoveConnection?.({
                tempId: `rm-click-${t.id}`,
                fromStepId: t.fromStepId,
                fromStepName: fromStep?.name ?? t.fromStepId,
                fromVariableName: fromStep?.variableName ?? "",
                toStepId: t.toStepId,
                toStepName: toStep?.name ?? t.toStepId,
                toVariableName: toStep?.variableName ?? "",
                synchronous: t.synchronous,
                isDisable: t.type === "disable",
              });
              setContextMenu(null);
            }}
            onClose={() => setContextMenu(null)}
          />
        )}

        {/* Connection edit modal — opened via context menu Edit action */}
        {editingTransition && (
          <ConnectionEditModal
            transition={editingTransition}
            allSteps={workflow.steps}
            onSave={(result: ConnectionEditResult) => {
              onRemoveConnection?.(result.removal);
              if (result.newConnection)
                onAddConnectionDraft?.(result.newConnection);
              if (result.newTransition)
                onAddTransitionDraft?.(result.newTransition);
            }}
            onCancel={() => setEditingTransition(null)}
          />
        )}

        {/* Connection-drag preview line */}
        {connectionDrag && (
          <svg
            style={{
              position: "absolute",
              inset: 0,
              pointerEvents: "none",
              zIndex: 50,
              overflow: "visible",
            }}
            width={canvasWidth}
            height={canvasHeight}
          >
            <line
              x1={connectionDrag.fromPixelX}
              y1={connectionDrag.fromPixelY}
              x2={connectionDrag.currentX}
              y2={connectionDrag.currentY}
              stroke={connectionDrag.hoverTargetId ? "#3b82f6" : "#9ca3af"}
              strokeWidth={2}
              strokeDasharray="8 4"
            />
            {connectionDrag.hoverTargetId &&
              (() => {
                const tgt = workflow.steps.find(
                  (s) => s.id === connectionDrag.hoverTargetId,
                );
                if (!tgt) return null;
                const { pixelX: tx, pixelY: ty } = effectivePosition(
                  tgt,
                  pendingChanges,
                  null,
                  null,
                );
                return (
                  <rect
                    x={tx - 5}
                    y={ty - 5}
                    width={BLOCK_WIDTH + 10}
                    height={BLOCK_HEIGHT + 10}
                    rx={8}
                    fill="none"
                    stroke="#22c55e"
                    strokeWidth={2.5}
                    strokeDasharray="7 3"
                  />
                );
              })()}
          </svg>
        )}
      </div>

      {/* AddConnectionModal via portal so position:fixed works outside
		     the CSS transform applied by CanvasPane */}
      {pendingConnectionDraft &&
        createPortal(
          <AddConnectionModal
            existingSteps={workflow.steps}
            existingTransitions={workflow.transitions}
            initialFromStepId={pendingConnectionDraft.fromStepId}
            initialToStepIds={[pendingConnectionDraft.toStepId]}
            onAdd={(draft) => {
              onAddConnectionDraft?.(draft);
              setPendingConnectionDraft(null);
            }}
            onCancel={() => setPendingConnectionDraft(null)}
          />,
          document.body,
        )}
    </>
  );
}
