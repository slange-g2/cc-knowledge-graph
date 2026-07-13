import fs from 'fs';
import path from 'path';
import os from 'os';
import type { RawSession } from './types';

interface ClaudeRecord {
  type: string;
  timestamp?: string;
  aiTitle?: string;
  message?: {
    content?: Array<{ type: string; text?: string }>;
  };
}

function projectNameFromDirName(dirName: string): string {
  // Dir names like: -Users-slange-Documents-coding-ue
  // Split on '-', filter empty strings, take the last element
  const parts = dirName.split('-').filter((p) => p.length > 0);
  return parts[parts.length - 1] ?? dirName;
}

export function loadClaudeCodeSessions(watermark: number): RawSession[] {
  const projectsDir = path.join(os.homedir(), '.claude', 'projects');

  if (!fs.existsSync(projectsDir)) {
    return [];
  }

  const sessions: RawSession[] = [];

  let projectDirs: string[];
  try {
    projectDirs = fs.readdirSync(projectsDir);
  } catch {
    return [];
  }

  for (const dirName of projectDirs) {
    const dirPath = path.join(projectsDir, dirName);

    let stat: fs.Stats;
    try {
      stat = fs.statSync(dirPath);
    } catch {
      continue;
    }
    if (!stat.isDirectory()) continue;

    const projectName = projectNameFromDirName(dirName);

    let files: string[];
    try {
      files = fs.readdirSync(dirPath);
    } catch {
      continue;
    }

    const jsonlFiles = files.filter((f) => f.endsWith('.jsonl'));

    for (const file of jsonlFiles) {
      const sessionId = file.slice(0, -'.jsonl'.length);
      const filePath = path.join(dirPath, file);

      let content: string;
      try {
        content = fs.readFileSync(filePath, 'utf-8');
      } catch {
        continue;
      }

      const lines = content.split('\n').filter((l) => l.trim().length > 0);
      const records: ClaudeRecord[] = [];

      for (const line of lines) {
        try {
          records.push(JSON.parse(line) as ClaudeRecord);
        } catch {
          // skip malformed lines
        }
      }

      if (records.length === 0) continue;

      // Find earliest timestamp
      let earliestTs = Infinity;
      for (const rec of records) {
        if (rec.timestamp) {
          const ts = new Date(rec.timestamp).getTime();
          if (!isNaN(ts) && ts < earliestTs) {
            earliestTs = ts;
          }
        }
      }

      if (earliestTs === Infinity) continue;
      if (earliestTs <= watermark) continue;

      // Extract ai-title
      let label = sessionId;
      for (const rec of records) {
        if (rec.type === 'ai-title' && rec.aiTitle) {
          label = rec.aiTitle;
          break;
        }
      }

      // Extract user messages
      const userMessages: string[] = [];
      for (const rec of records) {
        if (rec.type === 'user' && rec.message?.content) {
          for (const item of rec.message.content) {
            if (item.type === 'text' && item.text) {
              userMessages.push(item.text);
            }
          }
        }
      }

      sessions.push({
        id: sessionId,
        source: 'claude-code',
        project: projectName,
        label,
        timestamp: earliestTs,
        userMessages,
      });
    }
  }

  return sessions;
}
