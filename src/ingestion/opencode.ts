import { DatabaseSync } from 'node:sqlite';
import path from 'path';
import os from 'os';
import fs from 'fs';
import type { RawSession } from './types';

interface OpenCodeSession {
  id: string;
  title: string | null;
  directory: string;
  time_created: number; // unix ms
}

interface OpenCodeMessageRow {
  data: string;
}

interface MessageData {
  role?: string;
  content?: string | Array<{ type: string; text?: string }>;
}

function extractUserText(data: MessageData): string | null {
  if (data.role !== 'user') return null;

  if (typeof data.content === 'string') {
    return data.content.trim() || null;
  }

  if (Array.isArray(data.content)) {
    const texts: string[] = [];
    for (const part of data.content) {
      if (part.type === 'text' && part.text) {
        texts.push(part.text);
      }
    }
    return texts.join('\n').trim() || null;
  }

  return null;
}

export function loadOpenCodeSessions(watermark: number): RawSession[] {
  const dbPath = path.join(
    os.homedir(),
    '.local',
    'share',
    'opencode',
    'opencode.db',
  );

  if (!fs.existsSync(dbPath)) {
    return [];
  }

  let db: DatabaseSync;
  try {
    db = new DatabaseSync(dbPath, { readOnly: true });
  } catch {
    return [];
  }

  const sessions: RawSession[] = [];

  try {
    const rows = db
      .prepare('SELECT id, title, directory, time_created FROM session WHERE time_created > ?')
      .all(watermark) as unknown as OpenCodeSession[];

    for (const row of rows) {
      const messageRows = db
        .prepare('SELECT data FROM message WHERE session_id = ? ORDER BY rowid')
        .all(row.id) as unknown as OpenCodeMessageRow[];

      const userMessages: string[] = [];
      for (const msgRow of messageRows) {
        let parsed: MessageData;
        try {
          parsed = JSON.parse(msgRow.data) as MessageData;
        } catch {
          continue;
        }

        const text = extractUserText(parsed);
        if (text) {
          userMessages.push(text);
        }
      }

      const projectName = path.basename(row.directory);

      sessions.push({
        id: row.id,
        source: 'opencode',
        project: projectName,
        label: row.title ?? row.id,
        timestamp: row.time_created,
        userMessages,
      });
    }
  } catch {
    // gracefully handle DB errors (e.g. table doesn't exist)
  } finally {
    db.close();
  }

  return sessions;
}
