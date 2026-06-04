import { useEffect, useRef, useState, useCallback } from "react";
import type { WsMessage, SeedParseResult } from "../../shared/types";

export function useWebSocket() {
	const [connected, setConnected] = useState(false);
	const [lastResult, setLastResult] = useState<SeedParseResult | null>(null);
	const [lastError, setLastError] = useState<string | null>(null);
	const [isParsing, setIsParsing] = useState(false);
	const wsRef = useRef<WebSocket | null>(null);
	const reconnectRef = useRef<ReturnType<typeof setTimeout>>();

	const connect = useCallback(() => {
		if (wsRef.current?.readyState === WebSocket.OPEN) return;
		const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
		const ws = new WebSocket(`${protocol}//${window.location.host}/ws`);

		ws.onopen = () => {
			setConnected(true);
			setLastError(null);
		};
		ws.onmessage = (event) => {
			try {
				const msg: WsMessage = JSON.parse(event.data);
				if (msg.type === "workflowUpdate") {
					setLastResult(msg.data);
					setLastError(null);
					setIsParsing(false);
				} else if (msg.type === "fileError") {
					setLastError(msg.error);
					setIsParsing(false);
				} else if (msg.type === "watchStarted") {
					setLastError(null);
				} else if (msg.type === "parsingStarted") {
					setIsParsing(true);
				}
			} catch {
				/* ignore */
			}
		};
		ws.onclose = () => {
			setConnected(false);
			wsRef.current = null;
			reconnectRef.current = setTimeout(connect, 2000);
		};
		ws.onerror = () => ws.close();
		wsRef.current = ws;
	}, []);

	useEffect(() => {
		connect();
		return () => {
			if (reconnectRef.current) clearTimeout(reconnectRef.current);
			wsRef.current?.close();
		};
	}, [connect]);

	return { connected, lastResult, lastError, isParsing };
}
