import fs from 'node:fs';
import path from 'node:path';
import type { ViewerConfig } from '../shared/types.js';

const CONFIG_FILE_NAME = '.flex-viewer.config.json';

function getConfigPath(): string {
    return path.join(process.cwd(), CONFIG_FILE_NAME);
}

const DEFAULT_CONFIG: ViewerConfig = {
    clientSafePath: '',
    lastSelectedSeed: null,
};

export function readConfig(): ViewerConfig {
    const configPath = getConfigPath();
    try {
        if (fs.existsSync(configPath)) {
            const raw = fs.readFileSync(configPath, 'utf-8');
            return { ...DEFAULT_CONFIG, ...JSON.parse(raw) };
        }
    } catch {
        // Corrupted config — return default
    }
    return { ...DEFAULT_CONFIG };
}

export function writeConfig(config: Partial<ViewerConfig>): ViewerConfig {
    const current = readConfig();
    const merged = { ...current, ...config };
    const configPath = getConfigPath();
    fs.writeFileSync(configPath, JSON.stringify(merged, null, 2), 'utf-8');
    return merged;
}

export function validateClientSafePath(clientSafePath: string): { valid: boolean; error?: string } {
    if (!clientSafePath) return { valid: false, error: 'Path is empty' };
    if (!fs.existsSync(clientSafePath)) return { valid: false, error: 'Path does not exist' };
    const seedsDir = path.join(clientSafePath, 'src', 'backend', 'seeds');
    if (!fs.existsSync(seedsDir)) return { valid: false, error: 'Missing src/backend/seeds/ directory' };
    const commonDir = path.join(clientSafePath, 'src', 'common');
    if (!fs.existsSync(commonDir)) return { valid: false, error: 'Missing src/common/ directory' };
    return { valid: true };
}
