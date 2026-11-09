/**
 * TaskCalendar.jsx - the per-task calendar inside TaskDetailPanel.jsx.
 *
 * Marks, for this task (and every occurrence of it, if it repeats):
 *   ● created day     ● due day     ● completed day
 * plus a short summary ("Completed 12 times") for repeating tasks.
 *
 * Data: GET /api/tasks/<id>/history/ (api.getTaskHistory), which returns all
 * occurrences sharing the task's series_id. Rendering of the grid is
 * delegated to the reusable MonthCalendar.jsx.
 *
 * Props:
 *   task - the task open in the panel. Its `updated_at` changes after every
 *          save/completion, which triggers a reload here.
 */
import { useEffect, useMemo, useState } from "react";
import * as api from "../api/client.js";
import { localDateOf, parseISODate } from "../utils/dates.js";
import MonthCalendar from "./MonthCalendar.jsx";

/** Event kinds and their labels; colors come from CSS classes (.mark-created ...). */
const KINDS = [
  { key: "created", label: "Created" },
  { key: "due", label: "Due" },
  { key: "completed", label: "Completed" },
];

export default function TaskCalendar({ task }) {
  const [history, setHistory] = useState([task]);
  // Start on the month of the due date, else the month it was created.
  const anchor = parseISODate(task.due_date) || new Date(task.created_at);
  const [view, setView] = useState({ year: anchor.getFullYear(), month: anchor.getMonth() });

  // Reload the series history when the task changes or is updated.
  useEffect(() => {
    let cancelled = false;
    api.getTaskHistory(task.id).then((data) => {
      if (!cancelled) setHistory(data);
    });
    return () => {
      cancelled = true;
    };
  }, [task.id, task.updated_at]);

  // Jump to the right month when a different task is opened.
  useEffect(() => {
    setView({ year: anchor.getFullYear(), month: anchor.getMonth() });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [task.id]);

  /** Map of "YYYY-MM-DD" -> Set of kinds that happened that day. */
  const marks = useMemo(() => {
    const map = {};
    const add = (iso, kind) => {
      if (!iso) return;
      (map[iso] ||= new Set()).add(kind);
    };
    for (const t of history) {
      add(localDateOf(t.created_at), "created");
      if (!t.is_completed) add(t.due_date, "due");
      if (t.completed_at) add(localDateOf(t.completed_at), "completed");
    }
    return map;
  }, [history]);

  const completedCount = history.filter((t) => t.is_completed).length;

  return (
    <div className="task-calendar">
      <MonthCalendar
        compact
        year={view.year}
        month={view.month}
        onMonthChange={(year, month) => setView({ year, month })}
        renderDay={(iso) =>
          marks[iso] ? (
            <span className="marks">
              {KINDS.filter((k) => marks[iso].has(k.key)).map((k) => (
                <span key={k.key} className={`mark mark-${k.key}`} title={k.label} />
              ))}
            </span>
          ) : null
        }
      />
      <div className="legend small">
        {KINDS.map((k) => (
          <span key={k.key} className="legend-item">
            <span className={`mark mark-${k.key}`} /> {k.label}
          </span>
        ))}
      </div>
      {task.is_recurring && (
        <p className="muted small">
          Repeating task · completed {completedCount} time{completedCount === 1 ? "" : "s"} across{" "}
          {history.length} occurrence{history.length === 1 ? "" : "s"}
        </p>
      )}
    </div>
  );
}
