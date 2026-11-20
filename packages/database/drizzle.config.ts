import { config as loadEnv } from 'dotenv';
import { defineConfig } from 'drizzle-kit';
import { mkdirSync } from 'node:fs';
import { dirname, isAbsolute, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const packageDirectory = dirname(fileURLToPath(import.meta.url));
const repositoryRoot = resolve(packageDirectory, '../..');

loadEnv({ path: resolve(repositoryRoot, '.env') });

const configuredDatabasePath =
  process.env.DB_FILE_NAME ?? '.local-job-agent/career-scout.sqlite';
const databasePath = isAbsolute(configuredDatabasePath)
  ? configuredDatabasePath
  : resolve(repositoryRoot, configuredDatabasePath);

mkdirSync(dirname(databasePath), { recursive: true, mode: 0o700 });

export default defineConfig({
  dialect: 'sqlite',
  schema: resolve(packageDirectory, 'src/schema/index.ts'),
  out: resolve(packageDirectory, 'drizzle'),
  dbCredentials: {
    url: databasePath,
  },
});
