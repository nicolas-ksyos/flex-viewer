/**
 * TypeScript AST-based seed file parser.
 *
 * Statically analyses seed files that use `ServiceCreationHelper` to extract
 * workflow data (activities, steps, transitions) **without** executing any
 * code or touching a database.
 *
 * Public API used by both the server and the unit-test suite inside ClientSafeWeb:
 *   parseSeedFile(repositoryRoot, filePath, relativePath) → SeedSnapshot
 *   getSeedRelativePath(repositoryRoot, absolutePath)     → string
 *   hasErrorDiagnostics(diagnostics)                      → boolean
 */

import crypto from 'node:crypto';
import path from 'node:path';
import ts from 'typescript';

// ────────────────────────────────────────────────────────
// Block-name → block-type mapping (extracted from the DB
// seed + migrations in ClientSafeWeb)
// ────────────────────────────────────────────────────────

const BLOCK_TYPE_MAP: Record<string, string> = {
    accessForRequester: 'general',
    activateCaroQuestionnaireOrBodyWeightMeasurement: 'general',
    assignAnyActivityPerformer: 'general',
    assignToActivityPerformer: 'general',
    assignToHomeHolterOrganization: 'general',
    assignToPreviousActiveActivityPerformer: 'general',
    assignToPreviousActivityPerformer: 'general',
    assignToProcessActorOrganization: 'general',
    assignToRequester: 'general',
    authorizeAnyOrganizationWithServiceActivityAuthorizations: 'general',
    bariPostSendZorgmail: 'general',
    bariPreSendZorgmail: 'general',
    bariatricsNotifyProcessActor: 'general',
    canPerformActivity: 'choice',
    cancelProcess: 'action',
    checkBooleanInActivity: 'general',
    checkCaroInactivityNextStep: 'general',
    checkCaroPatientCreated: 'general',
    checkConditions: 'general',
    checkEveryStepHasStatus: 'general',
    checkForTruthy: 'general',
    checkIsTheRequesterTheGp: 'general',
    checkNotEmpty: 'general',
    checkSomeConditions: 'general',
    checkSomeStepsHaveStatus: 'general',
    checkStringValueInActivity: 'general',
    closeProcess: 'general',
    completeProcess: 'action',
    createCaroPatient: 'general',
    createCompletedActivity: 'general',
    createCompletedResendQuestionnaires: 'general',
    createEvidencioPatient: 'general',
    createExternalReferralLetter: 'general',
    createMraReferralLetter: 'general',
    CreateOsasNoTreatmentTaskBlock: 'general',
    createOsasTaskForChosenTreatment: 'general',
    createPatientTask: 'general',
    createReferralLetter: 'general',
    createTaskForAdminStatus: 'general',
    createTherapielandRequest: 'general',
    dummyAction: 'action',
    dummyStep: 'general',
    emailEvidencioQuestionnaireToPatient: 'general',
    emailExaminationToPerformer: 'general',
    fixedIntervalScheduler: 'scheduled',
    hearingLossCreateRecipeLetter: 'general',
    insertInGroupMeetingPatientsTable: 'general',
    insertInPatientConsentsTable: 'general',
    insertInProcessActorsTable: 'general',
    insertPoliclinicOrganizationInProcessActorsTable: 'general',
    intervalBasedOnServiceActivityScheduler: 'scheduled',
    intervalWeeksBasedOnServiceActivityScheduler: 'scheduled',
    invitePatientToBrightPlan: 'general',
    manualStart: 'start',
    osasCreateExternalReferralLetter: 'general',
    osasDeleteCloudpatExaminationResults: 'action',
    pauseProcess: 'general',
    percentageYesOrNo: 'general',
    performActivity: 'activity',
    receiveEvidencioQuestionnaireStatus: 'activity',
    receiveGradingResult: 'general',
    receivePrickTestMeasurements: 'general',
    registerCloudPatPatient: 'general',
    reminderEmailEvidencioQuestionnaireToPatient: 'general',
    reminderEmailToPerformer: 'general',
    resumeProcess: 'general',
    saveCaroFollowUpBodyWeightMeasurements: 'general',
    saveCaroQuestionnaireResponse: 'activity',
    saveEvidencioQuestionnaireResponse: 'activity',
    saveProcessQuestionnaireResponse: 'activity',
    saveResponseBody: 'activity',
    sendEmailToGeneralPractitioner: 'general',
    sendEmailToPatient: 'general',
    sendEmailToRequester: 'general',
    sendEmailToTaskPerformer: 'general',
    sendEmailToTaskPerformerBasedOnNotificationSettings: 'general',
    sendExaminationRecorderEmail: 'general',
    sendZorgMail: 'general',
    sendZorgmailToGeneralPractitioner: 'general',
    sendEmailToRequesterBasedOnNotificationSettings: 'general',
    sendZorgmailToRequester: 'general',
    setProcessStatusFlags: 'general',
    setRequesterFromCareProvider: 'general',
    setRequesterFromStarter: 'general',
    startProcessFromExistingProcess: 'general',
    updateCaroPatientFromActivityData: 'general',
    updateCaroPatientFromStep: 'general',
    updateGroupMeetingPatient: 'general',
    updatePatientFromActivityData: 'general',
    updatePatientGeneralPractitionerFromStarter: 'general',
    upsertInPatientGeneralPractitionersTable: 'general',
    userChoice: 'choice',
    waitForAll: 'general',
};

