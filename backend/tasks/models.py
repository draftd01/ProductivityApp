"""
models.py - the database tables (Django models) for the app.

Four models (each also gets an automatic `id` primary key, an integer).
Project, Task and Note are described here; SkippedDate is at the end.

  Project : an optional list/folder to group tasks (like an Asana project).
      - name                : CharField (str, max 120 chars)
      - color               : CharField (str, hex color like "#4f6bed")
      - created_at          : DateTimeField (datetime, set automatically on create)
      - tasks               : reverse side of Task.project, not a column
                              (project.tasks.all() lists its tasks)

  Task    : a to-do item. Completed tasks are NEVER deleted automatically -
            they keep `completed_at`, which powers the calendar and progress
            pages. Repeating tasks store their rule here too.

      Required user input (creating a task fails without it):
      - title               : CharField (str, max 255 chars)

      Optional user input (the default in [brackets] is used if omitted):
      - description         : TextField (str, may be blank) [""]
      - project             : ForeignKey -> Project (or None) [None]
      - priority            : CharField (str: "low" | "medium" | "high") ["medium"]
      - due_date            : DateField (date, or None) [None]
      - repeat_type         : CharField (str: "none" | "daily" | "weekly" | "monthly" | "yearly") ["none"]
      - repeat_interval     : PositiveIntegerField (int >= 1, "every N" units) [1]
      - repeat_days         : CharField (str of weekday numbers, e.g. "0,1,2,3,4") [""]
                              (the API accepts this as `repeat_days_list`, e.g. [0, 1, 2, 3, 4])
      - repeat_end_date     : DateField (date, or None) [None]

      Changed only by actions (complete / uncomplete / ignore / unignore),
      read-only in the API:
      - is_completed        : BooleanField (bool) [False]
      - completed_at        : DateTimeField (datetime, or None while open) [None]
      - is_ignored          : BooleanField (bool; an overdue task you chose to skip) [False]
      - ignored_at          : DateTimeField (datetime, or None if not ignored) [None]

      Set automatically, never by the user:
      - created_at          : DateTimeField (datetime, set on create)
      - updated_at          : DateTimeField (datetime, set on every save)
      - series_id           : UUIDField (uuid, shared by all occurrences of a repeating task;
                              new UUID for a new task, copied when the next occurrence is made)
      - previous_occurrence : ForeignKey -> Task (or None; the occurrence before this one,
                              set when completing/ignoring creates the next occurrence)

      Reverse relations (not columns; access them as task.notes.all() etc.):
      - notes               : reverse side of Note.task
      - next_occurrences    : reverse side of previous_occurrence

  Note    : a timestamped note attached to one Task (one Task -> many Notes).
      - task                : ForeignKey -> Task (deleting the task deletes its notes)
      - body                : TextField (str)
      - created_at          : DateTimeField (datetime, set automatically on create)
      - updated_at          : DateTimeField (datetime, set automatically on every save)

  Field types are Django's; the Python type in parentheses is what you get
  when you read the attribute, e.g. task.due_date is a datetime.date.

Referenced by:
  - tasks/serializers.py (converts these to/from JSON)
  - tasks/views.py       (queries and updates them)
  - tasks/stats.py       (calendar + progress aggregation)
  - tasks/admin.py       (Django admin screens)

How repeating tasks work
------------------------
Each occurrence of a repeating task is its own Task row. When you complete
one, Task.complete() creates the next occurrence (a copy with a new due date,
computed by tasks/recurrence.py). All occurrences share the same `series_id`,
and each new one points back to the one before via `previous_occurrence`.
So your history shows every individual completion, and notes stay attached
to the specific day's occurrence they were written on.

Task states
-----------
A task is in exactly one of three states:
  open      : is_completed=False, is_ignored=False
  completed : is_completed=True
  ignored   : is_ignored=True  - an overdue task you decided to let go of.
              It is kept (with its notes) but no longer counts as open or
              overdue. Ignoring an occurrence of a repeating task still
              schedules the next one, just like completing it.

Changing one day of a repeating task (like Google Calendar)
-----------------------------------------------------------
Future repeats exist only as "projected" dates until the series reaches
them. From the calendar or the task panel you can:
  - complete ONE day ahead of time  -> Task.complete_on_date(day): creates a
        completed row for just that day.
  - remove ONE day (holiday)        -> Task.remove_on_date(day): records a
        SkippedDate, so the day simply disappears. Nothing is shown for it.
        If that day is the open occurrence, its due date moves forward.
  - remove this day AND FOLLOWING   -> Task.remove_from_date(day): ends the
        series the day before (repeat_end_date) and deletes open rows from
        that day on. Completed/ignored history is kept.
Days that already have a row or a SkippedDate are "taken" (Task.taken_dates)
and are never scheduled or projected again.

  SkippedDate : one removed day of a repeating series (an "exception date").
      - series_id           : UUIDField (the Task.series_id it belongs to)
      - date                : DateField (the removed day)
      - created_at          : DateTimeField (set automatically on create)
"""
import uuid
from datetime import timedelta

