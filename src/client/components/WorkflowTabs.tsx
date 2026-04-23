import { TabBar } from '@ksyos/design-system';

interface WorkflowTabsProps {
    workflows: Array<{ serviceName: string; serviceCode: string | null }>;
    activeIndex: number;
    onSelect: (index: number) => void;
}

export function WorkflowTabs({ workflows, activeIndex, onSelect }: WorkflowTabsProps) {
    if (workflows.length <= 1) return null;
    return (
        <TabBar>
            {workflows.map((wf, i) => (
                <TabBar.Button key={i} isSelected={i === activeIndex} onClick={() => onSelect(i)}>
                    {wf.serviceName || wf.serviceCode || `Workflow ${i + 1}`}
                </TabBar.Button>
            ))}
        </TabBar>
    );
}
