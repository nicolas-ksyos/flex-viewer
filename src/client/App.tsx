import { useState, useEffect, useCallback } from "react";
import {
  Alert,
  Badge,
  Box,
  Heading,
  IconButton,
  Spinner,
  Text,
} from "@ksyos/design-system";
import { ConfigPanel } from "./components/ConfigPanel";
import { KsyosLogo } from "./components/KsyosLogo";
import { WorkflowTabs } from "./components/WorkflowTabs";
import { DiagnosticsPanel } from "./components/DiagnosticsPanel";
import { useConfig } from "./hooks/useConfig";
import { useSeeds } from "./hooks/useSeeds";
import { useWebSocket } from "./hooks/useWebSocket";
import type { SeedParseResult } from "../shared/types";
import { useEditMode } from "./hooks/useEditMode";
import { useBlockParameters } from "./hooks/useBlockParameters";
import { ContextSidebar } from "./components/ContextSidebar";
import { CanvasPane } from "./components/CanvasPane";
import { CloneModal } from "./components/CloneModal";
import { AddBlockModal } from "./components/edit/AddBlockModal";
import { AddConnectionModal } from "./components/edit/AddConnectionModal";
import { AddTransitionModal } from "./components/edit/AddTransitionModal";
import type { NewStepDraft } from "../shared/types";

