import fs from "node:fs";
import path from "node:path";
import { Router } from "express";
import { readConfig } from "../config.js";
import { convertSeedToMigration } from "../migrationConverter.js";
import type {
	MigrationConvertRequest,
	MigrationConvertResponse,
} from "../../shared/types.js";

const router = Router();

/**
 * POST /api/migrations/convert
 *
 * Converts a seed file to a migration file, writes the result to the
 * migrations directory, and returns the new file name.
 *
 * Body: MigrationConvertRequest
 * Response: MigrationConvertResponse
 */
router.post("/migrations/convert", async (req, res) => {
	const config = readConfig();
	if (!config.clientSafePath) {
		const resp: MigrationConvertResponse = {
			success: false,
			error: "ClientSafe path not configured",
		};
		res.status(400).json(resp);
		return;
	}

	const body = req.body as MigrationConvertRequest;
	if (!body.seedFileName) {
		const resp: MigrationConvertResponse = {
			success: false,
			error: "seedFileName is required",
		};
		res.status(400).json(resp);
		return;
	}

	const seedFilePath = path.join(
		config.clientSafePath,
		"src",
		"backend",
		"seeds",
		body.seedFileName,
	);

	if (!fs.existsSync(seedFilePath)) {
		const resp: MigrationConvertResponse = {
			success: false,
			error: `Seed file not found: ${body.seedFileName}`,
		};
		res.status(404).json(resp);
		return;
	}

	try {
		const result = await convertSeedToMigration(
			seedFilePath,
			config.clientSafePath,
			body.migrationNumber,
			body.migrationName,
		);

		fs.writeFileSync(result.migrationFilePath, result.migrationSource, "utf-8");

		const resp: MigrationConvertResponse = {
			success: true,
			migrationFileName: result.migrationFileName,
		};
		res.json(resp);
	} catch (err) {
		const resp: MigrationConvertResponse = {
			success: false,
			error: err instanceof Error ? err.message : String(err),
		};
		res.status(500).json(resp);
	}
});

export default router;
