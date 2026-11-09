/**
 * App.jsx - the top-level layout and route table.
 *
 * Layout:  [ Sidebar ] [ current page ]
 *
 * Routes (URL -> page component):
 *   /today, /upcoming, /all, /completed  -> TasksPage (different `mode`)
 *   /project/:projectId                  -> TasksPage (mode="project")
 *   /calendar                            -> CalendarPage
 *   /progress                            -> ProgressPage
 *
 * Shared state kept here:
 *   `projects` - loaded once and passed to the Sidebar (navigation + counts)
 *   and to pages (project pickers). Pages call `refreshProjects()` after
 *   changes that affect open-task counts (e.g. completing a task).
 */
import { useCallback, useEffect, useState } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import * as api from "./api/client.js";
import Sidebar from "./components/Sidebar.jsx";
import TasksPage from "./pages/TasksPage.jsx";
import CalendarPage from "./pages/CalendarPage.jsx";
import ProgressPage from "./pages/ProgressPage.jsx";

export default function App() {
  const [projects, setProjects] = useState([]);
  const [loadError, setLoadError] = useState("");

  /** Reload the project list (and their open-task counts) from the API. */
  const refreshProjects = useCallback(async () => {
    try {
      setProjects(await api.getProjects());
      setLoadError("");
    } catch (e) {
      setLoadError("Can't reach the API. Is the Django server running on port 8000?");
    }
  }, []);

  // Load projects once when the app first renders.
  useEffect(() => {
    refreshProjects();
  }, [refreshProjects]);

  // Props every page needs, bundled to keep the route table short.
  const shared = { projects, refreshProjects };

  return (
    <div className="app">
      <Sidebar projects={projects} refreshProjects={refreshProjects} />
      <main className="main">
        {loadError && <div className="banner banner-error">{loadError}</div>}
        <Routes>
          <Route path="/" element={<Navigate to="/today" replace />} />
          <Route path="/today" element={<TasksPage mode="today" {...shared} />} />
          <Route path="/upcoming" element={<TasksPage mode="upcoming" {...shared} />} />
          <Route path="/all" element={<TasksPage mode="all" {...shared} />} />
          <Route path="/completed" element={<TasksPage mode="completed" {...shared} />} />
          <Route path="/project/:projectId" element={<TasksPage mode="project" {...shared} />} />
          <Route path="/calendar" element={<CalendarPage {...shared} />} />
          <Route path="/progress" element={<ProgressPage {...shared} />} />
          <Route path="*" element={<Navigate to="/today" replace />} />
        </Routes>
      </main>
    </div>
  );
}
