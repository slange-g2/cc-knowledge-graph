import * as d3 from 'd3';
import type { GraphResponse, GraphNode, Edge, SessionNode, TopicNode } from './types.js';

// D3 simulation nodes get mutated with x, y, vx, vy
interface SimNode extends d3.SimulationNodeDatum {
  id: string;
  type: 'session' | 'topic';
  label: string;
  size: number;
  color: string;
  timestamp?: number;
  avgTimestamp?: number;
}

interface SimLink extends d3.SimulationLinkDatum<SimNode> {
  source: SimNode | string;
  target: SimNode | string;
  type: 'session-topic' | 'topic-similarity';
  weight: number;
}

function toSimNode(n: GraphNode): SimNode {
  if (n.type === 'session') {
    const s = n as SessionNode;
    return { id: s.id, type: 'session', label: s.label, size: s.size, color: s.color, timestamp: s.timestamp };
  } else {
    const t = n as TopicNode;
    return { id: t.id, type: 'topic', label: t.label, size: t.size, color: t.color, avgTimestamp: t.avgTimestamp };
  }
}

function toSimLink(e: Edge): SimLink {
  return { source: e.source, target: e.target, type: e.type, weight: e.weight };
}

function pixelRadius(node: SimNode): number {
  return 4 + node.size * 20;
}

function bucketTimestamp(ts: number, granularity: string): string {
  const d = new Date(ts);
  if (granularity === 'day') {
    return d.toISOString().slice(0, 10);
  } else if (granularity === 'week') {
    // ISO week: floor to Monday
    const day = d.getUTCDay(); // 0=Sun
    const diff = (day === 0 ? -6 : 1 - day);
    const monday = new Date(d);
    monday.setUTCDate(d.getUTCDate() + diff);
    return monday.toISOString().slice(0, 10);
  } else {
    // month
    return d.toISOString().slice(0, 7);
  }
}

function getColumnX(bucket: string, buckets: string[], width: number): number {
  const idx = buckets.indexOf(bucket);
  const count = buckets.length;
  if (count <= 1) return width / 2;
  const padding = 80;
  return padding + (idx / (count - 1)) * (width - padding * 2);
}

function getTargetX(node: SimNode, buckets: string[], width: number, granularity: string): number {
  const ts = node.type === 'session' ? (node.timestamp ?? 0) : (node.avgTimestamp ?? 0);
  const bucket = bucketTimestamp(ts, granularity);
  return getColumnX(bucket, buckets, width);
}

