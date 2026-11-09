/**
 * TaskList.jsx - renders tasks in titled groups (e.g. "Overdue", "Today").
 *
 * Grouping is decided by the page (TasksPage.jsx -> groupTasks()) and passed
 * in; this component only draws the groups and a TaskRow per task.
 *
 * Props:
 *   groups          - [{ title, tasks: [...] }]; empty groups are skipped
 *   selectedId      - id of the task open in the detail panel
 *   onSelect(task)  - open a task
 *   onToggle(task)  - complete / un-complete a task
 *   emptyMessage    - text shown when there are no tasks at all
 */
import TaskRow from "./TaskRow.jsx";

export default function TaskList({ groups, selectedId, onSelect, onToggle, emptyMessage }) {
  const nonEmpty = groups.filter((g) => g.tasks.length > 0);

  if (nonEmpty.length === 0) {
    return <p className="empty">{emptyMessage}</p>;
  }

  return (
    <div className="task-groups">
      {nonEmpty.map((group) => (
        <section key={group.title} className="task-group">
          <h3 className="group-title">
            {group.title} <span className="muted">{group.tasks.length}</span>
          </h3>
          <ul className="task-list">
            {group.tasks.map((task) => (
              <TaskRow
                key={task.id}
                task={task}
                selected={task.id === selectedId}
                onSelect={() => onSelect(task)}
                onToggle={() => onToggle(task)}
              />
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