// ────────────────────────────────────────────────────────
// Public types
// ────────────────────────────────────────────────────────

export interface SeedDiagnostic {
    code: string | null;
    message: string;
    line?: number;
    column?: number;
}

function getNodeLocation(node: ts.Node, sourceFile: ts.SourceFile): { line: number; column: number } {
    const { line, character } = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile));
    return { line: line + 1, column: character + 1 };
}

interface WorkflowActivity {
    closedStatusLabel: string;
    customControlCode: string;
    id: string;
    isAutoSaveEnabled: boolean;
    isPrintEnabled: boolean;
    label: string;
    name: string;
    serviceActivityType: string;
    serviceId: string;
}

interface WorkflowStep {
    allowedPerformer: string | null;
    displayOptions: { x: number; y: number };
    id: string;
    isRerunnable: boolean;
    label: string | null;
    name: string;
    parameters: Record<string, unknown> | null;
    performerNeedsTask: boolean;
    serviceId: string;
    serviceWorkflowBlock: { id: string; name: string; type: string };
    type?: string;
}

interface WorkflowStepActivity {
    id: string;
    serviceActivityId: string;
    serviceWorkflowStepId: string;
}

interface WorkflowTransition {
    fromStepId: string;
    id: string;
    onlyIfOutputEquals: string | null;
    serviceId: string;
    synchronous: boolean;
    toStepId: string;
    type: string;
}

export interface ParsedWorkflowEntry {
    serviceCode: string | null;
    serviceName: string;
    workflow: {
        activities: WorkflowActivity[];
        stepActivities: WorkflowStepActivity[];
        steps: WorkflowStep[];
        transitions: WorkflowTransition[];
    };
}

export interface SeedSnapshot {
    diagnostics: SeedDiagnostic[];
    workflows: ParsedWorkflowEntry[];
}

// ────────────────────────────────────────────────────────
// Helpers
// ────────────────────────────────────────────────────────

function deterministicUuid(seed: string): string {
    const hash = crypto.createHash('sha256').update(seed).digest('hex');
    return [
        hash.slice(0, 8),
        hash.slice(8, 12),
        '4' + hash.slice(13, 16),
        ((parseInt(hash.slice(16, 18), 16) & 0x3f) | 0x80).toString(16) + hash.slice(18, 20),
        hash.slice(20, 32),
    ].join('-');
}

export function getSeedRelativePath(repositoryRoot: string, absolutePath: string): string {
    return path.relative(repositoryRoot, absolutePath).replace(/\\/g, '/');
}

