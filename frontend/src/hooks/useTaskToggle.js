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
 *   const { toggleComplete, toggleIgnore, completeDay, removeDay, toast } = useTaskToggle(afterChange);
 *   ...
 *   <button onClick={() => toggleComplete(task)}>
 *   <button onClick={() => toggleIgnore(task)}>   // overdue or ignored tasks
 *   <button onClick={() => removeDay(id, title, date, "one")}>  // repeating tasks
 *   {toast && <div className="toast">{toast}</div>}   // may include an Undo button
 *
 * `afterChange` is called after every successful toggle (reload lists, etc).
 */
import { createElement, Fragment, useCallback, useEffect, useRef, useState } from "react";
import * as api from "../api/client.js";
import { formatDate } from "../utils/dates.js";

export default function useTaskToggle(afterChange) {
  const [toast, setToast] = useState(null); // { text, undo? } or null
  const timer = useRef(null);

  /**
   * Show a message for a few seconds. If `undo` (a function) is given, the
   * message gets an Undo button and stays a little longer.
   */
  const flash = useCallback((text, undo = null) => {
    setToast({ text, undo });
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setToast(null), undo ? 7000 : 3500);
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

  /**
   * Complete only the occurrence of a repeating task on `date` (the Calendar's
   * per-day "Done" button). `taskId` is any task in the series, e.g. the one
   * a projected event points at.
   */
  const completeDay = useCallback(
    async (taskId, title, date) => {
      try {
        await api.actOnOccurrence(taskId, date, "complete");
        flash(`Completed “${title}” for ${formatDate(date)}`);
        await afterChange?.();
      } catch (e) {
        flash(`Error: ${e.message}`);
      }
    },
    [afterChange, flash]
  );

  /**
   * Remove one day of a repeating task, Google Calendar style.
   *   scope "one"       - only `date` disappears; the toast offers Undo
   *   scope "following" - `date` and every repeat after it (series ends)
   * Used by CalendarPage.jsx and TaskDetailPanel.jsx. Returns the API result
   * ({ task, ... }; `task` is set if the open task was moved to its next
   * date), or null on error.
   */
  const removeDay = useCallback(
    async (taskId, title, date, scope) => {
      try {
        if (scope === "following") {
          await api.actOnOccurrence(taskId, date, "remove_following");
          flash(`Removed “${title}” from ${formatDate(date)} onward`);
          await afterChange?.();
          return { task: null };
        }
        const result = await api.actOnOccurrence(taskId, date, "remove");
        // Undo: bring the day back (and move the task back if it was moved).
        const undo = async () => {
          try {
            const moved = result.task;
            await api.actOnOccurrence(moved ? moved.id : taskId, date, "restore", {
              move_back: Boolean(moved),
            });
            flash(`Restored “${title}” on ${formatDate(date)}`);
            await afterChange?.();
          } catch (e) {
            flash(`Error: ${e.message}`);
          }
        };
        flash(`Removed “${title}” on ${formatDate(date)} only`, undo);
        await afterChange?.();
        return result;
      } catch (e) {
        flash(`Error: ${e.message}`);
        return null;
      }
    },
    [afterChange, flash]
  );

  // The toast as something a page can render: the text, plus an Undo
  // button when the action can be undone. (createElement is what JSX
  // compiles to; this file is .js, so JSX isn't available here.)
  const toastNode = toast
    ? createElement(
        Fragment,
        null,
        toast.text,
        toast.undo &&
          createElement(
            "button",
            {
              className: "toast-undo",
              onClick: () => {
                setToast(null);
                toast.undo();
              },
            },
            "Undo"
          )
      )
    : null;

  return { toggleComplete, toggleIgnore, completeDay, removeDay, toast: toastNode };
}
