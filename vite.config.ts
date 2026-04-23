import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';
import fs from 'node:fs';

// Read the ClientSafe path from the config file (if it exists)
function getClientSafePath(): string | null {
    try {
        const configPath = path.resolve(__dirname, '.flex-viewer.config.json');
        if (fs.existsSync(configPath)) {
            const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
            if (config.clientSafePath && fs.existsSync(config.clientSafePath)) {
                return config.clientSafePath;
            }
        }
    } catch {
        // ignore
    }
    return null;
}

function tryAlias(alias: Record<string, string>, key: string, absPath: string) {
    if (fs.existsSync(absPath)) alias[key] = absPath;
}

export default defineConfig(() => {
    const csPath = getClientSafePath();

    const alias: Record<string, string> = {};

    if (csPath) {
        // Map ClientSafe path aliases so WorkflowGraph components resolve
        alias['@common'] = path.join(csPath, 'src', 'common');
        alias['@frontend'] = path.join(csPath, 'src', 'frontend');

        // Resolve all packages from ClientSafe's node_modules to avoid duplicates
        // and ensure version compatibility (e.g. zod 4.x, React 19, styled-components 6)
        const nm = path.join(csPath, 'node_modules');
        tryAlias(alias, '@ksyos/design-system', path.join(nm, '@ksyos', 'design-system'));
        tryAlias(alias, '@ksyos/design-tokens', path.join(nm, '@ksyos', 'design-tokens'));
        tryAlias(alias, '@ksyos/date-time', path.join(nm, '@ksyos', 'date-time'));
        tryAlias(alias, 'styled-components', path.join(nm, 'styled-components'));
        tryAlias(alias, 'zod', path.join(nm, 'zod'));
        tryAlias(alias, 'react', path.join(nm, 'react'));
        tryAlias(alias, 'react-dom', path.join(nm, 'react-dom'));
        tryAlias(alias, 'react/jsx-runtime', path.join(nm, 'react', 'jsx-runtime'));
        tryAlias(alias, 'react/jsx-dev-runtime', path.join(nm, 'react', 'jsx-dev-runtime'));
    }

    alias['@shared'] = path.resolve(__dirname, 'src', 'shared');

    return {
        plugins: [react()],
        resolve: { alias },
        server: {
            port: 5173,
            proxy: {
                '/api': 'http://localhost:3001',
                '/ws': {
                    target: 'ws://localhost:3001',
                    ws: true,
                },
            },
        },
    };
});
