"""
apps.py - registers the `tasks` app with Django.

Django finds this class because "tasks" is listed in INSTALLED_APPS
(config/settings.py).
"""
from django.apps import AppConfig


class TasksConfig(AppConfig):
    """App configuration: the app's import name and default primary-key type."""

    default_auto_field = "django.db.models.BigAutoField"
    name = "tasks"
