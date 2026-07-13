import { Router, Request, Response } from 'express';
import db from '../db/client';
import { config } from '../config';

const PALETTE = [
  '#4e79a7', '#f28e2b', '#e15759', '#76b7b2', '#59a14f',
  '#edc948', '#b07aa1', '#ff9da7', '#9c755f', '#bab0ac',
];

// ---- DB row types ----

interface SessionRow {
  id: string;
  source: 'claude-code' | 'opencode';
  project: string;
  label: string;
  timestamp: number;
}

interface TopicRow {
  id: string;
  label: string;
  cluster_id: number;
}

interface SessionTopicRow {
  session_id: string;
  topic_id: string;
}

interface SimilarityRow {
  topic_a: string;
  topic_b: string;
  similarity: number;
}

interface WatermarkRow {
  last_processed_at: number;
}

// ---- API Types (matching global.md) ----

interface SessionNode {
  id: string;
  type: 'session';
  label: string;
  project: string;
  source: 'claude-code' | 'opencode';
  timestamp: number;
  size: number;
  color: string;
}

interface TopicNode {
  id: string;
  type: 'topic';
  label: string;
  cluster: number;
  avgTimestamp: number;
  size: number;
  color: string;
}

interface Edge {
  source: string;
  target: string;
  type: 'session-topic' | 'topic-similarity';
  weight: number;
}

interface GraphResponse {
  nodes: (SessionNode | TopicNode)[];
  edges: Edge[];
}

// ---- Helpers ----

function projectColor(project: string, allProjects: string[]): string {
  const sorted = [...allProjects].sort();
  const idx = sorted.indexOf(project);
  return PALETTE[idx % PALETTE.length] ?? PALETTE[0]!;
}

function clusterColor(clusterId: number): string {
  return PALETTE[clusterId % PALETTE.length] ?? PALETTE[0]!;
}

// ---- Router ----

const router = Router();

