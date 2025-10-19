import { Hono } from 'hono';
import projects from './routes/projects';
import type { Env } from './types';

const ALLOWED_METHODS = 'GET,POST,PATCH,DELETE,OPTIONS';

const app = new Hono<Env>();

type OriginMatcher = {
  value: string;
  regex?: RegExp;
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

app.route('/projects', projects);

app.notFound((c) => c.json({ error: 'Not found' }, 404));

app.onError((err, c) => {
  console.error(err);
  return c.json({ error: 'Internal server error' }, 500);
});

export default app;
