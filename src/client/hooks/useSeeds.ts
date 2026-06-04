import { useState, useEffect, useCallback } from "react";
import type { SeedFileInfo, SeedParseResult } from "../../shared/types";

export function useSeeds(clientSafePath: string | undefined) {
	const [seeds, setSeeds] = useState<SeedFileInfo[]>([]);
	const [loading, setLoading] = useState(false);

	const fetchSeeds = useCallback(async () => {
		if (!clientSafePath) {
			setSeeds([]);
			return;
		}
		setLoading(true);
		try {
			const res = await fetch("/api/seeds");
			if (res.ok) setSeeds(await res.json());
		} catch {
			/* ignore */
		} finally {
			setLoading(false);
		}
	}, [clientSafePath]);

	// Re-fetch seeds whenever clientSafePath changes
	useEffect(() => {
		fetchSeeds();
	}, [fetchSeeds]);

	const startWatching = useCallback(
		async (seedFileName: string): Promise<SeedParseResult | null> => {
			try {
				const res = await fetch("/api/watch", {
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({ seedFileName }),
				});
				if (res.ok) {
					const data = await res.json();
					return (data.initialResult as SeedParseResult) ?? null;
				}
			} catch {
				/* ignore */
			}
			return null;
		},
		[],
	);

	const parseSeed = useCallback(
		async (seedFileName: string): Promise<SeedParseResult | null> => {
			try {
				const res = await fetch(
					`/api/seeds/${encodeURIComponent(seedFileName)}/parse`,
				);
				if (res.ok) return await res.json();
			} catch {
				/* ignore */
			}
			return null;
		},
		[],
	);

	return { seeds, loading, fetchSeeds, startWatching, parseSeed };
}
