# cc-timeline: Global Context
Last updated: 2026-07-13

## Charter
Build a knowledge graph generator from Claude Code + OpenCode chat history. Sessions and extracted topics/concepts become graph nodes, interconnected by topic-similarity and session-topic edges. The x-axis of the force-directed graph encodes time (date columns), enabling a visual knowledge timeline.

## Status

| Phase | Owner | Status |
|-------|-------|--------|
| Foundation (docs, package.json, tsconfig, vite) | Executive | DONE |
| DB layer (`src/db/`) | Backend Worker | PENDING |
| Ingestion (`src/ingestion/`) | Backend Worker | PENDING |
| Processing (`src/processing/`) | Backend Worker | PENDING |
| API server (`src/server/`) | Backend Worker | PENDING |
| Frontend shell + types | Frontend Worker | PENDING |
| D3 graph (`frontend/src/graph.ts`) | Frontend Worker | PENDING |
| Filters + main (`frontend/src/filters.ts`, `main.ts`) | Frontend Worker | PENDING |

## Verification command
```bash
npm run type-check
```
Run from `/Users/slange/Documents/coding/cc-timeline`.

## Directory layout
```
src/
  config.ts     # single env-var config module
  db/           # SQLite client + schema
  ingestion/    # Claude Code + OpenCode readers + run script
  processing/   # LLM extraction + embeddings + dedup
  server/       # Express API server
frontend/
  src/          # Vite/browser TypeScript
  index.html
data/           # SQLite DB file (gitignored)
docs/
  structure/    # global.md, this file
  agents/       # living context tree
```

## Locked decisions (do not relitigate)

### Data sources
- Claude Code: `~/.claude/projects/**/*.jsonl` — JSONL, one session per file
- OpenCode: `~/.local/share/opencode/opencode.db` — SQLite
- Claude Code session id = UUID portion of filename (strip `.jsonl`)
- Claude Code ai-title: from record `{ type: "ai-title", aiTitle: "..." }`
- Claude Code user messages: records with `type: "user"`, extract `.message.content[]` items where `type === "text"`, use `.text` field
- Claude Code timestamp: earliest `timestamp` field (ISO string) across all records in the file
- Claude Code project name: last non-empty segment of the projects dir key (e.g. `-Users-slange-Documents-coding-ue` → `ue`; `-Users-slange-Documents-coding` → `coding`)
- OpenCode: `session.id`, `session.title`, `session.directory`, `session.time_created` (unix ms)
- OpenCode messages: `SELECT * FROM message WHERE session_id = ?`, field `data` is a JSON string — parse it; extract user-role content
- OpenCode project name: last segment of `session.directory`
- OpenCode `time_created` is unix ms

### Graph nodes
- Session nodes: one per conversation, `type: 'session'`
- Topic nodes: one per deduplicated concept, `type: 'topic'`
- Session→Topic edges: `type: 'session-topic'`
- Topic→Topic edges: `type: 'topic-similarity'`, only pairs with similarity ≥ `SIMILARITY_THRESHOLD`

### LLM extraction
- Model: `EXTRACTION_MODEL` env var (default: `claude-haiku-4-5-20251001`)
- Mode `full`: send all user messages; mode `brief`: send title + first user message only (toggled by `EXTRACTION_MODE` env var)
- System prompt: `"You extract topics and concepts from software engineering conversations. Return ONLY a JSON array of strings, no explanation, no markdown."` 
- User prompt: `"Extract key topics and concepts.\n\nTitle: {title}\n\nUser messages:\n{messages}"`
- Parse response as `string[]`; ignore malformed responses (skip session)
- Track input+output tokens per call; print cumulative after each session

### Embeddings
- Model: `EMBEDDING_MODEL` env var (default: `text-embedding-3-small`)
- 1536 dimensions
- Stored as JSON text in `topics.embedding` column

### Topic deduplication
- After extracting topics from a session, embed each
- For each new topic: compute cosine similarity against all existing topics in DB
- If max similarity ≥ `SIMILARITY_THRESHOLD`: merge into the existing topic (keep existing id; update label only if new label is longer)
- Otherwise: insert as new topic
- After all sessions processed: recompute `cluster_id` via connected components of the topic similarity graph

### Color assignment (backend assigns hex strings, frontend uses them as-is)
```typescript
const PALETTE = [
  '#4e79a7','#f28e2b','#e15759','#76b7b2','#59a14f',
  '#edc948','#b07aa1','#ff9da7','#9c755f','#bab0ac',
];
// projects: sorted alphabetically, index into PALETTE
// clusters: cluster_id index into PALETTE
```

### Node visual encoding
- Session nodes: diamond shape, color = project color
- Topic nodes: circle shape, color = cluster color
- Size = `RECENCY_WEIGHT * recencyScore + CONNECTION_WEIGHT * connectionScore`
  - `recencyScore`: `(timestamp - minTs) / (maxTs - minTs)` across all nodes
  - `connectionScore`: `edgeCount / maxEdgeCount` across all nodes
  - Both weights from env vars, default 0.5 each
- Backend computes `size` (0–1), frontend scales to pixel radius (e.g. `4 + size * 20`)

### Timeline layout (D3)
- `forceX` pins session nodes to x-position of their date column; strength ~0.3
- Topic node x-target = weighted avg of its sessions' x-positions (use `avgTimestamp` from API)
- `forceY` pulls all nodes toward vertical center; strength ~0.05
- `forceCollide` radius = node pixel radius + 2
- `forceManyBody` strength = -30
- `forceLink` applied to session-topic + topic-similarity edges
- Granularity: `day | week | month` — user-togglable radio buttons

### API contract (LOCKED — backend and frontend must match exactly)

```
GET /api/graph?project=&dateStart=&dateEnd=&topic=&granularity=day|week|month
→ GraphResponse

GET /api/projects
→ { projects: string[] }

GET /api/topics
→ { topics: { id: string; label: string }[] }

GET /api/status
→ { sessionCount: number; topicCount: number; lastIngested: string | null }
```

TypeScript types (canonical — mirror verbatim in `frontend/src/types.ts`):
```typescript
interface SessionNode {
  id: string;
  type: 'session';
  label: string;
  project: string;
  source: 'claude-code' | 'opencode';
  timestamp: number;    // unix ms
  size: number;         // 0–1 composite
  color: string;        // hex
}

interface TopicNode {
  id: string;
  type: 'topic';
  label: string;
  cluster: number;
  avgTimestamp: number; // weighted avg unix ms of its sessions
  size: number;
  color: string;
}

interface Edge {
  source: string;       // node id
  target: string;       // node id
  type: 'session-topic' | 'topic-similarity';
  weight: number;       // 0–1
}

interface GraphResponse {
  nodes: (SessionNode | TopicNode)[];
  edges: Edge[];
}
```

## Global rules
- TypeScript strict mode throughout (`strict: true` in both tsconfigs)
- Single env config: `src/config.ts` — all other files import from it, never from `process.env` directly
- DB file path: `data/knowledge-graph.db` (create `data/` dir with `fs.mkdirSync` if absent)
- No `any` types
- Express on port `config.PORT` (default 3000); Vite dev on 5173 with proxy to Express
- Run scripts via `tsx` (already installed)
- `npm run type-check` must pass before any worker marks work DONE