export function hasErrorDiagnostics(diagnostics: SeedDiagnostic[]): boolean {
    return diagnostics.some(
        (d) => !d.code || !d.code.startsWith('WARN')
    );
}

// ────────────────────────────────────────────────────────
// AST evaluation helpers
// ────────────────────────────────────────────────────────

function resolveEnumAccess(node: ts.Node, checker: ts.TypeChecker): string | undefined {
    if (ts.isPropertyAccessExpression(node)) {
        const symbol = checker.getSymbolAtLocation(node);
        if (symbol) {
            const decl = symbol.valueDeclaration;
            if (decl && ts.isEnumMember(decl) && decl.initializer) {
                if (ts.isStringLiteral(decl.initializer)) {
                    return decl.initializer.text;
                }
            }
        }
        // Fallback: use the member name (common for enums where name === value)
        return node.name.text;
    }
    return undefined;
}

/**
 * Statically evaluate a TS AST node into a JSON-friendly value.
 */
function evaluate(
    node: ts.Node,
    checker: ts.TypeChecker,
    variables: Map<string, unknown>,
    fileSeed: string,
    uuidCounter: { value: number }
): unknown {
    if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) return node.text;
    if (ts.isNumericLiteral(node)) return Number(node.text);
    if (node.kind === ts.SyntaxKind.TrueKeyword) return true;
    if (node.kind === ts.SyntaxKind.FalseKeyword) return false;
    if (node.kind === ts.SyntaxKind.NullKeyword) return null;
    if (node.kind === ts.SyntaxKind.UndefinedKeyword) return undefined;

    if (ts.isTemplateExpression(node)) {
        let result = node.head.text;
        for (const span of node.templateSpans) {
            const val = evaluate(span.expression, checker, variables, fileSeed, uuidCounter);
            result += String(val ?? '') + span.literal.text;
        }
        return result;
    }

    if (ts.isArrayLiteralExpression(node)) {
        return node.elements.map((el) => evaluate(el, checker, variables, fileSeed, uuidCounter));
    }

    if (ts.isObjectLiteralExpression(node)) {
        const obj: Record<string, unknown> = {};
        for (const prop of node.properties) {
            if (ts.isPropertyAssignment(prop)) {
                const key = prop.name && ts.isIdentifier(prop.name)
                    ? prop.name.text
                    : prop.name && ts.isComputedPropertyName(prop.name)
                        ? String(evaluate(prop.name.expression, checker, variables, fileSeed, uuidCounter))
                        : prop.name?.getText();
                if (key) {
                    obj[key] = evaluate(prop.initializer, checker, variables, fileSeed, uuidCounter);
                }
            } else if (ts.isShorthandPropertyAssignment(prop)) {
                obj[prop.name.text] = variables.get(prop.name.text);
            } else if (ts.isSpreadAssignment(prop)) {
                const spread = evaluate(prop.expression, checker, variables, fileSeed, uuidCounter);
                if (spread && typeof spread === 'object') Object.assign(obj, spread);
            }
        }
        return obj;
    }

    if (ts.isPropertyAccessExpression(node)) {
        const enumVal = resolveEnumAccess(node, checker);
        if (enumVal !== undefined) return enumVal;
        const objVal = evaluate(node.expression, checker, variables, fileSeed, uuidCounter);
        if (objVal && typeof objVal === 'object') {
            return (objVal as Record<string, unknown>)[node.name.text];
        }
        return node.name.text;
    }

    if (ts.isElementAccessExpression(node)) {
        const objVal = evaluate(node.expression, checker, variables, fileSeed, uuidCounter);
        const key = evaluate(node.argumentExpression, checker, variables, fileSeed, uuidCounter);
        if (objVal && typeof objVal === 'object' && key !== undefined) {
            return (objVal as Record<string, unknown>)[String(key)];
        }
    }

    if (ts.isIdentifier(node)) {
        if (variables.has(node.text)) return variables.get(node.text);
        const symbol = checker.getSymbolAtLocation(node);
        if (symbol?.valueDeclaration && ts.isEnumMember(symbol.valueDeclaration)) {
            const init = symbol.valueDeclaration.initializer;
            if (init && ts.isStringLiteral(init)) return init.text;
            return node.text;
        }
        return undefined;
    }

    if (ts.isCallExpression(node)) {
        const callee = node.expression;
        const calleeName = ts.isIdentifier(callee) ? callee.text : undefined;
        if (calleeName === 'uuidv4' || calleeName === 'v4') {
            const uuid = deterministicUuid(`${fileSeed}:uuid:${uuidCounter.value}`);
            uuidCounter.value++;
            return uuid;
        }
        // Method call on a known variable (e.g. helper.createActivity) — skip
    }

    if (ts.isParenthesizedExpression(node))
        return evaluate(node.expression, checker, variables, fileSeed, uuidCounter);
    if (ts.isAsExpression(node))
        return evaluate(node.expression, checker, variables, fileSeed, uuidCounter);
    if (ts.isNonNullExpression(node))
        return evaluate(node.expression, checker, variables, fileSeed, uuidCounter);
    if (ts.isAwaitExpression(node))
        return evaluate(node.expression, checker, variables, fileSeed, uuidCounter);

    if (ts.isConditionalExpression(node)) {
        const cond = evaluate(node.condition, checker, variables, fileSeed, uuidCounter);
        return cond
            ? evaluate(node.whenTrue, checker, variables, fileSeed, uuidCounter)
            : evaluate(node.whenFalse, checker, variables, fileSeed, uuidCounter);
    }

    if (ts.isBinaryExpression(node)) {
        if (node.operatorToken.kind === ts.SyntaxKind.QuestionQuestionToken) {
            const left = evaluate(node.left, checker, variables, fileSeed, uuidCounter);
            return left ?? evaluate(node.right, checker, variables, fileSeed, uuidCounter);
        }
        if (node.operatorToken.kind === ts.SyntaxKind.BarBarToken) {
            const left = evaluate(node.left, checker, variables, fileSeed, uuidCounter);
            return left || evaluate(node.right, checker, variables, fileSeed, uuidCounter);
        }
    }

    if (ts.isSpreadElement(node))
        return evaluate(node.expression, checker, variables, fileSeed, uuidCounter);

    return undefined;
}

