import fs from "node:fs";
import path from "node:path";
import { Router } from "express";
import { readConfig } from "../config.js";
import { discoverSeedFiles } from "../seedDiscovery.js";
import { parseSeedFile, getSeedRelativePath } from "../seedAstParser.js";
import { patchSeedFile } from "../seedWriter.js";
import { appendNewItemsToSeedFile } from "../seedWriterNew.js";
import type { SeedPatchRequest } from "../../shared/types.js";

const router = Router();

router.get("/seeds", (_req, res) => {
	const config = readConfig();
	if (!config.clientSafePath) {
		res.status(400).json({ error: "ClientSafe path not configured" });
		return;
	}
	res.json(discoverSeedFiles(config.clientSafePath));
});

router.get("/seeds/:fileName/parse", (req, res) => {
	const config = readConfig();
	if (!config.clientSafePath) {
		res.status(400).json({ error: "ClientSafe path not configured" });
		return;
	}

	const filePath = path.join(
		config.clientSafePath,
		"src",
		"backend",
		"seeds",
		req.params.fileName,
	);
	const relativePath = getSeedRelativePath(config.clientSafePath, filePath);

	try {
		const snapshot = parseSeedFile(
			config.clientSafePath,
			filePath,
			relativePath,
		);
		res.json({
			workflows: snapshot.workflows,
			diagnostics: snapshot.diagnostics.map((d) => ({
				code: d.code,
				message: d.message,
				severity: d.code?.startsWith("WARN") ? "warning" : "error",
				line: d.line,
				column: d.column,
			})),
			filePath,
			parsedAt: new Date().toISOString(),
		});
	} catch (err) {
		res
			.status(500)
			.json({ error: err instanceof Error ? err.message : String(err) });
	}
});

router.patch("/seeds/:fileName", (req, res) => {
	const config = readConfig();
	if (!config.clientSafePath) {
		res.status(400).json({ error: "ClientSafe path not configured" });
		return;
	}

	const body = req.body as SeedPatchRequest;
	const changes = body.changes;
	if (!Array.isArray(changes)) {
		res.status(400).json({ error: "Missing or invalid changes array" });
		return;
	}

	const filePath = path.join(
		config.clientSafePath,
		"src",
		"backend",
		"seeds",
		req.params.fileName,
	);

	try {
		// 1. Apply edits to existing steps
		if (changes.length > 0) {
			patchSeedFile(filePath, changes);
		}

		// 2. Append new steps / connections / transitions
		const hasNewItems =
			(body.newSteps && body.newSteps.length > 0) ||
			(body.newConnections && body.newConnections.length > 0) ||
			(body.newTransitions && body.newTransitions.length > 0);

		if (hasNewItems) {
			// Build stepId → variableName map from client-supplied data
			const stepVarNames = new Map<string, string>();
			for (const entry of body.stepVarNames ?? []) {
				if (entry.variableName) {
					stepVarNames.set(entry.id, entry.variableName);
				}
			}

			appendNewItemsToSeedFile(
				filePath,
				body.newSteps ?? [],
				body.newConnections ?? [],
				body.newTransitions ?? [],
				stepVarNames,
			);
		}

		res.json({ success: true });
	} catch (err) {
		res
			.status(500)
			.json({ error: err instanceof Error ? err.message : String(err) });
	}
});

router.post("/seeds/clone", (req, res) => {
	const config = readConfig();
	if (!config.clientSafePath) {
		res.status(400).json({ error: "ClientSafe path not configured" });
		return;
	}

	const { sourceFileName, newFileName } = req.body as {
		sourceFileName: string;
		newFileName: string;
	};

	if (!sourceFileName || !newFileName) {
		res
			.status(400)
			.json({ error: "sourceFileName and newFileName are required" });
		return;
	}
	if (newFileName === sourceFileName) {
		res.status(400).json({ error: "New filename must differ from source" });
		return;
	}

	const seedsDir = path.join(config.clientSafePath, "src", "backend", "seeds");
	const sourcePath = path.join(seedsDir, sourceFileName);
	const destPath = path.join(seedsDir, newFileName);

	// Security: ensure both paths resolve within seedsDir
	if (!sourcePath.startsWith(seedsDir) || !destPath.startsWith(seedsDir)) {
		res.status(400).json({ error: "Invalid file path" });
		return;
	}

	try {
		if (!fs.existsSync(sourcePath)) {
			res
				.status(404)
				.json({ error: `Source file not found: ${sourceFileName}` });
			return;
		}
		if (fs.existsSync(destPath)) {
			res.status(409).json({ error: `File already exists: ${newFileName}` });
			return;
		}
		fs.copyFileSync(sourcePath, destPath);
		res.json({ success: true, fileName: newFileName });
	} catch (err) {
		res
			.status(500)
			.json({ error: err instanceof Error ? err.message : String(err) });
	}
});

export default router;
