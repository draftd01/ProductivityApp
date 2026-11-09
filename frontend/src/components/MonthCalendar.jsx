/**
 * MonthCalendar.jsx - a reusable month grid with previous/next navigation.
 *
 * It knows nothing about tasks: the parent decides what goes inside each
 * day via the `renderDay` function. Used in two places:
 *   - CalendarPage.jsx  : big calendar listing task events per day
 *   - TaskCalendar.jsx  : small calendar marking one task's created /
 *                         due / completed days (compact mode)
 *
 * Props:
 *   year, month         - which month to show (month is 0-11, like JS Date)
 *   onMonthChange(y, m) - called by the ‹ › buttons and "Today"
 *   renderDay(iso)      - returns the content for a day cell ("YYYY-MM-DD")
 *   selectedDate        - "YYYY-MM-DD" to highlight, optional
 *   onSelectDate(iso)   - called when a day cell is clicked, optional
 *   compact             - smaller styling for the task panel
 */
import { monthGrid, toISODate, todayISO } from "../utils/dates.js";

const DAY_HEADERS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export default function MonthCalendar({
  year,
  month,
  onMonthChange,
  renderDay,
  selectedDate,
  onSelectDate,
  compact = false,
}) {
  const weeks = monthGrid(year, month);
  const today = todayISO();
  const title = new Date(year, month, 1).toLocaleDateString(undefined, {
    month: "long",
    year: "numeric",
  });

  /** Move the view by `delta` months (Date handles year rollover). */
  function shift(delta) {
    const d = new Date(year, month + delta, 1);
    onMonthChange(d.getFullYear(), d.getMonth());
  }

  /** Jump back to the current month. */
  function goToday() {
    const d = new Date();
    onMonthChange(d.getFullYear(), d.getMonth());
  }

  return (
    <div className={`month-calendar ${compact ? "compact" : ""}`}>
      <div className="cal-header">
        <button className="icon-btn" onClick={() => shift(-1)} aria-label="Previous month">
          ‹
        </button>
        <span className="cal-title">{title}</span>
        <button className="icon-btn" onClick={() => shift(1)} aria-label="Next month">
          ›
        </button>
        {!compact && (
          <button className="btn btn-small" onClick={goToday}>
            Today
          </button>
        )}
      </div>

      <div className="cal-grid" role="grid">
        {DAY_HEADERS.map((d) => (
          <div key={d} className="cal-dow" role="columnheader">
            {compact ? d[0] : d}
          </div>
        ))}
        {weeks.flat().map((date) => {
          const iso = toISODate(date);
          const classes = [
            "cal-day",
            date.getMonth() !== month && "other-month",
            iso === today && "today",
            iso === selectedDate && "selected",
            onSelectDate && "clickable",
          ]
            .filter(Boolean)
            .join(" ");
          return (
            <div
              key={iso}
              className={classes}
              role="gridcell"
              onClick={onSelectDate ? () => onSelectDate(iso) : undefined}
            >
              <span className="cal-date-num">{date.getDate()}</span>
              {renderDay(iso)}
            </div>
          );
        })}
      </div>
    </div>
  );
}
