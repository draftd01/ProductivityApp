/**
 * utils/dates.js - small date helpers shared across components.
 *
 * Two kinds of dates come from the API:
 *   - plain dates  "2026-03-09"            (due_date, repeat_end_date, calendar events)
 *   - timestamps   "2026-03-09T14:22:05Z"  (created_at, completed_at)
 * Plain dates must be parsed as LOCAL dates (new Date("2026-03-09") would be
 * treated as UTC midnight and can show up as the previous day), so always use
 * parseISODate() for them.
 */

/** Date object -> "YYYY-MM-DD" using the browser's local calendar day. */
export function toISODate(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/** "YYYY-MM-DD" -> Date at local midnight. Returns null for empty input. */
export function parseISODate(str) {
  if (!str) return null;
  const [y, m, d] = str.split("-").map(Number);
  return new Date(y, m - 1, d);
}

/** Today's date as "YYYY-MM-DD". */
export function todayISO() {
  return toISODate(new Date());
}

/** Return a new Date `n` days after `date`. */
export function addDays(date, n) {
  const copy = new Date(date);
  copy.setDate(copy.getDate() + n);
  return copy;
}

/** Timestamp string -> local "YYYY-MM-DD" (the day it happened for you). */
export function localDateOf(timestamp) {
  return timestamp ? toISODate(new Date(timestamp)) : null;
}

/** "YYYY-MM-DD" -> "Mon, Mar 9" (adds the year if it's not this year). */
export function formatDate(str) {
  const date = parseISODate(str);
  if (!date) return "";
  const sameYear = date.getFullYear() === new Date().getFullYear();
  return date.toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    ...(sameYear ? {} : { year: "numeric" }),
  });
}

/** Timestamp -> "Mar 9, 2026, 2:22 PM" in local time. */
export function formatDateTime(timestamp) {
  if (!timestamp) return "";
  return new Date(timestamp).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

/**
 * Friendly label for a due date, used in TaskRow.jsx:
 * "Today", "Tomorrow", "Yesterday", or a formatted date.
 */
export function dueLabel(str) {
  if (!str) return "";
  const today = todayISO();
  if (str === today) return "Today";
  if (str === toISODate(addDays(new Date(), 1))) return "Tomorrow";
  if (str === toISODate(addDays(new Date(), -1))) return "Yesterday";
  return formatDate(str);
}

/**
 * Build the grid for a month view: an array of weeks, each an array of 7
 * Date objects (Sunday first), including leading/trailing days from the
 * neighbouring months so every row is full. Used by MonthCalendar.jsx.
 */
export function monthGrid(year, month) {
  const first = new Date(year, month, 1);
  const start = addDays(first, -first.getDay()); // back up to Sunday
  const weeks = [];
  let cursor = start;
  // Always 6 rows so the calendar height doesn't jump between months.
  for (let w = 0; w < 6; w++) {
    const week = [];
    for (let d = 0; d < 7; d++) {
      week.push(cursor);
      cursor = addDays(cursor, 1);
    }
    weeks.push(week);
  }
  return weeks;
}

/** First and last "YYYY-MM-DD" visible in a month grid (for API range queries). */
export function monthGridRange(year, month) {
  const weeks = monthGrid(year, month);
  return { start: toISODate(weeks[0][0]), end: toISODate(weeks[5][6]) };
}
