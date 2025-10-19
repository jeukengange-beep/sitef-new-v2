import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import {
  createProject,
  deleteProject,
  listProjects,
  updateProject,
  type Project
} from '../api';

const initialFormState = {
  name: '',
  description: ''
};

function ProjectsPage() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState(initialFormState);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const fetchProjects = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await listProjects();
      setProjects(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load projects');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchProjects();
  }, [fetchProjects]);

  const resetForm = useCallback(() => {
    setForm(initialFormState);
    setEditingId(null);
  }, []);

  const handleSubmit = useCallback(
    async (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      setSubmitting(true);
      setError(null);
      try {
        if (editingId) {
          const updated = await updateProject(editingId, {
            name: form.name,
            description: form.description.trim() === '' ? null : form.description
          });
          setProjects((prev) => prev.map((project) => (project.id === updated.id ? updated : project)));
        } else {
          const created = await createProject({
            name: form.name,
            description: form.description.trim() === '' ? undefined : form.description
          });
          setProjects((prev) => [created, ...prev]);
        }
        resetForm();
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Unable to save project');
      } finally {
        setSubmitting(false);
      }
    },
    [editingId, form.description, form.name, resetForm]
  );

  const handleEdit = useCallback((project: Project) => {
    setEditingId(project.id);
    setForm({ name: project.name, description: project.description ?? '' });
  }, []);

  const handleDelete = useCallback(
    async (project: Project) => {
      if (!confirm(`Delete project "${project.name}"?`)) {
        return;
      }
      try {
        await deleteProject(project.id);
        setProjects((prev) => prev.filter((item) => item.id !== project.id));
        if (editingId === project.id) {
          resetForm();
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Unable to delete project');
      }
    },
    [editingId, resetForm]
  );

  const sortedProjects = useMemo(
    () => [...projects].sort((a, b) => (a.created_at < b.created_at ? 1 : -1)),
    [projects]
  );

  return (
    <main className="page">
      <header className="page__header">
        <div>
          <h1>Projects</h1>
          <p>Manage the projects stored in your Cloudflare D1 database.</p>
        </div>
        <button type="button" className="page__refresh" onClick={() => void fetchProjects()} disabled={loading}>
          Refresh
        </button>
      </header>

      <section className="card">
        <h2>{editingId ? 'Edit project' : 'Create a new project'}</h2>
        <form className="form" onSubmit={handleSubmit}>
          <label className="form__field">
            <span>Name</span>
            <input
              name="name"
              value={form.name}
              onChange={(event) => setForm((prev) => ({ ...prev, name: event.target.value }))}
              placeholder="Project name"
              required
              disabled={submitting}
            />
          </label>

          <label className="form__field">
            <span>Description</span>
            <textarea
              name="description"
              value={form.description}
              onChange={(event) => setForm((prev) => ({ ...prev, description: event.target.value }))}
              placeholder="What is this project about?"
              rows={3}
              disabled={submitting}
            />
          </label>

          <div className="form__actions">
            <button type="submit" disabled={submitting}>
              {editingId ? 'Save changes' : 'Create project'}
            </button>
            {editingId && (
              <button type="button" className="button--ghost" onClick={resetForm} disabled={submitting}>
                Cancel
              </button>
            )}
          </div>
        </form>
      </section>

      <section className="card">
        <div className="card__header">
          <h2>Existing projects</h2>
          {loading && <span className="badge">Loading…</span>}
        </div>
        {error && <p className="error">{error}</p>}
        {!loading && sortedProjects.length === 0 && <p>No projects yet.</p>}
        <ul className="project-list">
          {sortedProjects.map((project) => (
            <li key={project.id} className="project-list__item">
              <div>
                <h3>{project.name}</h3>
                {project.description && <p>{project.description}</p>}
                <span className="project-list__meta">
                  Created {new Date(project.created_at).toLocaleString()}
                </span>
              </div>
              <div className="project-list__actions">
                <button type="button" onClick={() => handleEdit(project)}>
                  Edit
                </button>
                <button type="button" className="button--danger" onClick={() => void handleDelete(project)}>
                  Delete
                </button>
              </div>
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
}

export default ProjectsPage;
