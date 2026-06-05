import path from "node:path";
import express from "express";
import { WebSocketServer, WebSocket } from "ws";
import http from "node:http";
import configRoutes from "./routes/configRoutes.js";
import seedRoutes from "./routes/seedRoutes.js";
import blockParameterRoutes from "./routes/blockParameterRoutes.js";
import migrationRoutes from "./routes/migrationRoutes.js";
import { readConfig } from "./config.js";
import { startWatching, stopWatching } from "./fileWatcher.js";
import type { WsMessage } from "../shared/types.js";

const PORT = process.env.PORT ? parseInt(process.env.PORT) : 3001;

const app = express();
app.use(express.json());

app.use("/api", configRoutes);
app.use("/api", seedRoutes);
app.use("/api", blockParameterRoutes);
app.use("/api", migrationRoutes);

app.post("/api/watch", (req, res) => {
	const { seedFileName } = req.body;
	const config = readConfig();
	if (!config.clientSafePath) {
		res.status(400).json({ error: "ClientSafe path not configured" });
		return;
	}
	if (!seedFileName) {
		res.status(400).json({ error: "Missing seedFileName" });
		return;
	}
	const seedFilePath = path.join(
		config.clientSafePath,
		"src",
		"backend",
		"seeds",
		seedFileName,
	);
	const initialResult = startWatching(
		config.clientSafePath,
		seedFilePath,
		broadcast,
	);
	res.json({ watching: seedFilePath, initialResult: initialResult ?? null });
});

app.post("/api/watch/stop", (_req, res) => {
	stopWatching();
	res.json({ watching: null });
});

const server = http.createServer(app);
const wss = new WebSocketServer({ server, path: "/ws" });

function broadcast(message: WsMessage): void {
	const data = JSON.stringify(message);
	for (const client of wss.clients) {
		if (client.readyState === WebSocket.OPEN) {
			client.send(data);
		}
	}
}

wss.on("connection", (ws) => {
	console.log("[ws] Client connected");
	ws.on("close", () => console.log("[ws] Client disconnected"));
});

server.listen(PORT, () => {
	console.log(`\n  🔧 CS Flex Workflow Viewer — API server`);
	console.log(`     http://localhost:${PORT}`);
	console.log(`     WebSocket: ws://localhost:${PORT}/ws\n`);
});
