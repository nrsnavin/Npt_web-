import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { setupChecklist } from '../api/endpoints.js';
import { Meter } from './ui.jsx';

/**
 * Admin's setup checklist [server: records.service `setupChecklist`]: what the plant still has to
 * fill in before the newer screens do anything — machines, mould intervals and test standards,
 * resin stock and reorder levels, buyers' delivery details and pins, the dispatch lists, WhatsApp.
 * Only what is unfinished is listed; when everything is done the card goes away. It can be folded
 * for the day.
 */
const FOLD_KEY = 'npt.setupChecklist.folded';
const today = () => new Date().toDateString();

export default function SetupChecklist() {
  const [items, setItems] = useState(null);
  const [folded, setFolded] = useState(() => {
    try { return localStorage.getItem(FOLD_KEY) === today(); } catch { return false; }
  });
  useEffect(() => {
    let live = true;
    setupChecklist().then((rows) => live && setItems(rows)).catch(() => live && setItems([]));
    return () => { live = false; };
  }, []);
  if (!items) return null;
  const open = items.filter((item) => !item.done);
  if (!open.length) return null;
  const fold = (value) => {
    setFolded(value);
    try { if (value) localStorage.setItem(FOLD_KEY, today()); else localStorage.removeItem(FOLD_KEY); } catch { /* private window */ }
  };

  return (
    <section className="card p-5" aria-label="Setup checklist">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-base font-bold text-steel-50">Finish setting up · {items.length - open.length} of {items.length} done</p>
          <p className="text-sm text-steel-400">The plant screens work from these — each one left empty is a screen that has nothing to show.</p>
        </div>
        <button type="button" className="btn-ghost text-xs" onClick={() => fold(!folded)}>{folded ? 'Show' : 'Hide for today'}</button>
      </div>
      {!folded && (
        <ul className="mt-4 divide-y divide-line/[0.06]">
          {open.map((item) => (
            <li key={item.key} className="flex flex-wrap items-center justify-between gap-3 py-2.5">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-steel-100">
                  {item.label}
                  {item.of != null && <span className="ml-2 font-normal tabular-nums text-steel-400">{item.have} of {item.of}</span>}
                </p>
                <p className="text-xs text-steel-500">{item.hint}</p>
                {item.of ? <Meter className="mt-1.5 max-w-xs" percent={(item.have / item.of) * 100} tone="accent" label={`${item.label}: ${item.have} of ${item.of}`} /> : null}
              </div>
              <Link to={item.link} className="btn-secondary px-3 py-1.5 text-xs">Open</Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
