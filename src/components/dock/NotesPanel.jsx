import { useState } from 'react';
import { useWorkspace } from './WorkspaceContext.jsx';
import DockIcon from './DockIcon.jsx';
import { Notice } from '../ui.jsx';

/**
 * Note colours are tinted surfaces rather than solid paper: a solid yellow note would be
 * the brightest thing on a dark canvas and would fight the accent.
 */
const COLOURS = {
  amber: { chip: 'bg-amber-400', card: 'bg-warn-500/10 ring-warn-500/25' },
  lime: { chip: 'bg-lime-400', card: 'bg-success-500/10 ring-success-500/25' },
  sky: { chip: 'bg-sky-400', card: 'bg-aqua-500/12 ring-aqua-500/25' },
  rose: { chip: 'bg-rose-400', card: 'bg-danger-500/10 ring-danger-500/25' },
  violet: { chip: 'bg-violet-400', card: 'bg-flame-500/10 ring-flame-500/25' },
};

const ORDER = ['amber', 'lime', 'sky', 'rose', 'violet'];

export default function NotesPanel() {
  const { notes, addNote, saveNote, removeNote } = useWorkspace();
  const [draft, setDraft] = useState('');
  const [colour, setColour] = useState('amber');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [editingId, setEditingId] = useState(null);
  const [editingText, setEditingText] = useState('');

  const submit = async (event) => {
    event.preventDefault();
    if (!draft.trim()) return;

    setBusy(true);
    setError(null);
    try {
      await addNote({ content: draft.trim(), colour });
      setDraft('');
    } catch (submitError) {
      setError(submitError.message);
    } finally {
      setBusy(false);
    }
  };

  const commitEdit = async (note) => {
    const next = editingText.trim();
    setEditingId(null);
    if (next && next !== note.content) await saveNote({ id: note._id, content: next });
  };

  return (
    <div className="flex h-full flex-col">
      <form onSubmit={submit} className="border-b border-line/[0.06] px-4 py-3">
        <textarea
          rows={2}
          className="input resize-none py-1.5 text-[0.8125rem]"
          placeholder="Jot something down…"
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
        />
        <div className="mt-2 flex items-center gap-2">
          <div className="flex gap-1.5" role="radiogroup" aria-label="Note colour">
            {ORDER.map((key) => (
              <button
                key={key}
                type="button"
                role="radio"
                aria-checked={colour === key}
                aria-label={key}
                onClick={() => setColour(key)}
                className={`h-4 w-4 rounded-full ${COLOURS[key].chip} transition-transform ${
                  colour === key ? 'scale-110 ring-2 ring-steel-100 ring-offset-2 ring-offset-ink-850' : 'opacity-60 hover:opacity-100'
                }`}
              />
            ))}
          </div>
          <button
            type="submit"
            className="btn-primary ml-auto px-3 py-1 text-xs"
            disabled={busy || !draft.trim()}
          >
            Pin note
          </button>
        </div>
        {error && (
          <div className="mt-2">
            <Notice tone="danger">{error}</Notice>
          </div>
        )}
      </form>

      <div className="flex-1 overflow-y-auto p-4">
        {notes.length ? (
          <div className="grid gap-2.5">
            {notes.map((note) => (
              <div
                key={note._id}
                className={`group relative rounded-lg p-3 ring-1 ring-inset ${COLOURS[note.colour]?.card || COLOURS.amber.card}`}
              >
                {editingId === note._id ? (
                  <textarea
                    autoFocus
                    rows={3}
                    className="input resize-none py-1 text-[0.8125rem]"
                    value={editingText}
                    onChange={(event) => setEditingText(event.target.value)}
                    onBlur={() => commitEdit(note)}
                    onKeyDown={(event) => {
                      if (event.key === 'Escape') setEditingId(null);
                      if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) commitEdit(note);
                    }}
                  />
                ) : (
                  <button
                    type="button"
                    onClick={() => {
                      setEditingId(note._id);
                      setEditingText(note.content);
                    }}
                    className="block w-full text-left text-[0.8125rem] leading-relaxed text-steel-100"
                  >
                    {note.content}
                  </button>
                )}

                <div className="mt-2 flex items-center gap-1">
                  <button
                    type="button"
                    aria-label={note.pinned ? 'Unpin note' : 'Pin note to top'}
                    onClick={() => saveNote({ id: note._id, pinned: !note.pinned })}
                    className={`rounded p-1 transition-colors ${
                      note.pinned ? 'text-flame-400' : 'text-steel-500 hover:text-steel-200'
                    }`}
                  >
                    <DockIcon name="pin" className="h-3.5 w-3.5" />
                  </button>
                  <button
                    type="button"
                    aria-label="Delete note"
                    onClick={() => removeNote(note._id)}
                    className="rounded p-1 text-steel-500 opacity-0 transition-opacity hover:text-danger-400 focus-visible:opacity-100 group-hover:opacity-100"
                  >
                    <DockIcon name="trash" className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="py-10 text-center text-[0.8125rem] text-steel-500">
            No notes yet. Anything you jot here stays private to you.
          </p>
        )}
      </div>
    </div>
  );
}
