"""
asgi.py - entry point for ASGI web servers (e.g. uvicorn, daphne).

The async counterpart of wsgi.py. Unused in development; kept for completeness.
"""
import os

from django.core.asgi import get_asgi_application

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings")

application = get_asgi_application()
