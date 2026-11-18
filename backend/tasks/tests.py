"""
tests.py - automated tests. Run with:  python manage.py test

Four groups:
  RecurrenceTests : pure date math in tasks/recurrence.py (no database)
  TaskModelTests  : Task.complete()/uncomplete() in tasks/models.py, which
                    create and clean up the next occurrence of repeating tasks
  ProjectionTests : projected future repeats for the calendars (stats.py)
  IgnoreTests     : Task.ignore()/unignore() and how ignored tasks are
                    excluded from open/overdue counts and lists
"""
from datetime import date, timedelta

from django.test import SimpleTestCase, TestCase
from django.utils import timezone

from . import recurrence, stats
from .models import Note, Task

WEEKDAYS = [0, 1, 2, 3, 4]


class RecurrenceTests(SimpleTestCase):
    """Checks next_due_date() for each repeat type."""

    def test_daily(self):
        """Every day / every 3 days."""
        d = date(2026, 3, 10)
        self.assertEqual(recurrence.next_due_date("daily", 1, [], d, d), date(2026, 3, 11))
        self.assertEqual(recurrence.next_due_date("daily", 3, [], d, d), date(2026, 3, 13))

    def test_weekdays_skip_weekend(self):
        """Weekdays-only rule: Friday -> Monday."""
        friday = date(2026, 3, 13)
        self.assertEqual(
            recurrence.next_due_date("weekly", 1, WEEKDAYS, friday, friday),
            date(2026, 3, 16),
        )

    def test_every_other_week_on_monday(self):
        """Every 2 weeks on Monday."""
        monday = date(2026, 3, 9)
        self.assertEqual(
            recurrence.next_due_date("weekly", 2, [0], monday, monday),
            date(2026, 3, 23),
        )

    def test_monthly_clamps_day(self):
        """Jan 31 + 1 month -> Feb 28."""
        d = date(2026, 1, 31)
        self.assertEqual(recurrence.next_due_date("monthly", 1, [], d, d), date(2026, 2, 28))

    def test_skips_missed_occurrences(self):
        """Completing an old daily task schedules the next one for today."""
        old = date(2026, 3, 1)
        today = date(2026, 3, 10)
        self.assertEqual(recurrence.next_due_date("daily", 1, [], old, today), today)

    def test_end_date(self):
        """No next occurrence past the end date."""
        d = date(2026, 3, 10)
        self.assertIsNone(
            recurrence.next_due_date("daily", 1, [], d, d, end_date=date(2026, 3, 10))
        )

    def test_none(self):
        """Non-repeating tasks never get a next date."""
        d = date(2026, 3, 10)
        self.assertIsNone(recurrence.next_due_date("none", 1, [], d, d))


class TaskModelTests(TestCase):
    """Checks completion side effects on the database."""

    def test_complete_non_repeating(self):
        """Completed task is kept with a timestamp; nothing new is created."""
        task = Task.objects.create(title="One-off")
        self.assertIsNone(task.complete())
        task.refresh_from_db()
        self.assertTrue(task.is_completed)
        self.assertIsNotNone(task.completed_at)
        self.assertEqual(Task.objects.count(), 1)

    def test_complete_repeating_creates_next(self):
        """Completing a daily task creates tomorrow's occurrence in the same series."""
        today = timezone.localdate()
        task = Task.objects.create(title="Stretch", due_date=today, repeat_type="daily")
        nxt = task.complete()
        self.assertIsNotNone(nxt)
        self.assertEqual(nxt.series_id, task.series_id)
        self.assertEqual(nxt.previous_occurrence, task)
        self.assertGreater(nxt.due_date, today)
        # Toggling complete -> open -> complete must not leave duplicates.
        task.uncomplete()
        task.complete()
        self.assertEqual(Task.objects.filter(series_id=task.series_id).count(), 2)

    def test_uncomplete_removes_untouched_next(self):
        """Re-opening removes the auto-created next occurrence if unused."""
        task = Task.objects.create(title="Water plants", repeat_type="daily")
        task.complete()
        self.assertEqual(Task.objects.count(), 2)
        task.uncomplete()
        self.assertEqual(Task.objects.count(), 1)

    def test_uncomplete_keeps_next_with_notes(self):
        """...but keeps it if you already wrote a note on it."""
        task = Task.objects.create(title="Journal", repeat_type="daily")
        nxt = task.complete()
        Note.objects.create(task=nxt, body="Started early")
        task.uncomplete()
        self.assertTrue(Task.objects.filter(pk=nxt.pk).exists())


