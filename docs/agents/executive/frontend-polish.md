# frontend-polish
Path: docs/agents/executive/frontend-polish.md | Last updated: 2026-07-13 | Tasks: UI-Polish, Drag-Over-Links, Node-Detail-Panel

## Purpose & scope boundary
**In:** `frontend/index.html`, `frontend/src/graph.ts`, `frontend/src/main.ts`  
**Out:** `frontend/src/types.ts`, `frontend/src/api.ts`, `frontend/src/filters.ts`, all of `src/`

Three deliverables:
1. **UI Polish** — redesign the page CSS using a dark-tech aesthetic
2. **Drag-over-links** — add D3 zoom/pan so dragging while the cursor is over an edge line still works
3. **Node detail sheet** — left panel that slides in on node click, showing full node metadata + connected nodes

## State of the work
PENDING — agent hasn't started.

## Decisions in force
- Stack: plain TypeScript + D3 v7 + Vite. **No React, no Tailwind, no new npm packages.**
- No `any` types, strict mode.
- `npm run type-check` must pass clean from `/Users/slange/Documents/coding/cc-timeline`.
- All existing behavior (filters, force simulation, highlight, graph update) must remain intact.

## Open decisions
None — all design and technical details are specified below.

## Gotchas
- `d3.zoom` on the SVG and `d3.drag` on nodes coexist fine — D3 event capture handles it. But the edge `<line>` elements must have `pointer-events: none` so that dragging over them triggers the SVG zoom/pan, not a stale handler.
- `simulation` is declared as `let` at the top of `initGraph`; it's set inside `update()`. The drag handler references it via closure — this is safe because nodes (and their drag handlers) are only created inside `update()` after simulation is set.
- When zoomed/panned, D3 zoom transforms a `mainG` group. Column guide coordinates are in the original SVG coordinate system, so column guides + labels must live in `mainG`, not outside it. If column labels should be fixed to the top of the viewport even when zoomed, they should live outside `mainG` — that's a design choice. Simplest: put everything in `mainG` so they all zoom/pan together.
- `initGraph` currently returns `{ update }`. Adding the panel callback changes the signature — `main.ts` must also be updated.

## Implementation spec

### Design system
```
Background:    #0a0a0f
Surface-1:     #111118 (controls bar, panel)
Surface-2:     #1a1a24 (panel inner sections)
Border:        #2a2a38
Text-primary:  #e8e8f0
Text-secondary: #888899
Accent:        #4f9eff
Font-stack:    system-ui, -apple-system, "Segoe UI", sans-serif
Font-mono:     "JetBrains Mono", "Fira Code", ui-monospace, monospace
```

---

### index.html — full rewrite

Layout structure:
```
body (flex-column, 100vh, background #0a0a0f, color #e8e8f0)
  #controls   (flex-row, 56px height, background #111118, border-bottom 1px solid #2a2a38)
  #main       (flex: 1, display:flex, flex-direction:row, overflow:hidden, position:relative)
    #node-panel   (position:absolute, left:0, top:0, bottom:0, w:300px, background rgba(17,17,24,0.97), backdrop-filter blur(12px), border-right 1px solid #2a2a38, transform:translateX(-100%), transition:transform 0.25s cubic-bezier(0.4,0,0.2,1), z-index:10)
    #graph      (flex:1, overflow:hidden)
```

Controls bar inputs styling:
- `background: #0a0a0f; color: #e8e8f0; border: 1px solid #2a2a38; border-radius: 5px; padding: 3px 8px; font-size: 12px; font-family: var(--font-mono)`
- `:focus { outline: none; border-color: #4f9eff; box-shadow: 0 0 0 2px rgba(79,158,255,0.15) }`
- Section-label: `font-size: 11px; color: #888899; text-transform: uppercase; letter-spacing: 0.08em; font-family: var(--font-mono)`
- Checkbox/radio: custom or just styled with accent-color: #4f9eff
- App title in controls: `<span id="app-title">cc-timeline</span>` with `font-family: var(--font-mono); font-size: 13px; color: #4f9eff; letter-spacing: 0.1em; margin-right: 16px`
- Divider between control sections: `width: 1px; height: 20px; background: #2a2a38; margin: 0 8px`

