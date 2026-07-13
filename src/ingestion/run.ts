import db from '../db/client';
import { config } from '../config';
import { loadClaudeCodeSessions } from './claude-code';
import { loadOpenCodeSessions } from './opencode';
import { extractTopics } from '../processing/extractor';
import { embedStrings } from '../processing/embeddings';
import { findOrCreateTopics, recomputeClusters } from '../processing/dedup';
import type { RawSession } from './types';

interface WatermarkRow {
  last_processed_at: number;
}

function getWatermark(source: string): number {
  const row = db
    .prepare('SELECT last_processed_at FROM ingestion_watermarks WHERE source = ?')
    .get(source) as WatermarkRow | undefined;
  return row?.last_processed_at ?? 0;
}

function setWatermark(source: string, ts: number): void {
  db.prepare(
    'INSERT INTO ingestion_watermarks (source, last_processed_at) VALUES (?, ?) ON CONFLICT(source) DO UPDATE SET last_processed_at = excluded.last_processed_at',
  ).run(source, ts);
}

interface ProcessedSession {
  session: RawSession;
  topicsWithEmbeddings: { label: string; embedding: number[] }[];
  tokens: number;
}

// Extract + embed a single session — fully async, no DB writes.
async function processSessionAsync(session: RawSession): Promise<ProcessedSession> {
  const { topics, tokens } = await extractTopics(session);

  const embeddings = topics.length > 0 ? await embedStrings(topics) : [];
  const topicsWithEmbeddings = topics.map((label, i) => ({
    label,
    embedding: embeddings[i] ?? [],
  }));

  return { session, topicsWithEmbeddings, tokens };
}

async function main(): Promise<void> {
  if (config.forceReingest) {
    console.log('FORCE_REINGEST=true — resetting watermarks and clearing existing data...');
    db.exec('DELETE FROM ingestion_watermarks');
    db.exec('DELETE FROM session_topics');
    db.exec('DELETE FROM topic_similarities');
    db.exec('DELETE FROM topics');
    db.exec('DELETE FROM sessions');
  }

  const ccWatermark = getWatermark('claude-code');
  const ocWatermark = getWatermark('opencode');

  console.log(`Loading sessions (cc watermark=${ccWatermark}, oc watermark=${ocWatermark})...`);

  const ccSessions = loadClaudeCodeSessions(ccWatermark);
  const ocSessions = loadOpenCodeSessions(ocWatermark);
  const allSessions = [...ccSessions, ...ocSessions];

  const total = allSessions.length;
  console.log(`Found ${total} new session(s). Processing with ${config.parallelWorkers} parallel worker(s).`);

  if (total === 0) {
    console.log('Nothing to ingest.');
    return;
  }

  const insertSession = db.prepare(
    'INSERT OR REPLACE INTO sessions (id, source, project, label, timestamp, raw_messages) VALUES (?, ?, ?, ?, ?, ?)',
  );
  const insertSessionTopic = db.prepare(
    'INSERT OR IGNORE INTO session_topics (session_id, topic_id) VALUES (?, ?)',
  );

  let cumulativeTokens = 0;
  const batchSize = Math.max(1, config.parallelWorkers);

  for (let batchStart = 0; batchStart < total; batchStart += batchSize) {
    const batch = allSessions.slice(batchStart, batchStart + batchSize).filter(
      (s): s is RawSession => s !== undefined,
    );

    // --- PARALLEL: extract + embed all sessions in this batch ---
    const settled = await Promise.allSettled(batch.map((s) => processSessionAsync(s)));

    // --- SEQUENTIAL: DB writes for each result in batch order ---
    for (let j = 0; j < settled.length; j++) {
      const globalIdx = batchStart + j;
      const result = settled[j];
      const session = batch[j]!;

      if (result.status === 'rejected') {
        console.error(`[${globalIdx + 1}/${total}] "${session.label}" — failed: ${String(result.reason)}`);
        // Insert session with no topics so it's watermarked and skipped next run
        insertSession.run(session.id, session.source, session.project, session.label, session.timestamp, JSON.stringify(session.userMessages));
        continue;
      }

      const { topicsWithEmbeddings, tokens } = result.value;
      cumulativeTokens += tokens;
      console.log(
        `[${globalIdx + 1}/${total}] "${session.label}" — ${topicsWithEmbeddings.length} topics | tokens: ${tokens} (cumulative: ${cumulativeTokens})`,
      );

      const topicIds = topicsWithEmbeddings.length > 0
        ? findOrCreateTopics(db, topicsWithEmbeddings)
        : [];

      db.exec('BEGIN');
      try {
        insertSession.run(session.id, session.source, session.project, session.label, session.timestamp, JSON.stringify(session.userMessages));
        for (const topicId of topicIds) {
          insertSessionTopic.run(session.id, topicId);
        }
        db.exec('COMMIT');
      } catch (e) {
        db.exec('ROLLBACK');
        throw e;
      }
    }
  }

  console.log('Recomputing clusters...');
  recomputeClusters(db);

  const now = Date.now();
  setWatermark('claude-code', now);
  setWatermark('opencode', now);

  console.log(`Ingestion complete. Total tokens used: ${cumulativeTokens}`);
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
