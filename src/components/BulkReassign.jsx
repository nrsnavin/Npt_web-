import { useCallback, useEffect, useMemo, useState } from 'react';
import { bulk, users as usersApi } from '../api/endpoints.js';
import { Field, Modal, Notice } from './ui.jsx';

/**
 * Moving a batch of records to another owner.
 *
 * The case this exists for is somebody leaving, or a territory changing hands: forty
 * customers to move, one screen at a time, which nobody does — so instead the records keep a
 * name that has left, and the follow-ups they carry are chased by nobody.
 *
 * Administration only, enforced on the server. The checkboxes are hidden entirely for anyone
 * else rather than shown and refused: offering an action the person cannot take is a worse
 * answer than not offering it.
 */

/** Tracks which rows are ticked, and forgets them whenever the list underneath changes. */
export function useSelection(rows) {
  const [selected, setSelected] = useState(() => new Set());

  const ids = useMemo(() => rows.map((row) => row._id).join(','), [rows]);

  /*
   * Cleared on every page, filter or search change. A tick means "this record", and carrying
   * it across a filter change means acting on records nobody can see — which on a bulk
   * action is how forty of the wrong customers move at once.
   */
  useEffect(() => {
    setSelected(new Set());
  }, [ids]);

  const toggle = useCallback((id) => {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const toggleAll = useCallback(() => {
    setSelected((current) =>
      current.size === rows.length ? new Set() : new Set(rows.map((row) => row._id))
    );
  }, [rows]);

  const clear = useCallback(() => setSelected(new Set()), []);

  return {
    selected,
    toggle,
    toggleAll,
    clear,
    count: selected.size,
    allSelected: rows.length > 0 && selected.size === rows.length,
  };
}

/** The tick in a row. Styled to sit on the baseline of the cell it shares. */
export function RowCheckbox({ checked, onChange, label }) {
  return (
    <input
      type="checkbox"
      className="h-4 w-4 accent-flame-500"
      checked={checked}
      onChange={onChange}
      aria-label={label}
    />
  );
}

/**
 * The bar that appears once something is ticked, and the dialog behind it.
 *
 * `collection` is the URL segment the server knows: customers, leads, enquiries or samples.
 */
export default function BulkBar({ collection, selection, noun = 'records', onDone }) {
  const [open, setOpen] = useState(false);
  const [team, setTeam] = useState([]);
  const [assignTo, setAssignTo] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  // Loaded when the dialog opens rather than with the screen: most visits never reassign
  // anything, and this is a request nobody asked for until they did.
  useEffect(() => {
    if (!open || team.length) return;
    usersApi
      .list({ isActive: true, limit: 100 })
      .then((response) => setTeam(response.data || []))
      .catch(() => setTeam([]));
  }, [open, team.length]);

  if (!selection.count) return null;

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      const result = await bulk.reassign({
        collection,
        ids: [...selection.selected],
        assignTo,
      });
      setOpen(false);
      setAssignTo('');
      selection.clear();
      onDone?.(result);
    } catch (submitError) {
      setError(submitError);
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      {/*
       * Sticky to the bottom of the scrolling area rather than fixed to the viewport. The
       * ticks are spread down a long table, so a bar at the end of it is one nobody scrolls
       * back to — but the layout has its own footer and utility dock down there, and a fixed
       * bar would sit on top of both.
       */}
      <div className="sticky bottom-0 z-20 mt-4 flex flex-wrap items-center gap-3 rounded-t-xl border border-b-0 border-line/[0.08] bg-ink-850/95 px-4 py-3 shadow-float backdrop-blur">
        <p className="text-sm text-steel-200">
          <span className="font-semibold tabular-nums text-steel-100">{selection.count}</span>{' '}
          {selection.count === 1 ? noun.replace(/s$/, '') : noun} selected
        </p>
        <div className="ml-auto flex gap-2">
          <button type="button" className="btn-secondary px-3 py-1.5" onClick={selection.clear}>
            Clear
          </button>
          <button type="button" className="btn-primary px-3 py-1.5" onClick={() => setOpen(true)}>
            Reassign
          </button>
        </div>
      </div>

      <Modal
        open={open}
        title={`Reassign ${selection.count} ${selection.count === 1 ? noun.replace(/s$/, '') : noun}`}
        description="The move is written into each record's history, with your name on it"
        onClose={() => setOpen(false)}
      >
        <div className="space-y-4">
          <Field label="Hand them to">
            <select className="input" value={assignTo} onChange={(event) => setAssignTo(event.target.value)}>
              <option value="">Choose a colleague…</option>
              {team.map((person) => (
                <option key={person.id} value={person.id}>
                  {person.name} — {person.department}
                </option>
              ))}
            </select>
          </Field>

          {error && <Notice tone="danger">{error.message}</Notice>}

          <div className="flex justify-end gap-2">
            <button type="button" className="btn-secondary" onClick={() => setOpen(false)}>
              Cancel
            </button>
            <button type="button" className="btn-primary" disabled={!assignTo || busy} onClick={submit}>
              {busy ? 'Moving…' : 'Reassign'}
            </button>
          </div>
        </div>
      </Modal>
    </>
  );
}
