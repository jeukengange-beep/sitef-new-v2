import { Hono } from 'hono';
import projects from './routes/projects';
import type { Env } from './types';

const ALLOWED_METHODS = 'GET,POST,PATCH,DELETE,OPTIONS';

const app = new Hono<Env>();

type OriginMatcher = {
  value: string;
  regex?: RegExp;
};

type CompletionPayload = {
  choices?: Array<{
    message?: {
      content?: string;
    };
  }>;
};

const escapeRegex = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const parseAllowedOrigins = (raw: string): OriginMatcher[] =>
  raw
    .split(',')
    .map((origin) => origin.trim())
    .filter((origin) => origin.length > 0)
    .map<OriginMatcher>((origin) => {
      if (origin.includes('*')) {
        const pattern = `^${origin.split('*').map(escapeRegex).join('.*')}$`;
        return { value: origin, regex: new RegExp(pattern) };
      }
      return { value: origin };
    });

const findMatchingOrigin = (requestOrigin: string | null, allowed: OriginMatcher[]): string | null => {
  if (!requestOrigin) {
    return null;
  }
  for (const origin of allowed) {
    if (origin.regex) {
      if (origin.regex.test(requestOrigin)) {
        return requestOrigin;
      }
    } else if (origin.value === requestOrigin) {
      return origin.value;
    }
  }
  return null;
};

const parsePositiveInt = (value: string | undefined, fallback: number): number => {
  if (!value) {
    return fallback;
  }
  const parsed = Number.parseInt(value, 10);
  if (Number.isNaN(parsed) || parsed <= 0) {
    return fallback;
  }
  return parsed;
};

const coerceNumber = (value: unknown, fallback: number): number => {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === 'string') {
    const parsed = Number.parseInt(value, 10);
    if (!Number.isNaN(parsed)) {
      return parsed;
    }
  }
  return fallback;
};

const coerceString = (value: unknown): string => (typeof value === 'string' ? value : '');

app.use('*', async (c, next) => {
  const requestOrigin = c.req.header('Origin');
  const allowedOrigins = parseAllowedOrigins(c.env.ORIGIN ?? '');
  const matchedOrigin = findMatchingOrigin(requestOrigin ?? null, allowedOrigins);

  if (requestOrigin && !matchedOrigin) {
    if (c.req.method === 'OPTIONS') {
      return c.json({ error: 'Origin not allowed' }, 403);
    }
    return c.json({ error: 'Origin not allowed' }, 403);
  }

  if (c.req.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: {
        ...(matchedOrigin ? { 'Access-Control-Allow-Origin': matchedOrigin, Vary: 'Origin' } : {}),
        'Access-Control-Allow-Methods': ALLOWED_METHODS,
        'Access-Control-Allow-Headers': 'Content-Type',
        'Access-Control-Max-Age': '86400'
      }
    });
  }

  await next();

  if (matchedOrigin) {
    c.res.headers.set('Access-Control-Allow-Origin', matchedOrigin);
    c.res.headers.set('Vary', 'Origin');
  }
  c.res.headers.set('Access-Control-Allow-Methods', ALLOWED_METHODS);
  c.res.headers.set('Access-Control-Allow-Headers', 'Content-Type');
  c.res.headers.set('Access-Control-Max-Age', '86400');
});

app.get('/health', (c) => c.json({ ok: true }));

app.post('/ai/complete', async (c) => {
  const apiKey = c.env.OPENAI_API_KEY;
  if (!apiKey) {
    return c.json({ error: 'AI integration not configured' }, 500);
  }

  let prompt: unknown;
  let model: unknown;
  try {
    const body = await c.req.json();
    prompt = body.prompt;
    model = body.model;
  } catch (error) {
    console.error('Failed to parse AI request body', error);
    return c.json({ error: 'Invalid JSON payload' }, 400);
  }

  if (typeof prompt !== 'string' || prompt.trim().length === 0) {
    return c.json({ error: 'Prompt is required' }, 400);
  }

  const selectedModel =
    typeof model === 'string' && model.trim().length > 0 ? model : 'gpt-4o-mini';

  let completion: CompletionPayload | undefined;
  try {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: selectedModel,
        messages: [
          {
            role: 'user',
            content: prompt
          }
        ]
      })
    });

    if (!response.ok) {
      const errorPayload = await response.text();
      console.error('OpenAI error', response.status, errorPayload);
      return c.json({ error: 'AI request failed' }, 502);
    }

    completion = (await response.json()) as CompletionPayload;
  } catch (error) {
    console.error('OpenAI request failed', error);
    return c.json({ error: 'AI request failed' }, 502);
  }
  const text = completion?.choices?.[0]?.message?.content?.toString().trim() ?? '';

  return c.json({ text });
});

app.get('/media/pexels', async (c) => {
  const apiKey = c.env.PEXELS_API_KEY;
  if (!apiKey) {
    return c.json({ error: 'Pexels integration not configured' }, 500);
  }

  const query = c.req.query('query');
  if (!query || query.trim().length === 0) {
    return c.json({ error: 'query required' }, 400);
  }

  const page = parsePositiveInt(c.req.query('page'), 1);
  const perPage = parsePositiveInt(c.req.query('per_page'), 10);

  const url = new URL('https://api.pexels.com/v1/search');
  url.searchParams.set('query', query.trim());
  url.searchParams.set('page', String(page));
  url.searchParams.set('per_page', String(perPage));

  let response: Response;
  try {
    response = await fetch(url.toString(), {
      headers: {
        Authorization: apiKey
      }
    });
  } catch (error) {
    console.error('Failed to reach Pexels API', error);
    return c.json({ error: 'Failed to reach Pexels API' }, 502);
  }

  if (!response.ok) {
    let message = `Pexels request failed (${response.status})`;
    try {
      const errorBody = await response.text();
      if (errorBody) {
        message = errorBody;
      }
    } catch (error) {
      console.error('Failed to read Pexels error response', error);
    }
    console.error('Pexels responded with an error', response.status, message);
    return c.json({ error: message }, 502);
  }

  let payload: unknown;
  try {
    payload = await response.json();
  } catch (error) {
    console.error('Failed to parse Pexels response', error);
    return c.json({ error: 'Failed to parse Pexels response' }, 502);
  }

  const photos = Array.isArray((payload as { photos?: unknown }).photos)
    ? ((payload as { photos: unknown[] }).photos).map((photo) => {
        const record = photo as Record<string, unknown>;
        const src = (record.src as Record<string, unknown>) ?? {};
        return {
          id: coerceNumber(record.id, 0),
          photographer: coerceString(record.photographer),
          url: coerceString(record.url),
          src: {
            original: coerceString(src.original),
            large: coerceString(src.large),
            medium: coerceString(src.medium),
            small: coerceString(src.small)
          }
        };
      })
    : [];

  const normalized = {
    photos,
    page: coerceNumber((payload as { page?: unknown }).page, page),
    per_page: coerceNumber((payload as { per_page?: unknown }).per_page, perPage),
    total_results: coerceNumber((payload as { total_results?: unknown }).total_results, photos.length)
  };

  return c.json(normalized);
});

app.route('/projects', projects);

app.notFound((c) => c.json({ error: 'Not found' }, 404));

app.onError((err, c) => {
  console.error(err);
  return c.json({ error: 'Internal server error' }, 500);
});

export default app;
