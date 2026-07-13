# Frontend Worker
Path: docs/agents/executive/frontend.md | Last updated: 2026-07-13 | Tasks: 3/3 done

## Purpose & scope boundary
Build the entire frontend: Vite app shell, typed API client, D3 force-directed timeline graph, and filter UI.

**Owns `frontend/` exclusively.** Do not touch `src/` or `docs/structure/`.

## State of the work
DONE. All 6 files created. `npx tsc --noEmit -p tsconfig.frontend.json` passes with zero errors.

## Decisions in force
All locked decisions from `docs/structure/global.md` apply verbatim. Critical implementation details:

**`frontend/index.html`:**
- Standard Vite entry: `<script type="module" src="/src/main.ts"></script>`
- Minimal CSS in `<style>`: `body { margin: 0; font-family: sans-serif; background: #111; color: #eee; }`
- Two divs: `#controls` (filter bar, top) and `#graph` (SVG container, fills remaining height)

**`frontend/src/types.ts`:**
- Mirror the API contract types from `docs/structure/global.md` verbatim: `SessionNode`, `TopicNode`, `Edge`, `GraphResponse`
- Also add: `Filters { projects: string[]; dateStart: string; dateEnd: string; topic: string; granularity: 'day'|'week'|'month' }`
- Also add: `ProjectsResponse`, `TopicsResponse`, `StatusResponse`

**`frontend/src/api.ts`:**
- Base URL: `/api` (Vite proxies to Express in dev)
- `fetchGraph(filters: Partial<Filters>): Promise<GraphResponse>`
- `fetchProjects(): Promise<string[]>`
- `fetchTopics(): Promise<{ id: string; label: string }[]>`
- `fetchStatus(): Promise<StatusResponse>`
- Build query string from non-empty filter values only

**`frontend/src/graph.ts`:**
D3 v7 force-directed graph:
- SVG fills `#graph` container via `width = container.clientWidth`, `height = container.clientHeight`
- **Date columns**: given granularity + nodes, compute unique buckets; map bucket → x-position (left-to-right, padded)
  - `bucketTimestamp(ts: number, granularity): string` — floor to day/week/month ISO string
  - `getColumnX(bucket: string, buckets: string[], width: number): number` — linear x mapping
- **Forces**:
  ```typescript
  simulation = d3.forceSimulation(nodes)
    .force('x', d3.forceX(d => getTargetX(d, buckets, width)).strength(0.3))
    .force('y', d3.forceY(height / 2).strength(0.05))
    .force('collide', d3.forceCollide(d => pixelRadius(d) + 2))
    .force('charge', d3.forceManyBody().strength(-30))
    .force('link', d3.forceLink(edges).id(d => d.id).strength(0.1))
  ```
- `getTargetX(node, buckets, width)`: for sessions use `bucketTimestamp(node.timestamp)`, for topics use `bucketTimestamp(node.avgTimestamp)`
- `pixelRadius(node)`: `4 + node.size * 20` for circles (topics), use same for diamond area
- **Session nodes** (diamond): `d3.symbol().type(d3.symbolDiamond).size(area)` where `area = Math.PI * r * r`
- **Topic nodes** (circle): `<circle r={pixelRadius(d)}>`
- **Edges**: `<line>` with `stroke-opacity: 0.3`, `stroke: '#888'`, `stroke-width: edge.weight * 2`
- **Column labels**: date bucket strings rendered as text at top of SVG, one per column
- **Click to highlight**: on node click, dim all nodes/edges to 0.1 opacity, highlight clicked node + direct neighbors to 1.0; click background to reset
- Export `initGraph(container: HTMLElement): { update(data: GraphResponse, granularity: string): void }`

**`frontend/src/filters.ts`:**
- Build filter controls inside `#controls` div
- Project multi-select: render checkboxes from `fetchProjects()`; all checked by default
- Date range: two `<input type="date">` (start/end); default to 1 year ago → today
- Topic search: `<input type="text" placeholder="Filter by topic...">` — substring match on topic labels
- Granularity: three radio buttons `day | week | month`, default `week`
- Export `initFilters(onChange: (f: Filters) => void): void`
- Debounce text input changes 300ms before firing onChange

**`frontend/src/main.ts`:**
- `import 'dotenv/config'` — NO, this is browser code; just import api + graph + filters
- On DOMContentLoaded:
  1. `initFilters(onFilterChange)`
  2. `initGraph(document.getElementById('graph')!)`
  3. Fetch initial data + render
- `onFilterChange(f: Filters)`: call `fetchGraph(f)`, call `graph.update(data, f.granularity)`

## Open decisions
None.

## Gotchas
- D3 v7: `d3.forceSimulation` nodes get mutated with `x`, `y`, `vx`, `vy` — the input array IS the simulation state
- D3 force restart: when updating data, call `simulation.nodes(nodes).force('link', ...).alpha(0.3).restart()`
- `d3.symbolDiamond` exists in D3 v7 (not `symbolDiamond2` — that's a different shape)
- `d3.symbol().size(n)` takes **area**, not radius — compute as `Math.PI * r * r`
- `forceX` x-accessor receives each node as argument: `d3.forceX(d => getTargetX(d, ...))`
- tsconfig for frontend is `tsconfig.frontend.json` at project root — Vite uses it automatically for type checking
- Do NOT import from `src/` (backend) — frontend types are defined in `frontend/src/types.ts`
- Colors come from API — do not reassign them in frontend
- The `#graph` container must have explicit height via CSS (e.g. `height: calc(100vh - 60px)`) or D3 reads 0

## Tasks (in order)
1. `frontend/index.html` + `frontend/src/types.ts` + `frontend/src/api.ts`
2. `frontend/src/graph.ts`
3. `frontend/src/filters.ts` + `frontend/src/main.ts`

**Done when:** all 6 files created, `npm run type-check` passes (the tsc -p tsconfig.frontend.json portion), update this doc's state.
