import fs from 'node:fs';
import path from 'node:path';
import type { SeedFileInfo } from '../shared/types.js';

export function discoverSeedFiles(clientSafePath: string): SeedFileInfo[] {
    const seedsDir = path.join(clientSafePath, 'src', 'backend', 'seeds');
    if (!fs.existsSync(seedsDir)) return [];

    const files = fs.readdirSync(seedsDir).filter((f) => f.endsWith('.ts') && !f.startsWith('000_'));
    const results: SeedFileInfo[] = [];

    for (const fileName of files) {
        const filePath = path.join(seedsDir, fileName);
        try {
            const content = fs.readFileSync(filePath, 'utf-8');
            if (content.includes('ServiceCreationHelper')) {
                results.push({
                    fileName,
                    relativePath: path.relative(clientSafePath, filePath),
                });
            }
        } catch {
            // Skip unreadable files
        }
    }

    return results.sort((a, b) => a.fileName.localeCompare(b.fileName));
}
