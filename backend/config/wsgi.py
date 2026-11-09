"""
wsgi.py - entry point for WSGI web servers (e.g. gunicorn, waitress).

Not used by `manage.py runserver` during development, but kept so the project
can be served by a production server later. It exposes `application`, which
the server calls for every request.
"""
import os

from django.core.wsgi import get_wsgi_application

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings")

application = get_wsgi_application()