// ────────────────────────────────────────────────────────
// Core parser
// ────────────────────────────────────────────────────────

interface WorkflowContext {
    activities: WorkflowActivity[];
    helperVarName: string;
    serviceId: string;
    serviceName: string;
    serviceCode: string | null;
    stepActivities: WorkflowStepActivity[];
    steps: WorkflowStep[];
    pendingTransitions: Array<{
        fromStepId: string;
        toStepRef: unknown;
        onlyIfOutputEquals: string | null;
        synchronous: boolean;
        type: string | null;
    }>;
}

export function parseSeedFile(
    repositoryRoot: string,
    filePath: string,
    _relativePath: string
): SeedSnapshot {
    const diagnostics: SeedDiagnostic[] = [];

    const configPath = ts.findConfigFile(repositoryRoot, ts.sys.fileExists, 'tsconfig.json');
    let compilerOptions: ts.CompilerOptions = {
        allowJs: true,
        esModuleInterop: true,
        module: ts.ModuleKind.ESNext,
        moduleResolution: ts.ModuleResolutionKind.Bundler,
        noEmit: true,
        skipLibCheck: true,
        target: ts.ScriptTarget.ES2022,
    };

    if (configPath) {
        const configFile = ts.readConfigFile(configPath, ts.sys.readFile);
        if (configFile.config) {
            const parsed = ts.parseJsonConfigFileContent(configFile.config, ts.sys, path.dirname(configPath));
            compilerOptions = { ...parsed.options, noEmit: true, skipLibCheck: true };
        }
    }

    const program = ts.createProgram([filePath], compilerOptions);
    const checker = program.getTypeChecker();
    const sourceFile = program.getSourceFile(filePath);

    if (!sourceFile) {
        diagnostics.push({ code: 'PARSER_ERROR', message: `Could not read file: ${filePath}` });
        return { diagnostics, workflows: [] };
    }

    const fileSeed = _relativePath;
    const uuidCounter = { value: 0 };
    const variables = new Map<string, unknown>();
    const workflows: WorkflowContext[] = [];
    const stepVarToId = new Map<string, string>();
    const stepsById = new Map<string, WorkflowStep>();
    // Track createService call metadata: varName → { name, code }
    const serviceMetadata = new Map<string, { name: string; code: string | null }>();
    // Track knex('services').insert() metadata: serviceId → { name, code }
    const knexServiceIdToMeta = new Map<string, { name: string; code: string | null }>();

    function processCallExpression(
        init: ts.CallExpression,
        varName: string | null,
        sourceFile: ts.SourceFile
    ): boolean {
        const callExpr = init;

        // createService({ ... })
        if (ts.isIdentifier(callExpr.expression) && callExpr.expression.text === 'createService' && callExpr.arguments.length > 0) {
            const argVal = evaluate(callExpr.arguments[0], checker, variables, fileSeed, uuidCounter) as Record<string, unknown> | undefined;
            if (argVal && varName) {
                const serviceId = deterministicUuid(`${fileSeed}:createService:${varName}`);
                variables.set(varName, serviceId);
                serviceMetadata.set(varName, {
                    name: String(argVal.name ?? ''),
                    code: argVal.code ? String(argVal.code) : null,
                });
                return true;
            }
        }

        // knex('services').insert([...]) — extract service metadata
        if (ts.isPropertyAccessExpression(callExpr.expression) && callExpr.expression.name.text === 'insert') {
            const parentCall = callExpr.expression.expression;
            if (ts.isCallExpression(parentCall) && ts.isIdentifier(parentCall.expression) && parentCall.expression.text === 'knex') {
                if (parentCall.arguments.length > 0) {
                    const tableArg = evaluate(parentCall.arguments[0], checker, variables, fileSeed, uuidCounter);
                    if (tableArg === 'services' && callExpr.arguments.length > 0) {
                        const insertData = evaluate(callExpr.arguments[0], checker, variables, fileSeed, uuidCounter);
                        const rows = Array.isArray(insertData) ? insertData : [insertData];
                        for (const row of rows) {
                            if (row && typeof row === 'object' && 'id' in row) {
                                const r = row as Record<string, unknown>;
                                const svcId = String(r.id);
                                serviceMetadata.set(`__knex_service_${svcId}`, {
                                    name: r.name ? String(r.name) : '',
                                    code: r.code ? String(r.code) : null,
                                });
                                // Also store the mapping from svcId → metadata for lookup
                                knexServiceIdToMeta.set(svcId, {
                                    name: r.name ? String(r.name) : '',
                                    code: r.code ? String(r.code) : null,
                                });
                            }
                        }
                        return true;
                    }
                }
            }
        }

        // helper.createActivity(...) / helper.createStep(...)
        if (ts.isPropertyAccessExpression(callExpr.expression)) {
            const objName = callExpr.expression.expression.getText(sourceFile);
            const methodName = callExpr.expression.name.text;
            const wf = workflows.find((w) => w.helperVarName === objName);

            if (wf && methodName === 'createActivity' && callExpr.arguments.length > 0) {
                const actData = evaluate(callExpr.arguments[0], checker, variables, fileSeed, uuidCounter) as Record<string, unknown> | undefined;
                if (actData) {
                    const activity = buildActivity(actData, wf.serviceId, fileSeed, uuidCounter);
                    wf.activities.push(activity);
                    if (varName) variables.set(varName, activity);
                }
                return true;
            }

            if (wf && methodName === 'createStep' && callExpr.arguments.length > 0) {
                const stepData = evaluate(callExpr.arguments[0], checker, variables, fileSeed, uuidCounter) as Record<string, unknown> | undefined;
                if (stepData) {
                    const loc = getNodeLocation(callExpr, sourceFile);
                    const result = buildStep(stepData, wf, fileSeed, uuidCounter, diagnostics, loc, varName ?? undefined);
                    if (result) {
                        wf.steps.push(result.step);
                        stepsById.set(result.step.id, result.step);
                        if (varName) {
                            stepVarToId.set(varName, result.step.id);
                            variables.set(varName, result.step);
                        }
                        if (result.stepActivities) wf.stepActivities.push(...result.stepActivities);
                        if (result.pendingTransitions) wf.pendingTransitions.push(...result.pendingTransitions);
                    }
                }
                return true;
            }

            if (wf && methodName === 'generateTransitions') {
                // generateTransitions() may receive an array of extra transitions
                if (callExpr.arguments.length > 0) {
                    const extraTransitions = evaluate(callExpr.arguments[0], checker, variables, fileSeed, uuidCounter) as Array<Record<string, unknown>> | undefined;
                    if (Array.isArray(extraTransitions)) {
                        for (const et of extraTransitions) {
                            if (et && typeof et === 'object' && et.fromStep && et.toStep) {
                                const fromId = resolveStepId(et.fromStep, stepVarToId, stepsById);
                                if (fromId) {
                                    wf.pendingTransitions.push({
                                        fromStepId: fromId,
                                        toStepRef: et.toStep,
                                        onlyIfOutputEquals: et.onlyIfOutputEquals ? String(et.onlyIfOutputEquals) : null,
                                        synchronous: false,
                                        type: et.type ? String(et.type) : null,
                                    });
                                }
                            }
                        }
                    }
                }
                return true;
            }
        }

        return false;
    }

    function visit(node: ts.Node): void {
        // Variable declarations
        if (ts.isVariableDeclaration(node) && node.initializer && node.name && ts.isIdentifier(node.name)) {
            const varName = node.name.text;
            let initializer = node.initializer;

            // Unwrap await
            if (ts.isAwaitExpression(initializer)) {
                initializer = initializer.expression;
            }

            // new ServiceCreationHelper(knex, serviceId)
            if (ts.isNewExpression(initializer)) {
                const ctorName = initializer.expression.getText(sourceFile!);
                if (ctorName === 'ServiceCreationHelper' && initializer.arguments) {
                    const args = initializer.arguments;
                    const serviceId = args.length >= 2
                        ? String(evaluate(args[1], checker, variables, fileSeed, uuidCounter) ?? deterministicUuid(`${fileSeed}:service:${workflows.length}`))
                        : deterministicUuid(`${fileSeed}:service:${workflows.length}`);

                    const wf: WorkflowContext = {
                        activities: [],
                        helperVarName: varName,
                        serviceId,
                        serviceName: '',
                        serviceCode: null,
                        stepActivities: [],
                        steps: [],
                        pendingTransitions: [],
                    };

                    // Try to resolve service metadata from the serviceId variable
                    for (const [metaVarName, meta] of serviceMetadata) {
                        const metaServiceId = variables.get(metaVarName);
                        if (metaServiceId === serviceId) {
                            wf.serviceName = meta.name;
                            wf.serviceCode = meta.code;
                            serviceMetadata.delete(metaVarName);
                            break;
                        }
                    }

                    // Also check knex('services').insert() metadata
                    if (!wf.serviceName && knexServiceIdToMeta.has(serviceId)) {
                        const meta = knexServiceIdToMeta.get(serviceId)!;
                        wf.serviceName = meta.name;
                        wf.serviceCode = meta.code;
                    }

                    workflows.push(wf);
                    variables.set(varName, { __serviceCreationHelper: true, serviceId });
                    return;
                }
            }

            // Call expression
            if (ts.isCallExpression(initializer)) {
                if (processCallExpression(initializer, varName, sourceFile!)) return;
            }

            // General variable evaluation
            const val = evaluate(node.initializer, checker, variables, fileSeed, uuidCounter);
            variables.set(varName, val);
            return;
        }

        // Expression statements (non-assigned calls)
        if (ts.isExpressionStatement(node)) {
            let expr = node.expression;
            if (ts.isAwaitExpression(expr)) expr = expr.expression;
            if (ts.isCallExpression(expr)) {
                processCallExpression(expr, null, sourceFile!);
                return;
            }
        }

        ts.forEachChild(node, visit);
    }

    function visitBlock(body: ts.Block): void {
        for (const stmt of body.statements) {
            if (ts.isVariableStatement(stmt)) {
                for (const decl of stmt.declarationList.declarations) {
                    visit(decl);
                }
            } else {
                visit(stmt);
            }
        }
    }

    // Find the exported seed function
    ts.forEachChild(sourceFile, (node) => {
        if (ts.isFunctionDeclaration(node) && node.name?.text === 'seed' && node.body) {
            visitBlock(node.body);
        }
        if (ts.isVariableStatement(node)) {
            for (const decl of node.declarationList.declarations) {
                if (ts.isIdentifier(decl.name) && decl.name.text === 'seed' && decl.initializer) {
                    const fn = decl.initializer;
                    if ((ts.isArrowFunction(fn) || ts.isFunctionExpression(fn)) && fn.body && ts.isBlock(fn.body)) {
                        visitBlock(fn.body);
                    }
                }
            }
        }
    });

    // Assign remaining service metadata
    for (const wf of workflows) {
        if (!wf.serviceName) {
            // Try knex metadata first (by serviceId)
            if (knexServiceIdToMeta.has(wf.serviceId)) {
                const meta = knexServiceIdToMeta.get(wf.serviceId)!;
                wf.serviceName = meta.name;
                wf.serviceCode = meta.code;
                continue;
            }
            for (const [metaVarName, meta] of serviceMetadata) {
                wf.serviceName = meta.name;
                wf.serviceCode = meta.code;
                serviceMetadata.delete(metaVarName);
                break;
            }
        }
    }

    // Resolve transitions
    const result: ParsedWorkflowEntry[] = workflows.map((wf) => {
        const transitions: WorkflowTransition[] = [];

        for (const pt of wf.pendingTransitions) {
            const toStepId = resolveStepId(pt.toStepRef, stepVarToId, stepsById);
            if (!toStepId) {
                const fromStep = stepsById.get(pt.fromStepId);
                const fromLabel = fromStep ? `"${fromStep.name}"` : pt.fromStepId;
                diagnostics.push({
                    code: 'WARN_UNRESOLVED_TRANSITION',
                    message: `Could not resolve transition target from step ${fromLabel}`,
                });
                continue;
            }

            transitions.push({
                fromStepId: pt.fromStepId,
                id: deterministicUuid(`${fileSeed}:transition:${pt.fromStepId}:${toStepId}:${pt.synchronous}`),
                onlyIfOutputEquals: pt.onlyIfOutputEquals,
                serviceId: wf.serviceId,
                synchronous: pt.synchronous,
                toStepId,
                type: pt.type ?? 'enable',
            });
        }

        return {
            serviceCode: wf.serviceCode,
            serviceName: wf.serviceName,
            workflow: {
                activities: wf.activities,
                stepActivities: wf.stepActivities,
                steps: wf.steps,
                transitions,
            },
        };
    });

    return { diagnostics, workflows: result };
}

