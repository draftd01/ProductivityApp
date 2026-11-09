#!/usr/bin/env python
"""
manage.py - Django's command-line entry point.

Every `python manage.py <command>` call (runserver, migrate, makemigrations,
createsuperuser, test ...) starts here. All it does is point Django at our
settings module (config/settings.py) and hand the command line to Django.
"""
import os
import sys


def main():
    """Configure the settings module and run the requested Django command."""
    os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings")
    try:
        from django.core.management import execute_from_command_line
    except ImportError as exc:
        raise ImportError(
            "Couldn't import Django. Did you activate the virtual environment "
            "and run `pip install -r requirements.txt`?"
        ) from exc
    execute_from_command_line(sys.argv)


if __name__ == "__main__":
    main()
