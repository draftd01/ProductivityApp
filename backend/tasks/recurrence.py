"""
recurrence.py - pure date math for repeating tasks.

This module has NO database access, which keeps it easy to read and test.
It is used by:
  - tasks/models.py  -> Task.complete() calls next_due_date() to schedule the
                        next occurrence when a repeating task is completed.
  - tasks/tests.py   -> unit tests for every repeat type.

How a repeat rule is described (these mirror fields on the Task model):
  repeat_type     : "none" | "daily" | "weekly" | "monthly" | "yearly"
  repeat_interval : "every N" units, e.g. 2 + "weekly" = every 2 weeks
  repeat_days     : weekdays for weekly rules, as ints with Monday=0 ... Sunday=6
                    e.g. [0,1,2,3,4] = weekdays only, [5,6] = weekends only
  repeat_end_date : optional last date an occurrence may fall on

"Weekdays only" is therefore just: weekly, interval 1, days [0,1,2,3,4].
The frontend (src/utils/recurrence.js) offers that and other presets.
"""
import calendar
from datetime import date, timedelta

REPEAT_NONE = "none"
REPEAT_DAILY = "daily"
REPEAT_WEEKLY = "weekly"
REPEAT_MONTHLY = "monthly"
REPEAT_YEARLY = "yearly"


def parse_days(days_str):
    """
    Turn the stored comma-separated weekday string ("0,2,4") into a sorted
    list of ints ([0, 2, 4]). Blank or invalid parts are ignored.
    """
    if not days_str:
        return []
    days = set()
    for part in str(days_str).split(","):
        part = part.strip()
        if part.isdigit() and 0 <= int(part) <= 6:
            days.add(int(part))
    return sorted(days)


def add_months(d, months):
    """
    Return date `d` moved forward by `months` calendar months, clamping the day
    to the last day of the target month (Jan 31 + 1 month -> Feb 28/29).
    """
    month_index = d.month - 1 + months
    year = d.year + month_index // 12
    month = month_index % 12 + 1
    last_day = calendar.monthrange(year, month)[1]
    return date(year, month, min(d.day, last_day))


def _week_start(d):
    """Return the Monday of the week containing date `d`."""
    return d - timedelta(days=d.weekday())


def _next_weekly(base, interval, days):
    """
    Find the first date after `base` that falls on one of `days` (weekday ints)
    in a week that is a multiple of `interval` weeks away from base's week.

    Example: base = Fri, days = Mon-Fri, interval = 1  -> next Monday.
    Example: base = Mon, days = [0] (Mon), interval = 2 -> Monday two weeks later.
    """
    if not days:
        # No specific weekdays chosen: simply jump N weeks.
        return base + timedelta(weeks=interval)

    base_week = _week_start(base)
    candidate = base + timedelta(days=1)
    # Searching (interval + 1) weeks ahead is always enough to find a match.
    limit = base + timedelta(weeks=interval + 1)
    while candidate <= limit:
        weeks_apart = (_week_start(candidate) - base_week).days // 7
        if candidate.weekday() in days and weeks_apart % interval == 0:
            return candidate
        candidate += timedelta(days=1)
    return base + timedelta(weeks=interval)  # Fallback; shouldn't be reached.


def step(base, repeat_type, interval=1, days=None):
    """
    Return the single next occurrence date after `base` for a rule, ignoring
    end dates and "catch up to today" logic. Returns None for non-repeating.
    """
    interval = max(1, int(interval or 1))
    if repeat_type == REPEAT_DAILY:
        return base + timedelta(days=interval)
    if repeat_type == REPEAT_WEEKLY:
        return _next_weekly(base, interval, days or [])
    if repeat_type == REPEAT_MONTHLY:
        return add_months(base, interval)
    if repeat_type == REPEAT_YEARLY:
        return add_months(base, 12 * interval)
    return None


def next_due_date(repeat_type, interval, days, base, today, end_date=None):
    """
    Compute the due date of the next occurrence of a repeating task.

    Args:
        repeat_type: one of the REPEAT_* constants.
        interval: every-N value (int >= 1).
        days: list of weekday ints (only used for weekly rules).
        base: the date to count from - the completed task's due date, or the
              completion day if it had no due date.
        today: the current local date.
        end_date: optional; if the next date would be after it, return None.

    Behaviour: if you complete an overdue task late, missed occurrences are
    skipped so the next one lands on today or later instead of in the past.
    """
    if repeat_type in (None, "", REPEAT_NONE):
        return None

    nxt = step(base, repeat_type, interval, days)
    # Skip forward past missed occurrences (bounded loop as a safety net).
    for _ in range(1000):
        if nxt is None or nxt >= today:
            break
        nxt = step(nxt, repeat_type, interval, days)

    if nxt is not None and end_date is not None and nxt > end_date:
        return None
    return nxt
