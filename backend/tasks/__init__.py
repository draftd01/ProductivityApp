"""
The `tasks` Django app - all of the productivity app's backend logic.

How the files reference each other (request flow, top to bottom):

  config/urls.py ──> tasks/urls.py ──> tasks/views.py
                                          │  uses
                                          ├──> tasks/serializers.py  (model <-> JSON)
                                          ├──> tasks/models.py       (database tables)
                                          └──> tasks/stats.py        (calendar + progress queries)
  tasks/models.py ──> tasks/recurrence.py (computes the next due date of repeating tasks)
  tasks/admin.py  ──> tasks/models.py     (registers models in /admin/)
  tasks/tests.py  ──> recurrence.py, models.py (automated tests)
"""
