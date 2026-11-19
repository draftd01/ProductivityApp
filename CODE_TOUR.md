# Code tour: reading order for this project

This guide gives an order for reading the codebase so you understand how it fits together as quickly as possible. It assumes you know some Python and JavaScript, but not necessarily Django REST Framework or React.

It follows the data: you start with what the app stores, then how the backend exposes it, then how the frontend displays and changes it. Every file has a header comment explaining its purpose and which files use it. Read that comment first, then skim the rest of the file.

You don't need to understand every line on the first pass. For each file, the goal is to answer the **"Check yourself"** question. If you can, move on.

---

## Stage 0: Run it and use it

Before reading any code, follow the setup steps in [README.md](README.md) and use the app for a few minutes. Open your browser's DevTools (**F12**) on the **Network** tab while you do.

- Create a project, add a few tasks, and give one of them a repeat rule (try "Every weekday").
- Complete the repeating task and watch a new copy appear with the next due date.
- Open a task, add a note, and look at the small calendar in the panel.
- Visit the Calendar and Progress pages.

In the Network tab, click the requests to `/api/...` and look at the JSON that comes back. Knowing what the app *does* makes the code much easier to follow.

---

## Stage 1: Orientation (what is this built with?)

| File | What to look for |
|---|---|
| [README.md](README.md) | Features, setup, the architecture diagram, and the endpoint table. Come back to the diagram whenever you feel lost. |
| [backend/requirements.txt](backend/requirements.txt) | Only two dependencies: Django and Django REST Framework (DRF). |
| [frontend/package.json](frontend/package.json) | React, react-router (page URLs) and Vite (the dev server). The `scripts` section shows how the frontend runs. |
| [frontend/vite.config.js](frontend/vite.config.js) | The **proxy**: requests to `/api` are forwarded to Django on port 8000. That's how the two halves connect. |
| [backend/config/settings.py](backend/config/settings.py) | Skim it. Note `INSTALLED_APPS`, the SQLite database, `TIME_ZONE`, and the `REST_FRAMEWORK` block (no login). |

**Check yourself:** When the React app requests `/api/tasks/`, which program actually answers, and on which port?

---

## Stage 2: The data (what does the app store?)

Start here because everything else in the app exists to create, display or change these records.

| File | What to look for |
|---|---|
| [backend/tasks/models.py](backend/tasks/models.py) | The main models: `Project`, `Task`, `Note`, plus the small `SkippedDate` (a removed day of a repeating task). On `Task`, notice the lifecycle fields (`created_at`, `is_completed`, `completed_at`, `is_ignored`, `ignored_at`), the `repeat_*` fields, and `series_id` / `previous_occurrence`. The "Task states" section of the docstring explains open vs. completed vs. ignored. Read `complete()`, `uncomplete()`, `ignore()` and `unignore()` carefully, along with the two helpers they share (`_spawn_next()` and `_remove_untouched_next()`); they hold the most important logic in the app. Then skim the "one day of a repeating series" methods (`complete_on_date()`, `remove_on_date()`, `remove_from_date()`), which work like Google Calendar's "this event" / "this and following events". |
| [backend/tasks/recurrence.py](backend/tasks/recurrence.py) | Pure date math with no database involved. `next_due_date()` is what `Task.complete()` calls. The module docstring explains how "weekdays only" is stored. |
| [backend/tasks/tests.py](backend/tasks/tests.py) | Read the tests as **examples of expected behavior**. Each test name states a rule, e.g. "completing a daily task creates tomorrow's occurrence." Run them with `python manage.py test`. |

**Check yourself:** When you complete a repeating task, is the same row updated with a new due date, or is a new row created? How are the occurrences linked together?

---

## Stage 3: The API (how does the backend expose the data?)

Follow the path a request takes through Django:

| File | What to look for |
|---|---|
| [backend/config/urls.py](backend/config/urls.py) | The root URL table. Everything under `/api/` is handed to the tasks app. |
| [backend/tasks/urls.py](backend/tasks/urls.py) | DRF's `DefaultRouter` generates URLs for each ViewSet. Plus two plain views: `calendar/` and `stats/`. |
| [backend/tasks/views.py](backend/tasks/views.py) | The docstring at the top lists every endpoint. In `TaskViewSet`, read `get_queryset()` (how list filters like `?status=open&view=today` work) and the `@action` methods (`complete`, `uncomplete`, `ignore`, `unignore`, `history`, `notes`). Notice that the views are short and call into models, serializers and stats. |
| [backend/tasks/serializers.py](backend/tasks/serializers.py) | Converts models to JSON and validates incoming JSON. `TaskSerializer` is the interesting one. `validate()` is called automatically by DRF during `serializer.is_valid()`; you won't find a direct call to it. `to_representation()` runs when a task is converted to JSON. |
| [backend/tasks/stats.py](backend/tasks/stats.py) | Read-only queries for the Calendar and Progress pages. Notice how timestamps are converted to *local* dates before grouping by day. |
| [backend/tasks/admin.py](backend/tasks/admin.py) | Optional. Registers the models in Django's admin site at `/admin/`. |

**Try it:** with the backend running, open http://127.0.0.1:8000/api/ in a browser. DRF's browsable API lets you click through and call every endpoint by hand.

**Check yourself:** Name every file a `POST /api/tasks/5/complete/` request passes through, in order, before the response is sent.

---

## Stage 4: The bridge (how does the frontend call the API?)

| File | What to look for |
|---|---|
| [frontend/src/api/client.js](frontend/src/api/client.js) | One small function per endpoint, matching the list in `views.py`. Components never call `fetch()` directly; they import from here. When you see `api.something()` in a component, this is where it goes. |

**Check yourself:** Which function would a component call to add a note, and what URL does it request?

---

## Stage 5: Frontend skeleton (how does the UI start up?)

| File | What to look for |
|---|---|
| [frontend/index.html](frontend/index.html) | The only HTML page. It has an empty `<div id="root">` and loads `main.jsx`. |
| [frontend/src/main.jsx](frontend/src/main.jsx) | Mounts `<App />` into that div and wraps it in the router. |
| [frontend/src/App.jsx](frontend/src/App.jsx) | The **route table**: which URL shows which page. Also holds the shared `projects` list and passes it down as props. |
| [frontend/src/components/Sidebar.jsx](frontend/src/components/Sidebar.jsx) | Navigation links (each matches a route in `App.jsx`) and creating/deleting projects. |

**Check yourself:** `/today` and `/completed` show different lists. Are they different components? What tells them apart?

---

## Stage 6: The main page (the task list)

Read top-down, from the page to its children, then the helpers they use:

| File | What to look for |
|---|---|
| [frontend/src/pages/TasksPage.jsx](frontend/src/pages/TasksPage.jsx) | One component handles five routes through its `mode` prop. Look at how `mode` becomes API query parameters (`params`) and how tasks are grouped into "Overdue", "Today", etc. |
| [frontend/src/components/QuickAddTask.jsx](frontend/src/components/QuickAddTask.jsx) | The "Add a task…" form. The same component also appears in a compact, stacked layout (the `compact` prop) on the Calendar page. |
| [frontend/src/components/TaskList.jsx](frontend/src/components/TaskList.jsx) | Draws the groups. Contains no logic of its own. |
| [frontend/src/components/TaskRow.jsx](frontend/src/components/TaskRow.jsx) | One line per task. Notice `e.stopPropagation()` on the checkbox: it stops the click from also opening the task's panel. |
| [frontend/src/hooks/useTaskToggle.js](frontend/src/hooks/useTaskToggle.js) | Shared complete/reopen logic, plus the "Next one scheduled for…" message. Used by both TasksPage and CalendarPage. |
| [frontend/src/utils/dates.js](frontend/src/utils/dates.js) | Date helpers. Read the header comment about why `"2026-03-09"` must be parsed as a *local* date. That rule matters throughout the frontend. |
| [frontend/src/utils/recurrence.js](frontend/src/utils/recurrence.js) | Converts friendly presets ("Every weekday") into the backend's repeat fields and back. It's the frontend counterpart of `recurrence.py`. |

**Check yourself:** Trace what happens when you tick a task's checkbox, from `TaskRow` to the list refreshing on screen.

---

## Stage 7: The task detail panel