Node panel (#node-panel) inner structure:
```html
<div id="node-panel">
  <div class="panel-header">
    <span class="panel-type-badge" id="panel-type-badge">SESSION</span>
    <button class="panel-close" id="panel-close" aria-label="Close">✕</button>
  </div>
  <div class="panel-label" id="panel-label">Node Label</div>
  <div class="panel-meta" id="panel-meta"><!-- filled by JS --></div>
  <div class="panel-relations-header">Connected to</div>
  <div class="panel-relations" id="panel-relations"><!-- filled by JS --></div>
</div>
```

Panel CSS:
```css
.panel-header { display:flex; align-items:center; justify-content:space-between; padding:14px 16px 8px; border-bottom:1px solid #2a2a38; }
.panel-type-badge { font-family:var(--font-mono); font-size:10px; letter-spacing:0.12em; padding:3px 8px; border-radius:4px; }
.panel-type-badge.session { background:#1a2a3a; color:#4f9eff; }
.panel-type-badge.topic { background:#2a1a3a; color:#a78fff; }
.panel-close { background:none; border:none; color:#888899; cursor:pointer; font-size:16px; padding:2px 6px; border-radius:4px; }
.panel-close:hover { background:#2a2a38; color:#e8e8f0; }
.panel-label { padding:16px 16px 8px; font-size:16px; font-weight:600; color:#e8e8f0; line-height:1.3; word-break:break-word; }
.panel-meta { padding:0 16px 16px; display:flex; flex-direction:column; gap:6px; border-bottom:1px solid #2a2a38; }
.panel-meta-row { display:flex; gap:8px; font-size:12px; }
.panel-meta-label { color:#888899; font-family:var(--font-mono); min-width:60px; }
.panel-meta-value { color:#e8e8f0; }
.panel-relations-header { padding:12px 16px 6px; font-size:10px; font-family:var(--font-mono); letter-spacing:0.1em; color:#888899; text-transform:uppercase; }
.panel-relations { padding:0 16px 16px; display:flex; flex-direction:column; gap:4px; overflow-y:auto; }
.panel-relation-item { display:flex; align-items:center; gap:8px; padding:6px 8px; border-radius:5px; cursor:pointer; border:1px solid transparent; }
.panel-relation-item:hover { background:#1a1a24; border-color:#2a2a38; }
.panel-relation-dot { width:8px; height:8px; border-radius:50%; flex-shrink:0; }
.panel-relation-dot.session { background:#4f9eff; }
.panel-relation-dot.topic { border-radius:2px; background:#a78fff; }
.panel-relation-label { font-size:12px; color:#c8c8d8; flex:1; min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
.panel-relation-type { font-size:10px; font-family:var(--font-mono); color:#666680; flex-shrink:0; }
#node-panel.visible { transform:translateX(0); }
```

Graph SVG styling:
- Column guide lines: `stroke: #2a2a38; stroke-dasharray: 3,4; stroke-width:1` (not solid, subtle dashes)
- Column labels: `fill: #555570; font-size: 10px; font-family: var(--font-mono); letter-spacing: 0.05em`
- Session-topic edges: `stroke: #2a4a7a; stroke-opacity: 0.5`
- Topic-similarity edges: `stroke: #4a2a7a; stroke-opacity: 0.4`
- Highlighted edges: stroke-opacity 1, stroke-width + 1

---

### graph.ts — changes

**New signature:**
```typescript
export function initGraph(
  container: HTMLElement,
  onNodeSelect: (node: GraphNode | null, related: Array<{node: GraphNode; edgeType: string; weight: number}>) => void
): { update(data: GraphResponse, granularity: string): void }
```

**Add zoom + pan:**
```typescript
const zoom = d3.zoom<SVGSVGElement, unknown>()
  .scaleExtent([0.15, 5])
  .on('zoom', (event) => {
    mainG.attr('transform', event.transform.toString());
  });
svg.call(zoom);
// Reset zoom on double-click background
bgRect.on('dblclick', () => svg.transition().duration(500).call(zoom.transform, d3.zoomIdentity));
```

Wrap labelsG, edgesG, nodesG in a **`mainG`** group:
```typescript
const mainG = svg.append('g');
const labelsG = mainG.append('g').attr('class', 'labels');
const edgesG  = mainG.append('g').attr('class', 'edges');
const nodesG  = mainG.append('g').attr('class', 'nodes');
```

**Edge pointer events:**
```typescript
edgeSel.style('pointer-events', 'none');
```
Also set edge stroke based on type:
```typescript
.attr('stroke', d => d.type === 'session-topic' ? '#2a4a7a' : '#4a2a7a')
.attr('stroke-opacity', d => d.type === 'session-topic' ? 0.5 : 0.4)
```

**Node drag:**
```typescript
const drag = d3.drag<SVGGElement, SimNode>()
  .on('start', (event, d) => {
    if (!event.active) simulation!.alphaTarget(0.3).restart();
    d.fx = d.x; d.fy = d.y;
  })
  .on('drag', (event, d) => { d.fx = event.x; d.fy = event.y; })
  .on('end', (event, d) => {
    if (!event.active) simulation!.alphaTarget(0);
    d.fx = null; d.fy = null;
  });
```
Apply to node groups in enter: `g.call(drag as d3.DragBehavior<SVGGElement, SimNode, unknown>)`

**Click handler** — calls onNodeSelect with full data:
```typescript
g.on('click', function(event: MouseEvent, d: SimNode) {
  event.stopPropagation();
  highlightNode(d.id, simLinks);
  // Find full GraphNode from current data store
  const fullNode = currentData.nodes.find(n => n.id === d.id) ?? null;
  const related = simLinks
    .filter(l => {
      const sid = typeof l.source === 'string' ? l.source : (l.source as SimNode).id;
      const tid = typeof l.target === 'string' ? l.target : (l.target as SimNode).id;
      return sid === d.id || tid === d.id;
    })
    .map(l => {
      const sid = typeof l.source === 'string' ? l.source : (l.source as SimNode).id;
      const tid = typeof l.target === 'string' ? l.target : (l.target as SimNode).id;
      const neighborId = sid === d.id ? tid : sid;
      const neighborNode = currentData.nodes.find(n => n.id === neighborId) ?? null;
      return neighborNode ? { node: neighborNode, edgeType: l.type, weight: l.weight } : null;
    })
    .filter((x): x is { node: GraphNode; edgeType: string; weight: number } => x !== null);
  onNodeSelect(fullNode, related);
});
```

Store `currentData` in a `let currentData: GraphResponse = { nodes: [], edges: [] }` at the top of `initGraph`, updated at the start of `update()`.

**Background click** — deselect:
```typescript
bgRect.on('click', () => {
  resetHighlight();
  onNodeSelect(null, []);
});
```

**Node shape tweaks:**
- Add a subtle stroke to all nodes: `el.select('circle').attr('stroke', '#ffffff').attr('stroke-width', 0.5).attr('stroke-opacity', 0.15)`
- Same for diamond paths
- On highlight: `nodesG.selectAll('.node').filter(d => d.id === clickedId).select('circle,path').attr('stroke', '#ffffff').attr('stroke-opacity', 0.8).attr('stroke-width', 1.5)`

---

### main.ts — changes

Import `GraphNode` and the new `initGraph` signature.

```typescript
import type { GraphNode } from './types.js';

// Panel elements
const panel = document.getElementById('node-panel')!;
const panelClose = document.getElementById('panel-close')!;
const panelTypeBadge = document.getElementById('panel-type-badge')!;
const panelLabel = document.getElementById('panel-label')!;
const panelMeta = document.getElementById('panel-meta')!;
const panelRelations = document.getElementById('panel-relations')!;

function formatDate(ts: number): string {
  return new Date(ts).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
}

function showPanel(node: GraphNode, related: Array<{node: GraphNode; edgeType: string; weight: number}>) {
  // Type badge
  panelTypeBadge.textContent = node.type.toUpperCase();
  panelTypeBadge.className = 'panel-type-badge ' + node.type;
  // Label
  panelLabel.textContent = node.label;
  // Meta rows
  panelMeta.innerHTML = '';
  if (node.type === 'session') {
    const rows = [
      ['project', node.project],
      ['source', node.source],
      ['date', formatDate(node.timestamp)],
    ];
    rows.forEach(([label, val]) => {
      const row = document.createElement('div');
      row.className = 'panel-meta-row';
      row.innerHTML = `<span class="panel-meta-label">${label}</span><span class="panel-meta-value">${val}</span>`;
      panelMeta.appendChild(row);
    });
  } else {
    const rows = [
      ['cluster', String(node.cluster)],
      ['avg date', formatDate(node.avgTimestamp)],
    ];
    rows.forEach(([label, val]) => {
      const row = document.createElement('div');
      row.className = 'panel-meta-row';
      row.innerHTML = `<span class="panel-meta-label">${label}</span><span class="panel-meta-value">${val}</span>`;
      panelMeta.appendChild(row);
    });
  }
  // Relations
  panelRelations.innerHTML = '';
  related.forEach(({ node: n, edgeType }) => {
    const item = document.createElement('div');
    item.className = 'panel-relation-item';
    item.innerHTML = `
      <span class="panel-relation-dot ${n.type}"></span>
      <span class="panel-relation-label" title="${n.label}">${n.label}</span>
      <span class="panel-relation-type">${edgeType === 'session-topic' ? 'topic' : 'similar'}</span>
    `;
    panelRelations.appendChild(item);
  });
  panel.classList.add('visible');
}

function hidePanel() {
  panel.classList.remove('visible');
}

panelClose.addEventListener('click', hidePanel);

// Init graph with the onNodeSelect callback
const graph = initGraph(graphContainer, (node, related) => {
  if (node) showPanel(node, related);
  else hidePanel();
});
```

---

## Done criteria
- [ ] `npm run type-check` passes clean from `/Users/slange/Documents/coding/cc-timeline`
- [ ] Panel slides in on node click, hides on background click and close button
- [ ] Panning the graph works even when cursor is over an edge line
- [ ] Node dragging still works
- [ ] No regressions to filter behavior or graph updates
