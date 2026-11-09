/**
 * hooks/useTaskToggle.js - shared "complete / un-complete a task" logic.
 *
 * A custom React hook (a function starting with "use" that can use other
 * hooks). Both TasksPage.jsx and CalendarPage.jsx need the same behaviour:
 *   1. call the right API endpoint
 *   2. show a short message, e.g. "Next occurrence scheduled for Tue, Mar 10"
 *   3. let the page reload its data
 *
 * Usage:
 *   const { toggleComplete, toast } = useTaskToggle(afterChange);
 *   ...
 *   <button onClick={() => toggleComplete(task)}>
 *   {toast && <div className="toast">{toast}</div>}
 *
 * `afterChange` is called after every successful toggle (reload lists, etc).
 */
import { useCallback, useEffect, useRef, useState } from "react";
import * as api from "../api/client.js";
import { formatDate } from "../utils/dates.js";

export default function useTaskToggle(afterChange) {
  const [toast, setToast] = useState("");
  const timer = useRef(null);

  /** Show a message for a few seconds. */
  const flash = useCallback((message) => {
    setToast(message);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setToast(""), 3500);
  }, []);

  // Clear the pending timer if the page unmounts.
  useEffect(() => () => clearTimeout(timer.current), []);

  /** Complete an open task or reopen a completed one. */
  const toggleComplete = useCallback(
    async (task) => {
      try {
        if (task.is_completed) {
          await api.uncompleteTask(task.id);
          flash(`Reopened “${task.title}”`);
        } else {
          const result = await api.completeTask(task.id);
          flash(
            result.next_occurrence
              ? `Done! Next one scheduled for ${formatDate(result.next_occurrence.due_date)}`
              : `Completed “${task.title}”`
          );
        }
        await afterChange?.();
      } catch (e) {
        flash(`Error: ${e.message}`);
      }
    },
    [afterChange, flash]
  );

  return { toggleComplete, toast };
}
