import { useEffect, useRef, useState } from 'react';
import { views as viewsApi } from '../api/endpoints.js';
import { useToast } from '../context/ToastContext.jsx';
import { viewParams } from '../utils/views.js';
import { announceViewsChanged } from './SavedViewsNav.jsx';

/**
 * Naming the filters on screen as a view, pinned in the sidebar. Only the filters that are set
 * are kept; the list reads them back from the address when the view is opened.
 */
export default function SaveView({ page, params, onClose }) {
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState(null);
  const box = useRef(null);
  const { toast } = useToast();
  const kept = viewParams(params);

  useEffect(() => {
    const away = (event) => box.current && !box.current.contains(event.target) && onClose();
    const escape = (event) => event.key === 'Escape' && onClose();
    document.addEventListener('mousedown', away);
    document.addEventListener('keydown', escape);
    return () => {
      document.removeEventListener('mousedown', away);
      document.removeEventListener('keydown', escape);
    };
  }, [onClose]);

  const save = async (event) => {
    event.preventDefault();
    if (!name.trim()) return;
    setBusy(true);
    setProblem(null);
    try {
      await viewsApi.create({ page, name: name.trim(), params: kept });
      announceViewsChanged();
      toast(`Saved "${name.trim()}"`, 'It is in your sidebar under My views.');
      onClose();
    } catch (saveError) {
      setProblem(saveError.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <form
      ref={box}
      onSubmit={save}
      role="dialog"
      aria-label="Save this view"
      className="absolute right-0 z-40 mt-1 w-72 animate-scale-in space-y-2 rounded-xl border border-line/[0.1] bg-ink-800 p-3 shadow-modal"
    >
      <p className="text-sm font-semibold text-steel-100">Save these filters as a view</p>
      <p className="text-xs text-steel-500">
        {Object.keys(kept).length
          ? `Keeps: ${Object.entries(kept).map(([key, value]) => `${key} ${value}`).join(' · ')}`
          : 'No filters are set — this view is the whole list.'}
      </p>
      <input
        autoFocus
        className="input h-9 py-1 text-sm"
        aria-label="View name"
        placeholder="e.g. My unanswered"
        maxLength={40}
        value={name}
        onChange={(event) => setName(event.target.value)}
      />
      {problem && <p role="alert" className="text-xs text-danger-400">{problem}</p>}
      <div className="flex justify-end gap-2">
        <button type="button" className="btn-ghost h-8 px-3 py-0 text-sm" onClick={onClose}>Cancel</button>
        <button type="submit" className="btn-primary h-8 px-3 py-0 text-sm" disabled={busy || !name.trim()}>
          {busy ? 'Saving…' : 'Save view'}
        </button>
      </div>
    </form>
  );
}
