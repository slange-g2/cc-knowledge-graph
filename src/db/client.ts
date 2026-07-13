import { DatabaseSync } from 'node:sqlite';
import fs from 'fs';
import { createTables } from './schema';

fs.mkdirSync('data', { recursive: true });

const db = new DatabaseSync('data/knowledge-graph.db');

db.exec('PRAGMA journal_mode = WAL');

createTables(db);

export default db;
