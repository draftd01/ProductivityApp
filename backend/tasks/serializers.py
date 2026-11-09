"""
serializers.py - converts models to JSON (for responses) and validates JSON
into models (for create/update requests).

Used by tasks/views.py. The JSON shapes defined here are what the React
frontend receives in src/api/client.js and renders in its components.
"""
from rest_framework import serializers

from . import recurrence
from .models import Note, Project, Task


class ProjectSerializer(serializers.ModelSerializer):
    """
    Project JSON, plus `open_task_count` for the sidebar badge.
    The count is annotated onto the queryset in ProjectViewSet (views.py).
    """

    open_task_count = serializers.IntegerField(read_only=True, default=0)

    class Meta:
        model = Project
        fields = ["id", "name", "color", "created_at", "open_task_count"]
        read_only_fields = ["created_at"]


class NoteSerializer(serializers.ModelSerializer):
    """A note's JSON. `task` is set by the view, not by the client."""

    class Meta:
        model = Note
        fields = ["id", "task", "body", "created_at", "updated_at"]
        read_only_fields = ["task", "created_at", "updated_at"]


class TaskSerializer(serializers.ModelSerializer):
    """
    Task JSON used for lists and the detail panel.

    Extra read-only fields beyond the model columns:
      - is_recurring / is_overdue : computed properties from models.Task
      - repeat_days_list          : repeat_days as a list of ints for the UI
      - note_count                : number of notes (badge in the task list)
      - project_name / project_color : so the list can show the project chip
                                       without another request
    """

    is_recurring = serializers.BooleanField(read_only=True)
    is_overdue = serializers.BooleanField(read_only=True)
    note_count = serializers.SerializerMethodField()
    project_name = serializers.CharField(source="project.name", read_only=True, default=None)
    project_color = serializers.CharField(source="project.color", read_only=True, default=None)
    # Accept weekdays as a JSON list, e.g. [0,1,2,3,4]. It's write_only here
    # because the model has no such attribute; to_representation() below adds
    # it back to the output from the stored `repeat_days` string.
    repeat_days_list = serializers.ListField(
        child=serializers.IntegerField(min_value=0, max_value=6),
        required=False,
        write_only=True,
    )

    class Meta:
        model = Task
        fields = [
            "id",
            "title",
            "description",
            "project",
            "project_name",
            "project_color",
            "priority",
            "due_date",
            "created_at",
            "updated_at",
            "is_completed",
            "completed_at",
            "repeat_type",
            "repeat_interval",
            "repeat_days_list",
            "repeat_end_date",
            "series_id",
            "previous_occurrence",
            "is_recurring",
            "is_overdue",
            "note_count",
        ]
        # Completion is changed only through the /complete/ and /uncomplete/
        # endpoints so the recurrence logic in Task.complete() always runs.
        read_only_fields = [
            "created_at",
            "updated_at",
            "is_completed",
            "completed_at",
            "series_id",
            "previous_occurrence",
        ]

    def get_note_count(self, obj):
        """Use the annotated count from the view if present, else query it."""
        annotated = getattr(obj, "note_count_annotated", None)
        return annotated if annotated is not None else obj.notes.count()

    def to_representation(self, instance):
        """Add `repeat_days_list` (list of ints) built from the stored string."""
        data = super().to_representation(instance)
        data["repeat_days_list"] = recurrence.parse_days(instance.repeat_days)
        return data

    def validate(self, attrs):
        """
        Convert `repeat_days_list` into the stored comma string and sanity
        check the repeat rule (e.g. weekly rules need valid weekdays).
        """
        days = attrs.pop("repeat_days_list", None)
        if days is not None:
            attrs["repeat_days"] = ",".join(str(d) for d in sorted(set(days)))

        repeat_type = attrs.get(
            "repeat_type", getattr(self.instance, "repeat_type", recurrence.REPEAT_NONE)
        )
        if repeat_type == recurrence.REPEAT_NONE:
            # Clear leftovers so a non-repeating task has a clean rule.
            attrs["repeat_days"] = ""
            attrs["repeat_interval"] = 1
            attrs["repeat_end_date"] = None
        elif repeat_type != recurrence.REPEAT_WEEKLY:
            attrs["repeat_days"] = ""  # Weekdays only apply to weekly rules.

        if attrs.get("repeat_interval") is not None and attrs["repeat_interval"] < 1:
            raise serializers.ValidationError({"repeat_interval": "Must be at least 1."})
        return attrs


class CalendarEventSerializer(serializers.Serializer):
    """
    One dot on the calendar: something that happened to a task on a date.
    Built in tasks/stats.py (calendar_events) - not backed by a model.
    """

    date = serializers.DateField()
    type = serializers.ChoiceField(choices=["created", "completed", "due"])
    task_id = serializers.IntegerField()
    title = serializers.CharField()
    is_completed = serializers.BooleanField()
    project_color = serializers.CharField(allow_null=True)