// ────────────────────────────────────────────────────────
// Builders
// ────────────────────────────────────────────────────────

function buildActivity(
    data: Record<string, unknown>,
    serviceId: string,
    fileSeed: string,
    uuidCounter: { value: number }
): WorkflowActivity {
    return {
        closedStatusLabel: String(data.closedStatusLabel ?? ''),
        customControlCode: String(data.customControlCode ?? ''),
        id: String(data.id ?? deterministicUuid(`${fileSeed}:activity:${uuidCounter.value++}`)),
        isAutoSaveEnabled: Boolean(data.isAutoSaveEnabled ?? false),
        isPrintEnabled: Boolean(data.isPrintEnabled ?? false),
        label: String(data.label ?? data.name ?? ''),
        name: String(data.name ?? ''),
        serviceActivityType: String(data.serviceActivityType ?? ''),
        serviceId,
    };
}

function buildStep(
    data: Record<string, unknown>,
    wf: WorkflowContext,
    fileSeed: string,
    uuidCounter: { value: number },
    diagnostics: SeedDiagnostic[],
    location?: { line: number; column: number },
    varName?: string
): {
    step: WorkflowStep;
    stepActivities: WorkflowStepActivity[];
    pendingTransitions: WorkflowContext['pendingTransitions'];
} | null {
    const blockName = String(data.block ?? '');
    const blockType = BLOCK_TYPE_MAP[blockName];
    const stepName = String(data.name ?? varName ?? '(unknown)');

    if (!blockType) {
        const loc = location ? ` (line ${location.line}, col ${location.column})` : '';
        diagnostics.push({
            code: 'UNSUPPORTED_BLOCK',
            message: `Unsupported workflow block "${blockName}" in step "${stepName}"${loc}`,
            ...location,
        });
        return null;
    }

    const stepId = String(data.id ?? deterministicUuid(`${fileSeed}:step:${uuidCounter.value++}`));
    const blockId = deterministicUuid(`${fileSeed}:block:${blockName}`);

    const step: WorkflowStep = {
        allowedPerformer: data.allowedPerformer ? String(data.allowedPerformer) : null,
        displayOptions: { x: Number(data.x ?? 0), y: Number(data.y ?? 0) },
        id: stepId,
        isRerunnable: false,
        label: data.label !== undefined ? (data.label === null ? null : String(data.label)) : String(data.name ?? ''),
        name: String(data.name ?? ''),
        parameters: data.parameters ? (data.parameters as Record<string, unknown>) : null,
        performerNeedsTask: Boolean(data.performerNeedsTask ?? false),
        serviceId: wf.serviceId,
        serviceWorkflowBlock: { id: blockId, name: blockName, type: blockType },
    };

    if (data.type) step.type = String(data.type);

    const stepActivities: WorkflowStepActivity[] = [];
    const activities = data.activities as Array<{ id: string }> | undefined;
    if (Array.isArray(activities)) {
        for (const act of activities) {
            if (act && act.id) {
                stepActivities.push({
                    id: deterministicUuid(`${fileSeed}:stepActivity:${stepId}:${act.id}`),
                    serviceActivityId: act.id,
                    serviceWorkflowStepId: stepId,
                });
            }
        }
    }

    const pendingTransitions: WorkflowContext['pendingTransitions'] = [];

    const processNextSteps = (nextSteps: unknown, synchronous: boolean) => {
        if (!Array.isArray(nextSteps)) return;
        for (const ns of nextSteps) {
            if (!ns) continue;
            if (typeof ns === 'object' && 'id' in ns && !('step' in ns)) {
                pendingTransitions.push({
                    fromStepId: stepId,
                    toStepRef: ns,
                    onlyIfOutputEquals: null,
                    synchronous,
                    type: null,
                });
            } else if (typeof ns === 'object' && 'step' in ns) {
                const cond = ns as { step: unknown; onlyIfOutputEquals?: string; type?: string };
                pendingTransitions.push({
                    fromStepId: stepId,
                    toStepRef: cond.step,
                    onlyIfOutputEquals: cond.onlyIfOutputEquals ?? null,
                    synchronous,
                    type: cond.type ?? null,
                });
            }
        }
    };

    processNextSteps(data.nextSteps, false);
    processNextSteps(data.synchronousNextSteps, true);

    return { step, stepActivities, pendingTransitions };
}

function resolveStepId(
    ref: unknown,
    _stepVarToId: Map<string, string>,
    stepsById: Map<string, WorkflowStep>
): string | null {
    if (!ref) return null;
    if (typeof ref === 'object' && 'id' in ref) {
        const id = String((ref as { id: string }).id);
        return id;
    }
    if (typeof ref === 'string') {
        if (stepsById.has(ref)) return ref;
    }
    return null;
}
