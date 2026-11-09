/**
 * api/client.js - every call from the React app to the Django API.
 *
 * Components never use fetch() directly; they import functions from here.
 * That keeps URLs in one place and mirrors the endpoint list in
 * backend/tasks/views.py. Requests go to relative /api/... URLs, which the
 * Vite dev server proxies to Django (see vite.config.js).
 */

/**
 * Low-level helper: send a JSON request and return the parsed JSON response.
 * Throws an Error with a readable message if the server responds with 4xx/5xx,
 * so callers can `try { ... } catch (e) { show e.message }`.
 */
async function request(path, { method = "GET", body, params } = {}) {
  let url = `/api/${path}`;
  if (params) {
    // Drop empty values so we don't send ?project=&search=
    const clean = Object.fromEntries(
      Object.entries(params).filter(([, v]) => v !== undefined && v !== null && v !== "")
    );
    const qs = new URLSearchParams(clean).toString();
    if (qs) url += `?${qs}`;
  }

  const response = await fetch(url, {
    method,
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });

  if (response.status === 204) return null; // e.g. successful DELETE

  const data = await response.json().catch(() => null);
  if (!response.ok) {
    // DRF validation errors look like {"field": ["message"]}; flatten them.
    const message = data
      ? Object.entries(data)
          .map(([k, v]) => `${k}: ${Array.isArray(v) ? v.join(" ") : v}`)
          .join("; ")
      : `Request failed (${response.status})`;
    throw new Error(message);
  }
  return data;
}

// ---- Projects (Sidebar.jsx, TaskDetailPanel.jsx) --------------------------
export const getProjects = () => request("projects/");
export const createProject = (data) => request("projects/", { method: "POST", body: data });
export const updateProject = (id, data) =>
  request(`projects/${id}/`, { method: "PATCH", body: data });
export const deleteProject = (id) => request(`projects/${id}/`, { method: "DELETE" });

// ---- Tasks (TasksPage.jsx, TaskDetailPanel.jsx) ----------------------------
/** params: { status, view, project, search } - see TaskViewSet in views.py */
export const getTasks = (params) => request("tasks/", { params });
export const getTask = (id) => request(`tasks/${id}/`);
export const createTask = (data) => request("tasks/", { method: "POST", body: data });
export const updateTask = (id, data) => request(`tasks/${id}/`, { method: "PATCH", body: data });
export const deleteTask = (id) => request(`tasks/${id}/`, { method: "DELETE" });
/** Returns { task, next_occurrence } - next_occurrence is set for repeating tasks. */
export const completeTask = (id) => request(`tasks/${id}/complete/`, { method: "POST" });
export const uncompleteTask = (id) => request(`tasks/${id}/uncomplete/`, { method: "POST" });
/** All occurrences of a repeating task's series (TaskCalendar.jsx). */
export const getTaskHistory = (id) => request(`tasks/${id}/history/`);

// ---- Notes (NotesSection.jsx) ---------------------------------------------
export const getNotes = (taskId) => request(`tasks/${taskId}/notes/`);
export const addNote = (taskId, body) =>
  request(`tasks/${taskId}/notes/`, { method: "POST", body: { body } });
export const updateNote = (id, body) => request(`notes/${id}/`, { method: "PATCH", body: { body } });
export const deleteNote = (id) => request(`notes/${id}/`, { method: "DELETE" });

// ---- Calendar & progress (CalendarPage.jsx, ProgressPage.jsx) --------------
/** start/end are "YYYY-MM-DD" strings. */
export const getCalendar = (start, end, project) =>
  request("calendar/", { params: { start, end, project } });
export const getStats = (days = 30) => request("stats/", { params: { days } });