// ─── Progress bar component ────────────────────────────────────
function ParseProgressBar({ slim = false }: { slim?: boolean }) {
  return (
    <div
      style={{
        height: slim ? 3 : 6,
        width: slim ? "100%" : 280,
        borderRadius: 3,
        background:
          "linear-gradient(90deg, #3b82f6 0%, #93c5fd 50%, #3b82f6 100%)",
        backgroundSize: "200% 100%",
        animation: "progress-shimmer 1.5s ease-in-out infinite",
      }}
    />
  );
}

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
  const { connected, lastResult, lastError, isParsing } = useWebSocket();

  const [selectedSeed, setSelectedSeed] = useState<string | null>(null);
  const [parseResult, setParseResult] = useState<SeedParseResult | null>(null);
  const [activeWorkflowIndex, setActiveWorkflowIndex] = useState(0);
  const [showConfig, setShowConfig] = useState(false);
  const [sidebarVisible, setSidebarVisible] = useState(true);
  const [showCloneModal, setShowCloneModal] = useState(false);
  const [showAddBlock, setShowAddBlock] = useState(false);
  const [showAddConnection, setShowAddConnection] = useState(false);
  const [showAddTransition, setShowAddTransition] = useState(false);
  const [selectedStepId, setSelectedStepId] = useState<string | null>(null);
  const [highlightedStepId, setHighlightedStepId] = useState<string | null>(
    null,
  );

  const {
    isEditMode,
    pendingChanges,
    enterEditMode,
    exitEditMode,
    recordBlockMove,
    recordFieldChange,
    removeStepChange,
    addNewStep,
    addNewConnection,
    addNewTransition,
    removeNewItem,
    recordBlockDeletion,
    undoBlockDeletion,
    recordConnectionRemoval,
    undoConnectionRemoval,
  } = useEditMode();

  const {
    schemas: blockParameterSchemas,
    loading: schemaRefreshing,
    lastRefreshed,
    refresh: refreshSchemas,
  } = useBlockParameters();

  // Derive current workflow early so zoom / clone handlers can use it
  const currentWorkflow = parseResult?.workflows[activeWorkflowIndex];

  // ── Wrapped exit — resets UI state alongside hook state ──────
  const handleExitEditMode = useCallback(() => {
    exitEditMode();
    setSidebarVisible(true);
    setHighlightedStepId(null);
    setSelectedStepId(null);
    // Do NOT reset parseResult here — the file watcher will re-parse and
    // broadcast a workflowUpdate via WebSocket which updates parseResult
    // naturally. Resetting to null here risks a race: if the WS update
    // arrives before this callback runs, setParseResult(null) would clear
    // the already-updated data and leave the spinner showing forever.
  }, [exitEditMode]);

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
    if (!selectedSeed || !config?.clientSafePath) return;
    startWatching(selectedSeed).then((result) => {
      if (result) {
        // Use setParseResult only if not already set (avoids overwriting a
        // result that handleSelectSeed already delivered via the same call).
        setParseResult((prev) => prev ?? result);
        setActiveWorkflowIndex(0);
      }
    });
  }, [selectedSeed, config?.clientSafePath, startWatching]);

  // ── Seed selection ────────────────────────────────────────────
  const handleSelectSeed = useCallback(
    async (fileName: string) => {
      handleExitEditMode();
      setSidebarVisible(true);
      setSelectedSeed(fileName);
      setParseResult(null);
      setActiveWorkflowIndex(0);
      setSelectedStepId(null);
      await updateConfig({ lastSelectedSeed: fileName });
      const result = await startWatching(fileName);
      if (result) {
        setParseResult(result);
        setActiveWorkflowIndex(0);
      }
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
          {/* Refresh block parameter types from ClientSafe */}
          <button
            type="button"
            onClick={refreshSchemas}
            disabled={schemaRefreshing}
            title={`Refresh block parameter types from ClientSafe${
              lastRefreshed
                ? ` (last: ${lastRefreshed.toLocaleTimeString()})`
                : ""
            }`}
            aria-label="Refresh block parameter schemas"
            style={{
              background: "none",
              border: "none",
              cursor: schemaRefreshing ? "wait" : "pointer",
              padding: "4px 6px",
              borderRadius: 4,
              color: "#6b7280",
              fontSize: 14,
              lineHeight: 1,
              opacity: schemaRefreshing ? 0.5 : 1,
              display: "flex",
              alignItems: "center",
            }}
          >
            <svg
              width="14"
              height="14"
              viewBox="0 0 14 14"
              fill="none"
              style={{
                display: "block",
                animation: schemaRefreshing
                  ? "spin 1s linear infinite"
                  : "none",
              }}
            >
              <path
                d="M12 7A5 5 0 1 1 7 2"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                fill="none"
              />
              <polyline
                points="7,2 9.5,2 9.5,4.5"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </button>
          <Badge
            text={connected ? "Live" : "Reconnecting…"}
            color={connected ? "green" : "red"}
            size="small"
          />
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
            gap={4}
          >
            <Text color="subtle" style={{ marginBottom: 4 }}>
              Parsing seed file…
            </Text>
            <ParseProgressBar />
          </Box>
        ) : (
          <>
            {/* Slim re-parse progress bar — shown over existing workflow during file-change re-parses */}
            {isParsing && (
              <div style={{ position: "relative", flexShrink: 0, zIndex: 100 }}>
                <ParseProgressBar slim />
              </div>
            )}
            {parseResult.workflows.length > 1 && (
              <WorkflowTabs
                workflows={parseResult.workflows}
                activeIndex={activeWorkflowIndex}
                onSelect={setActiveWorkflowIndex}
              />
            )}

            {/* ── Unified canvas + sidebar layout ───────────── */}
            {currentWorkflow ? (
              <Box
                display="flex"
                flex={1}
                overflow="hidden"
                style={{ position: "relative" }}
              >
                {/* Canvas pane */}
                <CanvasPane
                  workflow={currentWorkflow.workflow}
                  mode={isEditMode ? "edit" : "view"}
                  pendingChanges={pendingChanges}
                  highlightedStepId={highlightedStepId}
                  selectedStepId={selectedStepId}
                  onBlockClick={(step) => setSelectedStepId(step?.id ?? null)}
                  onBlockMove={(stepId, newGridX, newGridY) => {
                    const step = currentWorkflow.workflow.steps.find(
                      (s) => s.id === stepId,
                    );
                    if (step) {
                      recordBlockMove(step, newGridX, newGridY);
                    }
                  }}
                  onInfoFieldChange={(step, field, value) =>
                    recordFieldChange(step, field, value)
                  }
                  onAddBlock={() => setShowAddBlock(true)}
                  onAddConnection={() => setShowAddConnection(true)}
                  onAddTransition={() => setShowAddTransition(true)}
                  onAddConnectionDraft={(draft) => addNewConnection(draft)}
                  onAddTransitionDraft={(draft) => addNewTransition(draft)}
                  blockParameterSchemas={blockParameterSchemas}
                  onParametersChange={(step, params) => {
                    recordFieldChange(step, "parameters", params as any);
                  }}
                  onDeleteBlock={(step) =>
                    recordBlockDeletion(step, currentWorkflow.workflow)
                  }
                  onUndoDeleteBlock={undoBlockDeletion}
                  onRemoveConnection={recordConnectionRemoval}
                  onUndoRemoveConnection={undoConnectionRemoval}
                />

                {/* Diagnostics bar — bottom-left overlay */}
                <div
                  style={{
                    position: "absolute",
                    bottom: 8,
                    left: 8,
                    zIndex: 10,
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    background: "rgba(255,255,255,0.88)",
                    backdropFilter: "blur(4px)",
                    borderRadius: 6,
                    padding: "2px 8px 2px 4px",
                    border: "1px solid rgba(0,0,0,0.06)",
                  }}
                >
                  <DiagnosticsPanel diagnostics={parseResult.diagnostics} />
                  {parseResult.parsedAt && (
                    <Text size="xs" color="subtle">
                      Last parsed:{" "}
                      {new Date(parseResult.parsedAt).toLocaleTimeString()}
                    </Text>
                  )}
                </div>

                {/* Sidebar toggle button */}
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
                  {sidebarVisible ? "▶" : "◄"}
                </button>

                {/* Collapsible sidebar */}
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
                    <ContextSidebar
                      isEditMode={isEditMode}
                      selectedSeed={selectedSeed!}
                      workflow={currentWorkflow.workflow}
                      serviceName={currentWorkflow.serviceName}
                      serviceCode={currentWorkflow.serviceCode}
                      blockParameterSchemas={blockParameterSchemas}
                      selectedStepId={selectedStepId}
                      pendingChanges={pendingChanges}
                      onSaveSuccess={handleExitEditMode}
                      onDiscard={handleExitEditMode}
                      onRemoveStepChange={removeStepChange}
                      onRemoveNewItem={removeNewItem}
                      onStepHover={setHighlightedStepId}
                      allSteps={currentWorkflow.workflow.steps}
                      allTransitions={currentWorkflow.workflow.transitions}
                      onInfoFieldChange={recordFieldChange}
                      onParametersChange={(step, params) => {
                        recordFieldChange(step, "parameters", params as any);
                      }}
                      onAddConnection={addNewConnection}
                      onRemoveConnection={recordConnectionRemoval}
                      onUndoRemoveConnection={undoConnectionRemoval}
                      isSidebarVisible={sidebarVisible}
                      onToggleSidebar={() => setSidebarVisible((v) => !v)}
                      onEdit={() => enterEditMode()}
                      onClone={() => setShowCloneModal(true)}
                      onConvertSuccess={(migrationFileName) => {
                        console.info("Migration created:", migrationFileName);
                      }}
                    />
                  )}
                </div>
              </Box>
            ) : null}
          </>
        )}
      </Box>

      {/* ── Clone modal ─────────────────────────────────────── */}
      {showCloneModal && selectedSeed && (
        <CloneModal
          sourceFileName={selectedSeed}
          onClone={handleClone}
          onCancel={() => setShowCloneModal(false)}
          pendingChangesCount={pendingChanges.length}
        />
      )}

      {/* ── Add Block modal ─────────────────────────────────── */}
      {showAddBlock && isEditMode && currentWorkflow && (
        <AddBlockModal
          existingSteps={currentWorkflow.workflow.steps}
          allActivities={currentWorkflow.workflow.activities}
          blockParameterSchemas={blockParameterSchemas}
          onAdd={(draft) => {
            addNewStep(draft);
            // Wire prevStepIds → connections from those steps TO the new block
            if (draft.fields.prevStepIds?.length) {
              draft.fields.prevStepIds.forEach((pid, i) => {
                addNewConnection({
                  tempId: `new-conn-prev-${Date.now()}-${i}`,
                  fromStepId: pid,
                  toStepIds: [draft.tempId],
                  synchronous: false,
                });
              });
            }
            // Wire nextStepIds → async connection from new block TO those steps
            if (draft.fields.nextStepIds?.length) {
              addNewConnection({
                tempId: `new-conn-next-${Date.now()}`,
                fromStepId: draft.tempId,
                toStepIds: draft.fields.nextStepIds,
                synchronous: false,
              });
            }
            // Wire synchronousNextStepIds → sync connection from new block TO those steps
            if (draft.fields.synchronousNextStepIds?.length) {
              addNewConnection({
                tempId: `new-conn-sync-${Date.now()}`,
                fromStepId: draft.tempId,
                toStepIds: draft.fields.synchronousNextStepIds,
                synchronous: true,
              });
            }
            setShowAddBlock(false);
          }}
          onCancel={() => setShowAddBlock(false)}
        />
      )}

      {/* ── Add Connection modal ────────────────────────────── */}
      {showAddConnection && isEditMode && currentWorkflow && (
        <AddConnectionModal
          existingSteps={currentWorkflow.workflow.steps}
          existingTransitions={currentWorkflow.workflow.transitions}
          newStepDrafts={pendingChanges
            .filter((c): c is NewStepDraft => c.kind === "new-step")
            .map((c) => ({ tempId: c.tempId, name: c.fields.name }))}
          onAdd={(draft) => {
            addNewConnection(draft);
            setShowAddConnection(false);
          }}
          onCancel={() => setShowAddConnection(false)}
        />
      )}

      {/* ── Add Transition modal ────────────────────────────── */}
      {showAddTransition && isEditMode && currentWorkflow && (
        <AddTransitionModal
          existingSteps={currentWorkflow.workflow.steps}
          existingTransitions={currentWorkflow.workflow.transitions}
          newStepDrafts={pendingChanges
            .filter((c): c is NewStepDraft => c.kind === "new-step")
            .map((c) => ({ tempId: c.tempId, name: c.fields.name }))}
          onAdd={(draft) => {
            addNewTransition(draft);
            setShowAddTransition(false);
          }}
          onCancel={() => setShowAddTransition(false)}
        />
      )}
    </>
  );
}
