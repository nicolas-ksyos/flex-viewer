import { useState, useEffect, useCallback, useRef } from "react";
import {
  Alert,
  Badge,
  Box,
  Button,
  Heading,
  IconButton,
  Spinner,
  Text,
} from "@ksyos/design-system";
import { ConfigPanel } from "./components/ConfigPanel";
import { KsyosLogo } from "./components/KsyosLogo";
import { WorkflowTabs } from "./components/WorkflowTabs";
import { WorkflowView } from "./components/WorkflowView";
import { DiagnosticsPanel } from "./components/DiagnosticsPanel";
import { useConfig } from "./hooks/useConfig";
import { useSeeds } from "./hooks/useSeeds";
import { useWebSocket } from "./hooks/useWebSocket";
import type { SeedParseResult } from "../shared/types";
import { useEditMode } from "./hooks/useEditMode";
import { EditableWorkflowCanvas } from "./components/edit/EditableWorkflowCanvas";
import { EditSidebar } from "./components/edit/EditSidebar";
import {
  CanvasToolbar,
  computeCanvasSize,
  ZOOM_STEP,
  MIN_ZOOM,
  MAX_ZOOM,
} from "./components/CanvasToolbar";
import { CloneModal } from "./components/CloneModal";

function EmptyStateBox({
  title,
  subtitle,
}: {
  title: string;
  subtitle: string;
}) {
  return (
    <Box
      display="flex"
      flexDirection="column"
      alignItems="center"
      justifyContent="center"
      p={16}
      style={{ textAlign: "center" }}
    >
      <Heading size="small" as="h2">
        {title}
      </Heading>
      <Text color="subtle" style={{ maxWidth: 400 }}>
        {subtitle}
      </Text>
    </Box>
  );
}

