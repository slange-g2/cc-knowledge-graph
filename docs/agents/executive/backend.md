# Backend Worker
Path: docs/agents/executive/backend.md | Last updated: 2026-07-13 | Tasks: 4/4 done

## Purpose & scope boundary
Build the entire backend: config module, SQLite schema + client, ingestion pipeline (Claude Code JSONL + OpenCode SQLite), LLM extraction + embedding + deduplication processing, and Express API server.

**Owns `src/` exclusively.** Do not touch `frontend/` or `docs/structure/`.

## State of the work
DONE. All 12 source files created and `npx tsc --noEmit` passes cleanly (zero errors).

Files created:
- src/config.ts
- src/db/schema.ts
- src/db/client.ts
- src/ingestion/types.ts
- src/ingestion/claude-code.ts
- src/ingestion/opencode.ts
- src/ingestion/run.ts
- src/processing/extractor.ts
- src/processing/embeddings.ts
- src/processing/dedup.ts
- src/server/routes.ts
- src/server/index.ts

## Decisions in force
All locked decisions from `docs/structure/global.md` apply verbatim. Critical implementation details:

**Config (`src/config.ts`):**
- Call `dotenv/config` at top
- Export a single frozen `config` object with all env vars and their defaults
- Every other src file imports from `../config` or `./config`, never from `process.env` directly

**DB (`src/db/`):**
- `client.ts`: create `data/` with `fs.mkdirSync('data', { recursive: true })`, open `data/knowledge-graph.db`, call `createTables(db)`, export the db instance as default
- `schema.ts`: export `createTables(db: Database)` that runs all `CREATE TABLE IF NOT EXISTS` statements

**Schema tables:**
```sql
sessions(id TEXT PK, source TEXT, project TEXT, label TEXT, timestamp INTEGER, raw_messages TEXT)
topics(id TEXT PK, label TEXT, embedding TEXT, cluster_id INTEGER)
session_topics(session_id TEXT, topic_id TEXT, PRIMARY KEY(session_id, topic_id))
topic_similarities(topic_a TEXT, topic_b TEXT, similarity REAL, PRIMARY KEY(topic_a, topic_b), CHECK(topic_a < topic_b))
ingestion_watermarks(source TEXT PK, last_processed_at INTEGER)
```

**Claude Code ingestion (`src/ingestion/claude-code.ts`):**
- Use `fs.readdirSync` + `path.join(os.homedir(), '.claude', 'projects')` to discover all project dirs
- For each dir, `fs.readdirSync` for `.jsonl` files
- Session id = filename without `.jsonl`
- Parse each file line-by-line; wrap each `JSON.parse` in try/catch (skip malformed)
- Filter: only sessions where earliest timestamp > watermark
- Project name: last non-empty segment when splitting the dir name on `-` ... actually the dir names are like `-Users-slange-Documents-coding-ue` — split on `-`, filter empty, last element is the project name. Edge case: `-Users-slange-Documents-coding` → last element is `coding`

**OpenCode ingestion (`src/ingestion/opencode.ts`):**
- Open opencode.db read-only: `new Database(path, { readonly: true })`
- Query `SELECT * FROM session WHERE time_created > ?` with watermark
- For each session, query `SELECT data FROM message WHERE session_id = ? ORDER BY time_created` 
- `data` is a JSON string — `JSON.parse(data)` — inspect structure; look for user-role messages; extract text content
- Project name: `path.basename(session.directory)`

**RawSession type (`src/ingestion/types.ts`):**
```typescript
interface RawSession {
  id: string;
  source: 'claude-code' | 'opencode';
  project: string;
  label: string;
  timestamp: number;       // unix ms
  userMessages: string[];  // text of each user turn
}
```

**Extraction (`src/processing/extractor.ts`):**
- Initialize OpenAI client with `baseURL: config.litellmApiBase, apiKey: config.litellmApiKey`
- Function: `extractTopics(session: RawSession): Promise<{ topics: string[]; tokens: number }>`
- System: `"You extract topics and concepts from software engineering conversations. Return ONLY a JSON array of strings, no explanation, no markdown."`
- User message: title + messages per `EXTRACTION_MODE`
- Parse `JSON.parse(response.choices[0].message.content)` — if not an array, return `[]`
- Return topics + `usage.total_tokens`

