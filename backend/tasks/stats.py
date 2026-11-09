"""
stats.py - read-only queries that power the Calendar and Progress pages.

Kept separate from views.py so the views stay thin. Called by:
  - CalendarView  (views.py) -> calendar_events()
  - StatsView     (views.py) -> progress_stats()
  - TaskViewSet.history (views.py) -> series_history()

All "which day did this happen" questions use the local TIME_ZONE from
config/settings.py, via timezone.localtime()/localdate().
"""
from datetime import timedelta

from django.utils import timezone

from .models import Task


def _local_date(dt):
    """Convert a stored UTC datetime into the local calendar date."""
    return timezone.localtime(dt).date()


def calendar_events(start, end, project_id=None):
    """
    Return a list of event dicts for every task created, completed or due
    between `start` and `end` (inclusive dates).

    Each event: {date, type, task_id, title, is_completed, project_color}.
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
                "type": kind,
                "task_id": task.id,
                "title": task.title,
                "is_completed": task.is_completed,
                "project_color": task.project.color if task.project else None,
            }
        )

    # `__date__range` is evaluated in the local timezone by Django.
    for task in qs.filter(created_at__date__range=(start, end)):
        add(task, _local_date(task.created_at), "created")
    for task in qs.filter(completed_at__date__range=(start, end)):
        add(task, _local_date(task.completed_at), "completed")
    for task in qs.filter(due_date__range=(start, end)):
        add(task, task.due_date, "due")

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
      totals            : counts of open / completed / overdue tasks
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
    open_qs = Task.objects.filter(is_completed=False)

    return {
        "totals": {
            "open": open_qs.count(),
            "completed": len(completed_dates),
            "overdue": open_qs.filter(due_date__lt=today).count(),
        },
        "completed_today": completed_counts.get(today, 0),
        "completed_this_week": sum(
            c for d, c in completed_counts.items() if week_start <= d <= today
        ),
        "current_streak": current_streak,
        "longest_streak": longest_streak,
        "per_day": per_day,
    }