export function App() {
  const {
    config,
    loading: configLoading,
    error: configError,
    updateConfig,
    refetch: _refetchConfig,
  } = useConfig();
  const {
    seeds,
    loading: seedsLoading,
    fetchSeeds,
    startWatching,
  } = useSeeds(config?.clientSafePath);
  const { connected, lastResult, lastError } = useWebSocket();

  const [selectedSeed, setSelectedSeed] = useState<string | null>(null);
  const [parseResult, setParseResult] = useState<SeedParseResult | null>(null);
  const [activeWorkflowIndex, setActiveWorkflowIndex] = useState(0);
  const [showConfig, setShowConfig] = useState(false);
  const [sidebarVisible, setSidebarVisible] = useState(true);
  const [zoomLevel, setZoomLevel] = useState(1.0);
  const [showCloneModal, setShowCloneModal] = useState(false);
  const [highlightedStepId, setHighlightedStepId] = useState<string | null>(
    null,
  );
  const canvasContainerRef = useRef<HTMLDivElement>(null);

  const {
    isEditMode,
    pendingChanges,
    enterEditMode,
    exitEditMode,
    recordBlockMove,
    recordFieldChange,
    removeStepChange,
  } = useEditMode();

  // Derive current workflow early so zoom / clone handlers can use it
  const currentWorkflow = parseResult?.workflows[activeWorkflowIndex];

  // ── Wrapped exit — resets UI state alongside hook state ──────
  const handleExitEditMode = useCallback(() => {
    exitEditMode();
    setSidebarVisible(true);
    setHighlightedStepId(null);
  }, [exitEditMode]);

  // ── Zoom handlers ─────────────────────────────────────────────
  const handleZoomIn = useCallback(
    () =>
      setZoomLevel((z) =>
        Math.min(MAX_ZOOM, parseFloat((z + ZOOM_STEP).toFixed(2))),
      ),
    [],
  );
  const handleZoomOut = useCallback(
    () =>
      setZoomLevel((z) =>
        Math.max(MIN_ZOOM, parseFloat((z - ZOOM_STEP).toFixed(2))),
      ),
    [],
  );
  const handleFitToScreen = useCallback(() => {
    if (!currentWorkflow || !canvasContainerRef.current) {
      setZoomLevel(1.0);
      return;
    }
    const { width: cw, height: ch } = computeCanvasSize(
      currentWorkflow.workflow.steps,
      pendingChanges,
    );
    const { clientWidth, clientHeight } = canvasContainerRef.current;
    const fit = Math.min(clientWidth / cw, clientHeight / ch, MAX_ZOOM);
    setZoomLevel(Math.max(MIN_ZOOM, parseFloat(fit.toFixed(2))));
  }, [currentWorkflow, pendingChanges]);

  // ── Lifecycle effects ─────────────────────────────────────────
  useEffect(() => {
    if (config?.lastSelectedSeed && !selectedSeed)
      setSelectedSeed(config.lastSelectedSeed);
    if (config && !config.clientSafePath) setShowConfig(true);
  }, [config, selectedSeed]);

  useEffect(() => {
    if (lastResult) {
      setParseResult(lastResult);
      setActiveWorkflowIndex(0);
    }
  }, [lastResult]);

  useEffect(() => {
    if (selectedSeed && config?.clientSafePath) startWatching(selectedSeed);
  }, [selectedSeed, config?.clientSafePath, startWatching]);

  // ── Seed selection ────────────────────────────────────────────
  const handleSelectSeed = useCallback(
    async (fileName: string) => {
      handleExitEditMode();
      setSidebarVisible(true);
      setSelectedSeed(fileName);
      setParseResult(null);
      setActiveWorkflowIndex(0);
      await updateConfig({ lastSelectedSeed: fileName });
      await startWatching(fileName);
    },
    [updateConfig, startWatching, handleExitEditMode],
  );

  const handleSaveConfig = useCallback(
    async (clientSafePath: string) => {
      await updateConfig({ clientSafePath });
      setSelectedSeed(null);
      setParseResult(null);
      setShowConfig(false);
    },
    [updateConfig],
  );

  // ── Clone handler ─────────────────────────────────────────────
  const handleClone = useCallback(
    async (newFileName: string) => {
      const res = await fetch("/api/seeds/clone", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sourceFileName: selectedSeed, newFileName }),
      });
      const data = await res.json();
      if (!res.ok || !data.success)
        throw new Error(data.error ?? "Clone failed");
      setShowCloneModal(false);
      await fetchSeeds();
      await handleSelectSeed(newFileName);
      enterEditMode();
    },
    [selectedSeed, fetchSeeds, handleSelectSeed, enterEditMode],
  );

  // ── Loading state ─────────────────────────────────────────────
  if (configLoading) {
    return (
      <Box display="flex" alignItems="center" justifyContent="center" p={16}>
        <Spinner />
        <Text color="subtle" ml={2}>
          Loading…
        </Text>
      </Box>
    );
  }

  // ── Render ────────────────────────────────────────────────────
  return (
    <>
      {/* ── Header ─────────────────────────────────────────── */}
      <Box
        as="header"
        bg="white"
        px={6}
        py={3}
        display="flex"
        alignItems="center"
        gap={4}
        flexShrink={0}
        style={{ borderBottom: "1px solid var(--kds-color-gray-200)" }}
      >
        <KsyosLogo />
        <Heading size="xsmall" as="h1" style={{ whiteSpace: "nowrap" }}>
          Flex Workflow Viewer
        </Heading>
        <Box
          display="flex"
          alignItems="center"
          gap={2}
          style={{ marginLeft: "auto" }}
        >
          <Badge
            text={connected ? "Live" : "Reconnecting…"}
            color={connected ? "green" : "red"}
            size="small"
          />
          {/* Clone button — only in view mode when a seed is loaded */}
          {currentWorkflow && !isEditMode && (
            <Button
              variant="outline"
              color="neutral"
              size="small"
              onClick={() => setShowCloneModal(true)}
            >
              Clone
            </Button>
          )}
          {/* Edit / View mode toggle */}
          {currentWorkflow && (
            <Button
              variant={isEditMode ? "solid" : "outline"}
              color={isEditMode ? "primary" : "neutral"}
              size="small"
              onClick={() =>
                isEditMode ? handleExitEditMode() : enterEditMode()
              }
            >
              {isEditMode ? "View mode" : "Edit"}
            </Button>
          )}
          <IconButton
            icon="settings"
            labelText="Config"
            variant="ghost"
            onClick={() => setShowConfig(!showConfig)}
          />
        </Box>
      </Box>

      {/* ── Settings / seed-selector panel ─────────────────── */}
      {showConfig && (
        <ConfigPanel
          clientSafePath={config?.clientSafePath ?? ""}
          onSave={handleSaveConfig}
          error={configError}
          seeds={seeds}
          selectedSeed={selectedSeed}
          seedsLoading={seedsLoading}
          onSeedSelect={handleSelectSeed}
        />
      )}

      {/* ── Main content ────────────────────────────────────── */}
      <Box
        as="main"
        flex={1}
        display="flex"
        flexDirection="column"
        overflow="hidden"
      >
        {lastError && (
          <Alert appearance="danger" hasIcon>
            {lastError}
          </Alert>
        )}

        {!config?.clientSafePath ? (
          <EmptyStateBox
            title="Welcome to CS Flex Workflow Viewer"
            subtitle="Click ⚙ Config above to set the path to your ClientSafe codebase."
          />
        ) : !selectedSeed ? (
          <EmptyStateBox
            title="Select a Seed File"
            subtitle="Open ⚙ Config and choose a flex workflow seed to visualize."
          />
        ) : !parseResult ? (
          <Box
            display="flex"
            flexDirection="column"
            alignItems="center"
            justifyContent="center"
            p={16}
            gap={3}
          >
            <Spinner />
            <Text color="subtle">Waiting for the seed file to be parsed…</Text>
          </Box>
        ) : (
          <>
            {parseResult.workflows.length > 1 && (
              <WorkflowTabs
                workflows={parseResult.workflows}
                activeIndex={activeWorkflowIndex}
                onSelect={setActiveWorkflowIndex}
              />
            )}

            {/* ── Edit mode ─────────────────────────────────── */}
            {isEditMode && currentWorkflow ? (
              <Box
                display="flex"
                flex={1}
                overflow="hidden"
                style={{ position: "relative" }}
              >
                {/* Canvas + toolbar */}
                <Box
                  flex={1}
                  position="relative"
                  style={{
                    overflow: "hidden",
                    display: "flex",
                    flexDirection: "column",
                  }}
                >
                  <CanvasToolbar
                    zoomLevel={zoomLevel}
                    onZoomIn={handleZoomIn}
                    onZoomOut={handleZoomOut}
                    onFitToScreen={handleFitToScreen}
                  />
                  <Box
                    ref={canvasContainerRef}
                    flex={1}
                    style={{ overflow: "auto", position: "relative" }}
                  >
                    {(() => {
                      const { width: nw, height: nh } = computeCanvasSize(
                        currentWorkflow.workflow.steps,
                        pendingChanges,
                      );
                      return (
                        <>
                          <div
                            style={{
                              width: nw * zoomLevel,
                              height: nh * zoomLevel,
                              flexShrink: 0,
                            }}
                          />
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
                              workflow={currentWorkflow.workflow}
                              pendingChanges={pendingChanges}
                              zoomLevel={zoomLevel}
                              highlightedStepId={highlightedStepId}
                              onBlockMove={(stepId, newGridX, newGridY) => {
                                const step =
                                  currentWorkflow.workflow.steps.find(
                                    (s) => s.id === stepId,
                                  );
                                if (step)
                                  recordBlockMove(step, newGridX, newGridY);
                              }}
                              onInfoFieldChange={(step, field, value) =>
                                recordFieldChange(step, field, value)
                              }
                            />
                          </div>
                        </>
                      );
                    })()}
                  </Box>
                </Box>

                {/* Always-visible toggle — lives outside the sidebar so overflow:hidden never clips it */}
                <button
                  type="button"
                  onClick={() => setSidebarVisible((v) => !v)}
                  title={sidebarVisible ? "Hide sidebar" : "Show sidebar"}
                  aria-label={sidebarVisible ? "Hide sidebar" : "Show sidebar"}
                  style={{
                    position: "absolute",
                    top: 12,
                    right: sidebarVisible ? 308 : 8,
                    zIndex: 50,
                    background: "white",
                    border: "1px solid var(--kds-color-gray-200)",
                    borderRadius: 6,
                    cursor: "pointer",
                    padding: "4px 7px",
                    boxShadow: "0 1px 4px rgba(0,0,0,0.10)",
                    fontSize: 13,
                    lineHeight: 1,
                    transition: "right 0.2s ease",
                  }}
                >
                  {sidebarVisible ? "▶" : "◀"}
                </button>

                {/* Collapsible sidebar — collapses to zero width; toggle above handles open/close */}
                <div
                  style={{
                    width: sidebarVisible ? 300 : 0,
                    flexShrink: 0,
                    transition: "width 0.2s ease",
                    borderLeft: sidebarVisible
                      ? "1px solid var(--kds-color-gray-200)"
                      : "none",
                    display: "flex",
                    flexDirection: "column",
                    height: "100%",
                    overflow: "hidden",
                  }}
                >
                  {sidebarVisible && (
                    <EditSidebar
                      pendingChanges={pendingChanges}
                      selectedSeed={selectedSeed!}
                      onSaveSuccess={handleExitEditMode}
                      onDiscard={handleExitEditMode}
                      onRemoveStepChange={removeStepChange}
                      onStepHover={setHighlightedStepId}
                    />
                  )}
                </div>
              </Box>
            ) : (
              /* ── View mode ─────────────────────────────────── */
              <>
                {currentWorkflow && (
                  <Box
                    flex={1}
                    position="relative"
                    style={{
                      overflow: "hidden",
                      display: "flex",
                      flexDirection: "column",
                    }}
                  >
                    <CanvasToolbar
                      zoomLevel={zoomLevel}
                      onZoomIn={handleZoomIn}
                      onZoomOut={handleZoomOut}
                      onFitToScreen={handleFitToScreen}
                    />
                    <Box
                      ref={canvasContainerRef}
                      flex={1}
                      style={{ overflow: "auto", position: "relative" }}
                    >
                      {(() => {
                        const { width: nw, height: nh } = computeCanvasSize(
                          currentWorkflow.workflow.steps,
                          [],
                        );
                        return (
                          <>
                            <div
                              style={{
                                width: nw * zoomLevel,
                                height: nh * zoomLevel,
                                flexShrink: 0,
                              }}
                            />
                            <div
                              style={{
                                position: "absolute",
                                top: 0,
                                left: 0,
                                transformOrigin: "top left",
                                transform: `scale(${zoomLevel})`,
                              }}
                            >
                              <WorkflowView
                                workflow={currentWorkflow.workflow}
                              />
                            </div>
                          </>
                        );
                      })()}
                    </Box>
                  </Box>
                )}
                {parseResult.parsedAt && (
                  <Text
                    size="xs"
                    color="subtle"
                    style={{
                      padding: "4px 24px",
                      textAlign: "right",
                      flexShrink: 0,
                    }}
                  >
                    Last parsed:{" "}
                    {new Date(parseResult.parsedAt).toLocaleTimeString()}
                  </Text>
                )}
                <DiagnosticsPanel diagnostics={parseResult.diagnostics} />
              </>
            )}
          </>
        )}
      </Box>

      {/* ── Clone modal ─────────────────────────────────────── */}
      {showCloneModal && selectedSeed && (
        <CloneModal
          sourceFileName={selectedSeed}
          onClone={handleClone}
          onCancel={() => setShowCloneModal(false)}
        />
      )}
    </>
  );
}
