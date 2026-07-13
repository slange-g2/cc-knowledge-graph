import { initFilters } from './filters.js';
import { initGraph } from './graph.js';
import { fetchGraph } from './api.js';
import type { Filters, GraphNode } from './types.js';

document.addEventListener('DOMContentLoaded', () => {
  const graphContainer = document.getElementById('graph')!;

  // Panel DOM elements
  const panel = document.getElementById('node-panel')!;
  const panelClose = document.getElementById('panel-close')!;
  const panelTypeBadge = document.getElementById('panel-type-badge')!;
  const panelLabel = document.getElementById('panel-label')!;
  const panelMeta = document.getElementById('panel-meta')!;
  const panelRelations = document.getElementById('panel-relations')!;

  function formatDate(ts: number): string {
    return new Date(ts).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  }

  function showPanel(
    node: GraphNode,
    related: Array<{ node: GraphNode; edgeType: string; weight: number }>
  ): void {
    // Type badge
    panelTypeBadge.textContent = node.type.toUpperCase();
    panelTypeBadge.className = 'panel-type-badge ' + node.type;

    // Label
    panelLabel.textContent = node.label;

    // Meta rows
    panelMeta.innerHTML = '';
    if (node.type === 'session') {
      const rows: Array<[string, string]> = [
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
      const rows: Array<[string, string]> = [
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

    // Relations list
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

  function hidePanel(): void {
    panel.classList.remove('visible');
  }

  panelClose.addEventListener('click', hidePanel);

  // Init graph with the onNodeSelect callback
  const graph = initGraph(graphContainer, (node, related) => {
    if (node) showPanel(node, related);
    else hidePanel();
  });

  const onFilterChange = async (f: Filters) => {
    try {
      const data = await fetchGraph(f);
      graph.update(data, f.granularity);
    } catch (err) {
      console.error('Failed to fetch graph data:', err);
    }
  };

  // initFilters is async (fetches projects), fires onChange when ready
  initFilters(onFilterChange).catch(err => {
    console.error('Failed to initialize filters:', err);
  });
});