// GET /api/graph
router.get('/graph', (req: Request, res: Response): void => {
  const { project, dateStart, dateEnd, topic, granularity } = req.query as Record<string, string | undefined>;

  // Build session filter
  const conditions: string[] = [];
  const params: (string | number)[] = [];

  if (project) {
    const projectList = project.split(',').map(p => p.trim()).filter(Boolean);
    if (projectList.length === 1) {
      conditions.push('s.project = ?');
      params.push(projectList[0]!);
    } else if (projectList.length > 1) {
      conditions.push(`s.project IN (${projectList.map(() => '?').join(',')})`);
      params.push(...projectList);
    }
  }
  if (dateStart) {
    conditions.push('s.timestamp >= ?');
    params.push(new Date(dateStart).getTime());
  }
  if (dateEnd) {
    conditions.push('s.timestamp <= ?');
    params.push(new Date(dateEnd).getTime());
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  // Fetch filtered sessions
  const sessionRows = db
    .prepare(`SELECT id, source, project, label, timestamp FROM sessions s ${whereClause}`)
    .all(...params) as unknown as SessionRow[];

  if (sessionRows.length === 0) {
    const response: GraphResponse = { nodes: [], edges: [] };
    res.json(response);
    return;
  }

  const sessionIds = sessionRows.map((s) => s.id);
  const sessionIdPlaceholders = sessionIds.map(() => '?').join(',');

  // Fetch session-topic links for filtered sessions
  const sessionTopicRows = db
    .prepare(`SELECT session_id, topic_id FROM session_topics WHERE session_id IN (${sessionIdPlaceholders})`)
    .all(...sessionIds) as unknown as SessionTopicRow[];

  // If topic filter is provided, filter session_topics further
  let filteredSessionTopics = sessionTopicRows;
  if (topic) {
    const topicRow = db
      .prepare('SELECT id FROM topics WHERE id = ? OR label LIKE ?')
      .get(topic, `%${topic}%`) as { id: string } | undefined;
    if (topicRow) {
      filteredSessionTopics = sessionTopicRows.filter((st) => st.topic_id === topicRow.id);
    } else {
      filteredSessionTopics = [];
    }
  }

  // Collect unique topic ids
  const topicIdSet = new Set(filteredSessionTopics.map((st) => st.topic_id));
  const topicIds = [...topicIdSet];

  let topicRows: TopicRow[] = [];
  let similarityRows: SimilarityRow[] = [];

  if (topicIds.length > 0) {
    const topicPlaceholders = topicIds.map(() => '?').join(',');
    topicRows = db
      .prepare(`SELECT id, label, cluster_id FROM topics WHERE id IN (${topicPlaceholders})`)
      .all(...topicIds) as unknown as TopicRow[];

    // Fetch topic-similarity edges between visible topics
    similarityRows = db
      .prepare(
        `SELECT topic_a, topic_b, similarity FROM topic_similarities WHERE topic_a IN (${topicPlaceholders}) AND topic_b IN (${topicPlaceholders})`,
      )
      .all(...topicIds, ...topicIds) as unknown as SimilarityRow[];
  }

  // Compute avgTimestamp for topic nodes
  const topicTimestamps = new Map<string, number[]>();
  const sessionTimestampMap = new Map(sessionRows.map((s) => [s.id, s.timestamp]));

  for (const st of filteredSessionTopics) {
    const ts = sessionTimestampMap.get(st.session_id);
    if (ts !== undefined) {
      if (!topicTimestamps.has(st.topic_id)) topicTimestamps.set(st.topic_id, []);
      topicTimestamps.get(st.topic_id)!.push(ts);
    }
  }

  // Compute edge counts for size calculation
  const edgeCounts: Record<string, number> = {};
  for (const st of filteredSessionTopics) {
    edgeCounts[st.session_id] = (edgeCounts[st.session_id] ?? 0) + 1;
    edgeCounts[st.topic_id] = (edgeCounts[st.topic_id] ?? 0) + 1;
  }
  for (const sr of similarityRows) {
    edgeCounts[sr.topic_a] = (edgeCounts[sr.topic_a] ?? 0) + 1;
    edgeCounts[sr.topic_b] = (edgeCounts[sr.topic_b] ?? 0) + 1;
  }

  // All projects for color assignment
  const allProjectsResult = db
    .prepare('SELECT DISTINCT project FROM sessions')
    .all() as { project: string }[];
  const allProjects = allProjectsResult.map((r) => r.project);

  // Get all node timestamps for recency computation
  const allTimestamps: number[] = [];
  for (const s of sessionRows) allTimestamps.push(s.timestamp);
  for (const [topicId, tsList] of topicTimestamps.entries()) {
    if (tsList.length > 0) {
      const avg = tsList.reduce((a, b) => a + b, 0) / tsList.length;
      allTimestamps.push(avg);
    }
  }

  const minTs = allTimestamps.length > 0 ? Math.min(...allTimestamps) : 0;
  const maxTs = allTimestamps.length > 0 ? Math.max(...allTimestamps) : 0;
  const tsRange = maxTs - minTs;
  const maxEdge = Math.max(...Object.values(edgeCounts), 1);

  function computeSize(ts: number, nodeId: string): number {
    const recencyScore = tsRange > 0 ? (ts - minTs) / tsRange : 0;
    const connectionScore = (edgeCounts[nodeId] ?? 0) / maxEdge;
    return config.recencyWeight * recencyScore + config.connectionWeight * connectionScore;
  }

  // Build session nodes
  const sessionNodes: SessionNode[] = sessionRows.map((s) => ({
    id: s.id,
    type: 'session',
    label: s.label,
    project: s.project,
    source: s.source,
    timestamp: s.timestamp,
    size: computeSize(s.timestamp, s.id),
    color: projectColor(s.project, allProjects),
  }));

  // Build topic nodes
  const topicNodes: TopicNode[] = topicRows.map((t) => {
    const tsList = topicTimestamps.get(t.id) ?? [];
    const avg = tsList.length > 0 ? tsList.reduce((a, b) => a + b, 0) / tsList.length : minTs;
    return {
      id: t.id,
      type: 'topic',
      label: t.label,
      cluster: t.cluster_id,
      avgTimestamp: avg,
      size: computeSize(avg, t.id),
      color: clusterColor(t.cluster_id),
    };
  });

  // Build edges
  const edges: Edge[] = [];

  // Session-topic edges
  for (const st of filteredSessionTopics) {
    // Only include if both session and topic are in our result sets
    if (topicIdSet.has(st.topic_id)) {
      edges.push({
        source: st.session_id,
        target: st.topic_id,
        type: 'session-topic',
        weight: 1.0,
      });
    }
  }

  // Topic-similarity edges
  for (const sr of similarityRows) {
    edges.push({
      source: sr.topic_a,
      target: sr.topic_b,
      type: 'topic-similarity',
      weight: sr.similarity,
    });
  }

  // Handle granularity param — currently informational; D3 layout uses it on the frontend
  void granularity;

  const response: GraphResponse = {
    nodes: [...sessionNodes, ...topicNodes],
    edges,
  };

  res.json(response);
});

// GET /api/projects
router.get('/projects', (_req: Request, res: Response): void => {
  const rows = db
    .prepare('SELECT DISTINCT project FROM sessions ORDER BY project')
    .all() as { project: string }[];
  res.json({ projects: rows.map((r) => r.project) });
});

// GET /api/topics
router.get('/topics', (_req: Request, res: Response): void => {
  const rows = db
    .prepare('SELECT id, label FROM topics ORDER BY label')
    .all() as { id: string; label: string }[];
  res.json({ topics: rows });
});

// GET /api/status
router.get('/status', (_req: Request, res: Response): void => {
  const sessionCount = (db.prepare('SELECT COUNT(*) as cnt FROM sessions').get() as { cnt: number }).cnt;
  const topicCount = (db.prepare('SELECT COUNT(*) as cnt FROM topics').get() as { cnt: number }).cnt;

  const watermarkRow = db
    .prepare('SELECT MAX(last_processed_at) as ts FROM ingestion_watermarks')
    .get() as { ts: number | null };

  const lastIngested: string | null =
    watermarkRow.ts !== null ? new Date(watermarkRow.ts).toISOString() : null;

  res.json({ sessionCount, topicCount, lastIngested });
});

export default router;
