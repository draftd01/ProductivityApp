"""
config/urls.py - the root URL table.

Django checks incoming request paths against `urlpatterns` top to bottom:
  /admin/  -> Django's built-in admin site (models registered in tasks/admin.py)
  /api/    -> everything defined in tasks/urls.py (the JSON API the React app uses)
"""
from django.contrib import admin
from django.urls import include, path

urlpatterns = [
    path("admin/", admin.site.urls),
    path("api/", include("tasks.urls")),
]
