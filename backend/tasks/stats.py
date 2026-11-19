"""
stats.py - read-only queries that power the Calendar and Progress pages.

Kept separate from views.py so the views stay thin. Called by:
  - CalendarView  (views.py) -> calendar_events()
  - StatsView     (views.py) -> progress_stats()
  - TaskViewSet.history (views.py) -> series_history()
  - TaskViewSet.projection (views.py) -> series_projection()

All "which day did this happen" questions use the local TIME_ZONE from
config/settings.py, via timezone.localtime()/localdate().
"""
from datetime import timedelta

from django.utils import timezone

from . import recurrence
from .models import SkippedDate, Task


def _local_date(dt):
    """Convert a stored UTC datetime into the local calendar date."""
    return timezone.localtime(dt).date()


def projected_dates(task, start, end, taken=None):
    """
    Future dates (within [start, end]) on which an open repeating task will
    recur, counting from its due date. Display only - nothing is created.

    Only dates from today onward are returned: completing an overdue task
    skips missed dates (recurrence.next_due_date), so past projections would
    never become real. Tasks with no due date have nothing to count from.
    Taken days (`taken`, see Task.taken_dates) are left out: days that
    already have a row (e.g. completed ahead of time) and removed days.
    """
    if not task.is_open or not task.is_recurring or task.due_date is None:
        return []
    if taken is None:
        taken = task.taken_dates()
    return recurrence.occurrences_between(
        task.repeat_type,
        task.repeat_interval,
        recurrence.parse_days(task.repeat_days),
        base=task.due_date,
        start=max(start, timezone.localdate()),
        end=end,
        end_date=task.repeat_end_date,
        exclude=taken,
    )


def _projection_bases(qs):
    """
    For each repeating series in `qs`, the open occurrence with the EARLIEST
    due date: the one that carries the schedule forward. A series normally
    has one open occurrence, but can have more (an old occurrence re-opened,
    or a future day completed ahead of time and then re-opened); those extra
    rows show up as their own events, and projections skip their dates.
    """
    bases = {}
    open_repeating = qs.filter(
        is_completed=False, is_ignored=False, due_date__isnull=False
    ).exclude(
        repeat_type=recurrence.REPEAT_NONE
    )
    for task in open_repeating:
        current = bases.get(task.series_id)
        if current is None or task.due_date < current.due_date:
            bases[task.series_id] = task
    return list(bases.values())


def projection_base(series_id):
    """The open occurrence a series' projections count from, or None."""
    bases = _projection_bases(Task.objects.filter(series_id=series_id))
    return bases[0] if bases else None


def series_projection(task, start, end):
    """
    Projected dates for the series `task` belongs to, counted from the
    series' current open occurrence - so it works even when `task` is an
    older, completed occurrence. Used by the per-task calendar and by
    Task._row_on (to check a day really is a projected one).
    """
    base = projection_base(task.series_id)
    return projected_dates(base, start, end) if base else []


