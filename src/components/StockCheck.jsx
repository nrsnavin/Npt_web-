import { useState } from 'react';
import { smallOrders } from '../api/endpoints.js';
import { Field, Notice } from './ui.jsx';

/**
 * A small order's stock check [server: smallOrder.service `checkStock`]: Dispatch says how many of
 * each model are in the godown. What is there goes out as a Dispatch request; what is short goes
 * to Production — said before it is sent, so nobody is surprised by the split.
 */
const piecesOf = (value) => Math.max(0, Math.round(Number(String(value ?? '').replace(/,/g, '')) || 0));

export default function StockCheck({ todo, onChanged }) {
  const lines = (Array.isArray(todo.brief?.items) ? todo.brief.items : []).filter((row) => row.model);
  const [available, setAvailable] = useState(() => Object.fromEntries(lines.map((row) => [row.model, ''])));
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState(null);
  const [result, setResult] = useState(null);
  const checked = todo.brief?.stockCheck;
  if (checked?.length) {
    return (
      <div className="rounded-xl border border-success-500/40 bg-success-500/[0.06] p-3" aria-label="Stock checked">
        <p className="text-sm font-bold text-steel-50">Stock checked</p>
        <ul className="mt-1 text-sm text-steel-200">
          {checked.map((row) => (
            <li key={row.model}>{row.model}: {row.available} of {row.quantity} in stock{row.short ? <span className="text-warn-400"> · {row.short} sent to Production</span> : <span className="text-success-400"> · all to Dispatch</span>}</li>
          ))}
        </ul>
      </div>
    );
  }
  if (!lines.length) return <Notice tone="warn">This small order lists no models — add them before the stock is checked.</Notice>;
  const rows = lines.map((row) => {
    const asked = piecesOf(row.quantity);
    const given = available[row.model];
    const there = given === '' ? null : Math.min(asked, piecesOf(given));
    return { ...row, asked, there, short: there === null ? null : asked - there };
  });
  const ready = rows.every((row) => row.there !== null);
  const toDispatch = rows.reduce((sum, row) => sum + (row.there || 0), 0);
  const toMake = rows.reduce((sum, row) => sum + (row.short || 0), 0);
  const send = async (event) => {
    event.preventDefault();
    setBusy(true);
    setProblem(null);
    try {
      const response = await smallOrders.checkStock({ id: todo._id, lines: rows.map((row) => ({ model: row.model, available: row.there })), note: note.trim() || undefined });
      setResult(response.meta);
      onChanged?.();
    } catch (failure) {
      setProblem(failure.message);
    } finally {
      setBusy(false);
    }
  };
  if (result) {
    return (
      <Notice tone="success">
        Stock checked.{result.dispatch ? ' What is in stock is on the Dispatch queue.' : ''}{result.production ? ' Production has the rest to make.' : ''}
      </Notice>
    );
  }
  return (
    <form onSubmit={send} className="space-y-3 rounded-xl border border-accent/40 bg-accent/[0.05] p-3" aria-label="Check stock">
      <div>
        <p className="text-sm font-bold text-steel-50">Check stock</p>
        <p className="text-xs text-steel-400">How many of each are in the godown? What is there goes to Dispatch; the rest goes to Production.</p>
      </div>
      <ul className="space-y-2">
        {rows.map((row) => (
          <li key={row.model} className="grid items-end gap-2 sm:grid-cols-[1fr_9rem]">
            <div className="text-sm text-steel-100">
              <span className="font-semibold">{row.model}</span>
              <span className="text-steel-400"> · {row.asked.toLocaleString('en-IN')} pcs ordered{[row.material, row.hook, row.clip, row.print].filter(Boolean).length ? ` · ${[row.material, row.hook, row.clip, row.print].filter(Boolean).join(' · ')}` : ''}</span>
              {row.there !== null && (
                <span className={`block text-xs ${row.short ? 'text-warn-400' : 'text-success-400'}`}>
                  {row.short ? `${row.there} from stock · ${row.short} to make` : 'All from stock'}
                </span>
              )}
            </div>
            <Field label="In stock" required>
              <input
                className="input"
                type="number"
                inputMode="numeric"
                min={0}
                aria-label={`In stock, ${row.model}`}
                value={available[row.model]}
                onChange={(event) => setAvailable((current) => ({ ...current, [row.model]: event.target.value }))}
                required
              />
            </Field>
          </li>
        ))}
      </ul>
      <input className="input" aria-label="Note on the stock check" placeholder="Note (optional) — where it was counted" value={note} onChange={(event) => setNote(event.target.value)} />
      {ready && (
        <p className="text-sm text-steel-200">
          {toDispatch > 0 && <span className="font-semibold text-success-400">{toDispatch.toLocaleString('en-IN')} pcs to Dispatch now</span>}
          {toDispatch > 0 && toMake > 0 && ' · '}
          {toMake > 0 && <span className="font-semibold text-warn-400">{toMake.toLocaleString('en-IN')} pcs to Production</span>}
        </p>
      )}
      {problem && <Notice tone="danger">{problem}</Notice>}
      <div className="flex justify-end">
        <button type="submit" className="btn-primary" disabled={busy || !ready}>{busy ? 'Sending…' : 'Stock checked — send it on'}</button>
      </div>
    </form>
  );
}
