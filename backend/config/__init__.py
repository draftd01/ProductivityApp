"""
The `config` package is the Django *project* (as opposed to an *app*).

It holds project-wide wiring only:
  - settings.py : configuration (installed apps, database, timezone, DRF)
  - urls.py     : the root URL table, which forwards /api/ to the tasks app
  - wsgi.py / asgi.py : entry points used by production web servers

All business logic lives in the `tasks` app (backend/tasks/).
"""
