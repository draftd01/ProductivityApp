/**
 * hooks/useTaskToggle.js - shared "complete / un-complete" and
 * "ignore / restore" logic for tasks.
 *
 * A custom React hook (a function starting with "use" that can use other
 * hooks). Both TasksPage.jsx and CalendarPage.jsx need the same behaviour:
 *   1. call the right API endpoint
 *   2. show a short message, e.g. "Next occurrence scheduled for Tue, Mar 10"
 *   3. let the page reload its data
 *
 * Usage:
 *   const { toggleComplete, toggleIgnore, toast } = useTaskToggle(afterChange);
 *   ...
 *   <button onClick={() => toggleComplete(task)}>
 *   <button onClick={() => toggleIgnore(task)}>   // overdue or ignored tasks
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

  /**
   * Ignore an overdue task, or restore an ignored one to open.
   * Ignoring a repeating task schedules its next occurrence (like completing).
   */
  const toggleIgnore = useCallback(
    async (task) => {
      try {
        if (task.is_ignored) {
          await api.unignoreTask(task.id);
          flash(`Restored “${task.title}”`);
        } else {
          const result = await api.ignoreTask(task.id);
          flash(
            result.next_occurrence
              ? `Ignored. Next one scheduled for ${formatDate(result.next_occurrence.due_date)}`
              : `Ignored “${task.title}” (find it under Ignored)`
          );
        }
        await afterChange?.();
      } catch (e) {
        flash(`Error: ${e.message}`);
      }
    },
    [afterChange, flash]
  );

  return { toggleComplete, toggleIgnore, toast };
}
