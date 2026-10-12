import { useCallback, useEffect, useState } from 'react';
import { materialStock } from '../api/endpoints.js';
import { Field, FormError, Modal, Spinner } from './ui.jsx';
import { formatDate } from '../utils/format.js';

/**
 * A material's store [server: records.service `moveStock` / `stockBook`]: what is in it, the book —
 * receipts, what each run took, corrected counts — and, for whoever keeps the register, a receipt
 * or a correction. Runs take their resin themselves when they end.
 */
const KIND = { receipt: 'Received', issue: 'Used by a run', adjust: 'Count corrected' };
const kg = (value) => `${Number(value || 0).toLocaleString('en-IN', { maximumFractionDigits: 1 })} kg`;

export default function StockDialog({ material, mayWrite, onClose, onChanged }) {
  const [book, setBook] = useState(null);
  const [error, setError] = useState(null);
  const [values, setValues] = useState({ kind: 'receipt', kg: '', reference: '', note: '' });
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState(null);
  const load = useCallback(() => materialStock.book(material._id).then((next) => { setBook(next); setError(null); }).catch(setError), [material._id]);
  useEffect(() => { load(); }, [load]);
  const set = (key) => (event) => setValues((current) => ({ ...current, [key]: event.target.value }));

  const save = async (event) => {
    event.preventDefault();
    setBusy(true);
    setProblem(null);
    try {
      await materialStock.move({ id: material._id, kind: values.kind, kg: Number(values.kg), reference: values.reference, note: values.note });
      setValues({ kind: 'receipt', kg: '', reference: '', note: '' });
      await load();
      onChanged?.();
    } catch (failure) {
      setProblem(failure);
    } finally {
      setBusy(false);
    }
  };

  const low = book && book.material.reorderKg != null && book.material.stockKg <= book.material.reorderKg;
  return (
    <Modal open onClose={onClose} title={`Store — ${material.name}`} description="Receipts add to it; each mould run takes the resin it used" size="lg">
      {error && <FormError error={error} />}
      {!book && !error && <Spinner label="Loading the store" />}
      {book && (
        <div className="space-y-5">
          <div className="flex flex-wrap items-baseline gap-3">
            <p className={`text-3xl font-bold tabular-nums ${low ? 'text-danger-400' : 'text-steel-50'}`}>{kg(book.material.stockKg)}</p>
            <p className="text-sm text-steel-400">{book.material.reorderKg != null ? `Reorder at ${kg(book.material.reorderKg)}${low ? ' — reorder now' : ''}` : 'No reorder level set (Edit the material to set one)'}</p>
          </div>

          {mayWrite && (
            <form onSubmit={save} className="grid gap-3 rounded-xl border border-line/[0.08] p-4 sm:grid-cols-[auto_1fr_1fr_auto] sm:items-end">
              <Field label="What">
                <select className="input" value={values.kind} onChange={set('kind')}>
                  <option value="receipt">Received</option>
                  <option value="adjust">Correct the count (+ or −)</option>
                </select>
              </Field>
              <Field label="Kilograms" required>
                <input type="number" step="any" min={values.kind === 'receipt' ? 0.1 : undefined} className="input" value={values.kg} onChange={set('kg')} required />
              </Field>
              <Field label={values.kind === 'receipt' ? 'GRN / invoice' : 'Why'}>
                <input className="input" value={values.kind === 'receipt' ? values.reference : values.note} onChange={set(values.kind === 'receipt' ? 'reference' : 'note')} maxLength={120} />
              </Field>
              <button type="submit" className="btn-primary" disabled={busy || !values.kg || Number(values.kg) === 0}>{busy ? 'Saving…' : 'Save'}</button>
              {problem && <div className="sm:col-span-4"><FormError error={problem} /></div>}
            </form>
          )}

          {book.movements.length ? (
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead><tr className="text-left text-xs text-steel-400"><th className="pb-2 font-semibold">Date</th><th className="pb-2 font-semibold">What</th><th className="pb-2 text-right font-semibold">Kg</th><th className="pb-2 text-right font-semibold">Balance</th><th className="pb-2 font-semibold">Ref</th></tr></thead>
                <tbody className="divide-y divide-line/[0.06]">
                  {book.movements.map((row) => (
                    <tr key={row._id}>
                      <td className="py-1.5 text-steel-300">{formatDate(row.at)}</td>
                      <td className="py-1.5 text-steel-200">{KIND[row.kind]}{row.by?.name ? <span className="text-steel-500"> · {row.by.name}</span> : null}</td>
                      <td className={`py-1.5 text-right tabular-nums ${row.kg < 0 ? 'text-danger-400' : 'text-success-400'}`}>{row.kg > 0 ? '+' : ''}{row.kg}</td>
                      <td className="py-1.5 text-right tabular-nums text-steel-100">{kg(row.balanceAfter)}</td>
                      <td className="py-1.5 text-steel-400">{row.run?.number || row.reference || row.note || ''}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : <p className="text-sm text-steel-400">Nothing in or out yet.</p>}
        </div>
      )}
    </Modal>
  );
}
