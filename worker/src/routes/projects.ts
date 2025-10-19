import { Hono } from 'hono';
import type { Env, ProjectRecord } from '../types';

const projects = new Hono<Env>();

const normalizeProject = (row: ProjectRecord | Record<string, unknown>): ProjectRecord => {
  const record = row as Record<string, unknown>;
  const createdAtValue = record.created_at;
  const createdAt = typeof createdAtValue === 'string' ? createdAtValue : new Date().toISOString();

  return {
    id: Number(record.id ?? 0),
    name: String(record.name ?? ''),
    created_at: createdAt
  };
};

const fetchProjectById = async (env: Env['Bindings'], id: number) => {
  const { results } = await env.DB.prepare(
    'SELECT id, name, created_at FROM projects WHERE id = ?'
  )
    .bind(id)
    .all<ProjectRecord>();

  if (!results || results.length === 0) {
    return null;
  }

  return normalizeProject(results[0]);
};

projects.get('/', async (c) => {
  try {
    const { results } = await c.env.DB.prepare(
      'SELECT id, name, created_at FROM projects ORDER BY created_at DESC'
    ).all<ProjectRecord>();

    const items = (results ?? []).map((row) => normalizeProject(row));

    return c.json(items);
  } catch (error) {
    console.error('Failed to list projects', error);
    return c.json({ error: 'Failed to load projects' }, 500);
  }
});

projects.get('/:id', async (c) => {
  const id = Number.parseInt(c.req.param('id'), 10);
  if (Number.isNaN(id)) {
    return c.json({ error: 'Invalid project id' }, 400);
  }

  try {
    const project = await fetchProjectById(c.env, id);
    if (!project) {
      return c.json({ error: 'Project not found' }, 404);
    }
    return c.json(project);
  } catch (error) {
    console.error('Failed to load project', error);
    return c.json({ error: 'Failed to load project' }, 500);
  }
});

projects.post('/', async (c) => {
  const body = await c.req.json<{ name?: string }>().catch(() => null);
  if (!body || typeof body.name !== 'string' || body.name.trim().length === 0) {
    return c.json({ error: 'Name is required' }, 400);
  }

  const name = body.name.trim();
  const createdAt = new Date().toISOString();

  try {
    const result = await c.env.DB.prepare(
      'INSERT INTO projects (name, created_at) VALUES (?, ?)' 
    )
      .bind(name, createdAt)
      .run();

    if (!result.success || result.meta?.last_row_id == null) {
      console.error('Failed to insert project', result);
      return c.json({ error: 'Failed to create project' }, 500);
    }

    const project = await fetchProjectById(c.env, Number(result.meta.last_row_id));
    if (!project) {
      return c.json({ error: 'Failed to load created project' }, 500);
    }

    return c.json(project, 201);
  } catch (error) {
    console.error('Failed to create project', error);
    return c.json({ error: 'Failed to create project' }, 500);
  }
});

projects.patch('/:id', async (c) => {
  const id = Number.parseInt(c.req.param('id'), 10);
  if (Number.isNaN(id)) {
    return c.json({ error: 'Invalid project id' }, 400);
  }

  const body = await c.req.json<{ name?: string }>().catch(() => null);
  if (!body || typeof body.name !== 'string') {
    return c.json({ error: 'Name is required' }, 400);
  }

  const name = body.name.trim();
  if (name.length === 0) {
    return c.json({ error: 'Name cannot be empty' }, 400);
  }

  try {
    const result = await c.env.DB.prepare('UPDATE projects SET name = ? WHERE id = ?')
      .bind(name, id)
      .run();

    if (!result.success) {
      console.error('Failed to update project', result);
      return c.json({ error: 'Failed to update project' }, 500);
    }

    if ((result.meta?.changes ?? 0) === 0) {
      return c.json({ error: 'Project not found' }, 404);
    }

    const project = await fetchProjectById(c.env, id);
    if (!project) {
      return c.json({ error: 'Project not found' }, 404);
    }

    return c.json(project);
  } catch (error) {
    console.error('Failed to update project', error);
    return c.json({ error: 'Failed to update project' }, 500);
  }
});

projects.delete('/:id', async (c) => {
  const id = Number.parseInt(c.req.param('id'), 10);
  if (Number.isNaN(id)) {
    return c.json({ error: 'Invalid project id' }, 400);
  }

  try {
    const result = await c.env.DB.prepare('DELETE FROM projects WHERE id = ?')
      .bind(id)
      .run();

    if (!result.success) {
      console.error('Failed to delete project', result);
      return c.json({ error: 'Failed to delete project' }, 500);
    }

    if ((result.meta?.changes ?? 0) === 0) {
      return c.json({ error: 'Project not found' }, 404);
    }

    return c.json({ ok: true });
  } catch (error) {
    console.error('Failed to delete project', error);
    return c.json({ error: 'Failed to delete project' }, 500);
  }
});

export default projects;
