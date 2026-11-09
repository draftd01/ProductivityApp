"""
models.py - the database tables (Django models) for the app.

Three models:
  Project : an optional list/folder to group tasks (like an Asana project).
  Task    : a to-do item. Completed tasks are NEVER deleted automatically -
            they keep `completed_at`, which powers the calendar and progress
            pages. Repeating tasks store their rule here too.
  Note    : a timestamped note attached to one Task (one Task -> many Notes).

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
"""
import uuid

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
    project = models.ForeignKey(
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
    def is_overdue(self):
        """True if the task is open and its due date is before today."""
        return (
            not self.is_completed
            and self.due_date is not None
            and self.due_date < timezone.localdate()
        )

    # --- Actions called by views.py ----------------------------------------
    @transaction.atomic
    def complete(self):
        """
        Mark this task complete and, if it repeats, create the next occurrence.

        Returns the newly created next occurrence (a Task) or None.
        Called by TaskViewSet.complete in tasks/views.py.
        """
        if self.is_completed:
            return None

        self.is_completed = True
        self.completed_at = timezone.now()
        self.save(update_fields=["is_completed", "completed_at", "updated_at"])

        # Only spawn the next occurrence once, even if the task is toggled
        # complete -> incomplete -> complete again.
        if not self.is_recurring or self.next_occurrences.exists():
            return None

        today = timezone.localdate()
        base = self.due_date or today
        next_date = recurrence.next_due_date(
            self.repeat_type,
            self.repeat_interval,
            recurrence.parse_days(self.repeat_days),
            base=base,
            today=today,
            end_date=self.repeat_end_date,
        )
        if next_date is None:
            return None  # The series has reached its end date.

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

        for nxt in self.next_occurrences.all():
            if not nxt.is_completed and not nxt.notes.exists():
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
