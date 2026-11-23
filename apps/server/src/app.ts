import express, { type Express, type NextFunction, type Request, type Response } from 'express';
import type { AppDatabase } from '@career-scout/database';
import { createAuthRouter } from './routes/auth.js';
import { createProfileRouter } from './routes/profile.js';
import { createResumeRouter } from './routes/resumes.js';
import { resolve } from 'node:path';

export interface AppOptions {
  db: AppDatabase;
  cookieSecure: boolean;
  resumeStorageRoot?: string;
}

export function createApp(options: AppOptions): Express {
  const app = express();

  app.disable('x-powered-by');
  app.use(express.json({ limit: '1mb' }));
  app.use((_request, response, next) => {
    response.setHeader('X-Content-Type-Options', 'nosniff');
    response.setHeader('X-Frame-Options', 'DENY');
    response.setHeader('Referrer-Policy', 'no-referrer');
    response.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
    next();
  });

  app.get('/api/health', (_request: Request, response: Response) => {
    response.status(200).json({
      status: 'ok',
      service: 'career-scout-api',
      timestamp: new Date().toISOString(),
    });
  });

  app.use('/api/auth', createAuthRouter(options.db, { secure: options.cookieSecure }));
  app.use('/api/profile', createProfileRouter(options.db));
  app.use('/api/resumes', createResumeRouter(
    options.db,
    options.resumeStorageRoot ?? resolve(process.cwd(), '.local-job-agent/resumes'),
  ));

  app.use((_request: Request, response: Response) => {
    response.status(404).json({ error: 'Not found' });
  });

  app.use((error: unknown, _request: Request, response: Response, _next: NextFunction) => {
    if (
      error instanceof SyntaxError &&
      typeof error === 'object' &&
      error !== null &&
      'type' in error &&
      error.type === 'entity.parse.failed'
    ) {
      response.status(400).json({ error: 'Invalid JSON request body.' });
      return;
    }

    console.error('[career-scout-api] Unhandled request error:', error);
    response.status(500).json({ error: 'Internal server error.' });
  });

  return app;
}
