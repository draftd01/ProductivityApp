/**
 * TaskRow.jsx - one task line in a list: checkbox, title and small badges
 * (due date, project, repeat, note count).
 *
 * Rendered by TaskList.jsx. Clicking the row opens the task in
 * TaskDetailPanel; clicking the checkbox toggles completion. Overdue tasks
 * get an "Ignore" button (shown on hover); ignored tasks show when they
 * were ignored instead of a due date.
 *
 * Props:
 *   task         - task object from the API
 *   selected     - true if this task is open in the detail panel (highlight)
 *   onSelect()   - open the detail panel for this task
 *   onToggle()   - complete / un-complete the task
 *   onIgnore()   - ignore an overdue task (optional; hides the button if absent)
 */
import { dueLabel, formatDateTime } from "../utils/dates.js";
import { describeRepeat } from "../utils/recurrence.js";

export default function TaskRow({ task, selected, onSelect, onToggle, onIgnore }) {
  const repeatText = describeRepeat(task);
  const stateClass = task.is_completed ? "done" : task.is_ignored ? "ignored" : "";

  return (
    <li
      className={`task-row ${selected ? "selected" : ""} ${stateClass}`}
      onClick={onSelect}
    >
      <button
        className={`check ${task.is_completed ? "checked" : ""}`}
        aria-label={task.is_completed ? "Mark as not done" : "Mark as done"}
        onClick={(e) => {
          e.stopPropagation(); // don't also open the detail panel
          onToggle();
        }}
      >
        {task.is_completed ? "✓" : ""}
      </button>

      <span className="task-title">
        {task.priority === "high" && !task.is_completed && (
          <span className="priority-flag" title="High priority">!</span>
        )}
        {task.title}
      </span>

      <span className="task-meta">
        {task.note_count > 0 && (
          <span className="badge" title={`${task.note_count} note(s)`}>
            ✎ {task.note_count}
          </span>
        )}
        {repeatText && (
          <span className="badge" title={repeatText}>
            ↻
          </span>
        )}
        {task.project_name && (
          <span className="badge project-badge">
            <span className="project-dot" style={{ background: task.project_color }} />
            {task.project_name}
          </span>
        )}
        {task.is_overdue && onIgnore && (
          <button
            className="link-btn ignore-btn small"
            title="Stop counting this as overdue (it's kept, with its notes)"
            onClick={(e) => {
              e.stopPropagation(); // don't also open the detail panel
              onIgnore();
            }}
          >
            Ignore
          </button>
        )}
        {task.is_completed ? (
          <span className="due muted">Done {formatDateTime(task.completed_at)}</span>
        ) : task.is_ignored ? (
          <span className="due muted">Ignored {formatDateTime(task.ignored_at)}</span>
        ) : (
          task.due_date && (
            <span className={`due ${task.is_overdue ? "overdue" : ""}`}>
              {dueLabel(task.due_date)}
            </span>
          )
        )}
      </span>
    </li>
  );
}
