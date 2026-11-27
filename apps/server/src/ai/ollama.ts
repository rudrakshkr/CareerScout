export interface OllamaStatus {
  reachable: boolean;
  baseUrl: string;
  models: string[];
  error: string | null;
}

export function stripThinkingTags(raw: string): string {
  return raw
    .replace(/<think>[\s\S]*?<\/think>/giu, '')
    .replace(/<\/?think>/giu, '')
    .trim();
}

export async function inspectOllama(baseUrl: string): Promise<OllamaStatus> {
  const cleanBase = baseUrl.trim().replace(/\/+$/u, '');
  try {
    const res = await fetch(`${cleanBase}/api/tags`, {
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(4000),
    });
    if (!res.ok) {
      return { reachable: false, baseUrl: cleanBase, models: [], error: `Ollama returned HTTP ${res.status}.` };
    }
    const payload = (await res.json()) as { models?: Array<{ name?: string }> };
    const models = (payload.models ?? [])
      .map((m) => m.name?.trim())
      .filter((name): name is string => Boolean(name));
    return { reachable: true, baseUrl: cleanBase, models, error: null };
  } catch (err) {
    return {
      reachable: false,
      baseUrl: cleanBase,
      models: [],
      error: err instanceof Error ? err.message : 'Ollama is not reachable at this URL.',
    };
  }
}

async function resolveActiveModel(cleanBase: string, requestedModel: string | null): Promise<string | null> {
  const trimmed = requestedModel?.trim();
  if (trimmed) return trimmed;
  const status = await inspectOllama(cleanBase);
  if (!status.reachable || status.models.length === 0) return null;
  const preferred = status.models.find((m) => /qwen3\.5:4b|qwen3:4b|gemma3:4b/iu.test(m));
  return preferred ?? status.models[0];
}

async function postOllamaChat(
  cleanBase: string,
  payload: Record<string, unknown>,
  timeoutMs: number,
): Promise<{ message?: { content?: string } } | null> {
  // Send `think: false` so Qwen 3 / Qwen 3.5 / Gemma 4 models output directly without wasting tokens.
  // If an older Ollama server rejects the `think` field with HTTP 400, retry once without it.
  const bodies: Array<Record<string, unknown>> = [
    { ...payload, think: false },
    payload,
  ];

  for (let i = 0; i < bodies.length; i += 1) {
    try {
      const res = await fetch(`${cleanBase}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(bodies[i]),
        signal: AbortSignal.timeout(timeoutMs),
      });
      if (res.status === 400 && i === 0) continue;
      if (!res.ok) return null;
      return (await res.json()) as { message?: { content?: string } };
    } catch {
      return null;
    }
  }
  return null;
}

export async function ollamaChatText(options: {
  baseUrl: string;
  model: string | null;
  system: string;
  user: string;
  timeoutMs?: number;
  numPredict?: number;
  temperature?: number;
}): Promise<string | null> {
  const cleanBase = options.baseUrl.trim().replace(/\/+$/u, '');
  const model = await resolveActiveModel(cleanBase, options.model);
  if (!model) return null;

  const data = await postOllamaChat(
    cleanBase,
    {
      model,
      stream: false,
      keep_alive: '15m',
      options: {
        temperature: options.temperature ?? 0.25,
        num_ctx: 4096,
        num_predict: options.numPredict ?? 480,
      },
      messages: [
        { role: 'system', content: options.system },
        { role: 'user', content: options.user },
      ],
    },
    options.timeoutMs ?? 95_000,
  );

  const raw = data?.message?.content;
  if (!raw) return null;
  const content = stripThinkingTags(raw);
  return content.length >= 40 ? content : null;
}

export function extractJsonObject<T>(raw: string): T | null {
  const cleaned = stripThinkingTags(raw)
    .replace(/^```(?:json)?\s*/iu, '')
    .replace(/\s*```$/u, '')
    .trim();

  try {
    return JSON.parse(cleaned) as T;
  } catch {
    const start = cleaned.indexOf('{');
    const end = cleaned.lastIndexOf('}');
    if (start >= 0 && end > start) {
      try {
        return JSON.parse(cleaned.slice(start, end + 1)) as T;
      } catch {
        return null;
      }
    }
    return null;
  }
}

export async function ollamaChatJson<T>(options: {
  baseUrl: string;
  model: string | null;
  system: string;
  user: string;
  schema?: Record<string, unknown>;
  timeoutMs?: number;
}): Promise<T | null> {
  const cleanBase = options.baseUrl.trim().replace(/\/+$/u, '');
  const model = await resolveActiveModel(cleanBase, options.model);
  if (!model) return null;

  const data = await postOllamaChat(
    cleanBase,
    {
      model,
      stream: false,
      keep_alive: '15m',
      format: options.schema ?? 'json',
      options: {
        temperature: 0,
        num_ctx: 4096,
        num_predict: 220,
      },
      messages: [
        { role: 'system', content: options.system },
        { role: 'user', content: options.user },
      ],
    },
    options.timeoutMs ?? 60_000,
  );

  const raw = data?.message?.content;
  if (!raw) return null;
  return extractJsonObject<T>(raw);
}
