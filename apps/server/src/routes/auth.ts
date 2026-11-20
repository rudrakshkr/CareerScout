import { eq } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import { Router, type RequestHandler } from 'express';
import type { AppDatabase, User } from '@career-scout/database';
import { profiles, users } from '@career-scout/database';
import {
  hashPassword,
  performDummyPasswordVerification,
  validatePassword,
  verifyPassword,
} from '../auth/password.js';
import {
  clearSessionCookie,
  createSession,
  deleteExpiredSessions,
  getSessionToken,
  revokeSession,
  setSessionCookie,
} from '../auth/session.js';
import type { AuthCookieOptions } from '../auth/types.js';
import { requireAuth } from '../middleware/auth.js';
import { createRateLimiter } from '../middleware/rate-limit.js';

const RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000;
const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function publicUser(user: User) {
  return {
    id: user.id,
    email: user.email,
    displayName: user.displayName,
    createdAt: user.createdAt.toISOString(),
  };
}

function isUniqueEmailError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  return error.message.includes('UNIQUE constraint failed: users.email');
}

const requireSameOrigin: RequestHandler = (request, response, next) => {
  const origin = request.get('origin');
  if (!origin) {
    next();
    return;
  }

  try {
    const originUrl = new URL(origin);
    const requestHost = request.get('host');
    if (!requestHost || originUrl.host.toLowerCase() !== requestHost.toLowerCase()) {
      response.status(403).json({ error: 'Cross-origin request rejected.' });
      return;
    }
    next();
  } catch {
    response.status(403).json({ error: 'Invalid request origin.' });
  }
};

export function createAuthRouter(db: AppDatabase, cookieOptions: AuthCookieOptions): Router {
  const router = Router();
  const requireLoginRateLimit = createRateLimiter({
    windowMs: RATE_LIMIT_WINDOW_MS,
    maxRequests: 10,
    message: 'Too many sign-in attempts. Please try again in 15 minutes.',
  });
  const requireRegistrationRateLimit = createRateLimiter({
    windowMs: RATE_LIMIT_WINDOW_MS,
    maxRequests: 5,
    message: 'Too many registration attempts. Please try again in 15 minutes.',
  });

  router.use((_request, response, next) => {
    response.setHeader('Cache-Control', 'no-store');
    next();
  });

  router.post('/register', requireRegistrationRateLimit, requireSameOrigin, async (request, response) => {
    const body: unknown = request.body;
    if (!isRecord(body)) {
      response.status(400).json({ error: 'A JSON request body is required.' });
      return;
    }

    const displayName = typeof body.displayName === 'string' ? body.displayName.trim() : '';
    const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
    const password = typeof body.password === 'string' ? body.password : '';

    if (displayName.length < 2 || [...displayName].length > 80 || /[\u0000-\u001F\u007F]/u.test(displayName)) {
      response.status(400).json({ error: 'Name must be between 2 and 80 characters.' });
      return;
    }

    if (email.length > 254 || !emailPattern.test(email)) {
      response.status(400).json({ error: 'Enter a valid email address.' });
      return;
    }

    const passwordError = validatePassword(password);
    if (passwordError) {
      response.status(400).json({ error: passwordError });
      return;
    }

    const existingUser = db.select({ id: users.id }).from(users).where(eq(users.email, email)).get();
    if (existingUser) {
      response.status(409).json({ error: 'An account with this email already exists.' });
      return;
    }

    const userId = randomUUID();
    const passwordHash = await hashPassword(password);

    try {
      const newUser = {
        id: userId,
        email,
        passwordHash,
        displayName,
      };

      db.transaction((transaction) => {
        transaction.insert(users).values(newUser).run();
        transaction.insert(profiles).values({ userId }).run();
      });

      // The user row must exist before its session is inserted (foreign-key constraint).
      const createdSession = createSession(db, userId);
      const createdUser = db.select().from(users).where(eq(users.id, userId)).get();

      if (!createdUser) {
        revokeSession(db, createdSession.token);
        response.status(500).json({ error: 'Unable to create the account.' });
        return;
      }

      setSessionCookie(response, createdSession.token, cookieOptions);
      response.status(201).json({ user: publicUser(createdUser) });
    } catch (error) {
      if (isUniqueEmailError(error)) {
        response.status(409).json({ error: 'An account with this email already exists.' });
        return;
      }
      throw error;
    }
  });

  router.post('/login', requireLoginRateLimit, requireSameOrigin, async (request, response) => {
    const body: unknown = request.body;
    if (!isRecord(body)) {
      response.status(400).json({ error: 'A JSON request body is required.' });
      return;
    }

    const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
    const password = typeof body.password === 'string' ? body.password : '';

    if (!email || email.length > 254 || !password || Buffer.byteLength(password, 'utf8') > 1024) {
      response.status(400).json({ error: 'Enter your email and password.' });
      return;
    }

    const user = db.select().from(users).where(eq(users.email, email)).get();
    if (!user) {
      await performDummyPasswordVerification(password);
      response.status(401).json({ error: 'Invalid email or password.' });
      return;
    }

    const passwordMatches = await verifyPassword(password, user.passwordHash);
    if (!passwordMatches) {
      response.status(401).json({ error: 'Invalid email or password.' });
      return;
    }

    deleteExpiredSessions(db);
    const session = createSession(db, user.id);
    setSessionCookie(response, session.token, cookieOptions);
    response.status(200).json({ user: publicUser(user) });
  });

  router.get('/me', requireAuth(db), (request, response) => {
    const authenticatedUser = request.auth;
    if (!authenticatedUser) {
      response.status(401).json({ error: 'Authentication required.' });
      return;
    }

    const profile = db.select().from(profiles).where(eq(profiles.userId, authenticatedUser.id)).get();
    response.status(200).json({ user: authenticatedUser, profile: profile ?? null });
  });

  router.post('/logout', requireSameOrigin, (request, response) => {
    const token = getSessionToken(request.headers.cookie);
    if (token) revokeSession(db, token);
    clearSessionCookie(response, cookieOptions);
    response.status(204).end();
  });

  return router;
}
