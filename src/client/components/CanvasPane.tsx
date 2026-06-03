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
// Types
// ─────────────────────────────────────────────────────────────

interface ViewState {
	zoom: number;
	panX: number;
	panY: number;
}

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
 * Self-contained canvas panel that owns pan + zoom state, auto-fit on load,
 * the CanvasToolbar, and the transform wrapper.
 *
 * The viewport always fills the available area (overflow: hidden — no
 * scrollbars). The workflow is repositioned and scaled via a single CSS
 * transform: translate(panX, panY) scale(zoom).
 *
 * Interaction model:
 *   - Left-click-drag on canvas background → pan
 *   - Left-click-drag on a block (edit mode) → move block (stopPropagation
 *     in EditableWorkflowCanvas prevents pan from starting)
 *   - Mouse wheel → zoom toward cursor
 *   - Toolbar +/- → zoom toward viewport centre
 *   - Toolbar ⊡ → fit workflow to screen
 */
export function CanvasPane({
	workflow,
	mode,
	pendingChanges = [],
	highlightedStepId,
	onBlockMove,
	onInfoFieldChange,
}: CanvasPaneProps) {
	const [view, setView] = useState<ViewState>({ zoom: 1.0, panX: 0, panY: 0 });
	const [showLegend, setShowLegend] = useState(false);
	const [isPanning, setIsPanning] = useState(false);

	/** The DOM node for the viewport div — used for dimension queries and
	 *  the non-passive wheel listener. */
	const containerRef = useRef<HTMLDivElement>(null);

	/** Tracks whether a pan drag is in progress (avoids stale closure in global
	 *  mousemove/mouseup handlers). */
	const isPanningRef = useRef(false);

	/** Captures the mouse + pan values at the start of each pan gesture. */
	const panStartRef = useRef({ mouseX: 0, mouseY: 0, panX: 0, panY: 0 });

	// ── Fit to screen ─────────────────────────────────────────

	const handleFitToScreen = useCallback(() => {
		const { width: cw, height: ch } = computeCanvasSize(
			workflow.steps,
			pendingChanges,
		);
		if (!containerRef.current || cw === 0 || ch === 0) {
			setView({ zoom: 1.0, panX: 0, panY: 0 });
			return;
		}
		const { clientWidth, clientHeight } = containerRef.current;
		const margin = 48;
		const fitZoom = Math.min(
			(clientWidth - margin) / cw,
			(clientHeight - margin) / ch,
			MAX_ZOOM,
		);
		const clampedZoom = Math.max(MIN_ZOOM, parseFloat(fitZoom.toFixed(2)));
		// Centre the workflow inside the viewport
		const newPanX = (clientWidth - cw * clampedZoom) / 2;
		const newPanY = (clientHeight - ch * clampedZoom) / 2;
		setView({ zoom: clampedZoom, panX: newPanX, panY: newPanY });
	}, [workflow.steps, pendingChanges]);

	// ── Zoom toward viewport centre (toolbar buttons) ─────────

	const handleZoomIn = useCallback(() => {
		setView((v) => {
			const newZoom = Math.min(
				MAX_ZOOM,
				parseFloat((v.zoom + ZOOM_STEP).toFixed(2)),
			);
			if (!containerRef.current) return { ...v, zoom: newZoom };
			const cx = containerRef.current.clientWidth / 2;
			const cy = containerRef.current.clientHeight / 2;
			const factor = newZoom / v.zoom;
			return {
				zoom: newZoom,
				panX: cx - (cx - v.panX) * factor,
				panY: cy - (cy - v.panY) * factor,
			};
		});
	}, []);

	const handleZoomOut = useCallback(() => {
		setView((v) => {
			const newZoom = Math.max(
				MIN_ZOOM,
				parseFloat((v.zoom - ZOOM_STEP).toFixed(2)),
			);
			if (!containerRef.current) return { ...v, zoom: newZoom };
			const cx = containerRef.current.clientWidth / 2;
			const cy = containerRef.current.clientHeight / 2;
			const factor = newZoom / v.zoom;
			return {
				zoom: newZoom,
				panX: cx - (cx - v.panX) * factor,
				panY: cy - (cy - v.panY) * factor,
			};
		});
	}, []);

	// ── Wheel zoom — must be non-passive to call preventDefault ─

	useEffect(() => {
		const el = containerRef.current;
		if (!el) return;

		const handleWheel = (e: WheelEvent) => {
			e.preventDefault();
			const rect = el.getBoundingClientRect();
			const mouseX = e.clientX - rect.left;
			const mouseY = e.clientY - rect.top;
			// Zoom in on wheel-up (deltaY < 0), out on wheel-down (deltaY > 0)
			const delta = e.deltaY > 0 ? 0.9 : 1.1;
			setView((v) => {
				const newZoom = Math.min(
					MAX_ZOOM,
					Math.max(MIN_ZOOM, parseFloat((v.zoom * delta).toFixed(3))),
				);
				const factor = newZoom / v.zoom;
				return {
					zoom: newZoom,
					panX: mouseX - (mouseX - v.panX) * factor,
					panY: mouseY - (mouseY - v.panY) * factor,
				};
			});
		};

		// { passive: false } is required so we can call preventDefault()
		el.addEventListener("wheel", handleWheel, { passive: false });
		return () => el.removeEventListener("wheel", handleWheel);
	}, []); // attach once; handler uses functional updater so no stale closure

	// ── Global pan handlers (mousemove / mouseup on window) ───

	useEffect(() => {
		const handleMouseMove = (e: MouseEvent) => {
			if (!isPanningRef.current) return;
			const dx = e.clientX - panStartRef.current.mouseX;
			const dy = e.clientY - panStartRef.current.mouseY;
			setView((v) => ({
				...v,
				panX: panStartRef.current.panX + dx,
				panY: panStartRef.current.panY + dy,
			}));
		};

		const handleMouseUp = () => {
			if (isPanningRef.current) {
				isPanningRef.current = false;
				setIsPanning(false);
			}
		};

		window.addEventListener("mousemove", handleMouseMove);
		window.addEventListener("mouseup", handleMouseUp);
		return () => {
			window.removeEventListener("mousemove", handleMouseMove);
			window.removeEventListener("mouseup", handleMouseUp);
		};
	}, []); // attach once

	// ── Auto-fit when workflow identity changes ───────────────

	useEffect(() => {
		// Defer 50 ms so the container has finished laying out before we read
		// its clientWidth / clientHeight.
		const id = setTimeout(() => handleFitToScreen(), 50);
		return () => clearTimeout(id);
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [workflow]); // intentionally only re-fire when the workflow object changes

	// ── No-op block-move fallback for view mode ───────────────

	const noopBlockMove = useCallback(
		(_stepId: string, _gx: number, _gy: number) => {},
		[],
	);

	// ── Destructure for use in JSX ────────────────────────────

	const { zoom, panX, panY } = view;

	// ── Render ────────────────────────────────────────────────

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
			{/* Toolbar — absolutely positioned top-left, floats above viewport */}
			<CanvasToolbar
				zoomLevel={zoom}
				onZoomIn={handleZoomIn}
				onZoomOut={handleZoomOut}
				onFitToScreen={handleFitToScreen}
				showLegend={showLegend}
				onToggleLegend={() => setShowLegend((v) => !v)}
			/>

			{/* Legend overlay — absolutely positioned below toolbar */}
			{showLegend && <WorkflowLegend onClose={() => setShowLegend(false)} />}

			{/*
			 * Viewport — fills all remaining space; overflow:hidden clips content
			 * that pans outside the visible area.  All pan and wheel events are
			 * handled here.
			 */}
			<div
				ref={containerRef}
				onMouseDown={(e) => {
					if (e.button !== 0) return;
					isPanningRef.current = true;
					setIsPanning(true);
					// Capture the starting positions in a ref so the global
					// mousemove handler (which has no closure over view) can
					// compute deltas correctly.
					panStartRef.current = {
						mouseX: e.clientX,
						mouseY: e.clientY,
						panX: view.panX, // fresh from render closure
						panY: view.panY,
					};
					e.preventDefault();
				}}
				style={{
					flex: 1,
					position: "relative",
					overflow: "hidden",
					cursor: isPanning ? "grabbing" : "grab",
				}}
			>
				{/*
				 * Transform layer — a single CSS transform positions and scales
				 * the entire workflow.  No scrollbars; no spacer.
				 */}
				<div
					style={{
						position: "absolute",
						top: 0,
						left: 0,
						transformOrigin: "0 0",
						transform: `translate(${panX}px, ${panY}px) scale(${zoom})`,
					}}
				>
					<EditableWorkflowCanvas
						workflow={workflow}
						pendingChanges={pendingChanges}
						readOnly={mode === "view"}
						highlightedStepId={highlightedStepId}
						zoomLevel={zoom}
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
