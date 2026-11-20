import Database from 'better-sqlite3';
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { drizzle, type BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import * as schema from './schema/index.js';

export type AppDatabase = BetterSQLite3Database<typeof schema>;

export interface DatabaseConnection {
  client: Database.Database;
  db: AppDatabase;
  close: () => void;
}

export function createDatabase(databasePath: string): DatabaseConnection {
  const resolvedPath = databasePath === ':memory:' ? databasePath : resolve(databasePath);

  if (resolvedPath !== ':memory:') {
    mkdirSync(dirname(resolvedPath), { recursive: true, mode: 0o700 });
  }

  const client = new Database(resolvedPath);
  client.pragma('journal_mode = WAL');
  client.pragma('foreign_keys = ON');
  client.pragma('busy_timeout = 5000');

  const db = drizzle({ client, schema });

  return {
    client,
    db,
    close: () => client.close(),
  };
}

export * from './schema/index.js';
