/**
 * TaskDetailPanel.jsx - the right-hand panel that opens when you click a task.
 *
 * Sections:
 *   - Complete / ignore (overdue tasks only) / delete buttons, and a banner
 *     with a "Restore" button when the task is ignored
 *   - Editable title, description, project, priority, due date
 *   - Repeat rule            -> RepeatEditor.jsx
 *   - Timeline (created / completed timestamps) + per-task calendar
 *                            -> TaskCalendar.jsx
 *   - Notes                  -> NotesSection.jsx
 *
 * Used by TasksPage.jsx and CalendarPage.jsx.
 *
 * Props:
 *   taskId      - id of the task to show (the panel loads it itself)
 *   projects    - list of projects for the project dropdown
 *   onClose()   - close the panel
 *   onChanged() - tell the parent something changed so it can reload lists
 *   onToggleComplete(task) - completion is handled by the parent page so it
 *                 can show "next occurrence" messages; returns a Promise
 *   onToggleIgnore(task)   - same idea for ignoring / restoring (useTaskToggle.js)
 */
import { useEffect, useState } from "react";
import * as api from "../api/client.js";
import { formatDateTime } from "../utils/dates.js";
import NotesSection from "./NotesSection.jsx";
import RepeatEditor from "./RepeatEditor.jsx";
import TaskCalendar from "./TaskCalendar.jsx";

export default function TaskDetailPanel({
  taskId,
  projects,
  onClose,
  onChanged,
  onToggleComplete,
  onToggleIgnore,
}) {
  const [task, setTask] = useState(null);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [error, setError] = useState("");

  /** Fetch the task from the API and sync the text-field drafts. */
  async function load() {
    try {
      const data = await api.getTask(taskId);
      setTask(data);
      setTitle(data.title);
      setDescription(data.description);
      setError("");
    } catch (e) {
      setError(e.message);
    }
  }

  // Load when the panel opens or switches to another task.
  useEffect(() => {
    setTask(null);
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [taskId]);

  // Close the panel with the Escape key (unless typing in a field).
  useEffect(() => {
    function onKey(e) {
      const typing = ["INPUT", "TEXTAREA", "SELECT"].includes(document.activeElement?.tagName);
      if (e.key === "Escape" && !typing) onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  /** PATCH some fields, update local state and notify the parent page. */
  async function save(patch) {
    try {
      const updated = await api.updateTask(task.id, patch);
      setTask(updated);
      setError("");
      onChanged?.();
    } catch (e) {
      setError(e.message);
    }
  }

  /** Complete or reopen via the parent, then reload to show new timestamps. */
  async function handleToggle() {
    await onToggleComplete(task);
    await load();
  }

  /** Ignore (overdue) or restore (ignored) via the parent, then reload. */
  async function handleIgnoreToggle() {
    await onToggleIgnore(task);
    await load();
  }

  /** Delete the task (with confirmation) and close the panel. */
  async function handleDelete() {
    const extra = task.is_recurring ? " Past occurrences in its history are kept." : "";
    if (!window.confirm(`Delete "${task.title}"?${extra}`)) return;
    await api.deleteTask(task.id);
    onChanged?.();
    onClose();
  }

  if (!task) {
    return (
      <aside className="detail-panel">
        <p className="muted">{error || "Loading…"}</p>
      </aside>
    );
  }

  return (
    <aside className="detail-panel" aria-label="Task details">
      <div className="detail-toolbar">
        <button
          className={`btn ${task.is_completed ? "" : "btn-success"}`}
          onClick={handleToggle}
        >
          {task.is_completed ? "↺ Mark incomplete" : "✓ Mark complete"}
        </button>
        {task.is_overdue && onToggleIgnore && (
          <button
            className="btn"
            onClick={handleIgnoreToggle}
            title="Stop counting this as overdue. It's kept, with its notes, under Ignored."
          >
            Ignore
          </button>
        )}
        <span className="spacer" />
        <button className="btn btn-danger-ghost" onClick={handleDelete}>
          Delete
        </button>
        <button className="icon-btn" onClick={onClose} aria-label="Close panel">
          ×
        </button>
      </div>

      {error && <div className="form-error">{error}</div>}

      {task.is_ignored && (
        <div className="ignored-banner small">
          <span>
            Ignored {formatDateTime(task.ignored_at)}. It doesn't count as overdue.
          </span>
          {onToggleIgnore && (
            <button className="btn btn-small" onClick={handleIgnoreToggle}>
              Restore
            </button>
          )}
        </div>
      )}

      {/* Title and description save when the field loses focus. */}
      <input
        className="detail-title"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        onBlur={() => title.trim() && title !== task.title && save({ title: title.trim() })}
        aria-label="Task title"
      />

      <dl className="fields">
        <dt>Project</dt>
        <dd>
          <select
            value={task.project ?? ""}
            onChange={(e) => save({ project: e.target.value ? Number(e.target.value) : null })}
          >
            <option value="">No project</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </dd>

        <dt>Due date</dt>
        <dd>
          <input
            type="date"
            value={task.due_date || ""}
            onChange={(e) => save({ due_date: e.target.value || null })}
          />
        </dd>

        <dt>Priority</dt>
        <dd>
          <select value={task.priority} onChange={(e) => save({ priority: e.target.value })}>
            <option value="low">Low</option>
            <option value="medium">Medium</option>
            <option value="high">High</option>
          </select>
        </dd>

        <dt>Repeat</dt>
        <dd>
          <RepeatEditor task={task} onSave={save} />
        </dd>
      </dl>

      <h4 className="section-title">Description</h4>
      <textarea
        className="description"
        placeholder="Add more detail…"
        value={description}
        rows={3}
        onChange={(e) => setDescription(e.target.value)}
        onBlur={() => description !== task.description && save({ description })}
      />

      <h4 className="section-title">Timeline</h4>
      <ul className="timeline small">
        <li>
          <span className="mark mark-created" /> Created {formatDateTime(task.created_at)}
        </li>
        {task.is_completed && (
          <li>
            <span className="mark mark-completed" /> Completed {formatDateTime(task.completed_at)}
          </li>
        )}
        {task.is_ignored && (
          <li>
            <span className="mark mark-ignored" /> Ignored {formatDateTime(task.ignored_at)}
          </li>
        )}
      </ul>
      <TaskCalendar task={task} />

      <h4 className="section-title">Notes</h4>
      <NotesSection taskId={task.id} onNotesChanged={onChanged} />
    </aside>
  );
}
