import BetterSqlite3 from 'better-sqlite3';
import { migrations } from './migrations.js';

export type Database = BetterSqlite3.Database;

export function initDatabase(dbPath: string): Database {
  const db = new BetterSqlite3(dbPath);
  for (const sql of migrations) {
    db.exec(sql);
  }
  return db;
}

export function closeDatabase(db: Database): void {
  db.close();
}