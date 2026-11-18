/**
 * TaskCalendar.jsx - the per-task calendar inside TaskDetailPanel.jsx.
 *
 * Marks, for this task (and every occurrence of it, if it repeats):
 *   ● created day     ● due day     ● completed day
 * plus a short summary ("Completed 12 times") for repeating tasks.
 *
 * For repeating tasks it also shows future repeats (hollow ring) for the
 * month on screen.
 *
 * Data: GET /api/tasks/<id>/history/ (api.getTaskHistory), which returns all
 * occurrences sharing the task's series_id, and
 * GET /api/tasks/<id>/projection/ (api.getTaskProjection) for the future
 * repeat dates of the visible month - refetched when the month changes.
 * Rendering of the grid is delegated to the reusable MonthCalendar.jsx.
 *
 * Props:
 *   task - the task open in the panel. Its `updated_at` changes after every
 *          save/completion, which triggers a reload here.
 */
import { useEffect, useMemo, useState } from "react";
import * as api from "../api/client.js";
import { localDateOf, monthGridRange, parseISODate } from "../utils/dates.js";
import MonthCalendar from "./MonthCalendar.jsx";

/** Event kinds and their labels; colors come from CSS classes (.mark-created ...). */
const KINDS = [
  { key: "created", label: "Created" },
  { key: "due", label: "Due" },
  { key: "completed", label: "Completed" },
  { key: "projected", label: "Repeats" }, // only shown for repeating tasks
];

export default function TaskCalendar({ task }) {
  const [history, setHistory] = useState([task]);
  const [projected, setProjected] = useState([]); // "YYYY-MM-DD" strings
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

  // Future repeats for the visible month (repeating tasks only). Depends on
  // the month on screen, so it refetches as you navigate.
  useEffect(() => {
    if (!task.is_recurring) {
      setProjected([]);
      return;
    }
    let cancelled = false;
    const { start, end } = monthGridRange(view.year, view.month);
    api.getTaskProjection(task.id, start, end).then((data) => {
      if (!cancelled) setProjected(data.dates);
    });
    return () => {
      cancelled = true;
    };
  }, [task.id, task.updated_at, task.is_recurring, view.year, view.month]);

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
    for (const iso of projected) add(iso, "projected");
    return map;
  }, [history, projected]);

  const legendKinds = task.is_recurring ? KINDS : KINDS.filter((k) => k.key !== "projected");

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
        {legendKinds.map((k) => (
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