from django.db import models, transaction
from django.utils import timezone

from . import recurrence


class Project(models.Model):
    """A named group of tasks, shown in the sidebar (e.g. "Work", "Home")."""

    name = models.CharField(max_length=120)
    # Hex color string used for the dot next to the project name in the UI.
    color = models.CharField(max_length=7, default="#4f6bed")
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["name"]

    def __str__(self):
        """Readable name in the Django admin and shell."""
        return self.name


class Task(models.Model):
    """A single to-do item (or one occurrence of a repeating task)."""

    PRIORITY_CHOICES = [
        ("low", "Low"),
        ("medium", "Medium"),
        ("high", "High"),
    ]
    REPEAT_CHOICES = [
        (recurrence.REPEAT_NONE, "Does not repeat"),
        (recurrence.REPEAT_DAILY, "Daily"),
        (recurrence.REPEAT_WEEKLY, "Weekly"),
        (recurrence.REPEAT_MONTHLY, "Monthly"),
        (recurrence.REPEAT_YEARLY, "Yearly"),
    ]

    # --- Core fields -------------------------------------------------------
    title = models.CharField(max_length=255)
    description = models.TextField(blank=True)
    project = models.ForeignKey( # many-to-one relationship with Project
        Project,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,  # Deleting a project keeps its tasks.
        related_name="tasks",
    )
    priority = models.CharField(
        max_length=10, choices=PRIORITY_CHOICES, default="medium"
    )
    due_date = models.DateField(null=True, blank=True)

    # --- Lifecycle timestamps (shown on the per-task calendar) --------------
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    is_completed = models.BooleanField(default=False)
    completed_at = models.DateTimeField(null=True, blank=True)
    # "Ignored" = an overdue task you chose to skip (see ignore() below).
    is_ignored = models.BooleanField(default=False)
    ignored_at = models.DateTimeField(null=True, blank=True)

    # --- Repeat rule (see tasks/recurrence.py for the meaning) -------------
    repeat_type = models.CharField(
        max_length=10, choices=REPEAT_CHOICES, default=recurrence.REPEAT_NONE
    )
    repeat_interval = models.PositiveIntegerField(default=1)
    # Comma-separated weekday numbers, Monday=0 ... Sunday=6. "0,1,2,3,4" = weekdays.
    repeat_days = models.CharField(max_length=20, blank=True, default="")
    repeat_end_date = models.DateField(null=True, blank=True)

    # --- Links between occurrences of the same repeating task ---------------
    series_id = models.UUIDField(default=uuid.uuid4, db_index=True)
    previous_occurrence = models.ForeignKey(
        "self",
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="next_occurrences",
    )

    class Meta:
        # Open tasks first, then by due date (no-due-date last), then newest.
        ordering = ["is_completed", models.F("due_date").asc(nulls_last=True), "-created_at"]

    def __str__(self):
        """Readable name in the Django admin and shell."""
        return self.title

    # --- Convenience properties used by serializers ------------------------
    @property
    def is_recurring(self):
        """True if this task has a repeat rule."""
        return self.repeat_type != recurrence.REPEAT_NONE

    @property
    def is_open(self):
        """True if the task is neither completed nor ignored."""
        return not self.is_completed and not self.is_ignored

    @property
    def is_overdue(self):
        """True if the task is open and its due date is before today."""
        return (
            self.is_open
            and self.due_date is not None
            and self.due_date < timezone.localdate()
        )

    # --- Actions called by views.py ----------------------------------------
    @transaction.atomic
    def complete(self):
        """
        Mark this task complete and, if it repeats, create the next occurrence.
        Completing an ignored task is allowed and clears the ignored state.

        Returns the newly created next occurrence (a Task) or None.
        Called by TaskViewSet.complete in tasks/views.py.
        """
        if self.is_completed:
            return None

        self.is_completed = True
        self.completed_at = timezone.now()
        self.is_ignored = False
        self.ignored_at = None
        self.save(
            update_fields=["is_completed", "completed_at", "is_ignored", "ignored_at", "updated_at"]
        )
        return self._spawn_next()

    @transaction.atomic
    def uncomplete(self):
        """
        Re-open a completed task.

        If completing it had spawned a next occurrence that you haven't touched
        yet (still open, no notes), that occurrence is removed so you don't end
        up with duplicates. Called by TaskViewSet.uncomplete in tasks/views.py.
        """
        if not self.is_completed:
            return
        self.is_completed = False
        self.completed_at = None
        self.save(update_fields=["is_completed", "completed_at", "updated_at"])
        self._remove_untouched_next()

    @transaction.atomic
    def ignore(self):
        """
        Let go of an overdue task: it stays in the database with its notes, but
        no longer counts as open or overdue. For a repeating task, the next
        occurrence is scheduled just as if it had been completed.

        Only open, overdue tasks can be ignored; anything else raises
        ValueError (views.py turns that into a 400 response).
        Returns the next occurrence (a Task) or None.
        Called by TaskViewSet.ignore in tasks/views.py.
        """
        if not self.is_overdue:
            raise ValueError("Only open tasks that are past due can be ignored.")
        self.is_ignored = True
        self.ignored_at = timezone.now()
        self.save(update_fields=["is_ignored", "ignored_at", "updated_at"])
        return self._spawn_next()

    # --- One day of a repeating series (Google Calendar style) -------------
    # Called by TaskViewSet.occurrence in tasks/views.py. `self` can be any
    # task of the series; `day` is the date being acted on.

    def _row_on(self, day):
        """
        The open row of this series due on `day`, or None when `day` is a
        projected future date (no row yet). Raises ValueError if the series
        has no occurrence on `day` at all.
        """
        from . import stats  # Imported here because stats.py imports this module.

        if not self.is_recurring:
            raise ValueError("Only repeating tasks have per-day occurrences.")
        row = Task.objects.filter(
            series_id=self.series_id, due_date=day, is_completed=False, is_ignored=False
        ).first()
        if row is None and day not in stats.series_projection(self, day, day):
            raise ValueError("This task has no occurrence scheduled on that day.")
        return row

    @transaction.atomic
    def complete_on_date(self, day):
        """
        Complete only the occurrence on `day`.
          - If it's the open occurrence: a normal complete() (schedules the next).
          - If it's a projected future day: creates a row for just that day,
            already completed. The series' open occurrence is untouched, and
            the series steps over that day when it gets there (taken_dates).
        Returns (the row for that day, the newly scheduled next occurrence or None).
        """
        from . import stats

        row = self._row_on(day)
        if row is not None:
            return row, row.complete()

        template = stats.projection_base(self.series_id)  # The open occurrence.
        row = Task.objects.create(
            title=template.title,
            description=template.description,
            project=template.project,
            priority=template.priority,
            due_date=day,
            repeat_type=template.repeat_type,
            repeat_interval=template.repeat_interval,
            repeat_days=template.repeat_days,
            repeat_end_date=template.repeat_end_date,
            series_id=self.series_id,
            # Not linked to an earlier occurrence: it was made ahead of time,
            # outside the normal complete -> next chain.
            previous_occurrence=None,
            is_completed=True,
            completed_at=timezone.now(),
        )
        return row, None

    @transaction.atomic
    def remove_on_date(self, day):
        """
        "Remove this event only": the occurrence on `day` disappears, nothing
        else in the series changes. Recorded as a SkippedDate.
          - Projected future day: just the SkippedDate.
          - The open occurrence's own day: the task is moved to the series'
            next date (so its notes are kept). If there is no next date (the
            series ends), the task is deleted.
        Returns the moved task, or None.
        """
        row = self._row_on(day)
        SkippedDate.objects.get_or_create(series_id=self.series_id, date=day)
        if row is None:
            return None

        next_date = row._next_date()  # Steps over `day`, now a SkippedDate.
        if next_date is None or row._other_open_on_or_before(next_date):
            row.delete()
            return None
        row.due_date = next_date
        row.save(update_fields=["due_date", "updated_at"])
        return row

    @transaction.atomic
    def restore_on_date(self, day, move_back=False):
        """
        Undo remove_on_date(day): delete the SkippedDate so the day comes
        back. With move_back=True (used when removing had moved this task
        forward), this open task's due date is set back to `day`.
        """
        SkippedDate.objects.filter(series_id=self.series_id, date=day).delete()
        if move_back and self.is_open and self.due_date and self.due_date > day:
            self.due_date = day
            self.save(update_fields=["due_date", "updated_at"])

    @transaction.atomic
    def remove_from_date(self, day):
        """
        "Remove this and following events": end the series the day before
        `day`. Open occurrences due on or after `day` are deleted (with their
        notes); completed and ignored history is kept. Earlier open
        occurrences stay, with the new end date, so nothing repeats past it.
        Returns the number of tasks deleted.
        """
        self._row_on(day)  # Validates that `day` is an occurrence.
        series = Task.objects.filter(series_id=self.series_id)
        doomed = series.filter(is_completed=False, is_ignored=False, due_date__gte=day)
        deleted = doomed.count()
        doomed.delete()
        last_day = day - timedelta(days=1)
        series.filter(
            models.Q(repeat_end_date__isnull=True) | models.Q(repeat_end_date__gt=last_day)
        ).update(repeat_end_date=last_day)
        SkippedDate.objects.filter(series_id=self.series_id, date__gte=day).delete()
        return deleted

    def taken_dates(self):
        """
        Days of this task's series that must never be scheduled or projected
        again: due dates that already have a row (open, completed or
        ignored), plus removed days (SkippedDate).
        """
        rows = Task.objects.filter(series_id=self.series_id, due_date__isnull=False)
        skipped = SkippedDate.objects.filter(series_id=self.series_id)
        return set(rows.values_list("due_date", flat=True)) | set(
            skipped.values_list("date", flat=True)
        )

    @transaction.atomic
    def unignore(self):
        """
        Restore an ignored task to open (it will count as overdue again).
        Like uncomplete(), removes an untouched next occurrence that ignoring
        had created. Called by TaskViewSet.unignore in tasks/views.py.
        """
        if not self.is_ignored:
            return
        self.is_ignored = False
        self.ignored_at = None
        self.save(update_fields=["is_ignored", "ignored_at", "updated_at"])
        self._remove_untouched_next()

    # --- Helpers shared by the actions above -------------------------------
    def _next_date(self):
        """
        The date the occurrence after this one should be due, or None (not
        repeating, or past the series' end date). Counts from this task's
        due date (or today) and steps over taken days (see taken_dates).
        """
        if not self.is_recurring:
            return None
        today = timezone.localdate()
        return recurrence.next_due_date(
            self.repeat_type,
            self.repeat_interval,
            recurrence.parse_days(self.repeat_days),
            base=self.due_date or today,
            today=today,
            end_date=self.repeat_end_date,
            skip=self.taken_dates(),
        )

    def _other_open_on_or_before(self, day):
        """
        True if another open row of this series is due on or before `day`.
        E.g. you re-opened a future day you had completed ahead of time and
        complete it again: the series' real open occurrence (earlier) still
        carries the schedule, so no second chain should be started.
        """
        return (
            Task.objects.filter(
                series_id=self.series_id, is_completed=False, is_ignored=False,
                due_date__lte=day,
            )
            .exclude(pk=self.pk)
            .exists()
        )

    def _spawn_next(self):
        """
        If this task repeats, create its next occurrence and return it.
        Used by complete() and ignore(). Returns None for non-repeating tasks,
        when the series has reached its end date, when a next occurrence
        already exists (so toggling complete/ignore never creates duplicates),
        or when another open row of the series already covers that date.
        """
        if not self.is_recurring or self.next_occurrences.exists():
            return None
        next_date = self._next_date()
        if next_date is None or self._other_open_on_or_before(next_date):
            return None

        return Task.objects.create(
            title=self.title,
            description=self.description,
            project=self.project,
            priority=self.priority,
            due_date=next_date,
            repeat_type=self.repeat_type,
            repeat_interval=self.repeat_interval,
            repeat_days=self.repeat_days,
            repeat_end_date=self.repeat_end_date,
            series_id=self.series_id,
            previous_occurrence=self,
        )

    def _remove_untouched_next(self):
        """
        Delete next occurrences that were auto-created but never used (still
        open and without notes). Used by uncomplete() and unignore() so that
        re-opening a task doesn't leave two open copies of it.
        """
        for nxt in self.next_occurrences.all():
            if nxt.is_open and not nxt.notes.exists():
                nxt.delete()


class Note(models.Model):
    """A timestamped note written under a task (shown in the task panel)."""

    task = models.ForeignKey(Task, on_delete=models.CASCADE, related_name="notes")
    body = models.TextField()
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["created_at"]

    def __str__(self):
        """First few words of the note, for the Django admin."""
        return self.body[:50]


class SkippedDate(models.Model):
    """
    One removed day of a repeating series (like an "exception date" in
    Google Calendar): that day is never scheduled or shown. Created by
    Task.remove_on_date(), removed again by Task.restore_on_date() (undo) or
    Task.remove_from_date(). Linked by series_id rather than a ForeignKey
    because the day usually has no Task row.
    """

    series_id = models.UUIDField(db_index=True)
    date = models.DateField()
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["date"]
        constraints = [
            models.UniqueConstraint(fields=["series_id", "date"], name="unique_skipped_date")
        ]

    def __str__(self):
        """e.g. "2026-11-25 (series 1b2c...)" in the Django admin."""
        return f"{self.date} (series {str(self.series_id)[:8]}...)"
