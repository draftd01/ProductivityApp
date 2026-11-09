# Taskboard: personal productivity app

A single-user task tracker, loosely modeled on Asana. The backend is Django + Django REST Framework and the frontend is React (Vite).

## Features

- **Tasks** with a title, description, project, priority and due date.
- **Projects** to group tasks, shown in the sidebar with open-task counts.
- **Repeating tasks**: every day, every weekday (Mon–Fri), every weekend, weekly, monthly or yearly. A custom option lets you pick every *N* days/weeks/months/years, choose specific weekdays and set an end date.
- **Completed tasks are kept.** Completing a task records `completed_at`. Completing a repeating task also schedules the next occurrence, so you get a full history of every completion.
- **Notes** under each task, with timestamps. You can edit and delete them.
- **Per-task calendar** in the task panel that marks the days the task was created, is due and was completed, including every completion of a repeating task.
- **Calendar page** with a month view of everything created, due and completed. You can filter it by event type or project.
- **Progress page** with completions today and this week, current and longest streaks, overdue count, a per-day completion chart (30/90/365 days) and recent completions.

## Setup (Windows)

You need **Python 3.10+** (https://www.python.org/downloads/, check "Add Python to PATH" in the installer) and **Node.js 18+** (https://nodejs.org).

### 1. Backend (terminal #1)

```powershell
cd backend
python -m venv .venv
.\.venv\Scripts\Activate.ps1          # if blocked: Set-ExecutionPolicy -Scope CurrentUser RemoteSigned
pip install -r requirements.txt
python manage.py makemigrations tasks
python manage.py migrate
python manage.py runserver            # http://127.0.0.1:8000
```

Optional:
- `python manage.py test` runs the recurrence and completion tests.
- `python manage.py createsuperuser` lets you log in to the admin at http://127.0.0.1:8000/admin/.
- http://127.0.0.1:8000/api/ is DRF's clickable API browser.

### 2. Frontend (terminal #2)

```powershell
cd frontend
npm install
npm run dev                           # http://localhost:5173
```

Open **http://localhost:5173**. Vite forwards `/api/*` requests to Django, so both servers need to be running.

> Timezone: the settings default to `America/New_York` so that "completed today" matches your local day. To change it, edit `TIME_ZONE` in `backend/config/settings.py` or set the `DJANGO_TIME_ZONE` environment variable.

> This app has **no login**. It's designed to run locally on your own machine. Don't expose it to the internet as-is.

## How the pieces fit together

```
Browser (React, :5173)                          Django (:8000)
──────────────────────                          ──────────────
main.jsx → App.jsx (routes)                     config/urls.py
  ├─ Sidebar.jsx                                   └─ /api/ → tasks/urls.py
  ├─ pages/TasksPage.jsx                                      └─ tasks/views.py
  │    ├─ QuickAddTask.jsx                                        ├─ serializers.py (JSON ⇄ models)
  │    ├─ TaskList.jsx → TaskRow.jsx                              ├─ models.py (Project, Task, Note)
  │    └─ TaskDetailPanel.jsx                                     │    └─ recurrence.py (next due date)
  │         ├─ RepeatEditor.jsx                                   └─ stats.py (calendar + progress)
  │         ├─ TaskCalendar.jsx → MonthCalendar.jsx
  │         └─ NotesSection.jsx
  ├─ pages/CalendarPage.jsx → MonthCalendar.jsx, TaskDetailPanel.jsx
  └─ pages/ProgressPage.jsx → CompletionChart.jsx

Shared frontend helpers:
  api/client.js          every HTTP call (one function per endpoint)
  hooks/useTaskToggle.js complete/uncomplete + "next occurrence" toast
  utils/dates.js         date parsing/formatting, month grids
  utils/recurrence.js    repeat presets ⇄ backend rule fields, "Every weekday" text
```

### API endpoints

| Method | Path | Purpose |
|---|---|---|
| GET/POST | `/api/projects/` | list / create projects |
| PATCH/DELETE | `/api/projects/<id>/` | edit / delete a project (its tasks are kept) |
| GET/POST | `/api/tasks/?status=open\|completed\|all&view=today\|upcoming\|overdue&project=<id>&search=` | list / create tasks |
| GET/PATCH/DELETE | `/api/tasks/<id>/` | one task |
| POST | `/api/tasks/<id>/complete/` | complete (returns `next_occurrence` for repeating tasks) |
| POST | `/api/tasks/<id>/uncomplete/` | reopen |
| GET | `/api/tasks/<id>/history/` | every occurrence in a repeat series |
| GET/POST | `/api/tasks/<id>/notes/` | list / add notes |
| PATCH/DELETE | `/api/notes/<id>/` | edit / delete a note |
| GET | `/api/calendar/?start=YYYY-MM-DD&end=YYYY-MM-DD` | created/due/completed events |
| GET | `/api/stats/?days=30` | progress numbers |

### How repeating tasks work

Each occurrence of a repeating task is its own row in the database, and all occurrences share a `series_id`. When you complete one, `Task.complete()` (in `models.py`) asks `recurrence.next_due_date()` for the next date and creates a copy due on that date. If you complete an overdue occurrence late, any missed dates are skipped so the next one is never in the past. If you reopen a task, the auto-created next occurrence is removed, as long as you haven't completed it or added notes to it.

"Weekdays only" is stored as `repeat_type="weekly"`, `repeat_interval=1`, `repeat_days="0,1,2,3,4"` (Monday=0).
