import type { DatabaseSync } from 'node:sqlite';

export function createTables(db: DatabaseSync): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS sessions (
      id          TEXT PRIMARY KEY,
      source      TEXT NOT NULL,
      project     TEXT NOT NULL,
      label       TEXT NOT NULL,
      timestamp   INTEGER NOT NULL,
      raw_messages TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS topics (
      id         TEXT PRIMARY KEY,
      label      TEXT NOT NULL,
      embedding  TEXT NOT NULL,
      cluster_id INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS session_topics (
      session_id TEXT NOT NULL,
      topic_id   TEXT NOT NULL,
      PRIMARY KEY (session_id, topic_id)
    );

    CREATE TABLE IF NOT EXISTS topic_similarities (
      topic_a    TEXT NOT NULL,
      topic_b    TEXT NOT NULL,
      similarity REAL NOT NULL,
      PRIMARY KEY (topic_a, topic_b),
      CHECK (topic_a < topic_b)
    );

    CREATE TABLE IF NOT EXISTS ingestion_watermarks (
      source           TEXT PRIMARY KEY,
      last_processed_at INTEGER NOT NULL
    );
  `);
}
