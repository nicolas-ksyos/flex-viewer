# CS Flex Workflow Viewer

A standalone developer tool for visualizing ClientSafe flex workflow seed files in real-time, with hot-reload on file changes.

## Quick Start

```bash
npm install
npm run dev
```

Open **http://localhost:5173** in your browser.

## How It Works

1. **Set ClientSafe path** — Enter the path to your local ClientSafe checkout (e.g., `/Users/you/code/ksyos/ClientSafeWeb`)
2. **Select a seed file** — The app scans `src/backend/seeds/` for files using `ServiceCreationHelper`
3. **View the workflow** — An SVG diagram renders the workflow steps, transitions, and activities
4. **Edit the seed** — Save changes to the seed file and the diagram updates instantly via WebSocket hot-reload

## Architecture

```
Browser (React)          Express Backend (Node)
├─ ConfigPanel           ├─ Config API (read/write .flex-viewer.config.json)
├─ SeedSelector          ├─ Seed Discovery (scan seeds dir)
├─ WorkflowTabs          ├─ AST Parser (TypeScript Compiler API)
├─ WorkflowView (SVG)    ├─ File Watcher (chokidar)
├─ StepDetailPanel       └─ WebSocket (push updates on file change)
└─ DiagnosticsPanel
```

### Key Design: AST-Based Parsing

The seed files are **statically analyzed** using the TypeScript Compiler API — no database, no execution. The parser intercepts `ServiceCreationHelper.createActivity()`, `createStep()`, and `generateTransitions()` calls to extract the workflow graph.

### Hot-Reload Flow

```
Developer saves seed file
  → chokidar detects change (300ms debounce)
  → Server re-parses via TS AST
  → Pushes new workflow data over WebSocket
  → React re-renders the diagram
```

## Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Start both frontend (Vite :5173) and backend (Express :3001) |
| `npm run dev:client` | Start only the Vite dev server |
| `npm run dev:server` | Start only the Express backend |

## Configuration

The app persists its config in `.flex-viewer.config.json` (gitignored):

```json
{
  "clientSafePath": "/path/to/ClientSafeWeb",
  "lastSelectedSeed": "124_1_orthoptics_service.ts"
}
```

## Multi-Workflow Support

Seed files that define multiple `ServiceCreationHelper` instances (e.g., pulmonology with TPO + TPC) are shown as **tabs** — one per workflow.

## Step Details

Click any step in the diagram to see:
- Block name and type
- Position (x, y)
- Parameters
- Linked activities
- Connected transitions
