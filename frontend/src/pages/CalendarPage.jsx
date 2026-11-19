/**
 * CalendarPage.jsx - month calendar of everything that happened to your tasks.
 *
 * Each day cell lists events of three kinds (toggle them with the checkboxes):
 *   Created   - a task was added that day -- DON'T WANT THIS ON CALENDAR PAGE, ONLY IN LIST/TABLE VIEW
 *   Due       - a task is/was due that day (today or earlier)
 *   Upcoming  - an open task due after today (a "due" event re-labelled
 *               on the frontend, so it gets its own color)
 *   Completed - a task was finished that day
 *   Repeats   - ("projected") a future date an open repeating task will
 *               recur on. Display only; clicking opens the open occurrence.
 * Events belonging to completed or ignored tasks are shown faded (completed
 * ones also struck through), and a task appears
 * at most once per day (a task due and completed the same day shows only
 * as Completed).
 * Clicking a day shows its full list on the right; clicking an event opens
 * the task in TaskDetailPanel. The "+ Add task" button in that side section
 * opens QuickAddTask with the selected day as the due date (and the
 * project filter, if one is chosen, as the project).
 * Repeating tasks get "Done" / "Remove" buttons in that side list, like
 * Google Calendar: Done completes that ONE day; Remove asks "This day" (e.g.
 * a holiday: that day disappears, with Undo in the toast) or "This &
 * following" (the series ends there). Both use
 * POST /api/tasks/<id>/occurrence/ through useTaskToggle.js.
 *
 * Data: GET /api/calendar/?start&end (api.getCalendar), built on the backend
 * in tasks/stats.py -> calendar_events(). The grid is MonthCalendar.jsx.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import * as api from "../api/client.js";
import MonthCalendar from "../components/MonthCalendar.jsx";
import QuickAddTask from "../components/QuickAddTask.jsx";
import TaskDetailPanel from "../components/TaskDetailPanel.jsx";
import useTaskToggle from "../hooks/useTaskToggle.js";
import { formatDate, monthGridRange, todayISO } from "../utils/dates.js";
import { followingWarning } from "../utils/recurrence.js";

const EVENT_TYPES = [
  //{ key: "created", label: "Created" },
  { key: "due", label: "Due" },
  { key: "upcoming", label: "Upcoming" },
  { key: "completed", label: "Completed" },
  { key: "projected", label: "Repeats" },
];

/**
 * When one task has several events on the same day (e.g. due and completed
 * on Nov 16), only the highest-ranked one is shown, so each task appears
 * once per day.
 */
const TYPE_RANK = { created: 0, projected: 1, due: 2, upcoming: 2, completed: 3 };

/** Re-label open "due" events after today as "upcoming" so they get their own color. */
function displayType(ev, today) {
  if (ev.type === "due" && !ev.is_completed && !ev.is_ignored && ev.date > today) return "upcoming";
  return ev.type;
}

/**
 * True for a still-to-do day of a repeating task: a projected future repeat,
 * or the open occurrence's own due date. These get per-day "Done" / "Remove"
 * buttons in the side list.
 */
function isOpenRepeat(ev) {
  if (ev.type === "projected") return true;
  return ev.is_recurring && !ev.is_completed && !ev.is_ignored && (ev.type === "due" || ev.type === "upcoming");
}

/** How many events fit in a day cell before showing "+N more". */
const MAX_PER_CELL = 3;

