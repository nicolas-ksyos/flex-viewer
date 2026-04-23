import { Drawer, Box, Text, Heading, Divider } from '@ksyos/design-system';
import type { ParsedWorkflowStep, ParsedWorkflowTransition, ParsedWorkflowActivity, ParsedWorkflowStepActivity } from '../../shared/types';

interface StepDetailPanelProps {
    step: ParsedWorkflowStep;
    activities: ParsedWorkflowActivity[];
    stepActivities: ParsedWorkflowStepActivity[];
    transitions: ParsedWorkflowTransition[];
    onClose: () => void;
}

const monoStyle = { fontFamily: "'SF Mono', 'Fira Code', monospace", wordBreak: 'break-all' as const };
const labelStyle = { minWidth: 100, flexShrink: 0 };

function DetailRow({ label, value }: { label: string; value: string }) {
    return (
        <Box display="flex" gap={2}>
            <Text color="subtle" style={labelStyle}>{label}</Text>
            <Text style={monoStyle}>{value}</Text>
        </Box>
    );
}

export function StepDetailPanel({ step, activities, stepActivities, transitions, onClose }: StepDetailPanelProps) {
    const linkedActivityIds = stepActivities
        .filter((sa) => sa.serviceWorkflowStepId === step.id)
        .map((sa) => sa.serviceActivityId);
    const linkedActivities = activities.filter((a) => linkedActivityIds.includes(a.id));
    const incoming = transitions.filter((t) => t.toStepId === step.id);
    const outgoing = transitions.filter((t) => t.fromStepId === step.id);

    return (
        <Drawer isOpen={true} onClose={onClose} position="right" size="small">
            <Drawer.CloseButton onClick={onClose} />
            <Drawer.Header>{step.name}</Drawer.Header>
            <Drawer.Body>
                <DetailRow label="Block:" value={step.serviceWorkflowBlock.name} />
                <DetailRow label="Block type:" value={step.serviceWorkflowBlock.type} />
                <DetailRow label="Position:" value={`(${step.displayOptions.x}, ${step.displayOptions.y})`} />
                {step.allowedPerformer && <DetailRow label="Performer:" value={step.allowedPerformer} />}
                <DetailRow label="Needs task:" value={step.performerNeedsTask ? 'Yes' : 'No'} />

                {step.parameters && Object.keys(step.parameters).length > 0 && (
                    <>
                        <Divider spacing="small" />
                        <Heading size="xsmall" as="h4">Parameters</Heading>
                        <Box
                            as="pre"
                            bg="gray50"
                            p={2}
                            borderRadius="sm"
                            style={{ fontSize: 11, overflow: 'auto', maxHeight: 200, whiteSpace: 'pre-wrap' }}
                        >
                            {JSON.stringify(step.parameters, null, 2)}
                        </Box>
                    </>
                )}

                {linkedActivities.length > 0 && (
                    <>
                        <Divider spacing="small" />
                        <Heading size="xsmall" as="h4">Activities ({linkedActivities.length})</Heading>
                        {linkedActivities.map((act) => (
                            <Box key={act.id} style={{ padding: '4px 0' }}>
                                <Text size="sm" fontWeight="bold">{act.name}</Text>
                                <Text size="sm" color="subtle">{act.serviceActivityType} · {act.customControlCode}</Text>
                            </Box>
                        ))}
                    </>
                )}

                {(incoming.length > 0 || outgoing.length > 0) && (
                    <>
                        <Divider spacing="small" />
                        <Heading size="xsmall" as="h4">Transitions</Heading>
                        {incoming.length > 0 && (
                            <Box style={{ marginBottom: 6 }}>
                                <Text size="xs" color="subtle">Incoming ({incoming.length})</Text>
                                {incoming.map((t, i) => (
                                    <Text key={i} size="sm" style={{ padding: '2px 0' }}>
                                        ← from {t.fromStepId.slice(0, 8)}…
                                        {t.onlyIfOutputEquals && <Text as="em"> if={t.onlyIfOutputEquals}</Text>}
                                        {t.synchronous && <Text color="warning"> (sync)</Text>}
                                    </Text>
                                ))}
                            </Box>
                        )}
                        {outgoing.length > 0 && (
                            <Box>
                                <Text size="xs" color="subtle">Outgoing ({outgoing.length})</Text>
                                {outgoing.map((t, i) => (
                                    <Text key={i} size="sm" style={{ padding: '2px 0' }}>
                                        → to {t.toStepId.slice(0, 8)}…
                                        {t.onlyIfOutputEquals && <Text as="em"> if={t.onlyIfOutputEquals}</Text>}
                                        {t.type === 'disable' && <Text color="danger"> (disable)</Text>}
                                        {t.synchronous && <Text color="warning"> (sync)</Text>}
                                    </Text>
                                ))}
                            </Box>
                        )}
                    </>
                )}
            </Drawer.Body>
        </Drawer>
    );
}
