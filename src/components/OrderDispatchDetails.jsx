import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { orderDispatchDetails } from '../api/endpoints.js';
import { useAuth } from '../context/AuthContext.jsx';
import { Badge, ErrorState, Section } from './ui.jsx';
import TaskPdfLink from './TaskPdfLink.jsx';
import QcFlag from './QcFlag.jsx';
import DispatchProgress from './DispatchProgress.jsx';
import { formatNumber } from '../utils/format.js';

/**
 * How this SO's goods went [server: records.service `dispatchDetailsForOrder`]: each dispatch request
 * and where Dispatch has it, the trips it went on — vehicle or transporter, driver, when it left,
 * delivered or not — and the invoice, LR number, transporter and LR copy Reception keeps.
 */

const DELIVERY = {
  delivered: { label: 'Delivered', tone: 'success' },
  not_delivered: { label: 'Not delivered', tone: 'danger' },
  planned: { label: 'On the way', tone: 'progress' },
};
const TRIP = { planned: 'Planned', loading: 'Loading', left: 'Left', completed: 'Completed', cancelled: 'Cancelled' };
const when = (value) => (value ? new Date(value).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' }) : '');
const day = (date) => new Date(`${date}T12:00:00+05:30`).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });

/**
 * The requests, trips and LR rows themselves — shared by the SO page and the enquiry page. On the
 * enquiry, `showOrder` names the SO each request and LR is for.
 */
export function DispatchBody({ data, showOrder = false }) {
  const { canRead } = useAuth();
  if (!data.requests.length && !data.lr.length) {
    return <p className="text-sm text-steel-400">No dispatch request yet. It appears here once marketing sends one to Dispatch.</p>;
  }
  const soOf = (row) => (showOrder && row.order ? (
    canRead('orders') ? <Link to={`/orders/${row.order._id}`} className="text-accent">{row.order.number}</Link> : row.order.number
  ) : null);
  return (
    <div className="space-y-5">
      {/* Each model ordered against what has gone, across every request [DispatchProgress]. */}
      {data.models?.length > 0 && <DispatchProgress models={data.models} />}
      {data.requests.map((request, index) => (
        <div key={request._id} className="rounded-xl border border-line/[0.08] p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm font-semibold text-steel-100">
              Dispatch request {data.requests.length > 1 ? index + 1 : ''}{request.quantity ? ` · ${request.quantity} pcs` : ''}
              {soOf(request) && <span className="font-normal text-steel-400"> · {soOf(request)}</span>}
            </p>
            <Badge tone={request.completed ? 'success' : 'info'}>{request.statusLabel || 'Raised'}</Badge>
          </div>
          {request.remark && <p className="mt-1 text-xs text-steel-400">{request.remark}</p>}
          {request.qc && <p className="mt-1"><QcFlag qc={request.qc} /></p>}
          {/* Each load sent from the dispatch form: when, the models and pieces, how, who, and its proof. */}
          {request.loads?.length > 0 && (
            <ul className="mt-3 divide-y divide-line/[0.06] rounded-lg bg-line/[0.03] text-sm" aria-label="Loads sent">
              {request.loads.map((load) => (
                <li key={load._id} className="flex flex-wrap items-start justify-between gap-2 px-3 py-2">
                  <span className="min-w-0">
                    <span className="font-semibold text-steel-100">{load.lines.map((line) => `${line.model} ${formatNumber(line.quantity)} pcs`).join(' · ')}</span>
                    <span className="block text-xs text-steel-400">
                      {[when(load.at), load.mode, load.by && `by ${load.by}`, load.statusLabel].filter(Boolean).join(' · ')}
                    </span>
                    {(load.lrNumber || load.transporter || load.vehicleNumber) && (
                      <span className="block text-xs text-steel-400">{[load.lrNumber && `LR ${load.lrNumber}`, load.transporter, load.vehicleNumber].filter(Boolean).join(' · ')}</span>
                    )}
                    {load.note && <span className="block text-xs text-steel-500">{load.note}</span>}
                  </span>
                  {load.proof ? <TaskPdfLink file={load.proof} /> : load.proofPending && <span className="text-xs font-semibold text-warn-400">Paper to come</span>}
                </li>
              ))}
            </ul>
          )}
          {request.trips.length ? (
            <ul className="mt-3 space-y-2 text-sm">
              {request.trips.map((leg) => (
                <li key={`${leg.tripId}-${leg.trip}`} className="flex flex-wrap items-start justify-between gap-2">
                  <span>
                    {canRead('dispatch')
                      ? <Link to={`/dispatch/trips/${leg.tripId}`} className="font-semibold text-steel-100 hover:text-accent">{leg.trip}</Link>
                      : <span className="font-semibold text-steel-100">{leg.trip}</span>}
                    <span className="text-steel-400"> · {day(leg.date)} · {leg.mode}{leg.goesBy ? ` · ${leg.goesBy}` : ''}</span>
                    <span className="block text-xs text-steel-500">
                      {[leg.driver && `Driver ${leg.driver}`, leg.quantity != null && `${formatNumber(leg.quantity)} pcs`, leg.cartons != null && `${leg.cartons} cartons`, leg.leftAt && `left ${when(leg.leftAt)}`].filter(Boolean).join(' · ')}
                    </span>
                    {leg.note && <span className="block text-xs text-danger-400">{leg.note}</span>}
                  </span>
                  <span className="flex items-center gap-2">
                    <span className="text-xs text-steel-500">{TRIP[leg.status] || leg.status}</span>
                    {['left', 'completed'].includes(leg.status) && <Badge tone={DELIVERY[leg.delivery]?.tone || 'neutral'}>{DELIVERY[leg.delivery]?.label || leg.delivery}</Badge>}
                  </span>
                </li>
              ))}
            </ul>
          ) : <p className="mt-2 text-xs text-steel-500">Not on a trip yet.</p>}
        </div>
      ))}
      {data.lr.length > 0 && (
        <div>
          <p className="eyebrow mb-2">Invoice and LR</p>
          <ul className="divide-y divide-line/[0.06] text-sm">
            {data.lr.map((row) => (
              <li key={row._id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                <span className="text-steel-200">
                  {row.invoiceNumber ? `Invoice ${row.invoiceNumber}` : 'Invoice not recorded'}
                  <span className="text-steel-400"> · {row.lrNumber ? `LR ${row.lrNumber}` : 'LR awaited'}{row.transporter ? ` · ${row.transporter}` : ''}</span>
                  {soOf(row) && <span className="text-steel-400"> · {soOf(row)}</span>}
                </span>
                <span className="flex items-center gap-2">
                  <TaskPdfLink file={row.lrCopy} />
                  <Badge tone={row.completed ? 'success' : 'progress'}>{row.statusLabel || 'Awaiting'}</Badge>
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

export default function OrderDispatchDetails({ order }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const load = useCallback(() => orderDispatchDetails(order._id).then((next) => { setData(next); setError(null); }).catch(setError), [order._id]);
  useEffect(() => { load(); }, [load]);

  return (
    <Section title="Dispatch details">
      {error && <ErrorState error={error} onRetry={load} />}
      {!data && !error && <p className="text-sm text-steel-400">Loading…</p>}
      {data && <DispatchBody data={data} />}
    </Section>
  );
}