class ProjectionTests(TestCase):
    """Projected future repeats shown on the calendars (display only)."""

    def test_occurrences_between_weekly(self):
        """Every Monday from Nov 2 2026, within Nov: excludes the base date itself."""
        mondays = recurrence.occurrences_between(
            "weekly", 1, [0], base=date(2026, 11, 2), start=date(2026, 11, 1), end=date(2026, 11, 30)
        )
        self.assertEqual(mondays, [date(2026, 11, 9), date(2026, 11, 16), date(2026, 11, 23), date(2026, 11, 30)])

    def test_occurrences_between_respects_start_and_end_date(self):
        """Only dates inside the window and on/before the series end date."""
        dates = recurrence.occurrences_between(
            "daily", 1, [], base=date(2026, 3, 1), start=date(2026, 3, 3),
            end=date(2026, 3, 31), end_date=date(2026, 3, 5),
        )
        self.assertEqual(dates, [date(2026, 3, 3), date(2026, 3, 4), date(2026, 3, 5)])

    def test_occurrences_between_non_repeating(self):
        self.assertEqual(
            recurrence.occurrences_between("none", 1, [], date(2026, 1, 1), date(2026, 1, 1), date(2026, 2, 1)), []
        )

    def test_calendar_events_include_projected(self):
        """An open daily task gets projected events after its due date, linked to it."""
        today = timezone.localdate()
        task = Task.objects.create(title="Stretch", due_date=today, repeat_type="daily")
        events = stats.calendar_events(today, today + timedelta(days=3))
        projected = [e for e in events if e["type"] == "projected"]
        self.assertEqual([e["date"] for e in projected], [today + timedelta(days=i) for i in (1, 2, 3)])
        self.assertTrue(all(e["task_id"] == task.id for e in projected))

    def test_no_projection_in_past_or_without_due_date(self):
        """Overdue tasks only project from today on; no due date -> nothing."""
        today = timezone.localdate()
        Task.objects.create(title="Overdue", due_date=today - timedelta(days=5), repeat_type="daily")
        Task.objects.create(title="Undated", repeat_type="daily")
        events = stats.calendar_events(today - timedelta(days=10), today + timedelta(days=1))
        projected = [e for e in events if e["type"] == "projected"]
        self.assertEqual([(e["title"], e["date"]) for e in projected],
                         [("Overdue", today), ("Overdue", today + timedelta(days=1))])

    def test_series_projection_from_completed_occurrence(self):
        """Opening an old, completed occurrence still projects from the open one."""
        today = timezone.localdate()
        first = Task.objects.create(title="Stretch", due_date=today, repeat_type="daily")
        nxt = first.complete()
        dates = stats.series_projection(first, today, today + timedelta(days=3))
        self.assertEqual(dates[0], nxt.due_date + timedelta(days=1))

    def test_projection_endpoint(self):
        today = timezone.localdate()
        task = Task.objects.create(title="Stretch", due_date=today, repeat_type="daily")
        url = f"/api/tasks/{task.id}/projection/"
        resp = self.client.get(url, {"start": today.isoformat(), "end": (today + timedelta(days=2)).isoformat()})
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(len(resp.json()["dates"]), 2)
        self.assertEqual(self.client.get(url).status_code, 400)


class IgnoreTests(TestCase):
    """Ignoring overdue tasks: kept with notes, but not counted as open/overdue."""

    def setUp(self):
        self.today = timezone.localdate()
        self.yesterday = self.today - timedelta(days=1)

    def test_ignore_overdue_task(self):
        """Ignored task is kept, timestamped, and no longer overdue."""
        task = Task.objects.create(title="Old errand", due_date=self.yesterday)
        Note.objects.create(task=task, body="Store was closed")
        self.assertIsNone(task.ignore())
        task.refresh_from_db()
        self.assertTrue(task.is_ignored)
        self.assertIsNotNone(task.ignored_at)
        self.assertFalse(task.is_overdue)
        self.assertEqual(task.notes.count(), 1)

    def test_only_overdue_tasks_can_be_ignored(self):
        """Tasks due today, undated, or completed can't be ignored."""
        for task in (
            Task.objects.create(title="Due today", due_date=self.today),
            Task.objects.create(title="Undated"),
        ):
            with self.assertRaises(ValueError):
                task.ignore()
        done = Task.objects.create(title="Done", due_date=self.yesterday)
        done.complete()
        with self.assertRaises(ValueError):
            done.ignore()

    def test_ignore_repeating_schedules_next_and_unignore_removes_it(self):
        """Ignoring keeps a repeating series going; restoring undoes that."""
        task = Task.objects.create(title="Run", due_date=self.yesterday, repeat_type="daily")
        nxt = task.ignore()
        self.assertIsNotNone(nxt)
        self.assertGreaterEqual(nxt.due_date, self.today)
        task.unignore()
        task.refresh_from_db()
        self.assertFalse(task.is_ignored)
        self.assertFalse(Task.objects.filter(pk=nxt.pk).exists())

    def test_complete_clears_ignored(self):
        """Completing an ignored task makes it completed (not both)."""
        task = Task.objects.create(title="Late", due_date=self.yesterday)
        task.ignore()
        task.complete()
        task.refresh_from_db()
        self.assertTrue(task.is_completed)
        self.assertFalse(task.is_ignored)

    def test_stats_and_lists_exclude_ignored(self):
        """Overdue/open counts and the open list skip ignored tasks."""
        ignored = Task.objects.create(title="Skip me", due_date=self.yesterday)
        Task.objects.create(title="Still overdue", due_date=self.yesterday)
        ignored.ignore()
        totals = stats.progress_stats(30)["totals"]
        self.assertEqual((totals["open"], totals["overdue"], totals["ignored"]), (1, 1, 1))
        open_titles = [t["title"] for t in self.client.get("/api/tasks/").json()]
        self.assertEqual(open_titles, ["Still overdue"])
        ignored_titles = [t["title"] for t in self.client.get("/api/tasks/?status=ignored").json()]
        self.assertEqual(ignored_titles, ["Skip me"])
        # Notes stay reachable through the API.
        self.assertEqual(self.client.get(f"/api/tasks/{ignored.id}/notes/").status_code, 200)

    def test_ignore_endpoint_rejects_non_overdue(self):
        task = Task.objects.create(title="Future", due_date=self.today + timedelta(days=2))
        self.assertEqual(self.client.post(f"/api/tasks/{task.id}/ignore/").status_code, 400)