| File | What to look for |
|---|---|
| [frontend/src/components/TaskDetailPanel.jsx](frontend/src/components/TaskDetailPanel.jsx) | Loads one task and saves edits through `save(patch)`, which sends a PATCH request. Title and description save when the field loses focus. Completion is handed back to the parent page through `onToggleComplete`. |
| [frontend/src/components/RepeatEditor.jsx](frontend/src/components/RepeatEditor.jsx) | Preset dropdown plus the custom form (every N units, weekday buttons, end date). |
| [frontend/src/components/NotesSection.jsx](frontend/src/components/NotesSection.jsx) | Calls the notes endpoints directly and keeps the list in its own state. |
| [frontend/src/components/TaskCalendar.jsx](frontend/src/components/TaskCalendar.jsx) | Fetches the task's series history and marks created, due and completed days. |
| [frontend/src/components/MonthCalendar.jsx](frontend/src/components/MonthCalendar.jsx) | A reusable grid that knows nothing about tasks. The parent passes a `renderDay` function that decides what appears in each day cell. |

**Check yourself:** `MonthCalendar` is used in two places. How can the same component show dots in one place and task titles in the other?

---

## Stage 8: The other pages

| File | What to look for |
|---|---|
| [frontend/src/pages/CalendarPage.jsx](frontend/src/pages/CalendarPage.jsx) | Reuses `MonthCalendar`, `TaskDetailPanel` and `useTaskToggle`. Most of what's new is grouping events by date and the event-type filters. |
| [frontend/src/pages/ProgressPage.jsx](frontend/src/pages/ProgressPage.jsx) | Stat tiles and the recently completed list, from `/api/stats/`. |
| [frontend/src/components/CompletionChart.jsx](frontend/src/components/CompletionChart.jsx) | A bar chart drawn with plain SVG, with hover tooltips and a table view. |
| [frontend/src/styles.css](frontend/src/styles.css) | Skim the section headings. Colors are defined once as variables at the top (`--accent`, `--ev-completed`, …), with dark-mode versions below them. |

---

## Files you can skip

These are generated or boilerplate. You rarely need to read them:

- `backend/manage.py`, `backend/config/wsgi.py`, `backend/config/asgi.py`, `backend/tasks/apps.py`: standard Django startup code.
- `backend/tasks/migrations/0001_initial.py`: generated from `models.py` by `makemigrations`. Change the models, not this file.
- `frontend/package-lock.json`: generated by `npm install`; it pins exact package versions.
- `__init__.py` files: they mark folders as Python packages. One exception: [backend/tasks/\_\_init\_\_.py](backend/tasks/__init__.py) contains a short map of how the backend files depend on each other.
- `.venv/`, `frontend/node_modules/`, `frontend/dist/`: installed packages and build output, not project code.

---

## Final exercise: trace three features end to end

Once you've read the stages above, test your understanding by following each of these from the click to the database and back. Use DevTools' Network tab, **F12** (Go to Definition) and **Shift+F12** (Find All References) in VS Code.

1. **Completing a repeating task.** `TaskRow` → `useTaskToggle` → `api.completeTask` → `views.TaskViewSet.complete` → `Task.complete()` → `recurrence.next_due_date()` → new row → JSON with `next_occurrence` → message on screen and the list reloads.
2. **Adding a note.** `NotesSection` → `api.addNote` → `TaskViewSet.notes` (POST) → `NoteSerializer` → `Note` row → the note list updates.
3. **Loading a month on the Calendar page.** `CalendarPage` → `monthGridRange()` → `api.getCalendar` → `CalendarView` → `stats.calendar_events()` → events grouped by date → `MonthCalendar`'s `renderDay`.

If you can explain all three without opening the files, you understand how the project is put together.

---

## When you add a feature

1. **Search before writing** (**Ctrl+Shift+F**, or **Ctrl+T** for function names). Date logic probably belongs in `utils/dates.js`, and an API call belongs in `api/client.js`.
2. **Copy from a similar feature.** Look at how an existing page or component does something close, and follow its pattern.
3. **Work from the data up.** If the feature stores something new, the usual order is: `models.py` → `makemigrations` / `migrate` → `serializers.py` → `views.py` / `urls.py` → `api/client.js` → components.
4. **Add a test** in `tests.py` for any new backend rule.
