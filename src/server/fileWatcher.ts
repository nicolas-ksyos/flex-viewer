import path from "node:path";
import chokidar from "chokidar";
import type { SeedParseResult, WsMessage } from "../shared/types.js";
import { parseSeedFile, getSeedRelativePath } from "./seedAstParser.js";

type BroadcastFn = (message: WsMessage) => void;

let watcher: chokidar.FSWatcher | null = null;
let debounceTimer: ReturnType<typeof setTimeout> | null = null;

export function startWatching(
	clientSafePath: string,
	seedFilePath: string,
	broadcast: BroadcastFn,
): SeedParseResult | null {
	stopWatching();

	const absolutePath = path.isAbsolute(seedFilePath)
		? seedFilePath
		: path.join(clientSafePath, seedFilePath);

	console.log(`[watcher] Watching: ${absolutePath}`);

	watcher = chokidar.watch(absolutePath, {
		persistent: true,
		ignoreInitial: true,
		awaitWriteFinish: { stabilityThreshold: 200, pollInterval: 50 },
	});

	const handleChange = () => {
		if (debounceTimer) clearTimeout(debounceTimer);
		debounceTimer = setTimeout(() => {
			console.log(`[watcher] File changed, re-parsing...`);
			broadcast({ type: "parsingStarted", filePath: absolutePath });
			const result = parseSeed(clientSafePath, absolutePath);
			if (result) {
				broadcast({ type: "workflowUpdate", data: result });
			} else {
				broadcast({ type: "fileError", error: "Failed to parse seed file" });
			}
		}, 300);
	};

	watcher.on("change", handleChange);
	watcher.on("error", (err) => {
		console.error("[watcher] Error:", err.message);
		broadcast({ type: "fileError", error: err.message });
	});

	broadcast({ type: "watchStarted", filePath: absolutePath });

	// Send initial parse
	const initial = parseSeed(clientSafePath, absolutePath);
	if (initial) {
		broadcast({ type: "workflowUpdate", data: initial });
	}
	return initial;
}

export function stopWatching(): void {
	if (debounceTimer) {
		clearTimeout(debounceTimer);
		debounceTimer = null;
	}
	if (watcher) {
		watcher.close();
		watcher = null;
	}
}

function parseSeed(
	clientSafePath: string,
	absolutePath: string,
): SeedParseResult | null {
	try {
		const relativePath = getSeedRelativePath(clientSafePath, absolutePath);
		const snapshot = parseSeedFile(clientSafePath, absolutePath, relativePath);

		return {
			workflows: snapshot.workflows.map((w) => ({
				serviceName: w.serviceName,
				serviceCode: w.serviceCode,
				workflow: {
					activities: w.workflow.activities.map((a) => ({
						id: a.id,
						name: a.name,
						label: a.label,
						serviceActivityType: a.serviceActivityType,
						customControlCode: a.customControlCode,
						closedStatusLabel: a.closedStatusLabel,
						serviceId: a.serviceId,
						isAutoSaveEnabled: a.isAutoSaveEnabled,
						isPrintEnabled: a.isPrintEnabled,
					})),
					steps: w.workflow.steps.map((s) => ({
						id: s.id,
						name: s.name,
						label: s.label ?? s.name,
						displayOptions: s.displayOptions,
						serviceWorkflowBlock: s.serviceWorkflowBlock,
						allowedPerformer: s.allowedPerformer,
						parameters: s.parameters,
						performerNeedsTask: s.performerNeedsTask,
						serviceId: s.serviceId,
						isRerunnable: s.isRerunnable,
						...(s.type ? { type: s.type } : {}),
					})),
					stepActivities: w.workflow.stepActivities,
					transitions: w.workflow.transitions,
				},
			})),
			diagnostics: snapshot.diagnostics.map((d) => ({
				code: d.code,
				message: d.message,
				severity: d.code?.startsWith("WARN")
					? ("warning" as const)
					: ("error" as const),
				line: d.line,
				column: d.column,
			})),
			filePath: absolutePath,
			parsedAt: new Date().toISOString(),
		};
	} catch (err) {
		console.error(
			"[parser] Error:",
			err instanceof Error ? err.message : String(err),
		);
		return null;
	}
}
