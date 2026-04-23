import { Router } from 'express';
import { readConfig, writeConfig, validateClientSafePath } from '../config.js';

const router = Router();

router.get('/config', (_req, res) => {
    res.json(readConfig());
});

router.put('/config', (req, res) => {
    const { clientSafePath, lastSelectedSeed } = req.body;
    if (clientSafePath !== undefined) {
        const validation = validateClientSafePath(clientSafePath);
        if (!validation.valid) {
            res.status(400).json({ error: validation.error });
            return;
        }
    }
    // Only include defined fields to avoid overwriting existing values with undefined
    const update: Record<string, unknown> = {};
    if (clientSafePath !== undefined) update.clientSafePath = clientSafePath;
    if (lastSelectedSeed !== undefined) update.lastSelectedSeed = lastSelectedSeed;
    const config = writeConfig(update);
    res.json(config);
});

router.get('/config/validate', (req, res) => {
    const pathToValidate = req.query.path as string;
    if (!pathToValidate) {
        res.status(400).json({ error: 'Missing path query parameter' });
        return;
    }
    res.json(validateClientSafePath(pathToValidate));
});

export default router;
