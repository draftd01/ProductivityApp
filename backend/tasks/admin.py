"""
admin.py - registers the models with Django's built-in admin site
(http://localhost:8000/admin/, after `python manage.py createsuperuser`).

Handy for inspecting or bulk-fixing data directly; the React app doesn't use it.
"""
from django.contrib import admin

from .models import Note, Project, Task


class NoteInline(admin.TabularInline):
    """Show a task's notes inline on the task's admin page."""

    model = Note
    extra = 0


@admin.register(Task)
class TaskAdmin(admin.ModelAdmin):
    """Admin list/search/filter configuration for tasks."""

    list_display = ("title", "project", "due_date", "is_completed", "completed_at", "repeat_type")
    list_filter = ("is_completed", "repeat_type", "priority", "project")
    search_fields = ("title", "description")
    inlines = [NoteInline]


@admin.register(Project)
class ProjectAdmin(admin.ModelAdmin):
    """Admin list configuration for projects."""

    list_display = ("name", "color", "created_at")


@admin.register(Note)
class NoteAdmin(admin.ModelAdmin):
    """Admin list configuration for notes."""

    list_display = ("task", "body", "created_at")
