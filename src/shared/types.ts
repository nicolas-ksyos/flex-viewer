export interface ParsedWorkflowActivity {
	id: string;
	name: string;
	label: string;
	serviceActivityType: string;
	customControlCode: string | null;
	closedStatusLabel: string | null;
	serviceId: string;
	isAutoSaveEnabled: boolean;
	isPrintEnabled: boolean;
}

export interface ParsedWorkflowStepDisplayOptions {
	x: number;
	y: number;
}

export interface ParsedWorkflowStepBlock {
	id: string;
	name: string;
	type: string;
}

export interface ParsedWorkflowStep {
	id: string;
	name: string;
	label: string;
	displayOptions: ParsedWorkflowStepDisplayOptions;
	serviceWorkflowBlock: ParsedWorkflowStepBlock;
	allowedPerformer: string | null;
	parameters: Record<string, unknown> | null;
	performerNeedsTask: boolean;
	serviceId: string;
	isRerunnable: boolean;
	type?: string;
}

export interface ParsedWorkflowStepActivity {
	id: string;
	serviceActivityId: string;
	serviceWorkflowStepId: string;
}

export interface ParsedWorkflowTransition {
	id: string;
	fromStepId: string;
	toStepId: string;
	type: string;
	onlyIfOutputEquals: string | null;
	synchronous: boolean;
	serviceId: string;
}

export interface ParsedWorkflowDefinition {
	activities: ParsedWorkflowActivity[];
	steps: ParsedWorkflowStep[];
	stepActivities: ParsedWorkflowStepActivity[];
	transitions: ParsedWorkflowTransition[];
}

export interface ParsedWorkflow {
	serviceName: string;
	serviceCode: string | null;
	workflow: ParsedWorkflowDefinition;
}

export interface ParserDiagnostic {
	code: string | null;
	message: string;
	severity: "error" | "warning" | "info";
	line?: number;
	column?: number;
}

export interface SeedParseResult {
	workflows: ParsedWorkflow[];
	diagnostics: ParserDiagnostic[];
	filePath: string;
	parsedAt: string;
}

export interface ViewerConfig {
	clientSafePath: string;
	lastSelectedSeed: string | null;
}

export interface SeedFileInfo {
	fileName: string;
	relativePath: string;
}

export interface WsWorkflowUpdate {
	type: "workflowUpdate";
	data: SeedParseResult;
}

export interface WsFileError {
	type: "fileError";
	error: string;
}

export interface WsWatchStarted {
	type: "watchStarted";
	filePath: string;
}

export type WsMessage = WsWorkflowUpdate | WsFileError | WsWatchStarted;

/** All step properties that can be edited in the seed file. */
export interface EditableStepFields {
	x?: number;
	y?: number;
	name?: string;
	label?: string;
	allowedPerformer?: string | null;
	type?: string;
	block?: string;
}

/**
 * One pending change for a named step.
 * `stepName` matches the `name:` property value in the seed file — used by the
 * server writer to locate the right createStep() call.
 * `stepId` is the parsed ID — used by the client for keying/deduplication.
 */
export interface StepPendingChange {
	stepName: string;
	stepId: string;
	fields: EditableStepFields;
}

/** Body sent to PATCH /api/seeds/:fileName */
export interface SeedPatchRequest {
	changes: StepPendingChange[];
}

/** Response from PATCH /api/seeds/:fileName */
export interface SeedPatchResponse {
	success: boolean;
	error?: string;
}
