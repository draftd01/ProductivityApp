/**
 * Sidebar.jsx - left-hand navigation.
 *
 * Shows the fixed views (Today, Upcoming, ...) and the list of projects with
 * their open-task counts. Also lets you create and delete projects.
 *
 * Props (from App.jsx):
 *   projects        - array of project objects from the API
 *   refreshProjects - reloads `projects` after a create/delete
 *
 * Links use react-router's <NavLink>, which adds an "active" class to the
 * link matching the current URL (styled in styles.css).
 */
import { useState } from "react";
import { NavLink, useNavigate } from "react-router-dom";
import * as api from "../api/client.js";

/** The built-in views; each `to` path is a route in App.jsx. */
const VIEWS = [
  { to: "/today", label: "Today", icon: "☀" },
  { to: "/upcoming", label: "Upcoming", icon: "→" },
  { to: "/all", label: "All open tasks", icon: "☰" },
  { to: "/completed", label: "Completed", icon: "✓" },
  { to: "/calendar", label: "Calendar", icon: "▦" },
  { to: "/progress", label: "Progress", icon: "↗" },
];

/** Palette offered when creating a project. */
const PROJECT_COLORS = ["#4f6bed", "#e8622c", "#2e9e6a", "#b4489c", "#d29a1c", "#4a90a8"];

export default function Sidebar({ projects, refreshProjects }) {
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");
  const [color, setColor] = useState(PROJECT_COLORS[0]);
  const navigate = useNavigate();

  /** Create a project from the inline form, then open it. */
  async function handleCreate(e) {
    e.preventDefault();
    if (!name.trim()) return;
    const project = await api.createProject({ name: name.trim(), color });
    setName("");
    setAdding(false);
    await refreshProjects();
    navigate(`/project/${project.id}`);
  }

  /** Delete a project after confirmation. Its tasks are kept (moved to "no project"). */
  async function handleDelete(project) {
    if (!window.confirm(`Delete project "${project.name}"? Its tasks will be kept.`)) return;
    await api.deleteProject(project.id);
    await refreshProjects();
    navigate("/all");
  }

  return (
    <nav className="sidebar">
      <div className="brand">Taskboard</div>

      <ul className="nav-list">
        {VIEWS.map((v) => (
          <li key={v.to}>
            <NavLink to={v.to} className="nav-link">
              <span className="nav-icon" aria-hidden="true">{v.icon}</span>
              {v.label}
            </NavLink>
          </li>
        ))}
      </ul>

      <div className="nav-section-header">
        <span>Projects</span>
        <button
          className="icon-btn"
          title="New project"
          aria-label="New project"
          onClick={() => setAdding((a) => !a)}
        >
          +
        </button>
      </div>

      {adding && (
        <form className="project-form" onSubmit={handleCreate}>
          <input
            autoFocus
            placeholder="Project name"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          <div className="color-row">
            {PROJECT_COLORS.map((c) => (
              <button
                type="button"
                key={c}
                className={`color-swatch ${c === color ? "selected" : ""}`}
                style={{ background: c }}
                aria-label={`Color ${c}`}
                onClick={() => setColor(c)}
              />
            ))}
          </div>
          <button className="btn btn-primary btn-small" type="submit">
            Add project
          </button>
        </form>
      )}

      <ul className="nav-list">
        {projects.map((p) => (
          <li key={p.id} className="project-item">
            <NavLink to={`/project/${p.id}`} className="nav-link">
              <span className="project-dot" style={{ background: p.color }} />
              <span className="project-name">{p.name}</span>
              {p.open_task_count > 0 && <span className="count">{p.open_task_count}</span>}
            </NavLink>
            <button
              className="icon-btn project-delete"
              title="Delete project"
              aria-label={`Delete project ${p.name}`}
              onClick={() => handleDelete(p)}
            >
              ×
            </button>
          </li>
        ))}
        {projects.length === 0 && !adding && (
          <li className="muted small sidebar-hint">No projects yet</li>
        )}
      </ul>
    </nav>
  );
}
