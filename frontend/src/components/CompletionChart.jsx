/**
 * CompletionChart.jsx - bar chart of tasks completed per day (Progress page).
 *
 * Drawn with plain SVG (no chart library) so it's easy to read:
 *   - x axis: one bar per day, oldest on the left
 *   - y axis: number of completed tasks; a few light gridlines
 *   - hover a bar (or its wide invisible hit area) for a tooltip
 *   - "Show as table" reveals the same numbers as an accessible table
 *
 * Props:
 *   data - [{ date: "YYYY-MM-DD", completed: n, created: n }] from
 *          GET /api/stats/ (backend/tasks/stats.py -> progress_stats().per_day)
 */
import { useState } from "react";
import { formatDate, parseISODate } from "../utils/dates.js";

// Chart geometry in SVG units; the SVG scales to its container width.
const WIDTH = 720;
const HEIGHT = 220;
const PAD = { top: 12, right: 8, bottom: 28, left: 28 };

/** Pick a "nice" y-axis max and tick step for the largest value. */
function niceScale(max) {
  if (max <= 4) return { top: Math.max(max, 1), step: 1 };
  const step = Math.ceil(max / 4);
  return { top: step * 4, step };
}

export default function CompletionChart({ data }) {
  const [hover, setHover] = useState(null); // index of the hovered bar

  const max = Math.max(0, ...data.map((d) => d.completed));
  const { top, step } = niceScale(max);
  const plotW = WIDTH - PAD.left - PAD.right;
  const plotH = HEIGHT - PAD.top - PAD.bottom;
  const slot = plotW / data.length; // horizontal space per day
  const barW = Math.max(2, Math.min(18, slot - 2)); // leave a 2px gap between bars
  const y = (v) => PAD.top + plotH - (v / top) * plotH;

  const ticks = [];
  for (let v = 0; v <= top; v += step) ticks.push(v);

  // Label roughly every 7th day so the x axis doesn't get crowded.
  const labelEvery = Math.ceil(data.length / 6);
  const hovered = hover !== null ? data[hover] : null;

  return (
    <div className="chart">
      <div className="chart-wrap">
        <svg
          viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
          role="img"
          aria-label="Tasks completed per day"
          onMouseLeave={() => setHover(null)}
        >
          {/* Gridlines + y-axis labels */}
          {ticks.map((v) => (
            <g key={v}>
              <line x1={PAD.left} x2={WIDTH - PAD.right} y1={y(v)} y2={y(v)} className="grid" />
              <text x={PAD.left - 6} y={y(v)} className="axis-label" textAnchor="end" dominantBaseline="middle">
                {v}
              </text>
            </g>
          ))}

          {data.map((d, i) => {
            const cx = PAD.left + slot * i + slot / 2;
            const h = (d.completed / top) * plotH;
            const r = Math.min(4, barW / 2, h); // rounded top corners, flat base
            const x0 = cx - barW / 2;
            const yTop = PAD.top + plotH - h;
            return (
              <g key={d.date}>
                {h > 0 && (
                  <path
                    className={`bar ${hover === i ? "hovered" : ""}`}
                    d={`M${x0},${yTop + h} V${yTop + r} Q${x0},${yTop} ${x0 + r},${yTop}
                        H${x0 + barW - r} Q${x0 + barW},${yTop} ${x0 + barW},${yTop + r} V${yTop + h} Z`}
                  />
                )}
                {/* Invisible full-height hit area, wider than the bar, for easy hovering. */}
                <rect
                  x={PAD.left + slot * i}
                  y={PAD.top}
                  width={slot}
                  height={plotH}
                  fill="transparent"
                  onMouseEnter={() => setHover(i)}
                />
                {i % labelEvery === 0 && (
                  <text x={cx} y={HEIGHT - 8} className="axis-label" textAnchor="middle">
                    {parseISODate(d.date).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
                  </text>
                )}
              </g>
            );
          })}
          <line
            x1={PAD.left}
            x2={WIDTH - PAD.right}
            y1={PAD.top + plotH}
            y2={PAD.top + plotH}
            className="baseline"
          />
        </svg>

        {hovered && (
          <div
            className="chart-tooltip"
            style={{ left: `${((PAD.left + slot * hover + slot / 2) / WIDTH) * 100}%` }}
          >
            <strong>{formatDate(hovered.date)}</strong>
            <div>{hovered.completed} completed</div>
            <div className="muted">{hovered.created} created</div>
          </div>
        )}
      </div>

      <details className="chart-table">
        <summary className="small">Show as table</summary>
        <table>
          <thead>
            <tr>
              <th>Date</th>
              <th>Completed</th>
              <th>Created</th>
            </tr>
          </thead>
          <tbody>
            {[...data].reverse().map((d) => (
              <tr key={d.date}>
                <td>{formatDate(d.date)}</td>
                <td>{d.completed}</td>
                <td>{d.created}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </div>
  );
}
