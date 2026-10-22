import { useEffect, useState } from 'react';
import { api } from '../api';

type Employee = { id: string; name: string };
type Task = { id: string; title: string; description: string; assigneeId: string | null; assigneeName: string | null; priority: string; status: string; progress: number; dueDate: string | null };
type Phase = { id: string; title: string; position: number; status: string; start_date: string | null; due_date: string | null; tasks: Task[] };
type Project = { id: string; title: string; description: string; status: string; start_date: string | null; due_date: string | null; progress: number; phases: Phase[] };

export function Projects({ admin }: { admin: boolean }) {
  const [projects, setProjects] = useState<Project[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [selected, setSelected] = useState<Project | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  async function load() {
    try {
      const result = await api<{ projects: Project[] }>('/api/v1/projects');
      setProjects(result.projects);
      if (admin) setEmployees((await api<{ users: Employee[] }>('/api/v1/auth/users')).users.filter((u: any) => u.active && u.role === 'EMPLOYEE'));
    } catch (e) { setError(e instanceof Error ? e.message : 'No se pudieron cargar los proyectos.'); }
  }

  async function refreshSelected(id = selected?.id) {
    if (!id) return;
    const result = await api<{ project: Project }>(`/api/v1/projects/${id}`);
    setSelected(result.project);
  }

  useEffect(() => { void load(); }, [admin]);

  async function submit(path: string, form: HTMLFormElement, method = 'POST') {
    setBusy(true); setError(''); setNotice('');
    const values: Record<string, FormDataEntryValue | number | null> = Object.fromEntries(new FormData(form).entries());
    for (const key of ['position', 'progress']) if (values[key]) values[key] = Number(values[key]);
    for (const key of ['startDate', 'dueDate']) if (values[key] === '') {
      if (method === 'PATCH' && (path.includes('/phases/') || path.includes('/tasks/'))) values[key] = null;
      else delete values[key];
    }
    if (values.assigneeId === '') {
      if (method === 'PATCH') values.assigneeId = null;
      else delete values.assigneeId;
    }
    try {
      await api(path, { method, body: JSON.stringify(values) });
      if (method === 'POST') form.reset();
      setNotice('Cambios guardados.');
      await load(); await refreshSelected();
    } catch (e) { setError(e instanceof Error ? e.message : 'No se pudo guardar.'); }
    finally { setBusy(false); }
  }

  async function remove(path: string, successMessage: string, archive = false) {
    setBusy(true); setError(''); setNotice('');
    try {
      await api(path, { method: 'DELETE' });
      setNotice(successMessage);
      if (archive) setSelected(null);
      await load(); if (!archive) await refreshSelected();
    } catch (e) { setError(e instanceof Error ? e.message : 'No se pudo completar la acción.'); }
    finally { setBusy(false); }
  }

  async function updateTask(task: Task, status: string) {
    setBusy(true); setError(''); setNotice('');
    try {
      const progress = status === 'DONE' ? 100 : status === 'IN_PROGRESS' ? Math.max(10, task.progress) : task.progress;
      await api(`/api/v1/projects/tasks/${task.id}`, { method: 'PATCH', body: JSON.stringify({ status, progress }) });
      setNotice('Avance actualizado.'); await refreshSelected(); await load();
    } catch (e) { setError(e instanceof Error ? e.message : 'No se pudo actualizar la tarea.'); }
    finally { setBusy(false); }
  }

  return <section className="admin-section projects-section">
    <div className="section-heading"><div><span className="eyebrow">SEGUIMIENTO INTERNO</span><h2>Proyectos y tareas</h2></div></div>
    {error && <div className="alert" role="alert">{error}</div>}{notice && <div className="success" role="status">{notice}</div>}
    {admin && <form className="compact-form project-create" onSubmit={(e) => { e.preventDefault(); void submit('/api/v1/projects', e.currentTarget); }}><h3>Nuevo proyecto</h3><div className="compact-fields"><label>Título<input name="title" required minLength={2} /></label><label>Estado<select name="status"><option>PLANNED</option><option>ACTIVE</option><option>ON_HOLD</option></select></label><label>Inicio<input type="date" name="startDate" /></label><label>Fecha objetivo<input type="date" name="dueDate" /></label><label className="span-all">Descripción<textarea name="description" /></label><button className="button primary" disabled={busy}>Crear proyecto</button></div></form>}
    {projects.length === 0 ? <div className="empty-state">No hay proyectos asignados.</div> : <div className="project-layout">
      <aside className="project-list">{projects.map((project) => <button className={`project-link ${selected?.id === project.id ? 'active' : ''}`} key={project.id} onClick={() => void refreshSelected(project.id)}><b>{project.title}</b><small>{project.status} · {project.progress}% completado</small><progress max="100" value={project.progress} /></button>)}</aside>
      {selected && <div className="project-detail"><h3>{selected.title}</h3><p>{selected.description}</p><p>Avance general: <b>{selected.progress}%</b></p>
        {admin && <>
          <details className="compact-form"><summary>Editar proyecto</summary><form onSubmit={(e) => { e.preventDefault(); void submit(`/api/v1/projects/${selected.id}`, e.currentTarget, 'PATCH'); }}><div className="compact-fields"><label>Título<input name="title" defaultValue={selected.title} required /></label><label>Estado<select name="status" defaultValue={selected.status}><option>PLANNED</option><option>ACTIVE</option><option>ON_HOLD</option><option>COMPLETED</option><option>CANCELLED</option></select></label><label>Inicio<input name="startDate" type="date" defaultValue={selected.start_date?.slice(0, 10) ?? ''} /></label><label>Fecha objetivo<input name="dueDate" type="date" defaultValue={selected.due_date?.slice(0, 10) ?? ''} /></label><label className="span-all">Descripción<textarea name="description" defaultValue={selected.description} /></label><button className="mini-button" disabled={busy}>Guardar proyecto</button></div></form>
          <button type="button" className="button outline" disabled={busy} onClick={() => { if (window.confirm('¿Archivar este proyecto?')) void remove(`/api/v1/projects/${selected.id}`, 'Proyecto archivado.', true); }}>Archivar proyecto</button></details>
          <form className="compact-form" onSubmit={(e) => { e.preventDefault(); void submit(`/api/v1/projects/${selected.id}/phases`, e.currentTarget); }}><h4>Agregar fase</h4><div className="compact-fields"><label>Nombre<input name="title" required /></label><label>Orden<input name="position" type="number" min="1" required /></label><label>Inicio<input name="startDate" type="date" /></label><label>Fecha objetivo<input name="dueDate" type="date" /></label><button className="mini-button" disabled={busy}>Crear fase</button></div></form>
          <form className="compact-form" onSubmit={(e) => { e.preventDefault(); void submit(`/api/v1/projects/${selected.id}/tasks`, e.currentTarget); }}><h4>Nueva tarea</h4><div className="compact-fields"><label>Fase<select name="phaseId" required>{selected.phases.map((phase) => <option key={phase.id} value={phase.id}>{phase.title}</option>)}</select></label><label>Título<input name="title" required /></label><label>Responsable<select name="assigneeId"><option value="">Sin asignar</option>{employees.map((employee) => <option key={employee.id} value={employee.id}>{employee.name}</option>)}</select></label><label>Prioridad<select name="priority"><option>MEDIUM</option><option>LOW</option><option>HIGH</option><option>URGENT</option></select></label><label>Fecha objetivo<input type="date" name="dueDate" /></label><button className="mini-button" disabled={busy}>Crear tarea</button></div></form>
        </>}
        {selected.phases.map((phase) => <section className="phase-card" key={phase.id}>
          <div className="section-heading"><h4>{phase.title}</h4>{admin && <button type="button" className="text-button" disabled={busy || phase.tasks.length > 0} title={phase.tasks.length ? 'La fase debe estar vacía para eliminarla.' : 'Eliminar fase'} onClick={() => void remove(`/api/v1/projects/${selected.id}/phases/${phase.id}`, 'Fase eliminada.')}>Eliminar fase</button>}</div>
          {admin && <details className="compact-form"><summary>Editar fase</summary><form onSubmit={(e) => { e.preventDefault(); void submit(`/api/v1/projects/${selected.id}/phases/${phase.id}`, e.currentTarget, 'PATCH'); }}><div className="compact-fields"><label>Nombre<input name="title" defaultValue={phase.title} /></label><label>Orden<input name="position" type="number" min="1" defaultValue={phase.position} /></label><label>Estado<select name="status" defaultValue={phase.status}><option>PLANNED</option><option>ACTIVE</option><option>COMPLETED</option></select></label><label>Inicio<input type="date" name="startDate" defaultValue={phase.start_date?.slice(0, 10) ?? ''} /></label><label>Fecha objetivo<input type="date" name="dueDate" defaultValue={phase.due_date?.slice(0, 10) ?? ''} /></label><button className="mini-button" disabled={busy}>Guardar fase</button></div></form></details>}
          {phase.tasks.map((task) => <article className="task-row" key={task.id}><div><b>{task.title}</b><small>{task.assigneeName ?? 'Sin asignar'} · {task.priority} · {task.progress}% {task.dueDate && `· vence ${task.dueDate}`}</small></div><select aria-label={`Estado de ${task.title}`} disabled={busy} value={task.status} onChange={(e) => void updateTask(task, e.target.value)}><option>TODO</option><option>IN_PROGRESS</option><option>BLOCKED</option><option>DONE</option></select>{admin && <><details className="compact-form"><summary>Editar</summary><form onSubmit={(e) => { e.preventDefault(); void submit(`/api/v1/projects/tasks/${task.id}`, e.currentTarget, 'PATCH'); }}><div className="compact-fields"><label>Título<input name="title" defaultValue={task.title} /></label><label>Responsable<select name="assigneeId" defaultValue={task.assigneeId ?? ''}><option value="">Sin asignar</option>{employees.map((employee) => <option key={employee.id} value={employee.id}>{employee.name}</option>)}</select></label><label>Prioridad<select name="priority" defaultValue={task.priority}><option>LOW</option><option>MEDIUM</option><option>HIGH</option><option>URGENT</option></select></label><label>Fecha objetivo<input type="date" name="dueDate" defaultValue={task.dueDate?.slice(0, 10) ?? ''} /></label><button className="mini-button" disabled={busy}>Guardar tarea</button></div></form></details><button type="button" className="text-button" disabled={busy} onClick={() => { if (window.confirm('¿Eliminar esta tarea y su historial?')) void remove(`/api/v1/projects/tasks/${task.id}`, 'Tarea eliminada.'); }}>Eliminar tarea</button></>}</article>)}
          {phase.tasks.length === 0 && <p className="muted-small">Sin tareas en esta fase.</p>}
        </section>)}
      </div>}
    </div>}
  </section>;
}
