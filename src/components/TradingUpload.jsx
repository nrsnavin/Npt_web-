import { useState } from 'react';
import { downloads, tradedItems as tradedItemsApi } from '../api/endpoints.js';
import { FormError } from './ui.jsx';

/**
 * Uploading the trading master from Excel or CSV [server: services/tradedImport.service.js].
 *
 * Two steps, the same file both times: the first answers what would happen — new items, price
 * changes, rows that are wrong and why — and writes nothing; the second writes it. A price list
 * from a supplier is exactly the file where one shifted column would re-price every quote, so it
 * is read back to the person before it is believed.
 */

const ACTION = {
  create: { label: 'New', tone: 'bg-success-500/15 text-success-400' },
  update: { label: 'Changes', tone: 'bg-flame-500/15 text-flame-300' },
  unchanged: { label: 'Same', tone: 'bg-line/[0.08] text-steel-400' },
  error: { label: 'Refused', tone: 'bg-danger-500/15 text-danger-400' },
};

const FIELD_LABEL = {
  inwardPrice: 'Inward price', modelNumber: 'Model', code: 'Code', supplier: 'Supplier', description: 'Description',
  colour: 'Colour', category: 'Category', sizeMm: 'Size', material: 'Material', supplierItemCode: "Supplier's code",
  moq: 'MOQ', piecesPerCarton: 'Pcs per carton', hsnCode: 'HSN', gstPercent: 'GST %', notes: 'Notes',
};

const shown = (value) => (value === null || value === undefined || value === '' ? '—' : String(value));

/** What a row would do, in words. */
export function describeRow(entry) {
  if (entry.action === 'error') return entry.problems.join('; ');
  if (entry.action === 'create') {
    return `${entry.fields.modelNumber} at ₹${entry.fields.inwardPrice}${entry.fields.supplier ? ` from ${entry.fields.supplier}` : ''}`;
  }
  if (entry.action === 'unchanged') return 'Already on the master as it is';
  return Object.entries(entry.changes)
    .map(([field, change]) => `${FIELD_LABEL[field] || field}: ${shown(change.from)} → ${shown(change.to)}`)
    .join(' · ');
}

export default function TradingUpload({ onClose, onDone }) {
  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [onlyProblems, setOnlyProblems] = useState(false);

  const check = async (chosen) => {
    setFile(chosen);
    setPreview(null);
    setError(null);
    if (!chosen) return;
    setBusy(true);
    try {
      setPreview(await tradedItemsApi.importSheet({ file: chosen, commit: false }));
    } catch (readError) {
      setError(readError);
    } finally {
      setBusy(false);
    }
  };

  const commit = async () => {
    setBusy(true);
    setError(null);
    try {
      const done = await tradedItemsApi.importSheet({ file, commit: true });
      onDone?.(done);
      onClose();
    } catch (writeError) {
      setError(writeError);
    } finally {
      setBusy(false);
    }
  };

  const summary = preview?.summary;
  const writes = summary ? summary.create + summary.update : 0;
  const rows = (preview?.plan || []).filter((entry) => !onlyProblems || entry.action === 'error');

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-dashed border-line/[0.15] p-4">
        <p className="text-sm text-steel-300">
          An Excel (.xlsx) or CSV file with a header row. It needs a <strong>Model</strong> column and an
          {' '}<strong>Inward price</strong> column (Price, Rate or Purchase rate also work); Code, Supplier,
          Colour, Size, MOQ, HSN and GST % are read when present. A row updates the item with the same code,
          or the same model.
        </p>
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <input
            type="file"
            accept=".xlsx,.csv"
            aria-label="Trading master file"
            className="input max-w-sm"
            onChange={(event) => check(event.target.files?.[0] || null)}
          />
          <button type="button" className="text-sm font-semibold text-accent hover:underline" onClick={() => downloads.tradingTemplate()}>
            Download the template
          </button>
        </div>
      </div>

      {busy && !preview && <p className="text-sm text-steel-400">Reading the file…</p>}
      <FormError error={error} />

      {summary && (
        <>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {[
              ['New items', summary.create, 'text-success-400'],
              ['Changes', summary.update, 'text-flame-300'],
              ['Same', summary.unchanged, 'text-steel-300'],
              ['Refused', summary.error, summary.error ? 'text-danger-400' : 'text-steel-300'],
            ].map(([label, value, tone]) => (
              <div key={label} className="rounded-lg border border-line/[0.08] px-3 py-2">
                <p className="text-xs text-steel-500">{label}</p>
                <p className={`text-xl font-bold tabular-nums ${tone}`}>{value}</p>
              </div>
            ))}
          </div>

          {summary.error > 0 && (
            <label className="flex items-center gap-2 text-xs text-steel-400">
              <input type="checkbox" checked={onlyProblems} onChange={(event) => setOnlyProblems(event.target.checked)} />
              Show only the refused rows
            </label>
          )}

          <div className="max-h-80 overflow-auto rounded-lg border border-line/[0.08]">
            <table className="w-full text-left text-sm">
              <thead className="sticky top-0 bg-ink-850 text-xs uppercase tracking-wide text-steel-500">
                <tr>
                  <th className="px-3 py-2">Row</th>
                  <th className="px-3 py-2">Model</th>
                  <th className="px-3 py-2">What happens</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((entry) => (
                  <tr key={entry.row} className="border-t border-line/[0.05] align-top">
                    <td className="px-3 py-2 tabular-nums text-steel-500">{entry.row}</td>
                    <td className="px-3 py-2">
                      <span className="font-semibold text-steel-100">{entry.fields?.modelNumber || entry.modelNumber || '—'}</span>
                      <span className={`ml-2 rounded-full px-2 py-0.5 text-[0.68rem] font-bold ${ACTION[entry.action].tone}`}>
                        {ACTION[entry.action].label}
                      </span>
                    </td>
                    <td className={`px-3 py-2 text-xs ${entry.action === 'error' ? 'text-danger-400' : 'text-steel-300'}`}>
                      {describeRow(entry)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {summary.error > 0 && (
            <p className="text-xs text-steel-500">Refused rows are skipped. Fix them in the file and upload it again to bring them in.</p>
          )}
        </>
      )}

      <div className="flex justify-end gap-2 border-t border-line/[0.06] pt-4">
        <button type="button" className="btn-secondary" onClick={onClose}>Cancel</button>
        <button type="button" className="btn-primary" disabled={busy || !preview || writes === 0} onClick={commit}>
          {busy && preview ? 'Importing…' : writes ? `Import ${writes} item${writes === 1 ? '' : 's'}` : 'Nothing to import'}
        </button>
      </div>
    </div>
  );
}
