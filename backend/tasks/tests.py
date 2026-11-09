"""
tests.py - automated tests. Run with:  python manage.py test

Two groups:
  RecurrenceTests : pure date math in tasks/recurrence.py (no database)
  TaskModelTests  : Task.complete()/uncomplete() in tasks/models.py, which
                    create and clean up the next occurrence of repeating tasks
"""
from datetime import date

from django.test import SimpleTestCase, TestCase
from django.utils import timezone

from . import recurrence
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
