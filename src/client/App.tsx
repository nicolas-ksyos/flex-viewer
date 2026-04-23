import { useState, useEffect, useCallback } from 'react';
import { Alert, Badge, Box, Button, Heading, IconButton, Spinner, Text } from '@ksyos/design-system';
import { ConfigPanel } from './components/ConfigPanel';
import { KsyosLogo } from './components/KsyosLogo';
import { SeedSelector } from './components/SeedSelector';
import { WorkflowTabs } from './components/WorkflowTabs';
import { WorkflowView } from './components/WorkflowView';
import { DiagnosticsPanel } from './components/DiagnosticsPanel';
import { useConfig } from './hooks/useConfig';
import { useSeeds } from './hooks/useSeeds';
import { useWebSocket } from './hooks/useWebSocket';
import type { SeedParseResult } from '../shared/types';

function EmptyStateBox({ title, subtitle }: { title: string; subtitle: string }) {
    return (
        <Box display="flex" flexDirection="column" alignItems="center" justifyContent="center" p={16} style={{ textAlign: 'center' }}>
            <Heading size="small" as="h2">{title}</Heading>
            <Text color="subtle" style={{ maxWidth: 400 }}>{subtitle}</Text>
        </Box>
    );
}

export function App() {
    const { config, loading: configLoading, error: configError, updateConfig, refetch: refetchConfig } = useConfig();
    const { seeds, loading: seedsLoading, fetchSeeds, startWatching } = useSeeds(config?.clientSafePath);
    const { connected, lastResult, lastError } = useWebSocket();

    const [selectedSeed, setSelectedSeed] = useState<string | null>(null);
    const [parseResult, setParseResult] = useState<SeedParseResult | null>(null);
    const [activeWorkflowIndex, setActiveWorkflowIndex] = useState(0);
    const [showConfig, setShowConfig] = useState(false);

    useEffect(() => {
        if (config?.lastSelectedSeed && !selectedSeed) setSelectedSeed(config.lastSelectedSeed);
        if (config && !config.clientSafePath) setShowConfig(true);
    }, [config, selectedSeed]);

    useEffect(() => {
        if (lastResult) { setParseResult(lastResult); setActiveWorkflowIndex(0); }
    }, [lastResult]);

    const handleSelectSeed = useCallback(async (fileName: string) => {
        setSelectedSeed(fileName);
        setParseResult(null);
        setActiveWorkflowIndex(0);
        await updateConfig({ lastSelectedSeed: fileName });
        await startWatching(fileName);
    }, [updateConfig, startWatching]);

    const handleSaveConfig = useCallback(async (clientSafePath: string) => {
        await updateConfig({ clientSafePath });
        setSelectedSeed(null);
        setParseResult(null);
        setShowConfig(false);
    }, [updateConfig]);

    useEffect(() => {
        if (selectedSeed && config?.clientSafePath) startWatching(selectedSeed);
    }, [selectedSeed, config?.clientSafePath, startWatching]);

    if (configLoading) {
        return (
            <Box display="flex" alignItems="center" justifyContent="center" p={16}>
                <Spinner />
                <Text color="subtle" ml={2}>Loading…</Text>
            </Box>
        );
    }

    const currentWorkflow = parseResult?.workflows[activeWorkflowIndex];

    return (
        <>
            <Box as="header" bg="white" px={6} py={3} display="flex" alignItems="center" gap={4} flexShrink={0} style={{ borderBottom: '1px solid var(--kds-color-gray-200)' }}>
                <KsyosLogo />
                <Heading size="xsmall" as="h1" style={{ whiteSpace: 'nowrap' }}>Flex Workflow Viewer</Heading>
                <Box display="flex" alignItems="center" gap={2} style={{ marginLeft: 'auto' }}>
                    <Badge
                        text={connected ? 'Live' : 'Reconnecting…'}
                        color={connected ? 'green' : 'red'}
                        size="small"
                    />
                    <IconButton icon="settings" labelText="Config" variant="ghost" onClick={() => setShowConfig(!showConfig)} />
                </Box>
            </Box>

            {showConfig && <ConfigPanel clientSafePath={config?.clientSafePath ?? ''} onSave={handleSaveConfig} error={configError} />}

            <Box as="main" flex={1} display="flex" flexDirection="column" overflow="hidden">
                {lastError && <Alert appearance="danger" hasIcon>{lastError}</Alert>}

                {config?.clientSafePath && (
                    <Box px={6} py={3} display="flex" alignItems="center" gap={3} flexShrink={0}>
                        <SeedSelector seeds={seeds} selectedSeed={selectedSeed} loading={seedsLoading} onSelect={handleSelectSeed} />
                    </Box>
                )}

                {!config?.clientSafePath ? (
                    <EmptyStateBox title="Welcome to CS Flex Workflow Viewer" subtitle="Click ⚙ Config above to set the path to your ClientSafe codebase." />
                ) : !selectedSeed ? (
                    <EmptyStateBox title="Select a Seed File" subtitle="Choose a flex workflow seed from the dropdown to visualize its workflow diagram." />
                ) : !parseResult ? (
                    <Box display="flex" flexDirection="column" alignItems="center" justifyContent="center" p={16} gap={3}>
                        <Spinner />
                        <Text color="subtle">Waiting for the seed file to be parsed…</Text>
                    </Box>
                ) : (
                    <>
                        {parseResult.workflows.length > 1 && (
                            <WorkflowTabs workflows={parseResult.workflows} activeIndex={activeWorkflowIndex} onSelect={setActiveWorkflowIndex} />
                        )}
                        {currentWorkflow && <WorkflowView workflow={currentWorkflow.workflow} />}
                        {parseResult.parsedAt && (
                            <Text size="xs" color="subtle" style={{ padding: '4px 24px', textAlign: 'right' }}>
                                Last parsed: {new Date(parseResult.parsedAt).toLocaleTimeString()}
                            </Text>
                        )}
                        <DiagnosticsPanel diagnostics={parseResult.diagnostics} />
                    </>
                )}
            </Box>
        </>
    );
}
