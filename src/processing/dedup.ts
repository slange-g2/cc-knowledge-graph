import type { DatabaseSync } from 'node:sqlite';
import { config } from '../config';

interface TopicRow {
  id: string;
  label: string;
  embedding: string;
  cluster_id: number;
}

interface SimilarityRow {
  topic_a: string;
  topic_b: string;
}

export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length || a.length === 0) return 0;

  let dot = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < a.length; i++) {
    dot += (a[i] ?? 0) * (b[i] ?? 0);
    normA += (a[i] ?? 0) * (a[i] ?? 0);
    normB += (b[i] ?? 0) * (b[i] ?? 0);
  }

  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  if (denom === 0) return 0;
  return dot / denom;
}

export function findOrCreateTopics(
  db: DatabaseSync,
  newTopics: { label: string; embedding: number[] }[],
): string[] {
  // Load all existing topics once
  const existingTopics = db
    .prepare('SELECT id, label, embedding FROM topics')
    .all() as unknown as TopicRow[];

  const existingWithEmbeddings: { id: string; label: string; embedding: number[] }[] =
    existingTopics.map((row) => ({
      id: row.id,
      label: row.label,
      embedding: JSON.parse(row.embedding) as number[],
    }));

  const insertTopic = db.prepare(
    'INSERT INTO topics (id, label, embedding, cluster_id) VALUES (?, ?, ?, 0)',
  );
  const updateLabel = db.prepare('UPDATE topics SET label = ? WHERE id = ?');
  const insertSimilarity = db.prepare(
    'INSERT OR REPLACE INTO topic_similarities (topic_a, topic_b, similarity) VALUES (?, ?, ?)',
  );

  const resultIds: string[] = [];

  for (const newTopic of newTopics) {
    let bestId: string | null = null;
    let bestSim = -1;

    for (const existing of existingWithEmbeddings) {
      const sim = cosineSimilarity(newTopic.embedding, existing.embedding);
      if (sim > bestSim) {
        bestSim = sim;
        bestId = existing.id;
      }
    }

    if (bestSim >= config.similarityThreshold && bestId !== null) {
      // Merge into existing topic
      // Update label if new one is longer
      const existing = existingWithEmbeddings.find((e) => e.id === bestId);
      if (existing && newTopic.label.length > existing.label.length) {
        updateLabel.run(newTopic.label, bestId);
        existing.label = newTopic.label;
      }
      resultIds.push(bestId);
    } else {
      // Insert as new topic
      const newId = crypto.randomUUID();
      insertTopic.run(newId, newTopic.label, JSON.stringify(newTopic.embedding));

      // Compute and store similarities against all existing topics
      for (const existing of existingWithEmbeddings) {
        const sim = cosineSimilarity(newTopic.embedding, existing.embedding);
        if (sim >= config.similarityThreshold) {
          // Enforce topic_a < topic_b ordering
          const [a, b] = newId < existing.id ? [newId, existing.id] : [existing.id, newId];
          insertSimilarity.run(a, b, sim);
        }
      }

      // Add to the local list so subsequent topics in this batch can compare against it
      existingWithEmbeddings.push({ id: newId, label: newTopic.label, embedding: newTopic.embedding });

      resultIds.push(newId);
    }
  }

  return resultIds;
}

export function recomputeClusters(db: DatabaseSync): void {
  const allTopics = db.prepare('SELECT id FROM topics').all() as { id: string }[];
  if (allTopics.length === 0) return;

  const allSims = db
    .prepare('SELECT topic_a, topic_b FROM topic_similarities')
    .all() as unknown as SimilarityRow[];

  // Build adjacency list for connected components (Union-Find)
  const parent = new Map<string, string>();

  function find(id: string): string {
    if (!parent.has(id)) parent.set(id, id);
    const p = parent.get(id)!;
    if (p !== id) {
      const root = find(p);
      parent.set(id, root);
      return root;
    }
    return id;
  }

  function union(a: string, b: string): void {
    const ra = find(a);
    const rb = find(b);
    if (ra !== rb) parent.set(ra, rb);
  }

  // Initialize all topics in parent map
  for (const topic of allTopics) {
    find(topic.id);
  }

  // Union connected topics
  for (const sim of allSims) {
    union(sim.topic_a, sim.topic_b);
  }

  // Assign sequential cluster IDs to roots
  const rootToCluster = new Map<string, number>();
  let nextCluster = 0;

  const updateCluster = db.prepare('UPDATE topics SET cluster_id = ? WHERE id = ?');

  db.exec('BEGIN');
  try {
    for (const topic of allTopics) {
      const root = find(topic.id);
      if (!rootToCluster.has(root)) {
        rootToCluster.set(root, nextCluster++);
      }
      updateCluster.run(rootToCluster.get(root)!, topic.id);
    }
    db.exec('COMMIT');
  } catch (e) {
    db.exec('ROLLBACK');
    throw e;
  }
}
