/**
 * NotesSection.jsx - the list of timestamped notes under a task, with a box
 * to add a new one and inline edit/delete for existing ones.
 *
 * Shown inside TaskDetailPanel.jsx. Talks to the API directly:
 *   getNotes / addNote / updateNote / deleteNote  (api/client.js)
 *
 * Props:
 *   taskId           - which task's notes to show
 *   onNotesChanged() - tells the parent the note count changed (so the
 *                      ✎ badge in the task list stays accurate)
 */
import { useEffect, useState } from "react";
import * as api from "../api/client.js";
import { formatDateTime } from "../utils/dates.js";

export default function NotesSection({ taskId, onNotesChanged }) {
  const [notes, setNotes] = useState([]);
  const [draft, setDraft] = useState("");
  const [editingId, setEditingId] = useState(null);
  const [editText, setEditText] = useState("");

  // Load notes whenever a different task is opened.
  useEffect(() => {
    let cancelled = false; // ignore the response if the task changed meanwhile
    api.getNotes(taskId).then((data) => {
      if (!cancelled) setNotes(data);
    });
    return () => {
      cancelled = true;
    };
  }, [taskId]);

  /** Save the new-note textarea as a note. */
  async function handleAdd(e) {
    e?.preventDefault();
    if (!draft.trim()) return;
    const note = await api.addNote(taskId, draft.trim());
    setNotes((n) => [...n, note]);
    setDraft("");
    onNotesChanged?.();
  }

  /** Save an edited note. */
  async function handleSaveEdit(id) {
    if (!editText.trim()) return;
    const updated = await api.updateNote(id, editText.trim());
    setNotes((n) => n.map((note) => (note.id === id ? updated : note)));
    setEditingId(null);
  }

  /** Delete a note after confirmation. */
  async function handleDelete(id) {
    if (!window.confirm("Delete this note?")) return;
    await api.deleteNote(id);
    setNotes((n) => n.filter((note) => note.id !== id));
    onNotesChanged?.();
  }

  return (
    <div className="notes">
      {notes.length === 0 && <p className="muted small">No notes yet.</p>}

      <ul className="note-list">
        {notes.map((note) => (
          <li key={note.id} className="note">
            <div className="note-header">
              <span className="muted small">
                {formatDateTime(note.created_at)}
                {note.updated_at !== note.created_at && " (edited)"}
              </span>
              {editingId !== note.id && (
                <span className="note-actions">
                  <button
                    className="link-btn"
                    onClick={() => {
                      setEditingId(note.id);
                      setEditText(note.body);
                    }}
                  >
                    Edit
                  </button>
                  <button className="link-btn danger" onClick={() => handleDelete(note.id)}>
                    Delete
                  </button>
                </span>
              )}
            </div>

            {editingId === note.id ? (
              <div className="note-edit">
                <textarea value={editText} onChange={(e) => setEditText(e.target.value)} rows={3} />
                <div className="row">
                  <button className="btn btn-small btn-primary" onClick={() => handleSaveEdit(note.id)}>
                    Save
                  </button>
                  <button className="btn btn-small" onClick={() => setEditingId(null)}>
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <p className="note-body">{note.body}</p>
            )}
          </li>
        ))}
      </ul>

      <form onSubmit={handleAdd} className="note-add">
        <textarea
          placeholder="Write a note… (Ctrl+Enter to save)"
          value={draft}
          rows={3}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) handleAdd(e);
          }}
        />
        <button className="btn btn-small btn-primary" type="submit" disabled={!draft.trim()}>
          Add note
        </button>
      </form>
    </div>
  );
}
