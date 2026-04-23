import { Box, Heading, Text } from '@ksyos/design-system';
import type { ParsedWorkflowDefinition } from '../../shared/types';

// Import the real WorkflowGraph from ClientSafe codebase (resolved via @frontend alias)
import { WorkflowGraph } from '@frontend/components/pages/services/workflowGraph/WorkflowGraph';

/**
 * Wraps the real ClientSafe WorkflowGraph component, mapping our parsed data
 * into the props it expects. Since our parser produces structurally compatible
 * data (same field names/shapes), we can pass them through with a type cast.
 */
export function WorkflowView({ workflow }: { workflow: ParsedWorkflowDefinition }) {
    if (workflow.steps.length === 0) {
        return (
            <Box display="flex" flexDirection="column" alignItems="center" justifyContent="center" p={16} style={{ textAlign: 'center' }}>
                <Heading size="small" as="h2">No steps found</Heading>
                <Text color="subtle">The parser did not find any workflow steps.</Text>
            </Box>
        );
    }

    return (
        <WorkflowGraph
            serviceActivities={workflow.activities as any}
            serviceWorkflowStepActivities={workflow.stepActivities as any}
            serviceWorkflowSteps={workflow.steps as any}
            serviceWorkflowTransitions={workflow.transitions as any}
        />
    );
}
