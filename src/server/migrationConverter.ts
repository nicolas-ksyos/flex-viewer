/**
 * migrationConverter.ts
 *
 * Converts a seed `.ts` file into a migration `.ts` file using text-level
 * transformations.  No AST parsing — relies on the consistent conventions
 * used across flex service seed files.
 *
 * Mechanical transforms applied (in order):
 *  1.  Function signature:  seed(knex) → up(knex)
 *  2.  Remove specialism section (// 0. Add specialism … .ignore();)
 *  3.  Remove cleanServiceGroup call
 *  4.  Add isActive to createService()
 *  5.  Update imports (remove cleanServiceGroup, add Config; prune unused generateIdAndTimestamps)
 *  6.  Transform two-step profile pattern → one-step profileName pattern
 *  7.  Insert `await deleteSeedData(knex);` as first statement of up()
 *  8.  Append `export async function down()` after closing brace of up()
 *  9.  Append `async function deleteSeedData(knex: Knex)` helper at end of file
 * 10.  Derive output file name and path
 */

import fs from "node:fs";
import path from "node:path";

// ─────────────────────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────────────────────

export interface ConvertResult {
	migrationSource: string;
	migrationFileName: string;
	migrationFilePath: string;
}

export async function convertSeedToMigration(
	seedFilePath: string,
	clientSafePath: string,
	migrationNumber?: string,
	migrationName?: string,
): Promise<ConvertResult> {
	let source = fs.readFileSync(seedFilePath, "utf-8");

	// Extract the ServiceCode enum value early — needed for the deleteSeedData
	// helper body.  Falls back to a placeholder if not found.
	const serviceCodeMatch = source.match(
		/const serviceCode = (ServiceCode\.\w+)/,
	);
	const serviceCodeEnum = serviceCodeMatch
		? serviceCodeMatch[1]
		: "ServiceCode.Unknown";

	// ── 1. Function signature ──────────────────────────────────────────────
	source = source.replace(
		/export async function seed\(knex: Knex\): Promise<void> \{/,
		"export async function up(knex: Knex) {",
	);

	// ── 2. Remove specialism section ───────────────────────────────────────
	// Matches: blank line + "    // 0. Add specialism\n" through "    .ignore();\n"
	// The [\s\S]+? lazily matches everything in between (including the
	// generateIdAndTimestamps line and the knex('specialisms') block).
	source = source.replace(
		/\n\n {4}\/\/ 0\. Add specialism\n[\s\S]+?\.ignore\(\);\n/,
		"\n",
	);

	// ── 3. Remove cleanServiceGroup call ──────────────────────────────────
	source = source.replace(/\n\s*await cleanServiceGroup\([^)]+\);\n/, "\n");

	// ── 4. Add isActive to createService() as first property ──────────────
	// Finds "createService({\n        " and inserts isActive before the
	// first existing property, preserving indentation.
	source = source.replace(
		/(createService\(\{)(\n)([ \t]+)/,
		(_match, open, nl, indent) =>
			`${open}${nl}${indent}isActive: !['production', 'preproduction'].includes(Config.instance.get('NODE_ENV')),${nl}${indent}`,
	);

	// ── 5. Import updates ─────────────────────────────────────────────────

	// 5a. Remove cleanServiceGroup import
	source = source.replace(
		/\nimport \{ cleanServiceGroup \} from '@backend\/seeds\/util\/cleanUtils';\n/,
		"\n",
	);

	// 5b. Remove generateIdAndTimestamps import if no longer used in the body.
	//     After step 2 the specialism block (which used it) is gone; check
	//     whether any other usage remains.
	const genIdCount = (source.match(/generateIdAndTimestamps/g) ?? []).length;
	if (genIdCount <= 1) {
		// ≤1 means only the import line itself remains
		source = source.replace(
			/\nimport \{ generateIdAndTimestamps \} from '[^']+baseData';\n/,
			"\n",
		);
	}

	// 5c. Inject Config import before the first @backend/utils/ import line.
	//     Avoids duplicating if already present.
	if (!source.includes("import { Config }")) {
		source = source.replace(
			/(import [^\n]+ from '@backend\/utils\/[^']+';)/,
			`import { Config } from '@backend/utils/config';\n$1`,
		);
	}

	// ── 6. Profile creation: two-step → one-step ─────────────────────────
	source = transformProfiles(source);

	// ── 7. Insert deleteSeedData call as first statement of up() ──────────
	source = source.replace(
		/(export async function up\(knex: Knex\) \{)(\n)/,
		`$1$2    await deleteSeedData(knex);\n`,
	);

	// ── 8. Append down() export after the closing brace of up() ──────────
	// The closing "}" of up() is the last top-level "}" in the file at this
	// point (before we append anything else).
	const lastBraceIdx = source.lastIndexOf("\n}");
	if (lastBraceIdx !== -1) {
		source =
			source.slice(0, lastBraceIdx + 2) +
			"\n\nexport async function down() {\n    // Not implemented\n}";
	} else {
		source += "\n\nexport async function down() {\n    // Not implemented\n}";
	}

	// ── 9. Append deleteSeedData helper at end of file ────────────────────
	source +=
		`\n\nasync function deleteSeedData(knex: Knex) {\n` +
		`    /** Delete existing data that has been created by seeds from older commits (test environment) */\n` +
		`    await knex('serviceGroupMemberships')\n` +
		`        .whereIn('serviceId', (sub) => sub.select('id').from('services').where('code', ${serviceCodeEnum}))\n` +
		`        .delete();\n` +
		`    await knex('services').where('code', ${serviceCodeEnum}).delete();\n` +
		`}\n`;

	// ── 10. Determine output file name and path ───────────────────────────
	const { fileName, filePath } = buildMigrationFilePath(
		seedFilePath,
		clientSafePath,
		migrationNumber,
		migrationName,
	);

	return {
		migrationSource: source,
		migrationFileName: fileName,
		migrationFilePath: filePath,
	};
}

// ─────────────────────────────────────────────────────────────
// Profile transformation helper
// ─────────────────────────────────────────────────────────────

/**
 * Converts the two-step profile pattern used in seeds:
 *   const xyzProfile = await profileCreationHelper.createProfile('Name');
 *   await profileCreationHelper.setupProfileForService({ profileId: xyzProfile.id, ... });
 *
 * Into the one-step migration pattern:
 *   await profileCreationHelper.setupProfileForService({ profileName: 'Name', ... });
 *
 * Also replaces `xyzProfile.name` references (used in serviceEmployments) with
 * the literal profile name string.
 */
function transformProfiles(source: string): string {
	// Collect all createProfile declarations
	const createProfileRegex =
		/const (\w+) = await profileCreationHelper\.createProfile\('([^']+)'\);/g;
	const profiles: Array<{ varName: string; profileName: string }> = [];

	let m: RegExpExecArray | null;
	while ((m = createProfileRegex.exec(source)) !== null) {
		profiles.push({ varName: m[1], profileName: m[2] });
	}

	for (const { varName, profileName } of profiles) {
		const escapedName = profileName.replace(/'/g, "\\'");
		const escapedVar = escapeRegex(varName);

		// Replace profileId: varName.id, → profileName: 'Name',
		source = source.replace(
			new RegExp(`profileId: ${escapedVar}\\.id,`, "g"),
			`profileName: '${escapedName}',`,
		);

		// Replace varName.name references → 'Name'
		// (e.g. profileName: generalPractitionerProfile.name in serviceEmployments)
		source = source.replace(
			new RegExp(`${escapedVar}\\.name`, "g"),
			`'${escapedName}'`,
		);

		// Remove the createProfile declaration line.
		// Pattern: \n + optional indented line + the const statement + \n
		source = source.replace(
			new RegExp(
				`\\n    const ${escapedVar} = await profileCreationHelper\\.createProfile\\('[^']*'\\);\\n`,
			),
			"\n",
		);
	}

	return source;
}

// ─────────────────────────────────────────────────────────────
// File path helpers
// ─────────────────────────────────────────────────────────────

function buildMigrationFilePath(
	seedFilePath: string,
	clientSafePath: string,
	migrationNumber?: string,
	migrationName?: string,
): { fileName: string; filePath: string } {
	const migrationsDir = path.join(
		clientSafePath,
		"src",
		"backend",
		"migrations",
	);

	// Auto-detect the next migration number if not supplied
	if (!migrationNumber) {
		const files = fs
			.readdirSync(migrationsDir)
			.filter((f) => /^\d{4}[-_]/.test(f) && f.endsWith(".ts"));
		const numbers = files
			.map((f) => parseInt(f.slice(0, 4), 10))
			.filter((n) => !isNaN(n));
		const maxNum = numbers.length > 0 ? Math.max(...numbers) : 0;
		migrationNumber = String(maxNum + 1).padStart(4, "0");
	}

	// Derive migration name from seed file base name if not supplied
	if (!migrationName) {
		const seedBaseName = path.basename(seedFilePath, ".ts");
		// Strip leading numeric prefix patterns like "124_1_" or "088_"
		migrationName = seedBaseName
			.replace(/^\d+_\d+_/, "")
			.replace(/^\d+_/, "")
			.replace(/_/g, "-");
	}

	const fileName = `${migrationNumber}-${migrationName}.ts`;
	const filePath = path.join(migrationsDir, fileName);

	return { fileName, filePath };
}

// ─────────────────────────────────────────────────────────────
// Utility
// ─────────────────────────────────────────────────────────────

function escapeRegex(s: string): string {
	return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
