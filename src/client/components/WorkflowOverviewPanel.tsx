import { Box, Heading, Text } from "@ksyos/design-system";
import type { ParsedWorkflowDefinition } from "../../shared/types";

// ─────────────────────────────────────────────────────────────
// Colour map per block type (matches EditableWorkflowCanvas border colours)
// ─────────────────────────────────────────────────────────────

const BLOCK_TYPE_COLORS: Record<string, string> = {
	start: "#FF37F0",
	activity: "#3C3CFF",
	action: "#3C3CFF",
	choice: "#FF37F0",
	general: "#FF37F0",
	scheduled: "#FF9A1E",
	systemAction: "#FF37F0",
};

function blockTypeColor(type: string): string {
	return BLOCK_TYPE_COLORS[type] ?? "#9ca3af";
}

// ─────────────────────────────────────────────────────────────
// Props
// ─────────────────────────────────────────────────────────────

export interface WorkflowOverviewPanelProps {
	workflow: ParsedWorkflowDefinition;
	serviceName: string;
	serviceCode: string | null;
}

// ─────────────────────────────────────────────────────────────
// WorkflowOverviewPanel
// ─────────────────────────────────────────────────────────────

export function WorkflowOverviewPanel({
	workflow,
	serviceName,
	serviceCode,
}: WorkflowOverviewPanelProps) {
	// Group steps by block type
	const stepsByType: Record<string, number> = {};
	for (const step of workflow.steps) {
		const t = step.serviceWorkflowBlock.type || "unknown";
		stepsByType[t] = (stepsByType[t] ?? 0) + 1;
	}
	const typeEntries = Object.entries(stepsByType).sort((a, b) =>
		a[0].localeCompare(b[0]),
	);

	const dividerStyle = {
		borderTop: "1px solid var(--kds-color-gray-100)",
		margin: "12px 0",
	};

	return (
		<Box px={3} py={3}>
			{/* ── Service ──────────────────────────────────────── */}
			<Heading size="xsmall" as="h3" style={{ margin: "0 0 4px" }}>
				{serviceName || "—"}
			</Heading>
			{serviceCode && (
				<span
					style={{
						display: "inline-block",
						background: "#e0e7ff",
						color: "#3730a3",
						fontSize: 10,
						fontWeight: 600,
						padding: "1px 6px",
						borderRadius: 10,
						letterSpacing: "0.04em",
						marginBottom: 4,
					}}
				>
					{serviceCode}
				</span>
			)}

			<div style={dividerStyle} />

			{/* ── Steps ────────────────────────────────────────── */}
			<Text
				size="xs"
				color="subtle"
				style={{
					fontWeight: 600,
					textTransform: "uppercase",
					letterSpacing: "0.05em",
					display: "block",
					marginBottom: 6,
				}}
			>
				Steps ({workflow.steps.length})
			</Text>
			{typeEntries.map(([type, count]) => (
				<div
					key={type}
					style={{
						display: "flex",
						alignItems: "center",
						gap: 8,
						marginBottom: 4,
					}}
				>
					<span
						style={{
							width: 8,
							height: 8,
							borderRadius: "50%",
							background: blockTypeColor(type),
							flexShrink: 0,
						}}
					/>
					<Text size="xs" style={{ flex: 1 }}>
						{type}
					</Text>
					<Text size="xs" color="subtle">
						{count}
					</Text>
				</div>
			))}

			{workflow.activities.length > 0 && (
				<>
					<div style={dividerStyle} />

					{/* ── Activities ───────────────────────────────── */}
					<Text
						size="xs"
						color="subtle"
						style={{
							fontWeight: 600,
							textTransform: "uppercase",
							letterSpacing: "0.05em",
							display: "block",
							marginBottom: 6,
						}}
					>
						Activities ({workflow.activities.length})
					</Text>
					{workflow.activities.map((a) => (
						<div
							key={a.id}
							style={{
								marginBottom: 6,
								paddingBottom: 6,
								borderBottom: "1px solid var(--kds-color-gray-50)",
							}}
						>
							<Text size="xs" style={{ fontWeight: 500, display: "block" }}>
								{a.name}
							</Text>
							<Text size="xs" color="subtle">
								{a.serviceActivityType}
							</Text>
						</div>
					))}
				</>
			)}
		</Box>
	);
}
