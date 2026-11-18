/**
 * QuickAddTask.jsx - the "Add a task…" form.
 *
 * Used in two places:
 *   - TasksPage.jsx    : the full-width bar at the top of the task list
 *   - CalendarPage.jsx : a compact, stacked version in the selected-day
 *                        panel, pre-filled with the selected day as due date
 *
 * Type a title, optionally pick a due date and repeat preset, press Enter.
 * More details (notes, description, custom repeats) are edited afterwards in
 * TaskDetailPanel.jsx.
 *
 * Props:
 *   defaultDueDate   - pre-filled due date ("YYYY-MM-DD" or "") e.g. today on /today
 *   defaultProjectId - project to assign (on a project page), or null
 *   onCreated(task)  - called after the API creates the task (parent reloads list)
 *   compact          - stack the fields vertically for narrow spaces (optional)
 *   autoFocus        - put the cursor in the title field on mount (optional)
 *   onCancel()       - if given, shows a Cancel button that calls it (optional)
 */
import { useEffect, useState } from "react";
import * as api from "../api/client.js";
import { REPEAT_PRESETS, repeatRuleFromPreset } from "../utils/recurrence.js";

export default function QuickAddTask({
  defaultDueDate = "",
  defaultProjectId = null,
  onCreated,
  compact = false,
  autoFocus = false,
  onCancel,
}) {
  const [title, setTitle] = useState("");
  const [dueDate, setDueDate] = useState(defaultDueDate);
  const [repeat, setRepeat] = useState("none");
  const [error, setError] = useState("");

  // When the page changes (e.g. Today -> Upcoming), or a different day is
  // selected on the calendar, reset the default date.
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
        ...repeatRuleFromPreset(repeat, dueDate),
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
    <form className={`quick-add ${compact ? "compact" : ""}`} onSubmit={handleSubmit}>
      <input
        className="quick-add-title"
        placeholder="Add a task…"
        value={title}
        autoFocus={autoFocus}
        onChange={(e) => setTitle(e.target.value)}
        onKeyDown={(e) => e.key === "Escape" && onCancel?.()}
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
      <div className="quick-add-actions">
        <button className="btn btn-primary" type="submit">
          Add
        </button>
        {onCancel && (
          <button className="btn" type="button" onClick={onCancel}>
            Cancel
          </button>
        )}
      </div>
      {error && <div className="form-error">{error}</div>}
    </form>
  );
}
