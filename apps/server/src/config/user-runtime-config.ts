import { randomUUID } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { chmod, mkdir, rename, unlink, writeFile } from 'node:fs/promises';
import { isAbsolute, relative, resolve } from 'node:path';

export interface UserRuntimeConfig {
  firecrawlApiKey: string | null;
  githubToken: string | null;
  ollamaBaseUrl: string;
  ollamaModel: string | null;
  smtpHost: string | null;
  smtpPort: number;
  smtpSecure: boolean;
  smtpUser: string | null;
  smtpPass: string | null;
  smtpFromName: string | null;
}

export interface PublicRuntimeConfig {
  firecrawlConfigured: boolean;
  githubTokenConfigured: boolean;
  ollamaBaseUrl: string;
  ollamaModel: string | null;
  smtpConfigured: boolean;
  smtpHost: string | null;
  smtpPort: number;
  smtpSecure: boolean;
  smtpUser: string | null;
  smtpFromName: string | null;
}

const DEFAULT_CONFIG_ROOT = resolve('.local-job-agent/config');

function configPathForUser(userId: string): string {
  const safeId = userId.replace(/[^a-zA-Z0-9_-]/gu, '');
  if (!safeId) throw new Error('Invalid user ID for config.');
  const target = resolve(DEFAULT_CONFIG_ROOT, `${safeId}.json`);
  const rel = relative(DEFAULT_CONFIG_ROOT, target);
  if (!rel || rel.startsWith('..') || isAbsolute(rel)) {
    throw new Error('Invalid user config path.');
  }
  return target;
}

function cleanString(value: unknown, maxLen = 300): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed ? trimmed.slice(0, maxLen) : null;
}

function readStoredUserFile(userId: string): Partial<UserRuntimeConfig> {
  try {
    const file = configPathForUser(userId);
    if (!existsSync(file)) return {};
    const parsed = JSON.parse(readFileSync(file, 'utf8')) as Record<string, unknown>;
    return {
      firecrawlApiKey: cleanString(parsed.firecrawlApiKey, 300),
      githubToken: cleanString(parsed.githubToken, 300),
      ollamaBaseUrl: cleanString(parsed.ollamaBaseUrl, 300) ?? undefined,
      ollamaModel: cleanString(parsed.ollamaModel, 120),
      smtpHost: cleanString(parsed.smtpHost, 200),
      smtpPort: typeof parsed.smtpPort === 'number' && Number.isInteger(parsed.smtpPort) ? parsed.smtpPort : undefined,
      smtpSecure: typeof parsed.smtpSecure === 'boolean' ? parsed.smtpSecure : undefined,
      smtpUser: cleanString(parsed.smtpUser, 200),
      smtpPass: cleanString(parsed.smtpPass, 300),
      smtpFromName: cleanString(parsed.smtpFromName, 120),
    };
  } catch {
    return {};
  }
}

export function getUserRuntimeConfig(userId: string): UserRuntimeConfig {
  const stored = readStoredUserFile(userId);
  const envPort = Number(process.env.SMTP_PORT || 465);
  const smtpPort = stored.smtpPort ?? (Number.isInteger(envPort) && envPort > 0 ? envPort : 465);
  const smtpSecure = stored.smtpSecure ?? (process.env.SMTP_SECURE ? process.env.SMTP_SECURE === 'true' : smtpPort === 465);

  return {
    firecrawlApiKey: stored.firecrawlApiKey ?? cleanString(process.env.FIRECRAWL_API_KEY, 300),
    githubToken: stored.githubToken ?? cleanString(process.env.GITHUB_TOKEN, 300),
    ollamaBaseUrl: stored.ollamaBaseUrl ?? cleanString(process.env.OLLAMA_BASE_URL, 300) ?? 'http://127.0.0.1:11434',
    ollamaModel: stored.ollamaModel ?? cleanString(process.env.OLLAMA_MODEL, 120),
    smtpHost: stored.smtpHost ?? cleanString(process.env.SMTP_HOST, 200),
    smtpPort,
    smtpSecure,
    smtpUser: stored.smtpUser ?? cleanString(process.env.SMTP_USER, 200),
    smtpPass: stored.smtpPass ?? cleanString(process.env.SMTP_PASS, 300),
    smtpFromName: stored.smtpFromName ?? cleanString(process.env.SMTP_FROM_NAME, 120),
  };
}

export function toPublicRuntimeConfig(config: UserRuntimeConfig): PublicRuntimeConfig {
  return {
    firecrawlConfigured: Boolean(config.firecrawlApiKey),
    githubTokenConfigured: Boolean(config.githubToken),
    ollamaBaseUrl: config.ollamaBaseUrl,
    ollamaModel: config.ollamaModel,
    smtpConfigured: Boolean(config.smtpHost && config.smtpUser && config.smtpPass),
    smtpHost: config.smtpHost,
    smtpPort: config.smtpPort,
    smtpSecure: config.smtpSecure,
    smtpUser: config.smtpUser,
    smtpFromName: config.smtpFromName,
  };
}

export async function saveUserRuntimeConfig(
  userId: string,
  patch: Partial<{
    firecrawlApiKey: string | null;
    githubToken: string | null;
    ollamaBaseUrl: string;
    ollamaModel: string | null;
    smtpHost: string | null;
    smtpPort: number;
    smtpSecure: boolean;
    smtpUser: string | null;
    smtpPass: string | null;
    smtpFromName: string | null;
  }>,
): Promise<UserRuntimeConfig> {
  const existing = readStoredUserFile(userId);
  const merged: Record<string, unknown> = { ...existing };

  for (const [key, value] of Object.entries(patch)) {
    if (value === undefined) continue;
    merged[key] = value;
  }

  await mkdir(DEFAULT_CONFIG_ROOT, { recursive: true, mode: 0o700 });
  await chmod(DEFAULT_CONFIG_ROOT, 0o700);
  const target = configPathForUser(userId);
  const tmp = `${target}.${randomUUID()}.tmp`;
  try {
    await writeFile(tmp, Buffer.from(JSON.stringify(merged, null, 2), 'utf8'), { flag: 'wx', mode: 0o600 });
    await rename(tmp, target);
    await chmod(target, 0o600);
  } catch (err) {
    await unlink(tmp).catch(() => undefined);
    throw err;
  }

  return getUserRuntimeConfig(userId);
}
