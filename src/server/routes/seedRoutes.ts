import path from 'node:path';
import { Router } from 'express';
import { readConfig } from '../config.js';
import { discoverSeedFiles } from '../seedDiscovery.js';
import { parseSeedFile, getSeedRelativePath } from '../seedAstParser.js';

const router = Router();

router.get('/seeds', (_req, res) => {
    const config = readConfig();
    if (!config.clientSafePath) {
        res.status(400).json({ error: 'ClientSafe path not configured' });
        return;
    }
    res.json(discoverSeedFiles(config.clientSafePath));
});

router.get('/seeds/:fileName/parse', (req, res) => {
    const config = readConfig();
    if (!config.clientSafePath) {
        res.status(400).json({ error: 'ClientSafe path not configured' });
        return;
    }

    const filePath = path.join(config.clientSafePath, 'src', 'backend', 'seeds', req.params.fileName);
    const relativePath = getSeedRelativePath(config.clientSafePath, filePath);

    try {
        const snapshot = parseSeedFile(config.clientSafePath, filePath, relativePath);
        res.json({
            workflows: snapshot.workflows,
            diagnostics: snapshot.diagnostics.map((d) => ({
                code: d.code,
                message: d.message,
                severity: d.code?.startsWith('WARN') ? 'warning' : 'error',
                line: d.line,
                column: d.column,
            })),
            filePath,
            parsedAt: new Date().toISOString(),
        });
    } catch (err) {
        res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
    }
});

export default router;
