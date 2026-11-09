"""
views.py - the API endpoints. Each class/function handles HTTP requests for
one URL pattern registered in tasks/urls.py.

Endpoint summary (all under /api/):
  GET/POST            projects/                 ProjectViewSet
  GET/PATCH/DELETE    projects/<id>/
  GET/POST            tasks/                    TaskViewSet (filterable list)
  GET/PATCH/DELETE    tasks/<id>/
  POST                tasks/<id>/complete/      mark done (+ spawn next repeat)
  POST                tasks/<id>/uncomplete/    re-open
  GET                 tasks/<id>/history/       all occurrences in a repeat series
  GET/POST            tasks/<id>/notes/         list / add notes on a task
  PATCH/DELETE        notes/<id>/               NoteViewSet (edit / delete a note)
  GET                 calendar/?start=&end=     CalendarView
  GET                 stats/?days=30            StatsView

The frontend calls these from src/api/client.js.
"""
from datetime import date

from django.db.models import Count, Q
from django.utils import timezone
from rest_framework import mixins, status, viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import ValidationError
from rest_framework.response import Response
from rest_framework.views import APIView

from . import stats
from .models import Note, Project, Task
from .serializers import (
    CalendarEventSerializer,
    NoteSerializer,
    ProjectSerializer,
    TaskSerializer,
)


def _parse_date(value, name):
    """Parse a YYYY-MM-DD query parameter or raise a 400 error."""
    try:
        return date.fromisoformat(value)
    except (TypeError, ValueError):
        raise ValidationError({name: "Expected a date in YYYY-MM-DD format."})


class ProjectViewSet(viewsets.ModelViewSet):
    """
    Full CRUD for projects. Each project in the list includes
    `open_task_count` for the sidebar (src/components/Sidebar.jsx).
    """

    serializer_class = ProjectSerializer

    def get_queryset(self):
        """All projects, annotated with how many open tasks each has."""
        return Project.objects.annotate(
            open_task_count=Count("tasks", filter=Q(tasks__is_completed=False))
        )


class TaskViewSet(viewsets.ModelViewSet):
    """
    CRUD for tasks plus completion, history and notes actions.

    List filters (query parameters), used by src/pages/TasksPage.jsx:
      status=open|completed|all   (default: open)
      view=today|upcoming|overdue (based on due_date)
      project=<id> | project=none (tasks with no project)
      search=<text>               (title/description contains)
    """

    serializer_class = TaskSerializer

    def get_queryset(self):
        """Build the filtered task list from the query parameters."""
        qs = Task.objects.select_related("project").annotate(
            note_count_annotated=Count("notes")
        )
        # Filters only apply to the list endpoint; detail/complete/etc. must
        # still find completed tasks by id.
        if self.action != "list":
            return qs

        params = self.request.query_params
        today = timezone.localdate()

        status_filter = params.get("status", "open")
        if status_filter == "open":
            qs = qs.filter(is_completed=False)
        elif status_filter == "completed":
            qs = qs.filter(is_completed=True).order_by("-completed_at")

        view = params.get("view")
        if view == "today":
            # "Today" includes overdue items so nothing slips through the cracks.
            qs = qs.filter(due_date__lte=today)
        elif view == "upcoming":
            qs = qs.filter(due_date__gt=today)
        elif view == "overdue":
            qs = qs.filter(due_date__lt=today)

        project = params.get("project")
        if project == "none":
            qs = qs.filter(project__isnull=True)
        elif project:
            qs = qs.filter(project_id=project)

        search = params.get("search")
        if search:
            qs = qs.filter(Q(title__icontains=search) | Q(description__icontains=search))

        return qs

    @action(detail=True, methods=["post"])
    def complete(self, request, pk=None):
        """
        POST /api/tasks/<id>/complete/
        Marks the task done. For repeating tasks the response also includes
        `next_occurrence` (the newly scheduled copy) so the UI can show it.
        """
        task = self.get_object()
        next_task = task.complete()
        task.refresh_from_db()
        return Response(
            {
                "task": TaskSerializer(task).data,
                "next_occurrence": TaskSerializer(next_task).data if next_task else None,
            }
        )

    @action(detail=True, methods=["post"])
    def uncomplete(self, request, pk=None):
        """POST /api/tasks/<id>/uncomplete/ - re-opens a completed task."""
        task = self.get_object()
        task.uncomplete()
        task.refresh_from_db()
        return Response({"task": TaskSerializer(task).data})

    @action(detail=True, methods=["get"])
    def history(self, request, pk=None):
        """
        GET /api/tasks/<id>/history/
        Every occurrence in this task's repeat series (oldest first). The
        per-task calendar (src/components/TaskCalendar.jsx) uses this to show
        each past completion of a repeating task.
        """
        task = self.get_object()
        occurrences = stats.series_history(task).annotate(
            note_count_annotated=Count("notes")
        )
        return Response(TaskSerializer(occurrences, many=True).data)

    @action(detail=True, methods=["get", "post"])
    def notes(self, request, pk=None):
        """
        GET  /api/tasks/<id>/notes/  -> list this task's notes
        POST /api/tasks/<id>/notes/  -> add a note: {"body": "..."}
        Used by src/components/NotesSection.jsx.
        """
        task = self.get_object()
        if request.method == "POST":
            serializer = NoteSerializer(data=request.data)
            serializer.is_valid(raise_exception=True)
            serializer.save(task=task)
            return Response(serializer.data, status=status.HTTP_201_CREATED)
        return Response(NoteSerializer(task.notes.all(), many=True).data)


class NoteViewSet(
    mixins.RetrieveModelMixin,
    mixins.UpdateModelMixin,
    mixins.DestroyModelMixin,
    viewsets.GenericViewSet,
):
    """
    Edit or delete a single note: /api/notes/<id>/.
    (Creating and listing notes happens through TaskViewSet.notes above.)
    """

    queryset = Note.objects.all()
    serializer_class = NoteSerializer


class CalendarView(APIView):
    """
    GET /api/calendar/?start=YYYY-MM-DD&end=YYYY-MM-DD[&project=<id>]
    Returns created/completed/due events in the date range for the month
    grid on src/pages/CalendarPage.jsx.
    """

    def get(self, request):
        """Validate the range and return the serialized events."""
        start = _parse_date(request.query_params.get("start"), "start")
        end = _parse_date(request.query_params.get("end"), "end")
        if end < start:
            raise ValidationError({"end": "Must be on or after start."})
        if (end - start).days > 400:
            raise ValidationError({"end": "Range is limited to about a year."})
        events = stats.calendar_events(start, end, request.query_params.get("project"))
        return Response(CalendarEventSerializer(events, many=True).data)


class StatsView(APIView):
    """
    GET /api/stats/?days=30
    Progress numbers (streaks, totals, per-day completions) for
    src/pages/ProgressPage.jsx.
    """

    def get(self, request):
        """Clamp `days` to a sane range and return progress_stats()."""
        try:
            days = int(request.query_params.get("days", 30))
        except ValueError:
            days = 30
        days = min(max(days, 7), 365)
        return Response(stats.progress_stats(days))
