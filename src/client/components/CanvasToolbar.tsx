import type React from "react";
import type { ParsedWorkflowStep, StepPendingChange } from "../../shared/types";

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
  pendingChanges: StepPendingChange[],
): { width: number; height: number } {
  if (steps.length === 0) return { width: 440, height: 260 };
  const maxGX = Math.max(
    ...steps.map((s) => {
      const p = pendingChanges.find((c) => c.stepId === s.id);
      return p?.fields.x ?? s.displayOptions.x;
    }),
  );
  const maxGY = Math.max(
    ...steps.map((s) => {
      const p = pendingChanges.find((c) => c.stepId === s.id);
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