def calendar_events(start, end, project_id=None):
    """
    Return a list of event dicts for every task created, completed or due
    between `start` and `end` (inclusive dates), plus "projected" events for
    future repeats of open repeating tasks (see projected_dates).

    Each event: {date, type, task_id, title, is_completed, is_ignored,
    is_recurring, project_color}.
    Ignored tasks still appear (so they can be opened), flagged with is_ignored.
    A task completed BEFORE its due date shows as "completed" on its due
    date too (instead of a struck-through "due"), so a day you finished
    ahead of time reads as done on that day.
    The frontend groups these by date in src/pages/CalendarPage.jsx.
    """
    qs = Task.objects.select_related("project")
    if project_id:
        qs = qs.filter(project_id=project_id)

    events = []

    def add(task, date, kind):
        events.append(
            {
                "date": date,
                "type": kind, # possible values: ["created", "completed", "due", "projected"]
                "task_id": task.id,
                "title": task.title,
                "is_completed": task.is_completed,
                "is_ignored": task.is_ignored,
                "is_recurring": task.is_recurring,
                "project_color": task.project.color if task.project else None,
            }
        )

    # `__date__range` is evaluated in the local timezone by Django.
    for task in qs.filter(created_at__date__range=(start, end)):
        add(task, _local_date(task.created_at), "created")
    for task in qs.filter(completed_at__date__range=(start, end)):
        add(task, _local_date(task.completed_at), "completed")
    for task in qs.filter(due_date__range=(start, end)):
        done_early = task.completed_at and _local_date(task.completed_at) < task.due_date
        add(task, task.due_date, "completed" if done_early else "due")
    # Future repeats of open repeating tasks. They point at the open task, so
    # clicking one opens the occurrence you can actually edit.
    bases = _projection_bases(qs)
    # series_id -> taken days (rows + removed days), see Task.taken_dates.
    # Built with two queries for all series instead of two per series.
    series_ids = [t.series_id for t in bases]
    taken = {}
    for series_id, day in Task.objects.filter(
        series_id__in=series_ids, due_date__isnull=False
    ).values_list("series_id", "due_date"):
        taken.setdefault(series_id, set()).add(day)
    for series_id, day in SkippedDate.objects.filter(series_id__in=series_ids).values_list(
        "series_id", "date"
    ):
        taken.setdefault(series_id, set()).add(day)
    for task in bases:
        for d in projected_dates(task, start, end, taken.get(task.series_id, set())):
            add(task, d, "projected")

    events.sort(key=lambda e: (e["date"], e["type"], e["title"].lower()))
    return events


def series_history(task):
    """
    All occurrences of a repeating task (same series_id), oldest first.
    Used by the per-task calendar to mark every past completion of the series.
    For a non-repeating task this is just the task itself.
    """
    return Task.objects.filter(series_id=task.series_id).order_by("created_at")


def progress_stats(days=30):
    """
    Build the numbers for the Progress page (src/pages/ProgressPage.jsx).

    Returns:
      totals            : counts of open / completed / overdue / ignored tasks
                          (open and overdue exclude ignored tasks)
      completed_today   : tasks completed today
      completed_this_week: since Monday
      current_streak    : consecutive days (ending today, or yesterday if
                          nothing is done yet today) with >= 1 completion
      longest_streak    : best streak ever
      per_day           : [{date, created, completed}] for the last `days` days
    """
    today = timezone.localdate()
    start = today - timedelta(days=days - 1)

    completed_dates = [
        _local_date(dt)
        for dt in Task.objects.filter(is_completed=True, completed_at__isnull=False)
        .values_list("completed_at", flat=True)
    ]
    created_dates = [
        _local_date(dt)
        for dt in Task.objects.filter(created_at__date__gte=start).values_list(
            "created_at", flat=True
        )
    ]

    # Per-day counts for the chart.
    completed_counts = {}
    for d in completed_dates:
        completed_counts[d] = completed_counts.get(d, 0) + 1
    created_counts = {}
    for d in created_dates:
        created_counts[d] = created_counts.get(d, 0) + 1

    per_day = []
    for i in range(days):
        d = start + timedelta(days=i)
        per_day.append(
            {
                "date": d,
                "created": created_counts.get(d, 0),
                "completed": completed_counts.get(d, 0),
            }
        )

    # Current streak: walk backwards from today (or yesterday if today is empty).
    active_days = set(completed_counts)
    cursor = today if today in active_days else today - timedelta(days=1)
    current_streak = 0
    while cursor in active_days:
        current_streak += 1
        cursor -= timedelta(days=1)

    # Longest streak: scan all active days in order.
    longest_streak = 0
    run = 0
    previous = None
    for d in sorted(active_days):
        run = run + 1 if previous and d - previous == timedelta(days=1) else 1
        longest_streak = max(longest_streak, run)
        previous = d

    week_start = today - timedelta(days=today.weekday())
    open_qs = Task.objects.filter(is_completed=False, is_ignored=False)

    return {
        "totals": {
            "open": open_qs.count(),
            "completed": len(completed_dates),
            "overdue": open_qs.filter(due_date__lt=today).count(),
            "ignored": Task.objects.filter(is_ignored=True).count(),
        },
        "completed_today": completed_counts.get(today, 0),
        "completed_this_week": sum(
            c for d, c in completed_counts.items() if week_start <= d <= today
        ),
        "current_streak": current_streak,
        "longest_streak": longest_streak,
        "per_day": per_day,
    }