export default function CalendarPage({ projects, refreshProjects }) {
  const now = new Date();
  const [view, setView] = useState({ year: now.getFullYear(), month: now.getMonth() });
  const [events, setEvents] = useState([]);
  const [enabled, setEnabled] = useState({ due: true, upcoming: true, completed: true, projected: true }); //created: true,
  const [projectFilter, setProjectFilter] = useState("");
  const [selectedDate, setSelectedDate] = useState(todayISO());
  const [selectedTaskId, setSelectedTaskId] = useState(null);
  const [adding, setAdding] = useState(false); // is the "add task" form open?

  /** Fetch events covering every day visible in the month grid. */
  const loadEvents = useCallback(async () => {
    const { start, end } = monthGridRange(view.year, view.month);
    setEvents(await api.getCalendar(start, end, projectFilter));
  }, [view, projectFilter]);

  useEffect(() => {
    loadEvents();
  }, [loadEvents]);

  const afterChange = useCallback(async () => {
    await Promise.all([loadEvents(), refreshProjects()]);
  }, [loadEvents, refreshProjects]);
  const { toggleComplete, toggleIgnore, completeDay, removeDay, toast } = useTaskToggle(afterChange);
  const closePanel = useCallback(() => setSelectedTaskId(null), []);

  // The event whose "Remove: This day / This & following" choice is showing.
  const [removing, setRemoving] = useState(null);
  useEffect(() => setRemoving(null), [selectedDate]);

  /**
   * Remove one day ("one") or that day and all following ("following") of a
   * repeating task. If the removed task is open in the panel and got deleted
   * (not just moved to its next date), close the panel.
   */
  async function handleRemove(ev, scope) {
    setRemoving(null);
    if (scope === "following" && !window.confirm(followingWarning(ev.title, ev.date))) return;
    const result = await removeDay(ev.task_id, ev.title, ev.date, scope);
    if (result && !result.task && ev.type !== "projected" && selectedTaskId === ev.task_id) {
      closePanel();
    }
  }

  /** After the add form creates a task: close the form and reload the calendar. */
  async function handleTaskCreated() {
    setAdding(false);
    await afterChange();
  }

  /**
   * Events grouped by date: first reduced to one entry per task per day (see
   * TYPE_RANK), then filtered by the enabled types. Merging before filtering
   * means a task due and completed the same day is hidden entirely when
   * "Completed" is off, rather than falling back to its "Due" event.
   */
  const byDate = useMemo(() => {
    const perDay = {}; // date -> { task_id -> event }
    const today = todayISO();
    for (const raw of events) {
      const ev = { ...raw, type: displayType(raw, today) };
      const day = (perDay[ev.date] ||= {});
      const existing = day[ev.task_id];
      if (!existing || TYPE_RANK[ev.type] > TYPE_RANK[existing.type]) day[ev.task_id] = ev;
    }
    // Back to date -> list, preserving the backend's sort order.
    const map = {};
    for (const raw of events) {
      const ev = perDay[raw.date]?.[raw.task_id];
      if (ev && enabled[ev.type] && !map[raw.date]?.includes(ev)) (map[raw.date] ||= []).push(ev);
    }
    return map;
  }, [events, enabled]);

  /** Contents of one day cell (passed to MonthCalendar as renderDay). */
  function renderDay(iso) {
    const list = byDate[iso] || [];
    return (
      <ul className="cal-events">
        {list.slice(0, MAX_PER_CELL).map((ev) => (
          <li
            key={`${ev.type}-${ev.task_id}`}
            className={`cal-event ev-${ev.type}${ev.is_completed ? " is-done" : ""}${
              ev.is_ignored ? " is-ignored" : ""
            }`}
            title={`${ev.type}: ${ev.title}`}
            onClick={(e) => {
              e.stopPropagation();
              setSelectedTaskId(ev.task_id);
            }}
          >
            <span className={`mark mark-${ev.type}`} />
            <span className="cal-event-title">{ev.title}</span>
          </li>
        ))}
        {list.length > MAX_PER_CELL && (
          <li className="cal-more">+{list.length - MAX_PER_CELL} more</li>
        )}
      </ul>
    );
  }

  const dayEvents = byDate[selectedDate] || [];

  return (
    <div className={`page with-panel ${selectedTaskId ? "panel-open" : ""}`}>
      <div className="page-content">
        <header className="page-header">
          <h1>Calendar</h1>
          <div className="page-tools">
            {EVENT_TYPES.map((t) => (
              <label key={t.key} className="small filter-toggle">
                <input
                  type="checkbox"
                  checked={enabled[t.key]}
                  onChange={(e) => setEnabled({ ...enabled, [t.key]: e.target.checked })}
                />
                <span className={`mark mark-${t.key}`} /> {t.label}
              </label>
            ))}
            <select
              value={projectFilter}
              onChange={(e) => setProjectFilter(e.target.value)}
              aria-label="Filter by project"
            >
              <option value="">All projects</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>
        </header>

        <div className="calendar-layout">
          <MonthCalendar
            year={view.year}
            month={view.month}
            onMonthChange={(year, month) => setView({ year, month })}
            renderDay={renderDay}
            selectedDate={selectedDate}
            onSelectDate={setSelectedDate}
          />

          <section className="day-list" aria-label="Selected day">
            <div className="day-list-header">
              <h3>{formatDate(selectedDate)}</h3>
              {!adding && (
                <button className="btn btn-small" onClick={() => setAdding(true)}>
                  + Add task
                </button>
              )}
            </div>
            {adding && (
              <QuickAddTask
                compact
                autoFocus
                defaultDueDate={selectedDate}
                defaultProjectId={projectFilter ? Number(projectFilter) : null}
                onCreated={handleTaskCreated}
                onCancel={() => setAdding(false)}
              />
            )}
            {dayEvents.length === 0 && !adding && (
              <p className="muted small">Nothing on this day.</p>
            )}
            {EVENT_TYPES.map((t) => {
              const items = dayEvents.filter((ev) => ev.type === t.key);
              if (!items.length) return null;
              return (
                <div key={t.key} className="day-group">
                  <h4 className="small">
                    <span className={`mark mark-${t.key}`} /> {t.label} ({items.length})
                  </h4>
                  <ul>
                    {items.map((ev) => (
                      <li
                        key={ev.task_id}
                        className={ev.is_completed ? "is-done" : ev.is_ignored ? "is-ignored" : undefined}
                        title={ev.is_ignored ? "Ignored" : undefined}
                      >
                        <button className="link-btn" onClick={() => setSelectedTaskId(ev.task_id)}>
                          {ev.is_completed ? <s>{ev.title}</s> : ev.title}
                        </button>
                        {isOpenRepeat(ev) && removing !== ev && (
                          <span className="day-actions">
                            <button
                              className="link-btn small"
                              title="Mark only this day as done"
                              onClick={() => completeDay(ev.task_id, ev.title, ev.date)}
                            >
                              Done
                            </button>
                            <button
                              className="link-btn small danger"
                              title="Remove this day, or this day and all following"
                              onClick={() => setRemoving(ev)}
                            >
                              Remove
                            </button>
                          </span>
                        )}
                        {removing === ev && (
                          <span className="remove-choice small">
                            Remove:
                            <button className="link-btn danger" onClick={() => handleRemove(ev, "one")}>
                              This day
                            </button>
                            <button className="link-btn danger" onClick={() => handleRemove(ev, "following")}>
                              This &amp; following
                            </button>
                            <button className="link-btn" onClick={() => setRemoving(null)}>
                              Cancel
                            </button>
                          </span>
                        )}
                      </li>
                    ))}
                  </ul>
                </div>
              );
            })}
          </section>
        </div>
      </div>

      {selectedTaskId && (
        <TaskDetailPanel
          taskId={selectedTaskId}
          projects={projects}
          onClose={closePanel}
          onChanged={afterChange}
          onToggleComplete={toggleComplete}
          onToggleIgnore={toggleIgnore}
          onRemoveDay={removeDay}
        />
      )}
      {toast && <div className="toast" role="status">{toast}</div>}
    </div>
  );
}
