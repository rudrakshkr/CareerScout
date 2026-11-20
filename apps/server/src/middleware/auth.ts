import { eq } from 'drizzle-orm';
import type { RequestHandler } from 'express';
import type { AppDatabase } from '@career-scout/database';
import { sessions, users } from '@career-scout/database';
import { getSessionToken, hashSessionToken } from '../auth/session.js';

export function requireAuth(db: AppDatabase): RequestHandler {
  return (request, response, next) => {
    const token = getSessionToken(request.headers.cookie);
    if (!token) {
      response.status(401).json({ error: 'Authentication required.' });
      return;
    }

    const session = db
      .select({
        sessionId: sessions.id,
        expiresAt: sessions.expiresAt,
        id: users.id,
        email: users.email,
        displayName: users.displayName,
      })
      .from(sessions)
      .innerJoin(users, eq(sessions.userId, users.id))
      .where(eq(sessions.tokenHash, hashSessionToken(token)))
      .get();

    if (!session) {
      response.status(401).json({ error: 'Authentication required.' });
      return;
    }

    if (session.expiresAt.getTime() <= Date.now()) {
      db.delete(sessions).where(eq(sessions.id, session.sessionId)).run();
      response.status(401).json({ error: 'Your session has expired. Please sign in again.' });
      return;
    }

    request.auth = {
      id: session.id,
      email: session.email,
      displayName: session.displayName,
    };

    next();
  };
}
