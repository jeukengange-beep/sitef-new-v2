export type Project = {
  id: number;
  name: string;
  created_at: string;
};

const BASE_URL = (import.meta.env.VITE_API_BASE_URL ?? '/api').replace(/\/$/, '');

async function handleResponse<T>(response: Response): Promise<T> {
  if (!response.ok) {
    const errorBody = await response.json().catch(() => ({}));
    const message = typeof (errorBody as { error?: unknown }).error === 'string'
      ? (errorBody as { error: string }).error
      : 'Request failed';
    throw new Error(message);
  }
  return response.json() as Promise<T>;
}

export async function listProjects(): Promise<Project[]> {
  const response = await fetch(`${BASE_URL}/projects`, {
    headers: { 'Content-Type': 'application/json' }
  });
  return handleResponse<Project[]>(response);
}

export async function createProject(payload: { name: string }): Promise<Project> {
  const response = await fetch(`${BASE_URL}/projects`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
  return handleResponse<Project>(response);
}

export async function updateProject(id: number, payload: { name: string }): Promise<Project> {
  const response = await fetch(`${BASE_URL}/projects/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
  return handleResponse<Project>(response);
}

export async function deleteProject(id: number): Promise<void> {
  const response = await fetch(`${BASE_URL}/projects/${id}`, {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' }
  });
  await handleResponse<{ ok: boolean }>(response);
}
