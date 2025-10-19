import { Hono } from 'hono';
import type { Context } from 'hono';
import type { Env, ProjectRecord } from '../types';

const projects = new Hono<Env>();

type SupabaseConfig = {
  baseUrl: string;
  apiKey: string;
};

type ProjectContext = Context<Env>;

const getSupabaseConfig = (env: Env['Bindings']): SupabaseConfig | null => {
  const baseUrl = env.SUPABASE_URL?.trim();
  const apiKey = env.SUPABASE_SERVICE_ROLE_KEY?.trim();

  if (!baseUrl || !apiKey) {
    return null;
  }

  return {
    baseUrl: baseUrl.replace(/\/$/, ''),
    apiKey
  };
};

const supabaseFetch = (config: SupabaseConfig, path: string, init?: RequestInit) => {
  const url = `${config.baseUrl}${path.startsWith('/') ? path : `/${path}`}`;
  const headers = new Headers(init?.headers ?? {});

  if (!headers.has('apikey')) {
    headers.set('apikey', config.apiKey);
  }
  if (!headers.has('Authorization')) {
    headers.set('Authorization', `Bearer ${config.apiKey}`);
  }
  if (!headers.has('Accept')) {
    headers.set('Accept', 'application/json');
  }

  return fetch(url, {
    ...init,
    headers
  });
};

const respondWithSupabaseError = async (c: ProjectContext, response: Response) => {
  const status = response.status >= 400 ? response.status : 502;
  const rawBody = await response.text();
  let message = 'Supabase request failed';

  if (rawBody) {
    try {
      const parsed = JSON.parse(rawBody);
      if (typeof parsed === 'string') {
        message = parsed;
      } else if (parsed && typeof parsed === 'object') {
        message =
          (parsed.message && String(parsed.message)) ||
          (parsed.error && String(parsed.error)) ||
          (parsed.hint && String(parsed.hint)) ||
          rawBody;
      }
    } catch {
      message = rawBody;
    }
  }

  console.error('Supabase responded with an error', response.status, message);
  return c.json({ error: message }, status);
};

const ensureSupabase = (c: ProjectContext): SupabaseConfig | Response => {
  const config = getSupabaseConfig(c.env);
  if (!config) {
    return c.json({ error: 'Supabase not configured' }, 500);
  }
  return config;
};

projects.get('/', async (c) => {
  const config = ensureSupabase(c);
  if (config instanceof Response) {
    return config;
  }

  let response: Response;
  try {
    response = await supabaseFetch(
      config,
      '/projects?select=id,name,description,created_at&order=created_at.desc'
    );
  } catch (error) {
    console.error('Failed to query Supabase projects', error);
    return c.json({ error: 'Failed to load projects' }, 502);
  }

  if (!response.ok) {
    return respondWithSupabaseError(c, response);
  }

  const records = (await response.json()) as ProjectRecord[];
  return c.json(records ?? []);
});

projects.get('/:id', async (c) => {
  const id = Number.parseInt(c.req.param('id'), 10);
  if (Number.isNaN(id)) {
    return c.json({ error: 'Invalid project id' }, 400);
  }

  const config = ensureSupabase(c);
  if (config instanceof Response) {
    return config;
  }

  let response: Response;
  try {
    response = await supabaseFetch(
      config,
      `/projects?select=id,name,description,created_at&id=eq.${encodeURIComponent(id)}&limit=1`
    );
  } catch (error) {
    console.error('Failed to retrieve project from Supabase', error);
    return c.json({ error: 'Failed to load project' }, 502);
  }

  if (!response.ok) {
    return respondWithSupabaseError(c, response);
  }

  const records = (await response.json()) as ProjectRecord[];
  if (!records || records.length === 0) {
    return c.json({ error: 'Project not found' }, 404);
  }

  return c.json(records[0]);
});

