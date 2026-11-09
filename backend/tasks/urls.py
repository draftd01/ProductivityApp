"""
tasks/urls.py - maps /api/... paths to the views in tasks/views.py.

Included from config/urls.py under the "api/" prefix.

DRF's DefaultRouter auto-generates URLs for each ViewSet:
  projects/ and projects/<id>/
  tasks/ and tasks/<id>/ plus the @action routes
      (tasks/<id>/complete/, uncomplete/, history/, notes/)
  notes/<id>/
Visiting http://localhost:8000/api/ in a browser shows a clickable API index.
"""
from django.urls import include, path
from rest_framework.routers import DefaultRouter

from .views import CalendarView, NoteViewSet, ProjectViewSet, StatsView, TaskViewSet

router = DefaultRouter()
router.register("projects", ProjectViewSet, basename="project")
router.register("tasks", TaskViewSet, basename="task")
router.register("notes", NoteViewSet, basename="note")

urlpatterns = [
    path("", include(router.urls)),
    path("calendar/", CalendarView.as_view(), name="calendar"),
    path("stats/", StatsView.as_view(), name="stats"),
]