export function initGraph(container: HTMLElement): { update(data: GraphResponse, granularity: string): void } {
  const width = container.clientWidth;
  const height = container.clientHeight;

  const svg = d3.select(container)
    .append('svg')
    .attr('width', width)
    .attr('height', height)
    .style('display', 'block');

  // Background click to reset highlight
  svg.append('rect')
    .attr('width', width)
    .attr('height', height)
    .attr('fill', 'transparent')
    .on('click', resetHighlight);

  // Layers: column labels, edges, nodes
  const labelsG = svg.append('g').attr('class', 'labels');
  const edgesG = svg.append('g').attr('class', 'edges');
  const nodesG = svg.append('g').attr('class', 'nodes');

  let simulation: d3.Simulation<SimNode, SimLink> | null = null;

  function resetHighlight() {
    edgesG.selectAll<SVGLineElement, SimLink>('line').style('opacity', 0.3);
    nodesG.selectAll<SVGGElement, SimNode>('.node').style('opacity', 1);
  }

  function highlightNode(clickedId: string, links: SimLink[]) {
    const neighborIds = new Set<string>();
    neighborIds.add(clickedId);
    links.forEach(l => {
      const sid = typeof l.source === 'string' ? l.source : l.source.id;
      const tid = typeof l.target === 'string' ? l.target : l.target.id;
      if (sid === clickedId) neighborIds.add(tid);
      if (tid === clickedId) neighborIds.add(sid);
    });

    edgesG.selectAll<SVGLineElement, SimLink>('line').style('opacity', l => {
      const sid = typeof l.source === 'string' ? l.source : l.source.id;
      const tid = typeof l.target === 'string' ? l.target : l.target.id;
      return (sid === clickedId || tid === clickedId) ? 1 : 0.05;
    });

    nodesG.selectAll<SVGGElement, SimNode>('.node').style('opacity', d =>
      neighborIds.has(d.id) ? 1 : 0.1
    );
  }

  function update(data: GraphResponse, granularity: string) {
    const simNodes: SimNode[] = data.nodes.map(toSimNode);
    const simLinks: SimLink[] = data.edges.map(toSimLink);

    // Compute date buckets
    const allTs = simNodes.map(n => n.type === 'session' ? (n.timestamp ?? 0) : (n.avgTimestamp ?? 0));
    const rawBuckets = allTs.map(ts => bucketTimestamp(ts, granularity));
    const buckets = Array.from(new Set(rawBuckets)).sort();

    // Column labels
    labelsG.selectAll('text').remove();
    labelsG.selectAll<SVGTextElement, string>('text')
      .data(buckets)
      .join('text')
      .attr('x', b => getColumnX(b, buckets, width))
      .attr('y', 18)
      .attr('text-anchor', 'middle')
      .attr('fill', '#666')
      .attr('font-size', '11px')
      .text(b => b);

    // Vertical column guide lines
    labelsG.selectAll('line.col-guide').remove();
    labelsG.selectAll<SVGLineElement, string>('line.col-guide')
      .data(buckets)
      .join('line')
      .attr('class', 'col-guide')
      .attr('x1', b => getColumnX(b, buckets, width))
      .attr('x2', b => getColumnX(b, buckets, width))
      .attr('y1', 28)
      .attr('y2', height)
      .attr('stroke', '#222')
      .attr('stroke-width', 1);

    // Stop old simulation
    if (simulation) simulation.stop();

    simulation = d3.forceSimulation<SimNode, SimLink>(simNodes)
      .force('x', d3.forceX<SimNode>(d => getTargetX(d, buckets, width, granularity)).strength(0.3))
      .force('y', d3.forceY<SimNode>(height / 2).strength(0.05))
      .force('collide', d3.forceCollide<SimNode>(d => pixelRadius(d) + 2))
      .force('charge', d3.forceManyBody<SimNode>().strength(-30))
      .force('link', d3.forceLink<SimNode, SimLink>(simLinks).id(d => d.id).strength(0.1));

    // Edges
    const edgeSel = edgesG
      .selectAll<SVGLineElement, SimLink>('line')
      .data(simLinks, (_d, i) => String(i))
      .join('line')
      .attr('stroke', '#888')
      .attr('stroke-opacity', 0.3)
      .attr('stroke-width', d => Math.max(0.5, d.weight * 2));

    // Nodes
    const nodeSel = nodesG
      .selectAll<SVGGElement, SimNode>('.node')
      .data(simNodes, d => d.id)
      .join(
        enter => {
          const g = enter.append('g').attr('class', 'node').style('cursor', 'pointer');
          g.each(function(d) {
            const el = d3.select(this);
            if (d.type === 'session') {
              const r = pixelRadius(d);
              const area = Math.PI * r * r;
              el.append('path')
                .attr('d', d3.symbol().type(d3.symbolDiamond).size(area)())
                .attr('fill', d.color);
            } else {
              el.append('circle')
                .attr('r', pixelRadius(d))
                .attr('fill', d.color);
            }
            el.append('title').text(d.label);
          });
          g.on('click', function(event: MouseEvent, d: SimNode) {
            event.stopPropagation();
            highlightNode(d.id, simLinks);
          });
          return g;
        },
        update => {
          update.each(function(d) {
            const el = d3.select(this);
            if (d.type === 'session') {
              const r = pixelRadius(d);
              const area = Math.PI * r * r;
              el.select('path').attr('d', d3.symbol().type(d3.symbolDiamond).size(area)()).attr('fill', d.color);
            } else {
              el.select('circle').attr('r', pixelRadius(d)).attr('fill', d.color);
            }
            el.select('title').text(d.label);
          });
          return update;
        },
        exit => exit.remove()
      );

    simulation.on('tick', () => {
      edgeSel
        .attr('x1', d => (d.source as SimNode).x ?? 0)
        .attr('y1', d => (d.source as SimNode).y ?? 0)
        .attr('x2', d => (d.target as SimNode).x ?? 0)
        .attr('y2', d => (d.target as SimNode).y ?? 0);

      nodeSel.attr('transform', d => `translate(${d.x ?? 0},${d.y ?? 0})`);
    });
  }

  return { update };
}
