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

app.route('/projects', projects);

app.notFound((c) => c.json({ error: 'Not found' }, 404));

app.onError((err, c) => {
  console.error(err);
  return c.json({ error: 'Internal server error' }, 500);
});

export default app;
