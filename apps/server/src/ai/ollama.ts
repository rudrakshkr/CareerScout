export interface OllamaStatus {
  reachable: boolean;
  baseUrl: string;
  models: string[];
  error: string | null;
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

export async function ollamaChatText(options: {
  baseUrl: string;
  model: string | null;
  system: string;
  user: string;
  timeoutMs?: number;
}): Promise<string | null> {
  const cleanBase = options.baseUrl.trim().replace(/\/+$/u, '');
  let model = options.model?.trim() || null;

  if (!model) {
    const status = await inspectOllama(cleanBase);
    if (!status.reachable || status.models.length === 0) return null;
    model = status.models[0];
  }

  try {
    const res = await fetch(`${cleanBase}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model,
        stream: false,
        options: { temperature: 0.25, num_predict: 420 },
        messages: [
          { role: 'system', content: options.system },
          { role: 'user', content: options.user },
        ],
      }),
      signal: AbortSignal.timeout(options.timeoutMs ?? 25_000),
    });
    if (!res.ok) return null;
    const payload = (await res.json()) as { message?: { content?: string } };
    const content = payload.message?.content?.trim();
    return content && content.length >= 40 ? content : null;
  } catch {
    return null;
  }
}
