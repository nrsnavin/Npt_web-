import { useEffect, useMemo, useState } from 'react';
import { materials as materialsApi } from '../api/endpoints.js';
import { useToast } from '../context/ToastContext.jsx';
import { Notice } from './ui.jsx';
import { changedRates, invalidRates, moveOf } from '../utils/bulkRates.js';

/**
 * Bulk price update for the material register: every active material with its old price and a
 * box for the new one [server: POST /materials/bulk-rates]. Blank leaves a material as it is;
 * the ones typed are saved together, each dated and audited as a single edit would be.
 */
export default function BulkRateForm({ onClose, onSaved }) {
  const { toast } = useToast();
  const [rows, setRows] = useState(null);
  const [typed, setTyped] = useState({});
  const [search, setSearch] = useState('');
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState(null);

  useEffect(() => {
    let live = true;
    materialsApi.list({ isActive: 'true', limit: 200, sort: 'name' })
      .then((found) => live && setRows(Array.isArray(found) ? found : found?.data || []))
      .catch((failure) => live && setProblem(failure.message));
    return () => { live = false; };
  }, []);

  const shown = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return rows || [];
    return (rows || []).filter((row) => [row.name, row.code, row.colour, row.supplier].filter(Boolean).join(' ').toLowerCase().includes(term));
  }, [rows, search]);

  const changes = changedRates(rows || [], typed);
  const invalid = invalidRates(typed);

  const submit = async (event) => {
    event.preventDefault();
    if (!changes.length) return;
    setBusy(true);
    setProblem(null);
    try {
      const done = await materialsApi.bulkRates({ rates: changes });
      toast(`${done.updated} ${done.updated === 1 ? 'price' : 'prices'} updated`);
      onSaved?.();
      onClose();
    } catch (failure) {
      setProblem(failure.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="space-y-3">
      <input
        type="search"
        className="input"
        placeholder="Search name, code or colour…"
        value={search}
        onChange={(event) => setSearch(event.target.value)}
        aria-label="Search materials"
      />
      {!rows && !problem && <p className="py-6 text-center text-sm text-steel-400">Loading materials…</p>}
      {rows && (
        <div className="max-h-[55vh] overflow-y-auto rounded-xl border border-line/[0.1]">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-ink-850">
              <tr className="text-left text-xs text-steel-400">
                <th className="px-3 py-2 font-semibold">Material</th>
                <th className="px-3 py-2 text-right font-semibold">Old price (₹/kg)</th>
                <th className="w-40 px-3 py-2 font-semibold">New price (₹/kg)</th>
              </tr>
            </thead>
            <tbody>
              {shown.map((row) => {
                const value = typed[row._id] ?? '';
                const move = value !== '' ? moveOf(row.ratePerKg, value) : null;
                const bad = invalid.includes(row._id);
                return (
                  <tr key={row._id} className="border-t border-line/[0.06]">
                    <td className="px-3 py-1.5">
                      <p className="font-semibold text-steel-100">{row.name}</p>
                      <p className="text-xs text-steel-400">{[row.code, row.colour].filter(Boolean).join(' · ')}</p>
                    </td>
                    <td className="px-3 py-1.5 text-right tabular-nums text-steel-200">₹{Number(row.ratePerKg).toFixed(2)}</td>
                    <td className="px-3 py-1.5">
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        inputMode="decimal"
                        className={`input h-9 tabular-nums ${bad ? 'border-danger-500' : ''}`}
                        value={value}
                        onChange={(event) => setTyped({ ...typed, [row._id]: event.target.value })}
                        placeholder={Number(row.ratePerKg).toFixed(2)}
                        aria-label={`New price for ${row.name}`}
                      />
                      {move !== null && move !== 0 && (
                        <p className={`mt-0.5 text-xs ${move > 0 ? 'text-warn-400' : 'text-success-400'}`}>{move > 0 ? '+' : ''}{move}%</p>
                      )}
                    </td>
                  </tr>
                );
              })}
              {!shown.length && (
                <tr><td colSpan={3} className="px-3 py-6 text-center text-sm text-steel-400">No material matches.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}
      <p className="text-xs text-steel-400">Leave a box blank to keep that price. Quotations already costed keep the rate they were built on.</p>
      {invalid.length > 0 && <Notice tone="warn">A new price must be a number above zero.</Notice>}
      {problem && <Notice tone="danger">{problem}</Notice>}
      <div className="flex items-center justify-end gap-2">
        <span className="mr-auto text-sm text-steel-300">{changes.length} {changes.length === 1 ? 'price' : 'prices'} to update</span>
        <button type="button" className="btn-secondary" onClick={onClose} disabled={busy}>Cancel</button>
        <button type="submit" className="btn-primary" disabled={busy || !changes.length || invalid.length > 0}>
          {busy ? 'Updating…' : 'Update prices'}
        </button>
      </div>
    </form>
  );
}
