import { config } from 'dotenv';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import app from './app.js';

const currentDirectory = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(currentDirectory, '../../../.env') });

const port = Number.parseInt(process.env.PORT ?? '3001', 10);
const host = process.env.HOST ?? '127.0.0.1';

if (!Number.isInteger(port) || port < 1 || port > 65_535) {
  throw new Error(`Invalid PORT value: ${process.env.PORT ?? ''}`);
}

const server = app.listen(port, host, () => {
  console.log(`CareerScout API listening at http://${host}:${port}`);
});

function shutdown(signal: NodeJS.Signals): void {
  console.log(`\n${signal} received. Shutting down CareerScout API...`);
  server.close((error) => {
    if (error) {
      console.error('Error while shutting down the API:', error);
      process.exitCode = 1;
    }
  });
}

process.once('SIGINT', shutdown);
process.once('SIGTERM', shutdown);
