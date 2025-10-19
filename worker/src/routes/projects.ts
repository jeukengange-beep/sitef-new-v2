import { Hono } from 'hono';
import type { Env, ProjectRecord } from '../types';

const projects = new Hono<Env>();

projects.get('/', async (c) => {
  const { results } = await c.env.DB.prepare(
    'SELECT id, name, description, created_at FROM projects ORDER BY created_at DESC'
  ).all<ProjectRecord>();

  return c.json(results ?? []);
});

projects.get('/:id', async (c) => {
  const id = Number.parseInt(c.req.param('id'), 10);
  if (Number.isNaN(id)) {
    return c.json({ error: 'Invalid project id' }, 400);
  }

  const result = await c.env.DB.prepare(
    'SELECT id, name, description, created_at FROM projects WHERE id = ?'
  )
    .bind(id)
    .first<ProjectRecord>();

  if (!result) {
    return c.json({ error: 'Project not found' }, 404);
  }

  return c.json(result);
});

projects.post('/', async (c) => {
  const body = await c.req.json<{ name?: string; description?: string | null }>().catch(() => null);
  if (!body || typeof body.name !== 'string' || body.name.trim().length === 0) {
    return c.json({ error: 'Name is required' }, 400);
  }

  const name = body.name.trim();
  const description = typeof body.description === 'string' ? body.description.trim() : null;
  const createdAt = new Date().toISOString();

  const statement = c.env.DB.prepare(
    'INSERT INTO projects (name, description, created_at) VALUES (?1, ?2, ?3)'
  ).bind(name, description, createdAt);

  const { success, error } = await statement.run();
  if (!success) {
    return c.json({ error: error ?? 'Failed to create project' }, 500);
  }

  const project = await c.env.DB.prepare(
    'SELECT id, name, description, created_at FROM projects WHERE id = last_insert_rowid()'
  ).first<ProjectRecord>();

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

  const updates: string[] = [];
  const values: Array<string | number | null> = [];

  if (typeof body.name === 'string') {
    const trimmed = body.name.trim();
    if (trimmed.length === 0) {
      return c.json({ error: 'Name cannot be empty' }, 400);
    }
    updates.push('name = ?');
    values.push(trimmed);
  }

  if (typeof body.description === 'string') {
    updates.push('description = ?');
    values.push(body.description.trim());
  } else if (body.description === null) {
    updates.push('description = NULL');
  }

  if (updates.length === 0) {
    return c.json({ error: 'No fields provided to update' }, 400);
  }

  values.push(id);

  const statement = c.env.DB.prepare(
    `UPDATE projects SET ${updates.join(', ')} WHERE id = ?`
  ).bind(...values);

  const { success, error, changes } = await statement.run();
  if (!success) {
    return c.json({ error: error ?? 'Failed to update project' }, 500);
  }

  if (!changes) {
    return c.json({ error: 'Project not found' }, 404);
  }

  const updated = await c.env.DB.prepare(
    'SELECT id, name, description, created_at FROM projects WHERE id = ?'
  )
    .bind(id)
    .first<ProjectRecord>();

  return c.json(updated);
});

projects.delete('/:id', async (c) => {
  const id = Number.parseInt(c.req.param('id'), 10);
  if (Number.isNaN(id)) {
    return c.json({ error: 'Invalid project id' }, 400);
  }

  const statement = c.env.DB.prepare('DELETE FROM projects WHERE id = ?').bind(id);
  const { success, error, changes } = await statement.run();

  if (!success) {
    return c.json({ error: error ?? 'Failed to delete project' }, 500);
  }

  if (!changes) {
    return c.json({ error: 'Project not found' }, 404);
  }

  return c.json({ ok: true });
});

export default projects;
