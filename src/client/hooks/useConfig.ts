import { useState, useEffect, useCallback } from 'react';
import type { ViewerConfig } from '../../shared/types';

export function useConfig() {
    const [config, setConfig] = useState<ViewerConfig | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const fetchConfig = useCallback(async () => {
        try {
            const res = await fetch('/api/config');
            setConfig(await res.json());
            setError(null);
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to load config');
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => { fetchConfig(); }, [fetchConfig]);

    const updateConfig = useCallback(async (update: Partial<ViewerConfig>) => {
        const res = await fetch('/api/config', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(update),
        });
        if (!res.ok) {
            const data = await res.json();
            throw new Error(data.error ?? 'Failed to update config');
        }
        const data = await res.json();
        setConfig(data);
        setError(null);
        return data as ViewerConfig;
    }, []);

    return { config, loading, error, updateConfig, refetch: fetchConfig };
}
