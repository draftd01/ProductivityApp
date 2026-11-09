/**
 * CalendarPage.jsx - month calendar of everything that happened to your tasks.
 *
 * Each day cell lists events of three kinds (toggle them with the checkboxes):
 *   Created   - a task was added that day
 *   Due       - a task is/was due that day
 *   Completed - a task was finished that day
 * Clicking a day shows its full list on the right; clicking an event opens
 * the task in TaskDetailPanel.
 *
 * Data: GET /api/calendar/?start&end (api.getCalendar), built on the backend
 * in tasks/stats.py -> calendar_events(). The grid is MonthCalendar.jsx.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import * as api from "../api/client.js";
import MonthCalendar from "../components/MonthCalendar.jsx";
import TaskDetailPanel from "../components/TaskDetailPanel.jsx";
import useTaskToggle from "../hooks/useTaskToggle.js";
import { formatDate, monthGridRange, todayISO } from "../utils/dates.js";

const EVENT_TYPES = [
  { key: "created", label: "Created" },
  { key: "due", label: "Due" },
  { key: "completed", label: "Completed" },
];

/** How many events fit in a day cell before showing "+N more". */
const MAX_PER_CELL = 3;

export default function CalendarPage({ projects, refreshProjects }) {
  const now = new Date();
  const [view, setView] = useState({ year: now.getFullYear(), month: now.getMonth() });
  const [events, setEvents] = useState([]);
  const [enabled, setEnabled] = useState({ created: true, due: true, completed: true });
  const [projectFilter, setProjectFilter] = useState("");
  const [selectedDate, setSelectedDate] = useState(todayISO());
  const [selectedTaskId, setSelectedTaskId] = useState(null);

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
  const { toggleComplete, toast } = useTaskToggle(afterChange);
  const closePanel = useCallback(() => setSelectedTaskId(null), []);

  /** Events grouped by date, keeping only the enabled event types. */
  const byDate = useMemo(() => {
    const map = {};
    for (const ev of events) {
      if (!enabled[ev.type]) continue;
      (map[ev.date] ||= []).push(ev);
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
            className={`cal-event ev-${ev.type}`}
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
            <h3>{formatDate(selectedDate)}</h3>
            {dayEvents.length === 0 && <p className="muted small">Nothing on this day.</p>}
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
                      <li key={ev.task_id}>
                        <button className="link-btn" onClick={() => setSelectedTaskId(ev.task_id)}>
                          {ev.is_completed ? <s>{ev.title}</s> : ev.title}
                        </button>
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
        />
      )}
      {toast && <div className="toast" role="status">{toast}</div>}
    </div>
  );
}
