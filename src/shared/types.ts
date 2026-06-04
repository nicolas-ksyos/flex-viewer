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
	/** TypeScript variable name from the seed file, e.g. 'closeProcessStep' */
	variableName?: string;
	/** True for steps created in the editor but not yet saved to the seed file */
	isNew?: boolean;
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
	/** True for transitions created in the editor but not yet saved to the seed file */
	isNew?: boolean;
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

// ─────────────────────────────────────────────────────────────
// Block parameter schema types (populated by the server analyzer)
// ─────────────────────────────────────────────────────────────

export type ParameterFieldType =
	| "string"
	| "number"
	| "boolean"
	| "enum" // fixed list of string literals
	| "activity-id" // single UUID referencing a workflow activity
	| "step-id" // single UUID referencing a workflow step
	| "activity-id-array"
	| "step-id-array"
	| "string-array" // z.array(z.string())
	| "object" // nested z.strictObject / complex
	| "unknown";

export interface BlockParameterField {
	key: string;
	type: ParameterFieldType;
	/** Only present when type === 'enum' */
	enumValues?: string[];
	required: boolean;
}

export interface BlockParameterSchema {
	/** camelCase block name matching BLOCK_TYPE_MAP key, e.g. 'fixedIntervalScheduler' */
	blockName: string;
	fields: BlockParameterField[];
	/** true = a ParameterEditor component exists; false = block has no parameters */
	hasEditor: boolean;
}

/** Map of blockName → BlockParameterSchema, returned by GET /api/block-parameters */
export type BlockParameterSchemas = Record<string, BlockParameterSchema>;

/** All step properties that can be edited in the seed file. */
export interface EditableStepFields {
	x?: number;
	y?: number;
	name?: string;
	label?: string;
	allowedPerformer?: string | null;
	type?: string;
	block?: string;
	performerNeedsTask?: boolean;
	/** Full parameters object replacement. null clears the parameters. */
	parameters?: Record<string, unknown> | null;
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

// ─────────────────────────────────────────────────────────────
// Edit-mode creation drafts
// ─────────────────────────────────────────────────────────────

/** Fields for a brand-new step being created in the editor */
export interface NewStepFields {
	block: string;
	name: string;
	label?: string;
	x: number;
	y: number;
	allowedPerformer?: string | null;
	performerNeedsTask?: boolean;
	/** IDs of existing steps this new step connects TO (nextSteps) */
	nextStepIds?: string[];
	/** IDs of existing steps that should connect TO this new step */
	prevStepIds?: string[];
	/** IDs of existing steps this step connects TO synchronously */
	synchronousNextStepIds?: string[];
}

/** A new step pending to be added to the workflow */
export interface NewStepDraft {
	kind: "new-step";
	/** Client-side temporary ID (not a real DB UUID) */
	tempId: string;
	fields: NewStepFields;
	/** Auto-generated camelCase variable name for the seed file, e.g. 'performSomethingStep' */
	variableName: string;
}

/** A new connection (nextSteps link) between existing steps */
export interface NewConnectionDraft {
	kind: "new-connection";
	tempId: string;
	fromStepId: string;
	toStepIds: string[];
	synchronous: boolean;
}

/** A new TransitionType.disable link from one step to one or more steps */
export interface NewTransitionDraft {
	kind: "new-transition";
	tempId: string;
	fromStepId: string;
	toStepIds: string[];
}

/** An edit to an existing step's fields */
export interface StepEditDraft {
	kind: "edit";
	stepId: string;
	stepName: string;
	fields: EditableStepFields;
}

/**
 * Union of all pending-change kinds used in edit mode.
 * Replaces the old flat StepPendingChange[] in the hook state.
 */
export type PendingChangeItem =
	| StepEditDraft
	| NewStepDraft
	| NewConnectionDraft
	| NewTransitionDraft;

/** Body sent to PATCH /api/seeds/:fileName */
export interface SeedPatchRequest {
	changes: StepPendingChange[];
	newSteps?: NewStepDraft[];
	newConnections?: NewConnectionDraft[];
	newTransitions?: NewTransitionDraft[];
	/**
	 * Variable-name map for all steps in the workflow (existing + new drafts).
	 * Required when newSteps / newConnections / newTransitions are present so
	 * the server can resolve stepId → variableName for nextSteps references.
	 */
	stepVarNames?: Array<{ id: string; variableName: string }>;
}

/** Response from PATCH /api/seeds/:fileName */
export interface SeedPatchResponse {
	success: boolean;
	error?: string;
}
