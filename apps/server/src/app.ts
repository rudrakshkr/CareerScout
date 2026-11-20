import express, { type Request, type Response } from 'express';

const app = express();

app.disable('x-powered-by');
app.use(express.json({ limit: '1mb' }));

app.get('/api/health', (_request: Request, response: Response) => {
  response.status(200).json({
    status: 'ok',
    service: 'career-scout-api',
    timestamp: new Date().toISOString(),
  });
});

app.use((_request: Request, response: Response) => {
  response.status(404).json({
    error: 'Not found',
  });
});

export default app;
