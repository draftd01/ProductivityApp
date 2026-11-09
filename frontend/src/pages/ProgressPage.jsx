/**
 * ProgressPage.jsx - shows how you're doing over time.
 *
 *   - Stat tiles: completed today / this week, current and longest streak,
 *     open and overdue counts
 *   - CompletionChart: tasks completed per day over the last 30/90/365 days
 *   - Recently completed: the latest finished tasks (kept forever in the DB)
 *
 * Data:
 *   GET /api/stats/?days=N   (api.getStats)  -> backend tasks/stats.py progress_stats()
 *   GET /api/tasks/?status=completed          -> recent completions list
 */
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import * as api from "../api/client.js";
import CompletionChart from "../components/CompletionChart.jsx";
import { formatDateTime } from "../utils/dates.js";

const RANGES = [30, 90, 365];

/** One headline number with a label underneath. */
function StatTile({ label, value, hint, tone }) {
  return (
    <div className={`stat-tile ${tone || ""}`}>
      <div className="stat-value">{value}</div>
      <div className="stat-label">{label}</div>
      {hint && <div className="stat-hint muted small">{hint}</div>}
    </div>
  );
}

export default function ProgressPage() {
  const [days, setDays] = useState(30);
  const [stats, setStats] = useState(null);
  const [recent, setRecent] = useState([]);

  // Reload stats when the range changes.
  useEffect(() => {
    api.getStats(days).then(setStats);
  }, [days]);

  // Load the latest completed tasks once.
  useEffect(() => {
    api.getTasks({ status: "completed" }).then((list) => setRecent(list.slice(0, 10)));
  }, []);

  if (!stats) return <div className="page"><p className="muted">Loading…</p></div>;

  const periodTotal = stats.per_day.reduce((sum, d) => sum + d.completed, 0);

  return (
    <div className="page">
      <div className="page-content">
        <header className="page-header">
          <h1>Progress</h1>
        </header>

        <div className="stat-grid">
          <StatTile label="Completed today" value={stats.completed_today} />
          <StatTile label="Completed this week" value={stats.completed_this_week} />
          <StatTile
            label="Current streak"
            value={`${stats.current_streak} day${stats.current_streak === 1 ? "" : "s"}`}
            hint="Days in a row with at least one completion"
          />
          <StatTile label="Longest streak" value={`${stats.longest_streak} days`} />
          <StatTile label="Open tasks" value={stats.totals.open} />
          <StatTile
            label="Overdue"
            value={stats.totals.overdue}
            tone={stats.totals.overdue > 0 ? "warn" : ""}
            hint={stats.totals.overdue > 0 ? "⚠ Needs attention" : undefined}
          />
        </div>

        <section className="card">
          <div className="card-header">
            <h3>
              Tasks completed per day{" "}
              <span className="muted small">
                · {periodTotal} in the last {days} days · {stats.totals.completed} all-time
              </span>
            </h3>
            <div className="segmented" role="group" aria-label="Date range">
              {RANGES.map((r) => (
                <button
                  key={r}
                  className={r === days ? "active" : ""}
                  aria-pressed={r === days}
                  onClick={() => setDays(r)}
                >
                  {r}d
                </button>
              ))}
            </div>
          </div>
          <CompletionChart data={stats.per_day} />
        </section>

        <section className="card">
          <div className="card-header">
            <h3>Recently completed</h3>
            <Link to="/completed" className="small">
              See all →
            </Link>
          </div>
          {recent.length === 0 ? (
            <p className="muted small">Nothing completed yet.</p>
          ) : (
            <ul className="recent-list">
              {recent.map((t) => (
                <li key={t.id}>
                  <span className="check checked small-check">✓</span>
                  <span className="task-title">{t.title}</span>
                  <span className="muted small">{formatDateTime(t.completed_at)}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}
