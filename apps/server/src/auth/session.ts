import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { eq, lt } from 'drizzle-orm';
import type { Response } from 'express';
import type { AppDatabase } from '@career-scout/database';
import { sessions } from '@career-scout/database';
import type { AuthCookieOptions } from './types.js';

export const SESSION_COOKIE_NAME = 'career_scout_session';
export const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;

export interface CreatedSession {
  token: string;
  expiresAt: Date;
}

export function hashSessionToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export function createSession(db: AppDatabase, userId: string): CreatedSession {
  const token = randomBytes(32).toString('base64url');
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS);

  db.insert(sessions)
    .values({
      id: randomUUID(),
      userId,
      tokenHash: hashSessionToken(token),
      expiresAt,
    })
    .run();

  return { token, expiresAt };
}

export function setSessionCookie(
  response: Response,
  token: string,
  options: AuthCookieOptions,
): void {
  response.cookie(SESSION_COOKIE_NAME, token, {
    httpOnly: true,
    secure: options.secure,
    sameSite: 'lax',
    path: '/',
    maxAge: SESSION_TTL_MS,
  });
}

export function clearSessionCookie(response: Response, options: AuthCookieOptions): void {
  response.clearCookie(SESSION_COOKIE_NAME, {
    httpOnly: true,
    secure: options.secure,
    sameSite: 'lax',
    path: '/',
  });
}

export function getSessionToken(cookieHeader: string | undefined): string | null {
  if (!cookieHeader) return null;

  for (const cookie of cookieHeader.split(';')) {
    const separator = cookie.indexOf('=');
    if (separator < 0) continue;

    const name = cookie.slice(0, separator).trim();
    if (name === SESSION_COOKIE_NAME) {
      const value = cookie.slice(separator + 1).trim();
      return /^[A-Za-z0-9_-]{40,60}$/.test(value) ? value : null;
    }
  }

  return null;
}

export function deleteExpiredSessions(db: AppDatabase): void {
  db.delete(sessions).where(lt(sessions.expiresAt, new Date())).run();
}

export function revokeSession(db: AppDatabase, token: string): void {
  db.delete(sessions).where(eq(sessions.tokenHash, hashSessionToken(token))).run();
}
