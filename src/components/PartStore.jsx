import { useCallback, useEffect, useState } from 'react';
import { components as componentsApi } from '../api/endpoints.js';
import { Field, FormError, Modal, Section } from './ui.jsx';
import { formatDate, formatNumber } from '../utils/format.js';

const KIND_LABEL = { receipt: 'Received', issue: 'Issued to the floor', adjust: 'Count corrected' };

/**
 * The hook or clip store [server: bom.service `moveComponentStock`]: pieces on hand against the
 * reorder level, and the book of receipts, issues and corrections — each a dated line with who
 * wrote it.
 */
export default function PartStore({ part, mayEdit, onChanged }) {
  const [book, setBook] = useState(null);
  const [moving, setMoving] = useState(null);
  const [pieces, setPieces] = useState('');
  const [reference, setReference] = useState('');
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState(null);
  const load = useCallback(() => componentsApi.stock(part._id).then(setBook).catch(() => setBook(null)), [part._id]);
  useEffect(() => { load(); }, [load]);
  const onHand = book?.component?.stockQty ?? part.stockQty ?? 0;
  const low = part.reorderQty != null && onHand < part.reorderQty;
  const save = async (event) => {
    event.preventDefault();
    setBusy(true);
    setProblem(null);
    try {
      await componentsApi.moveStock({ id: part._id, kind: moving, pieces: Number(pieces), reference: reference.trim() || undefined });
      setMoving(null);
      setPieces('');
      setReference('');
      load();
      onChanged?.();
    } catch (failure) {
      setProblem(failure);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Section
      title="Store"
      actions={mayEdit ? (
        <div className="flex gap-2">
          <button type="button" className="row-action" onClick={() => setMoving('receipt')}>Receive</button>
          <button type="button" className="row-action" onClick={() => setMoving('issue')}>Issue</button>
          <button type="button" className="row-action" onClick={() => setMoving('adjust')}>Correct count</button>
        </div>
      ) : null}
    >
      <div className="card px-4 py-3">
        <p className="eyebrow">On hand</p>
        <p className={`stat-value mt-1 ${low ? 'text-warn-400' : 'text-steel-50'}`}>{formatNumber(onHand)} <span className="text-sm font-semibold text-steel-400">pcs</span></p>
        <p className="mt-0.5 text-xs text-steel-500">
          {part.reorderQty != null ? `Reorder below ${formatNumber(part.reorderQty)}` : 'No reorder level set'}
          {part.perHanger != null ? ` · ${part.perHanger} on a hanger` : ''}
        </p>
      </div>
      {book?.movements?.length > 0 && (
        <ul className="mt-3 divide-y divide-line/[0.06] text-sm">
          {book.movements.slice(0, 10).map((entry) => (
            <li key={entry._id} className="flex justify-between gap-3 py-1.5">
              <span className="text-steel-300">{KIND_LABEL[entry.kind]}{entry.reference ? ` · ${entry.reference}` : ''}{entry.workOrder?.number ? ` · ${entry.workOrder.number}` : ''}<span className="block text-xs text-steel-500">{formatDate(entry.at)}{entry.by?.name ? ` · ${entry.by.name}` : ''}</span></span>
              <span className={`tabular-nums ${entry.pieces < 0 ? 'text-warn-400' : 'text-success-400'}`}>{entry.pieces > 0 ? '+' : ''}{formatNumber(entry.pieces)}<span className="block text-right text-xs text-steel-500">{formatNumber(entry.balanceAfter)}</span></span>
            </li>
          ))}
        </ul>
      )}
      {moving && (
        <Modal open onClose={() => setMoving(null)} title={KIND_LABEL[moving]} description={part.name}>
          <form onSubmit={save} className="space-y-3" aria-label="Store entry">
            <Field label={moving === 'adjust' ? 'Pieces to add (negative to take off)' : 'Pieces'} required>
              <input type="number" step="1" className="input" value={pieces} onChange={(event) => setPieces(event.target.value)} autoFocus />
            </Field>
            <Field label={moving === 'receipt' ? 'Bill / challan number' : 'Reference'}><input className="input" value={reference} onChange={(event) => setReference(event.target.value)} maxLength={120} /></Field>
            {problem && <FormError error={problem} />}
            <div className="flex justify-end gap-2">
              <button type="button" className="btn-secondary" onClick={() => setMoving(null)}>Cancel</button>
              <button type="submit" className="btn-primary" disabled={busy || !Number(pieces) || (moving !== 'adjust' && Number(pieces) < 0)}>{busy ? 'Saving…' : 'Save'}</button>
            </div>
          </form>
        </Modal>
      )}
    </Section>
  );
}
