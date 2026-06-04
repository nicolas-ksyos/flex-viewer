import { useState, useEffect, useCallback } from "react";
import type { BlockParameterSchemas } from "../../shared/types";

export function useBlockParameters() {
	const [schemas, setSchemas] = useState<BlockParameterSchemas>({});
	const [loading, setLoading] = useState(false);
	const [lastRefreshed, setLastRefreshed] = useState<Date | null>(null);

	const fetchSchemas = useCallback(async () => {
		try {
			const res = await fetch("/api/block-parameters");
			if (res.ok) setSchemas(await res.json());
		} catch (err) {
			// Network errors are non-fatal; schemas stay empty
			console.warn("[useBlockParameters] fetch failed:", err);
		}
	}, []);

	const refresh = useCallback(async () => {
		setLoading(true);
		try {
			const res = await fetch("/api/block-parameters/refresh", {
				method: "POST",
			});
			if (res.ok) {
				const data = await res.json();
				setSchemas(data.schemas ?? {});
				setLastRefreshed(new Date());
			}
		} catch (err) {
			console.warn("[useBlockParameters] refresh failed:", err);
		} finally {
			setLoading(false);
		}
	}, []);

	useEffect(() => {
		fetchSchemas();
	}, [fetchSchemas]);

	return { schemas, loading, lastRefreshed, refresh };
}
