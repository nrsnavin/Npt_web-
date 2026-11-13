import { useEffect, useState } from 'react';
import { customers as customersApi, downloads } from '../api/endpoints.js';
import { FormError } from './ui.jsx';

/**
 * Customers from Excel [server: services/customerImport.service.js]. Download the template — the
 * columns, a sample row, and a How to fill sheet — fill it, pick the marketing owner for rows
 * that name none, and choose the file. The app reads it back first (new customers, customers
 * already in the app, rows with a problem and why) and writes nothing; Import creates them.
 */

const ACTION = {
  create: { label: 'New', tone: 'bg-success-500/15 text-success-400' },
  exists: { label: 'Already there', tone: 'bg-line/[0.08] text-steel-400' },
  error: { label: 'Fix this', tone: 'bg-danger-500/15 text-danger-400' },
};

/** What a row would do, in words. */
export function describeCustomerRow(entry) {
  if (entry.action === 'error') return entry.problems.join('; ');
  if (entry.action === 'exists') return `Already a customer — ${entry.existing.name} (${entry.existing.code}); skipped`;
  const where = [entry.fields.city, entry.fields.state].filter(Boolean).join(', ');
  return [entry.fields.gstin ? `GST ${entry.fields.gstin}` : 'No GST number', where, `owner ${entry.owner?.name}`].filter(Boolean).join(' · ');
}

export default function CustomerUpload({ onClose, onDone }) {
  const [file, setFile] = useState(null);
  const [owner, setOwner] = useState('');
  const [team, setTeam] = useState([]);
  const [preview, setPreview] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [onlyProblems, setOnlyProblems] = useState(false);

  useEffect(() => {
    let live = true;
    customersApi.team()
      .then((answer) => {
        if (!live) return;
        setTeam(answer.data || []);
        if (answer.meta?.you) setOwner(String(answer.meta.you));
      })
      .catch(() => {});
    return () => { live = false; };
  }, []);

  const check = async (chosen, ownerId = owner) => {
    setFile(chosen);
    setPreview(null);
    setError(null);
    if (!chosen) return;
    setBusy(true);
    try {
      setPreview(await customersApi.importSheet({ file: chosen, defaultOwner: ownerId || undefined, commit: false }));
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
      const done = await customersApi.importSheet({ file, defaultOwner: owner || undefined, commit: true });
      onDone?.(done);
      onClose();
    } catch (writeError) {
      setError(writeError);
    } finally {
      setBusy(false);
    }
  };

  const summary = preview?.summary;
  const rows = (preview?.plan || []).filter((entry) => !onlyProblems || entry.action === 'error');

  return (
    <div className="space-y-4">
      <ol className="space-y-3 rounded-xl border border-dashed border-line/[0.15] p-4 text-sm text-steel-300">
        <li>
          <span className="font-semibold text-steel-100">1. Download the template</span> — one row per customer.
          {' '}<strong>Customer name</strong> and <strong>Mobile</strong> are needed; Email, GST number, Address, City, State and
          Pincode are read when filled. A How to fill sheet inside says what goes in each column.
          <button type="button" className="mt-1 block font-semibold text-accent hover:underline" onClick={() => downloads.customerTemplate()}>
            Download customer-import-template.xlsx
          </button>
        </li>
        <li>
          <label className="block">
            <span className="font-semibold text-steel-100">2. Marketing owner</span> — for rows whose Marketing owner column is blank
            <select
              className="input mt-1 max-w-sm"
              value={owner}
              aria-label="Marketing owner for rows that name none"
              onChange={(event) => { setOwner(event.target.value); if (file) check(file, event.target.value); }}
            >
              <option value="">Only the owners named in the sheet</option>
              {team.map((person) => <option key={person._id} value={person._id}>{person.name}{person.self ? ' (you)' : ''}</option>)}
            </select>
          </label>
        </li>
        <li>
          <span className="font-semibold text-steel-100">3. Choose the filled file</span> — Excel (.xlsx) or CSV. Nothing is saved until you press Import.
          <input
            type="file"
            accept=".xlsx,.csv"
            aria-label="Customer file"
            className="input mt-1 max-w-sm"
            onChange={(event) => check(event.target.files?.[0] || null)}
          />
        </li>
      </ol>

      {busy && !preview && <p className="text-sm text-steel-400">Reading the file…</p>}
      <FormError error={error} />

      {summary && (
        <>
          <div className="grid grid-cols-3 gap-2">
            {[
              ['New customers', summary.create, 'text-success-400'],
              ['Already there', summary.exists, 'text-steel-300'],
              ['To fix', summary.error, summary.error ? 'text-danger-400' : 'text-steel-300'],
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
              Show only the rows to fix
            </label>
          )}

          <div className="max-h-80 overflow-auto rounded-lg border border-line/[0.08]">
            <table className="w-full text-left text-sm">
              <thead className="sticky top-0 bg-ink-850 text-xs uppercase tracking-wide text-steel-500">
                <tr>
                  <th className="px-3 py-2">Row</th>
                  <th className="px-3 py-2">Customer</th>
                  <th className="px-3 py-2">What happens</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((entry) => (
                  <tr key={entry.row} className="border-t border-line/[0.05] align-top">
                    <td className="px-3 py-2 tabular-nums text-steel-500">{entry.row}</td>
                    <td className="px-3 py-2">
                      <span className="font-semibold text-steel-100">{entry.fields?.name || '—'}</span>
                      <span className={`ml-2 rounded-full px-2 py-0.5 text-[0.75rem] font-bold ${ACTION[entry.action].tone}`}>{ACTION[entry.action].label}</span>
                      {entry.fields?.mobile && <span className="block text-xs text-steel-500">{entry.fields.mobile}</span>}
                    </td>
                    <td className={`px-3 py-2 text-xs ${entry.action === 'error' ? 'text-danger-400' : 'text-steel-300'}`}>{describeCustomerRow(entry)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {summary.error > 0 && <p className="text-xs text-steel-500">Rows to fix are skipped. Correct them in the file and upload it again — customers already brought in are skipped then.</p>}
        </>
      )}

      <div className="flex justify-end gap-2 border-t border-line/[0.06] pt-4">
        <button type="button" className="btn-secondary" onClick={onClose}>Cancel</button>
        <button type="button" className="btn-primary" disabled={busy || !preview || !summary?.create} onClick={commit}>
          {busy && preview ? 'Importing…' : summary?.create ? `Import ${summary.create} customer${summary.create === 1 ? '' : 's'}` : 'Nothing to import'}
        </button>
      </div>
    </div>
  );
}
