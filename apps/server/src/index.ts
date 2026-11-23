import { config } from 'dotenv';
import { mkdirSync, statSync } from 'node:fs';
import { dirname, isAbsolute, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createDatabase } from '@career-scout/database';
import { createApp } from './app.js';

const currentDirectory = dirname(fileURLToPath(import.meta.url));
const repositoryRoot = resolve(currentDirectory, '../../../');
config({ path: resolve(repositoryRoot, '.env') });

const port = Number.parseInt(process.env.PORT ?? '3001', 10);
const host = process.env.HOST ?? '127.0.0.1';
const configuredDatabasePath = process.env.DB_FILE_NAME ?? '.local-job-agent/career-scout.sqlite';
const configuredResumeStorageDir = process.env.RESUME_STORAGE_DIR ?? '.local-job-agent/resumes';
const resumeStorageRoot = isAbsolute(configuredResumeStorageDir)
  ? configuredResumeStorageDir
  : resolve(repositoryRoot, configuredResumeStorageDir);
mkdirSync(resumeStorageRoot, { recursive: true, mode: 0o700 });
const resumeStoragePermissions = statSync(resumeStorageRoot).mode & 0o777;
if ((resumeStoragePermissions & 0o077) !== 0) {
  throw new Error(
    `Resume storage directory must have owner-only permissions (0700). Run chmod 700 "${resumeStorageRoot}" and restart CareerScout.`,
  );
}
const databasePath = configuredDatabasePath === ':memory:'
  ? ':memory:'
  : isAbsolute(configuredDatabasePath)
    ? configuredDatabasePath
    : resolve(repositoryRoot, configuredDatabasePath);
const cookieSecure = process.env.COOKIE_SECURE === 'true';

if (!Number.isInteger(port) || port < 1 || port > 65_535) {
  throw new Error(`Invalid PORT value: ${process.env.PORT ?? ''}`);
}

const connection = createDatabase(databasePath);
const existingTables = new Set(
  connection.client
    .prepare("SELECT name FROM sqlite_master WHERE type = 'table'")
    .pluck()
    .all() as string[],
);
const requiredTables = ['users', 'sessions', 'profiles'];
const missingTables = requiredTables.filter((tableName) => !existingTables.has(tableName));

if (missingTables.length > 0) {
  connection.close();
  throw new Error(
    `CareerScout database is missing tables: ${missingTables.join(', ')}. ` +
    'Run "npm run db:migrate" from the repository root, then restart the API.',
  );
}

const app = createApp({ db: connection.db, cookieSecure, resumeStorageRoot });
const server = app.listen(port, host, () => {
  console.log(`CareerScout API listening at http://${host}:${port}`);
  console.log(`CareerScout database: ${databasePath}`);
});

function shutdown(signal: NodeJS.Signals): void {
  console.log(`\n${signal} received. Shutting down CareerScout API...`);
  server.close((error) => {
    connection.close();
    if (error) {
      console.error('Error while shutting down the API:', error);
      process.exitCode = 1;
    }
  });
}

process.once('SIGINT', shutdown);
process.once('SIGTERM', shutdown);
