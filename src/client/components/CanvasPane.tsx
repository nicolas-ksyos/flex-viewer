import { useState, useEffect, useRef, useCallback } from "react";
import type {
	ParsedWorkflowDefinition,
	ParsedWorkflowStep,
	EditableStepFields,
	StepPendingChange,
} from "../../shared/types";
import { EditableWorkflowCanvas } from "./edit/EditableWorkflowCanvas";
import {
	CanvasToolbar,
	computeCanvasSize,
	ZOOM_STEP,
	MIN_ZOOM,
	MAX_ZOOM,
} from "./CanvasToolbar";
import { WorkflowLegend } from "./WorkflowLegend";

// ─────────────────────────────────────────────────────────────
// Props
// ─────────────────────────────────────────────────────────────

export interface CanvasPaneProps {
	workflow: ParsedWorkflowDefinition;
	/** 'view' = read-only (no drag, no info icon). 'edit' = interactive. */
	mode: "view" | "edit";
	// Edit-mode only:
	pendingChanges?: StepPendingChange[];
	highlightedStepId?: string | null;
	onBlockMove?: (stepId: string, newGridX: number, newGridY: number) => void;
	onInfoFieldChange?: (
		step: ParsedWorkflowStep,
		field: keyof EditableStepFields,
		value: string | number | null,
	) => void;
}

// ─────────────────────────────────────────────────────────────
// CanvasPane
// ─────────────────────────────────────────────────────────────

/**
 * Self-contained canvas panel that owns zoom state, auto-fit on load,
 * the CanvasToolbar, and the zoom wrapper. Renders EditableWorkflowCanvas
 * in either read-only (view) or interactive (edit) mode.
 *
 * Zoom is applied via a spacer + CSS scale pattern so scrollbars always
 * reflect the full zoomed canvas size.
 */
export function CanvasPane({
	workflow,
	mode,
	pendingChanges = [],
	highlightedStepId,
	onBlockMove,
	onInfoFieldChange,
}: CanvasPaneProps) {
	const [zoomLevel, setZoomLevel] = useState(1.0);
	const [showLegend, setShowLegend] = useState(false);
	const containerRef = useRef<HTMLDivElement>(null);

	// ── Zoom handlers ─────────────────────────────────────────

	const handleZoomIn = useCallback(() => {
		setZoomLevel((z) =>
			Math.min(MAX_ZOOM, parseFloat((z + ZOOM_STEP).toFixed(2))),
		);
	}, []);

	const handleZoomOut = useCallback(() => {
		setZoomLevel((z) =>
			Math.max(MIN_ZOOM, parseFloat((z - ZOOM_STEP).toFixed(2))),
		);
	}, []);

	const handleFitToScreen = useCallback(() => {
		const { width: cw, height: ch } = computeCanvasSize(
			workflow.steps,
			pendingChanges,
		);

		if (!containerRef.current || cw === 0 || ch === 0) {
			setZoomLevel(1.0);
			return;
		}

		const { clientWidth, clientHeight } = containerRef.current;
		// Leave a small margin so the workflow doesn't sit flush against edges
		const margin = 48;
		const fit = Math.min(
			(clientWidth - margin) / cw,
			(clientHeight - margin) / ch,
			MAX_ZOOM,
		);
		setZoomLevel(Math.max(MIN_ZOOM, parseFloat(fit.toFixed(2))));
	}, [workflow.steps, pendingChanges]);

	// ── Auto-fit when workflow changes (new seed loaded) ──────
	// eslint-disable-next-line react-hooks/exhaustive-deps
	useEffect(() => {
		// Defer so the container has finished laying out
		const id = setTimeout(() => handleFitToScreen(), 50);
		return () => clearTimeout(id);
	}, [workflow]); // intentionally depend only on workflow identity

	// ── Canvas size for the spacer ────────────────────────────
	const { width: naturalW, height: naturalH } = computeCanvasSize(
		workflow.steps,
		pendingChanges,
	);

	// ── No-op fallbacks for view mode ─────────────────────────
	const noopBlockMove = useCallback(
		(_stepId: string, _gx: number, _gy: number) => {},
		[],
	);

	return (
		<div
			style={{
				flex: 1,
				position: "relative",
				overflow: "hidden",
				display: "flex",
				flexDirection: "column",
			}}
		>
			{/* ── Toolbar (absolutely positioned top-left) ─────── */}
			<CanvasToolbar
				zoomLevel={zoomLevel}
				onZoomIn={handleZoomIn}
				onZoomOut={handleZoomOut}
				onFitToScreen={handleFitToScreen}
				showLegend={showLegend}
				onToggleLegend={() => setShowLegend((v) => !v)}
			/>

			{/* ── Legend overlay (below toolbar) ───────────────── */}
			{showLegend && <WorkflowLegend onClose={() => setShowLegend(false)} />}

			{/* ── Scroll container ─────────────────────────────── */}
			<div
				ref={containerRef}
				style={{ flex: 1, overflow: "auto", position: "relative" }}
			>
				{/*
				 * Spacer: establishes the correct scroll area for the current zoom.
				 * Its dimensions are naturalSize × zoomLevel, which matches the
				 * visual footprint of the CSS-scaled canvas below.
				 */}
				<div
					style={{
						width: naturalW * zoomLevel,
						height: naturalH * zoomLevel,
						// Prevent spacer from capturing pointer events
						pointerEvents: "none",
					}}
				/>

				{/*
				 * Scaled canvas: absolutely positioned so it doesn't push the spacer
				 * around. transform: scale() is applied at top-left origin so it
				 * expands rightward/downward matching the spacer exactly.
				 */}
				<div
					style={{
						position: "absolute",
						top: 0,
						left: 0,
						transformOrigin: "top left",
						transform: `scale(${zoomLevel})`,
					}}
				>
					<EditableWorkflowCanvas
						workflow={workflow}
						pendingChanges={pendingChanges}
						readOnly={mode === "view"}
						highlightedStepId={highlightedStepId}
						// Pass zoomLevel so the canvas can correct drag deltas
						zoomLevel={zoomLevel}
						onBlockMove={
							mode === "edit" && onBlockMove ? onBlockMove : noopBlockMove
						}
						onInfoFieldChange={mode === "edit" ? onInfoFieldChange : undefined}
					/>
				</div>
			</div>
		</div>
	);
}
