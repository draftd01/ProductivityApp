/**
 * TasksPage.jsx - the main task list. One component serves several routes
 * (see App.jsx), switching on the `mode` prop:
 *
 *   mode        API filter                          grouped by
 *   ---------   ---------------------------------   -------------------------
 *   today       open, due today or earlier          Overdue / Today
 *   upcoming    open, due after today               Tomorrow / This week / Later
 *   all         open                                Overdue / Today / ... / No date
 *   completed   completed (newest first)            completion day
 *   project     tasks in :projectId (open, or all   due date, + Completed group
 *               when "Show completed" is ticked)
 *
 * Children: QuickAddTask (create), TaskList -> TaskRow (list),
 * TaskDetailPanel (edit the selected task).
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import * as api from "../api/client.js";
import QuickAddTask from "../components/QuickAddTask.jsx";
import TaskList from "../components/TaskList.jsx";
import TaskDetailPanel from "../components/TaskDetailPanel.jsx";
import useTaskToggle from "../hooks/useTaskToggle.js";
import { addDays, formatDate, localDateOf, toISODate, todayISO } from "../utils/dates.js";

const TITLES = {
  today: "Today",
  upcoming: "Upcoming",
  all: "All open tasks",
  completed: "Completed",
};

const EMPTY_MESSAGES = {
  today: "Nothing due today. Enjoy it — or add something above.",
  upcoming: "No upcoming tasks with a due date.",
  all: "No open tasks. 🎉",
  completed: "No completed tasks yet. Finished tasks are kept here so you can see your progress.",
  project: "No tasks in this project yet.",
};

/**
 * Split open tasks into date buckets. Returns [{title, tasks}] in display order.
 * Tasks arrive already sorted by due date from the API (models.Task.Meta.ordering).
 */
function groupOpenTasks(tasks) {
  const today = todayISO();
  const tomorrow = toISODate(addDays(new Date(), 1));
  const weekEnd = toISODate(addDays(new Date(), 7));
  const groups = {
    Overdue: [],
    Today: [],
    Tomorrow: [],
    "Next 7 days": [],
    Later: [],
    "No due date": [],
  };
  for (const t of tasks) {
    if (!t.due_date) groups["No due date"].push(t);
    else if (t.due_date < today) groups.Overdue.push(t); // ISO strings compare correctly
    else if (t.due_date === today) groups.Today.push(t);
    else if (t.due_date === tomorrow) groups.Tomorrow.push(t);
    else if (t.due_date <= weekEnd) groups["Next 7 days"].push(t);
    else groups.Later.push(t);
  }
  return Object.entries(groups).map(([title, list]) => ({ title, tasks: list }));
}

/** Group completed tasks by the local day they were completed. */
function groupCompletedTasks(tasks) {
  const today = todayISO();
  const yesterday = toISODate(addDays(new Date(), -1));
  const byDay = new Map(); // Map keeps insertion order (newest first from the API)
  for (const t of tasks) {
    const day = localDateOf(t.completed_at);
    const title = day === today ? "Today" : day === yesterday ? "Yesterday" : formatDate(day);
    if (!byDay.has(title)) byDay.set(title, []);
    byDay.get(title).push(t);
  }
  return [...byDay].map(([title, list]) => ({ title, tasks: list }));
}

export default function TasksPage({ mode, projects, refreshProjects }) {
  const { projectId } = useParams(); // only set on /project/:projectId
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState(null);
  const [search, setSearch] = useState("");
  const [showCompleted, setShowCompleted] = useState(false);

  const project = projects.find((p) => String(p.id) === projectId);

  /** Translate the page mode into API query parameters (see TaskViewSet). */
  const params = useMemo(() => {
    const p = { search: search.trim() };
    if (mode === "today") Object.assign(p, { status: "open", view: "today" });
    if (mode === "upcoming") Object.assign(p, { status: "open", view: "upcoming" });
    if (mode === "all") Object.assign(p, { status: "open" });
    if (mode === "completed") Object.assign(p, { status: "completed" });
    if (mode === "project")
      Object.assign(p, { project: projectId, status: showCompleted ? "all" : "open" });
    return p;
  }, [mode, projectId, search, showCompleted]);

  /** Fetch the task list for the current filters. */
  const loadTasks = useCallback(async () => {
    try {
      setTasks(await api.getTasks(params));
    } finally {
      setLoading(false);
    }
  }, [params]);

  // Reload whenever the filters change. A short delay "debounces" typing in
  // the search box so we don't send a request on every keystroke.
  useEffect(() => {
    const id = setTimeout(loadTasks, search ? 250 : 0);
    return () => clearTimeout(id);
  }, [loadTasks, search]);

  // Close the detail panel when switching pages.
  useEffect(() => setSelectedId(null), [mode, projectId]);

  /** After any change: reload this list and the sidebar counts. */
  const afterChange = useCallback(async () => {
    await Promise.all([loadTasks(), refreshProjects()]);
  }, [loadTasks, refreshProjects]);

  const { toggleComplete, toast } = useTaskToggle(afterChange);
  const closePanel = useCallback(() => setSelectedId(null), []);

  /** Decide the groups shown by TaskList for the current mode. */
  const groups = useMemo(() => {
    if (mode === "completed") return groupCompletedTasks(tasks);
    const open = tasks.filter((t) => !t.is_completed);
    const done = tasks.filter((t) => t.is_completed);
    const result = groupOpenTasks(open);
    if (done.length) result.push({ title: "Completed", tasks: done });
    return result;
  }, [tasks, mode]);

  const title = mode === "project" ? project?.name ?? "Project" : TITLES[mode];

  return (
    <div className={`page with-panel ${selectedId ? "panel-open" : ""}`}>
      <div className="page-content">
        <header className="page-header">
          <h1>
            {mode === "project" && project && (
              <span className="project-dot large" style={{ background: project.color }} />
            )}
            {title}
          </h1>
          <div className="page-tools">
            {mode === "project" && (
              <label className="small">
                <input
                  type="checkbox"
                  checked={showCompleted}
                  onChange={(e) => setShowCompleted(e.target.checked)}
                />{" "}
                Show completed
              </label>
            )}
            <input
              type="search"
              placeholder="Search…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              aria-label="Search tasks"
            />
          </div>
        </header>

        {mode !== "completed" && (
          <QuickAddTask
            defaultDueDate={mode === "today" ? todayISO() : ""}
            defaultProjectId={mode === "project" ? Number(projectId) : null}
            onCreated={afterChange}
          />
        )}

        {loading ? (
          <p className="muted">Loading…</p>
        ) : (
          <TaskList
            groups={groups}
            selectedId={selectedId}
            onSelect={(t) => setSelectedId(t.id)}
            onToggle={toggleComplete}
            emptyMessage={search ? "No tasks match your search." : EMPTY_MESSAGES[mode]}
          />
        )}
      </div>

      {selectedId && (
        <TaskDetailPanel
          taskId={selectedId}
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