projects.post('/', async (c) => {
  const body = await c.req.json<{ name?: string; description?: string | null }>().catch(() => null);
  if (!body || typeof body.name !== 'string' || body.name.trim().length === 0) {
    return c.json({ error: 'Name is required' }, 400);
  }

  const config = ensureSupabase(c);
  if (config instanceof Response) {
    return config;
  }

  const payload: Record<string, unknown> = {
    name: body.name.trim(),
    created_at: new Date().toISOString()
  };

  if (typeof body.description === 'string') {
    payload.description = body.description.trim();
  } else if (body.description === null) {
    payload.description = null;
  }

  let response: Response;
  try {
    response = await supabaseFetch(config, '/projects?select=id,name,description,created_at', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Prefer: 'return=representation'
      },
      body: JSON.stringify(payload)
    });
  } catch (error) {
    console.error('Failed to create project in Supabase', error);
    return c.json({ error: 'Failed to create project' }, 502);
  }

  if (!response.ok) {
    return respondWithSupabaseError(c, response);
  }

  const records = (await response.json()) as ProjectRecord[];
  const project = records?.[0];
  if (!project) {
    return c.json({ error: 'Failed to load created project' }, 500);
  }

  return c.json(project, 201);
});

projects.patch('/:id', async (c) => {
  const id = Number.parseInt(c.req.param('id'), 10);
  if (Number.isNaN(id)) {
    return c.json({ error: 'Invalid project id' }, 400);
  }

  const body = await c.req.json<{ name?: string; description?: string | null }>().catch(() => null);
  if (!body) {
    return c.json({ error: 'Invalid payload' }, 400);
  }

  const updates: Record<string, unknown> = {};

  if (typeof body.name === 'string') {
    const trimmed = body.name.trim();
    if (trimmed.length === 0) {
      return c.json({ error: 'Name cannot be empty' }, 400);
    }
    updates.name = trimmed;
  }

  if (typeof body.description === 'string') {
    updates.description = body.description.trim();
  } else if (body.description === null) {
    updates.description = null;
  }

  if (Object.keys(updates).length === 0) {
    return c.json({ error: 'No fields provided to update' }, 400);
  }

  const config = ensureSupabase(c);
  if (config instanceof Response) {
    return config;
  }

  let response: Response;
  try {
    response = await supabaseFetch(
      config,
      `/projects?id=eq.${encodeURIComponent(id)}&select=id,name,description,created_at`,
      {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Prefer: 'return=representation'
        },
        body: JSON.stringify(updates)
      }
    );
  } catch (error) {
    console.error('Failed to update project in Supabase', error);
    return c.json({ error: 'Failed to update project' }, 502);
  }

  if (!response.ok) {
    return respondWithSupabaseError(c, response);
  }

  const records = (await response.json()) as ProjectRecord[];
  if (!records || records.length === 0) {
    return c.json({ error: 'Project not found' }, 404);
  }

  return c.json(records[0]);
});

projects.delete('/:id', async (c) => {
  const id = Number.parseInt(c.req.param('id'), 10);
  if (Number.isNaN(id)) {
    return c.json({ error: 'Invalid project id' }, 400);
  }

  const config = ensureSupabase(c);
  if (config instanceof Response) {
    return config;
  }

  let response: Response;
  try {
    response = await supabaseFetch(
      config,
      `/projects?id=eq.${encodeURIComponent(id)}&select=id`,
      {
        method: 'DELETE',
        headers: {
          Prefer: 'return=representation'
        }
      }
    );
  } catch (error) {
    console.error('Failed to delete project in Supabase', error);
    return c.json({ error: 'Failed to delete project' }, 502);
  }

  if (!response.ok) {
    return respondWithSupabaseError(c, response);
  }

  const records = (await response.json()) as ProjectRecord[];
  if (!records || records.length === 0) {
    return c.json({ error: 'Project not found' }, 404);
  }

  return c.json({ ok: true });
});

export default projects;
