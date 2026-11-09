/**
 * QuickAddTask.jsx - the "Add a task…" bar at the top of TasksPage.
 *
 * Type a title, optionally pick a due date and repeat preset, press Enter.
 * More details (notes, description, custom repeats) are edited afterwards in
 * TaskDetailPanel.jsx.
 *
 * Props:
 *   defaultDueDate   - pre-filled due date ("YYYY-MM-DD" or "") e.g. today on /today
 *   defaultProjectId - project to assign (on a project page), or null
 *   onCreated(task)  - called after the API creates the task (parent reloads list)
 */
import { useEffect, useState } from "react";
import * as api from "../api/client.js";
import { REPEAT_PRESETS, ruleFromPreset } from "../utils/recurrence.js";

export default function QuickAddTask({ defaultDueDate = "", defaultProjectId = null, onCreated }) {
  const [title, setTitle] = useState("");
  const [dueDate, setDueDate] = useState(defaultDueDate);
  const [repeat, setRepeat] = useState("none");
  const [error, setError] = useState("");

  // When the page changes (e.g. Today -> Upcoming), reset the default date.
  useEffect(() => setDueDate(defaultDueDate), [defaultDueDate]);

  /** Submit the form: create the task, then clear the title for the next one. */
  async function handleSubmit(e) {
    e.preventDefault();
    if (!title.trim()) return;
    try {
      const task = await api.createTask({
        title: title.trim(),
        due_date: dueDate || null,
        project: defaultProjectId,
        ...ruleFromPreset(repeat, dueDate),
      });
      setTitle("");
      setRepeat("none");
      setError("");
      onCreated?.(task);
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <form className="quick-add" onSubmit={handleSubmit}>
      <input
        className="quick-add-title"
        placeholder="Add a task…"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        aria-label="New task title"
      />
      <input
        type="date"
        value={dueDate}
        onChange={(e) => setDueDate(e.target.value)}
        aria-label="Due date"
      />
      <select value={repeat} onChange={(e) => setRepeat(e.target.value)} aria-label="Repeat">
        {/* "Custom…" needs more inputs, so it's only offered in the detail panel. */}
        {REPEAT_PRESETS.filter((p) => p.value !== "custom").map((p) => (
          <option key={p.value} value={p.value}>
            {p.label}
          </option>
        ))}
      </select>
      <button className="btn btn-primary" type="submit">
        Add
      </button>
      {error && <div className="form-error">{error}</div>}
    </form>
  );
}
