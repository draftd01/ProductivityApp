/**
 * RepeatEditor.jsx - lets you set how a task repeats.
 *
 * Shown inside TaskDetailPanel.jsx. Offers presets (Every day, Every weekday,
 * ...) and a "Custom…" mode with:
 *   - every N  days / weeks / months / years
 *   - which weekdays (for weekly rules), e.g. Mon + Wed + Fri
 *   - an optional end date
 *
 * Props:
 *   task         - the task being edited (reads repeat_* fields)
 *   onSave(patch) - called with the fields to PATCH, e.g.
 *                  { repeat_type: "weekly", repeat_interval: 1, repeat_days_list: [0,1,2,3,4] }
 *
 * The meaning of these fields is documented in utils/recurrence.js and
 * backend/tasks/recurrence.py.
 */
import { useEffect, useState } from "react";
import { parseISODate } from "../utils/dates.js";
import {
  REPEAT_PRESETS,
  WEEKDAY_LABELS,
  backendWeekday,
  describeRepeat,
  presetFromTask,
  ruleFromPreset,
} from "../utils/recurrence.js";

/** Units for the custom rule, mapped to backend repeat_type values. */
const UNITS = [
  { value: "daily", label: "day(s)" },
  { value: "weekly", label: "week(s)" },
  { value: "monthly", label: "month(s)" },
  { value: "yearly", label: "year(s)" },
];

export default function RepeatEditor({ task, onSave }) {
  const [preset, setPreset] = useState(presetFromTask(task));
  // Draft values for the custom form (only sent when "Apply" is clicked).
  const [interval, setRepeatInterval] = useState(task.repeat_interval || 1);
  const [unit, setUnit] = useState(task.repeat_type === "none" ? "weekly" : task.repeat_type);
  const [days, setDays] = useState(task.repeat_days_list || []);

  // A string key for the weekday list, so the effect below only re-runs when
  // the days actually change (arrays from the API are new objects every load).
  const daysKey = (task.repeat_days_list || []).join(",");

  // When a different task is opened, or this one is saved, reset the drafts.
  useEffect(() => {
    setPreset(presetFromTask(task));
    setRepeatInterval(task.repeat_interval || 1);
    setUnit(task.repeat_type === "none" ? "weekly" : task.repeat_type);
    setDays(
      task.repeat_days_list?.length
        ? task.repeat_days_list
        : [backendWeekday(parseISODate(task.due_date) || new Date())]
    );
  }, [task.id, task.repeat_type, task.repeat_interval, daysKey, task.due_date]);

  /** Dropdown change: presets save immediately; "custom" just opens the form. */
  function handlePresetChange(value) {
    setPreset(value);
    if (value !== "custom") onSave(ruleFromPreset(value, task.due_date));
  }

  /** Add or remove a weekday in the custom form. */
  function toggleDay(day) {
    setDays((current) =>
      current.includes(day) ? current.filter((d) => d !== day) : [...current, day].sort()
    );
  }

  /** Save the custom rule. */
  function applyCustom() {
    onSave({
      repeat_type: unit,
      repeat_interval: Math.max(1, Number(interval) || 1),
      repeat_days_list: unit === "weekly" ? days : [],
    });
  }

  const isRepeating = task.repeat_type !== "none";

  return (
    <div className="repeat-editor">
      <select value={preset} onChange={(e) => handlePresetChange(e.target.value)} aria-label="Repeat">
        {REPEAT_PRESETS.map((p) => (
          <option key={p.value} value={p.value}>
            {p.label}
          </option>
        ))}
      </select>

      {preset === "custom" && (
        <div className="custom-repeat">
          <div className="row">
            <span>Every</span>
            <input
              type="number"
              min="1"
              className="input-narrow"
              value={interval}
              onChange={(e) => setRepeatInterval(e.target.value)}
              aria-label="Repeat interval"
            />
            <select value={unit} onChange={(e) => setUnit(e.target.value)} aria-label="Repeat unit">
              {UNITS.map((u) => (
                <option key={u.value} value={u.value}>
                  {u.label}
                </option>
              ))}
            </select>
          </div>

          {unit === "weekly" && (
            <div className="weekday-picker" role="group" aria-label="Repeat on weekdays">
              {WEEKDAY_LABELS.map((label, i) => (
                <button
                  type="button"
                  key={label}
                  className={`weekday ${days.includes(i) ? "on" : ""}`}
                  aria-pressed={days.includes(i)}
                  onClick={() => toggleDay(i)}
                >
                  {label[0]}
                </button>
              ))}
            </div>
          )}

          <button type="button" className="btn btn-small btn-primary" onClick={applyCustom}>
            Apply
          </button>
        </div>
      )}

      {isRepeating && (
        <>
          <p className="muted small">{describeRepeat(task)}</p>
          <label className="small">
            Ends on{" "}
            <input
              type="date"
              value={task.repeat_end_date || ""}
              onChange={(e) => onSave({ repeat_end_date: e.target.value || null })}
            />
          </label>
        </>
      )}
    </div>
  );
}
