import { Router } from "express";
import { readConfig } from "../config.js";
import {
	analyzeBlockParameterEditors,
	loadCachedSchemas,
	saveCachedSchemas,
} from "../blockParameterAnalyzer.js";

const router = Router();

/**
 * GET /api/block-parameters
 *
 * Returns the cached block parameter schemas.  If no cache exists yet and
 * a ClientSafe path is configured, automatically runs the first analysis.
 */
router.get("/block-parameters", (_req, res) => {
	const cached = loadCachedSchemas();
	if (cached) {
		res.json(cached);
		return;
	}

	// Auto-analyse on first request when clientSafePath is available
	const config = readConfig();
	if (config.clientSafePath) {
		try {
			const schemas = analyzeBlockParameterEditors(config.clientSafePath);
			saveCachedSchemas(schemas);
			res.json(schemas);
		} catch {
			res.json({});
		}
	} else {
		res.json({});
	}
});

/**
 * POST /api/block-parameters/refresh
 *
 * Re-analyses the ClientSafe blockParameters directory, updates the cache,
 * and returns the new schemas.
 */
router.post("/block-parameters/refresh", (_req, res) => {
	const config = readConfig();
	if (!config.clientSafePath) {
		res.status(400).json({ error: "ClientSafe path not configured" });
		return;
	}

	try {
		const schemas = analyzeBlockParameterEditors(config.clientSafePath);
		saveCachedSchemas(schemas);
		res.json({
			success: true,
			blockCount: Object.keys(schemas).length,
			schemas,
		});
	} catch (err) {
		res
			.status(500)
			.json({ error: err instanceof Error ? err.message : String(err) });
	}
});

export default router;
