"""
settings.py - project-wide Django configuration.

Referenced by:
  - manage.py, wsgi.py, asgi.py (via DJANGO_SETTINGS_MODULE="config.settings")

Key decisions for this personal app:
  - SQLite database stored in backend/db.sqlite3 (no server to install).
  - No authentication: this app is meant to run locally for one person.
    Do NOT expose it on the public internet as-is.
  - TIME_ZONE matters: "what day was this task completed?" is answered in this
    timezone, so the calendar and progress charts line up with your local day.
  - The React dev server (Vite, port 5173) proxies /api/* to Django (port 8000),
    so the browser sees one origin and no CORS configuration is needed.
"""
import os
from pathlib import Path

# BASE_DIR = the backend/ folder. Used to build paths like the database file.
BASE_DIR = Path(__file__).resolve().parent.parent

# Secret key used by Django for signing. Fine for local use; override with an
# environment variable if you ever deploy this somewhere.
SECRET_KEY = os.environ.get(
    "DJANGO_SECRET_KEY", "dev-only-insecure-key-change-me-if-you-deploy"
)

# DEBUG shows detailed error pages. Set DJANGO_DEBUG=0 to turn it off.
DEBUG = os.environ.get("DJANGO_DEBUG", "1") == "1"

ALLOWED_HOSTS = ["localhost", "127.0.0.1"]

# Apps that make up this project. `tasks` is ours; `rest_framework` (DRF)
# provides the JSON API tooling used in tasks/serializers.py and tasks/views.py.
INSTALLED_APPS = [
    "django.contrib.admin",
    "django.contrib.auth",
    "django.contrib.contenttypes",
    "django.contrib.sessions",
    "django.contrib.messages",
    "django.contrib.staticfiles",
    "rest_framework",
    "tasks",
]

MIDDLEWARE = [
    "django.middleware.security.SecurityMiddleware",
    "django.contrib.sessions.middleware.SessionMiddleware",
    "django.middleware.common.CommonMiddleware",
    "django.middleware.csrf.CsrfViewMiddleware",
    "django.contrib.auth.middleware.AuthenticationMiddleware",
    "django.contrib.messages.middleware.MessageMiddleware",
    "django.middleware.clickjacking.XFrameOptionsMiddleware",
]

# The root URL table lives in config/urls.py.
ROOT_URLCONF = "config.urls"

TEMPLATES = [
    {
        "BACKEND": "django.template.backends.django.DjangoTemplates",
        "DIRS": [],
        "APP_DIRS": True,
        "OPTIONS": {
            "context_processors": [
                "django.template.context_processors.request",
                "django.contrib.auth.context_processors.auth",
                "django.contrib.messages.context_processors.messages",
            ],
        },
    },
]

WSGI_APPLICATION = "config.wsgi.application"

# Single-file SQLite database. Delete db.sqlite3 + rerun migrate to start fresh.
DATABASES = {
    "default": {
        "ENGINE": "django.db.backends.sqlite3",
        "NAME": BASE_DIR / "db.sqlite3",
    }
}

AUTH_PASSWORD_VALIDATORS = []

LANGUAGE_CODE = "en-us"

# Timestamps are stored in UTC (USE_TZ=True) and converted to TIME_ZONE when we
# ask "which calendar day did this happen on?". Change via DJANGO_TIME_ZONE.
TIME_ZONE = os.environ.get("DJANGO_TIME_ZONE", "America/New_York")
USE_I18N = True
USE_TZ = True

STATIC_URL = "static/"

DEFAULT_AUTO_FIELD = "django.db.models.BigAutoField"

# Django REST Framework settings.
# - AllowAny: no login, because this is a single-user local app.
# - No authentication classes: also means DRF won't enforce CSRF on API calls
#   made by the React frontend.
REST_FRAMEWORK = {
    "DEFAULT_PERMISSION_CLASSES": ["rest_framework.permissions.AllowAny"],
    "DEFAULT_AUTHENTICATION_CLASSES": [],
    "UNAUTHENTICATED_USER": None,
}
