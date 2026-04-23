import { useState } from 'react';
import {
    Accordion,
    AccordionContent,
    AccordionItem,
    AccordionTrigger,
    Badge,
    Box,
    Text,
} from '@ksyos/design-system';
import type { ParserDiagnostic } from '../../shared/types';

interface DiagnosticsPanelProps {
    diagnostics: ParserDiagnostic[];
}

const severityColor: Record<string, 'danger' | 'warning' | 'default'> = {
    error: 'danger',
    warning: 'warning',
};

const monoStyle = { fontFamily: "'SF Mono', 'Fira Code', monospace" };

export function DiagnosticsPanel({ diagnostics }: DiagnosticsPanelProps) {
    const errorCount = diagnostics.filter((d) => d.severity === 'error').length;
    const warnCount = diagnostics.filter((d) => d.severity === 'warning').length;
    const [expanded, setExpanded] = useState(errorCount > 0);

    if (diagnostics.length === 0) {
        return (
            <Box display="flex" alignItems="center" gap={2} p={2}>
                <Badge text="✓" color="green" size="small" />
                <Text size="sm">No issues</Text>
            </Box>
        );
    }

    return (
        <Accordion
            type="single"
            collapsible
            value={expanded ? 'diagnostics' : ''}
            onValueChange={(val: string) => setExpanded(val === 'diagnostics')}
        >
            <AccordionItem value="diagnostics">
                <AccordionTrigger icon="warning">
                    <Box display="flex" alignItems="center" gap={2}>
                        <Text as="span" size="sm">Diagnostics</Text>
                        {errorCount > 0 && <Badge text={String(errorCount)} color="red" size="small" />}
                        {warnCount > 0 && <Badge text={String(warnCount)} color="orange" size="small" />}
                    </Box>
                </AccordionTrigger>
                <AccordionContent>
                    {diagnostics.map((d, i) => (
                        <Text
                            key={i}
                            as="div"
                            size="sm"
                            color={severityColor[d.severity] ?? 'default'}
                            style={monoStyle}
                        >
                            [{d.code ?? d.severity.toUpperCase()}]
                            {d.line ? (
                                <Text as="span" fontWeight="bold" color="subtle">
                                    {' '}line {d.line}{d.column ? `:${d.column}` : ''}
                                </Text>
                            ) : null}
                            {' '}{d.message}
                        </Text>
                    ))}
                </AccordionContent>
            </AccordionItem>
        </Accordion>
    );
}
