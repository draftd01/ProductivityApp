/**
 * utils/recurrence.js - helpers for showing and editing repeat rules.
 *
 * The backend (backend/tasks/recurrence.py) stores a rule as:
 *   repeat_type      "none" | "daily" | "weekly" | "monthly" | "yearly"
 *   repeat_interval  every N units
 *   repeat_days_list weekdays for weekly rules, Monday=0 ... Sunday=6
 *   repeat_end_date  optional
 *
 * The UI offers friendlier "presets" (e.g. "Weekdays") that map onto that
 * shape. Used by RepeatEditor.jsx (editing) and TaskRow.jsx / TaskDetailPanel.jsx
 * (displaying a summary like "Every weekday").
 */
import { parseISODate } from "./dates.js";

/** Weekday labels indexed by the backend's numbering (Monday=0). */
export const WEEKDAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

const WEEKDAYS = [0, 1, 2, 3, 4];
const WEEKENDS = [5, 6];

/** Options for the "Repeat" dropdown in RepeatEditor.jsx. */
export const REPEAT_PRESETS = [
  { value: "none", label: "Does not repeat" },
  { value: "daily", label: "Every day" },
  { value: "weekdays", label: "Every weekday (Mon–Fri)" },
  { value: "weekends", label: "Every weekend (Sat–Sun)" },
  { value: "weekly", label: "Every week" },
  { value: "monthly", label: "Every month" },
  { value: "yearly", label: "Every year" },
  { value: "custom", label: "Custom…" },
];

/** True if two weekday arrays contain the same days. */
function sameDays(a, b) {
  return a.length === b.length && [...a].sort().every((v, i) => v === [...b].sort()[i]);
}

/** JS Date.getDay() is Sunday=0; convert to backend numbering (Monday=0). */
export function backendWeekday(date) {
  return (date.getDay() + 6) % 7;
}

/**
 * Work out which preset a task's stored rule corresponds to, so the dropdown
 * shows the right option. Anything unusual is shown as "custom".
 */
export function presetFromTask(task) {
  const type = task.repeat_type;
  const interval = task.repeat_interval || 1;
  const days = task.repeat_days_list || [];
  if (type === "none") return "none";
  if (interval !== 1) return "custom";
  if (type === "daily") return "daily";
  if (type === "monthly") return "monthly";
  if (type === "yearly") return "yearly";
  if (type === "weekly") {
    if (sameDays(days, WEEKDAYS)) return "weekdays";
    if (sameDays(days, WEEKENDS)) return "weekends";
    if (days.length <= 1) return "weekly";
  }
  return "custom";
}

/**
 * Convert a preset into the rule fields to PATCH onto the task.
 * "weekly" repeats on the weekday of the due date (or today if none).
 */
export function ruleFromPreset(preset, dueDate) {
  const anchor = parseISODate(dueDate) || new Date();
  switch (preset) {
    case "daily":
      return { repeat_type: "daily", repeat_interval: 1, repeat_days_list: [] };
    case "weekdays":
      return { repeat_type: "weekly", repeat_interval: 1, repeat_days_list: WEEKDAYS };
    case "weekends":
      return { repeat_type: "weekly", repeat_interval: 1, repeat_days_list: WEEKENDS };
    case "weekly":
      return {
        repeat_type: "weekly",
        repeat_interval: 1,
        repeat_days_list: [backendWeekday(anchor)],
      };
    case "monthly":
      return { repeat_type: "monthly", repeat_interval: 1, repeat_days_list: [] };
    case "yearly":
      return { repeat_type: "yearly", repeat_interval: 1, repeat_days_list: [] };
    default:
      return { repeat_type: "none", repeat_interval: 1, repeat_days_list: [], repeat_end_date: null };
  }
}

/** Human-readable summary of a task's rule, e.g. "Every 2 weeks on Mon, Thu". */
export function describeRepeat(task) {
  const type = task.repeat_type;
  if (!type || type === "none") return "";
  const n = task.repeat_interval || 1;
  const days = task.repeat_days_list || [];
  const unit = { daily: "day", weekly: "week", monthly: "month", yearly: "year" }[type];
  let text = n === 1 ? `Every ${unit}` : `Every ${n} ${unit}s`;

  if (type === "weekly" && days.length) {
    if (n === 1 && sameDays(days, WEEKDAYS)) text = "Every weekday";
    else if (n === 1 && sameDays(days, WEEKENDS)) text = "Every weekend";
    else text += ` on ${days.map((d) => WEEKDAY_LABELS[d]).join(", ")}`;
  }
  if (task.repeat_end_date) text += ` until ${task.repeat_end_date}`;
  return text;
}
