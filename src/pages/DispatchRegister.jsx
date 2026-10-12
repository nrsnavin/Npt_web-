import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { dispatchRegisterApi } from '../api/endpoints.js';
import { Badge, EmptyState, ErrorState, PageHeader, TableSkeleton } from '../components/ui.jsx';
import { formatNumber } from '../utils/format.js';

/**
 * The dispatch register [server: records.service `dispatchRegister`]: every consignment that left,
 * day by day — buyer, goods, cartons, how it went, the vehicle or transporter, the invoice and LR
 * number Reception keeps, and whether it was delivered. The book the office kept by hand, with an
 * Excel download.
 */

const indiaDay = (offset = 0) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date(Date.now() + offset * 86400000));
const shortDay = (date) => new Date(`${date}T12:00:00+05:30`).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
const deliveryTone = (text) => (text === 'Delivered' ? 'success' : text.startsWith('Not delivered') ? 'danger' : 'progress');

export default function DispatchRegister() {
  const [from, setFrom] = useState(indiaDay(-29));
  const [to, setTo] = useState(indiaDay());
  const [search, setSearch] = useState('');
  const [rows, setRows] = useState(null);
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);
  const load = useCallback(() => dispatchRegisterApi.list({ from, to }).then((answer) => { setRows(answer.data); setError(null); }).catch(setError), [from, to]);
  useEffect(() => { load(); }, [load]);
  const needle = search.trim().toLowerCase();
  const shown = (rows || []).filter((row) => !needle || [row.customer, row.city, row.order, row.buyerPo, row.enquiry, row.trip, row.lrNumber, row.invoiceNumber, row.goesBy, row.model].some((value) => String(value || '').toLowerCase().includes(needle)));
  const cartons = shown.reduce((sum, row) => sum + (row.cartons || 0), 0);
  const download = async () => {
    setSaving(true);
    try { await dispatchRegisterApi.csv({ from, to }); } finally { setSaving(false); }
  };

  return (
    <div className="space-y-5">
      <PageHeader
        title="Dispatch register"
        subtitle="Every consignment that left — with the invoice, LR number and whether it reached the buyer."
        actions={(
          <>
            <Link to="/dispatch/report" className="btn-secondary">Dispatch report</Link>
            <button type="button" className="btn-primary" onClick={download} disabled={saving || !rows?.length}>{saving ? 'Preparing…' : 'Download Excel (CSV)'}</button>
          </>
        )}
      />
      <div className="flex flex-wrap items-end gap-3">
        <label className="text-sm text-steel-300">From <input type="date" className="input mt-1 w-auto" value={from} max={to} onChange={(event) => setFrom(event.target.value)} /></label>
        <label className="text-sm text-steel-300">To <input type="date" className="input mt-1 w-auto" value={to} min={from} onChange={(event) => setTo(event.target.value)} /></label>
        <label className="text-sm text-steel-300">Find <input type="search" aria-label="Find in the register" className="input mt-1 w-56" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buyer, SO, LR, invoice, vehicle…" /></label>
        {rows?.length > 0 && <p className="pb-2 text-sm text-steel-400">{shown.length} {shown.length === 1 ? 'consignment' : 'consignments'}{cartons ? ` · ${formatNumber(cartons)} cartons` : ''}</p>}
      </div>
      {error && <ErrorState error={error} onRetry={load} />}
      {!rows && !error && <TableSkeleton rows={6} columns={8} />}
      {rows && !shown.length && <EmptyState title="Nothing left the plant in these days" description="A consignment appears here once its trip is marked Left." />}
      {shown.length > 0 && (
        <div className="card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="table-head">
                <tr>
                  <th className="px-4 py-3">Date</th>
                  <th className="px-4 py-3">Buyer</th>
                  <th className="px-4 py-3">Goods</th>
                  <th className="px-4 py-3 text-right">Cartons</th>
                  <th className="px-4 py-3">Went by</th>
                  <th className="px-4 py-3">Invoice · LR</th>
                  <th className="px-4 py-3">Delivery</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line/[0.04]">
                {shown.map((row, index) => (
                  <tr key={`${row.tripId}-${index}`} className="row-hover align-top">
                    <td className="whitespace-nowrap px-4 py-3.5 text-steel-300">{shortDay(row.date)}<p className="text-xs"><Link to={`/dispatch/trips/${row.tripId}`} className="text-steel-500 hover:text-accent">{row.trip}</Link></p></td>
                    <td className="px-4 py-3.5">
                      <span className="font-semibold text-steel-100">{row.customer || '—'}</span>{row.city && <p className="text-xs text-steel-500">{row.city}</p>}
                      {row.order && <p className="text-xs"><Link to={`/orders/${row.orderId}`} className="text-steel-500 hover:text-accent">{row.order}</Link>{row.buyerPo ? <span className="text-steel-500"> · PO {row.buyerPo}</span> : null}</p>}
                    </td>
                    <td className="px-4 py-3.5 text-steel-200">
                      {[row.model, row.quantity && `${formatNumber(row.quantity)} pcs`].filter(Boolean).join(' · ') || '—'}
                      {row.enquiry && <p className="text-xs"><Link to={`/enquiries/${row.enquiryId}`} className="text-steel-500 hover:text-accent">{row.enquiry}</Link></p>}
                    </td>
                    <td className="px-4 py-3.5 text-right tabular-nums text-steel-200">{row.cartons ?? '—'}</td>
                    <td className="px-4 py-3.5 text-steel-200">{row.mode}<p className="text-xs text-steel-500">{[row.goesBy, row.driver].filter(Boolean).join(' · ')}</p></td>
                    <td className="px-4 py-3.5 text-steel-200">{row.invoiceNumber || '—'}<p className="text-xs text-steel-500">{row.lrNumber ? `LR ${row.lrNumber}` : 'No LR yet'}{row.transporter ? ` · ${row.transporter}` : ''}</p></td>
                    <td className="px-4 py-3.5"><Badge tone={deliveryTone(row.delivery)}>{row.delivery}</Badge></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