**Embeddings (`src/processing/embeddings.ts`):**
- Function: `embedStrings(texts: string[]): Promise<number[][]>`
- Use `client.embeddings.create({ model: config.embeddingModel, input: texts })`
- Return ordered array of float arrays

**Dedup (`src/processing/dedup.ts`):**
- `cosineSimilarity(a: number[], b: number[]): number` — dot product of normalized vectors
- `findOrCreateTopics(db, newTopics: {label: string, embedding: number[]}[]): string[]` — returns topic ids (merged or new)
- `recomputeClusters(db)` — connected components of topic_similarities graph → update cluster_id for all topics

**Ingestion run (`src/ingestion/run.ts`):**
- Load watermarks from DB (default 0 if absent)
- Load new sessions from both sources
- For each session (print progress `[n/total] "label"`):
  - Extract topics → print `tokens: X (cumulative: Y)`
  - Embed all topics
  - findOrCreateTopics → get topic ids
  - Insert session + session_topics into DB
- After all sessions: recomputeClusters, update topic_similarities for any new topics
- Update watermarks to `Date.now()`

**API server (`src/server/`):**
- `routes.ts`: Express Router
  - `GET /api/graph`: filter sessions by project/dateStart/dateEnd/topic, fetch their topics, build nodes+edges, compute sizes+colors, return GraphResponse
  - `GET /api/projects`: distinct project values from sessions
  - `GET /api/topics`: all topics with id+label
  - `GET /api/status`: counts + max watermark timestamp
- `index.ts`: create Express app, mount router at `/api`, serve `dist/frontend` as static in production, listen on `config.port`

**Color assignment (in routes.ts):**
```typescript
const PALETTE = ['#4e79a7','#f28e2b','#e15759','#76b7b2','#59a14f','#edc948','#b07aa1','#ff9da7','#9c755f','#bab0ac'];
// projects: sort all project names alphabetically, PALETTE[index % 10]
// clusters: PALETTE[cluster_id % 10]
```

**Size computation (in routes.ts):**
```typescript
// After fetching all nodes:
const minTs = Math.min(...nodes.map(n => n.timestamp ?? n.avgTimestamp));
const maxTs = Math.max(...nodes.map(n => n.timestamp ?? n.avgTimestamp));
const maxEdge = Math.max(...nodes.map(n => edgeCounts[n.id] ?? 0));
// recencyScore = (ts - minTs) / (maxTs - minTs) || 0
// connectionScore = edgeCount / maxEdge || 0
// size = config.recencyWeight * recencyScore + config.connectionWeight * connectionScore
```

## Open decisions
None.

## Gotchas
- `better-sqlite3` is fully synchronous — no async/await for DB calls
- `~` must be expanded with `os.homedir()`, not literal tilde
- JSONL files may have malformed lines — skip with try/catch
- `better-sqlite3` for opencode: open with `{ readonly: true }` to avoid locking it
- `topic_similarities` CHECK constraint: always store with `topic_a < topic_b` (sort ids before inserting)
- Embeddings are 1536-dim stored as JSON text — `JSON.parse` on read, `JSON.stringify` on write
- OpenCode `time_created` is already unix ms; Claude Code timestamps are ISO strings — use `new Date(ts).getTime()`
- The OpenCode DB currently has 0 sessions — ingestion should handle this gracefully (no error)
- `uuid` package: use `crypto.randomUUID()` (Node 18+ built-in) instead of adding a dependency

## Tasks
1. `src/config.ts` + `src/db/schema.ts` + `src/db/client.ts`
2. `src/ingestion/types.ts` + `src/ingestion/claude-code.ts` + `src/ingestion/opencode.ts` + `src/ingestion/run.ts`
3. `src/processing/extractor.ts` + `src/processing/embeddings.ts` + `src/processing/dedup.ts`
4. `src/server/routes.ts` + `src/server/index.ts`

**Done when:** all 11 files created, `npm run type-check` passes (the tsc -p tsconfig.json portion), update this doc's state.
