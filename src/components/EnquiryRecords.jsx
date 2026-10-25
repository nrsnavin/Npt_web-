import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { enquiryRecords, qcRecordsApi } from '../api/endpoints.js';
import { useAuth } from '../context/AuthContext.jsx';
import { Badge, ErrorState, Section } from './ui.jsx';
import { DispatchBody } from './OrderDispatchDetails.jsx';
import { formatDate, formatNumber } from '../utils/format.js';
import { orderStageLabel } from '../utils/pipeline.js';
import { QC_STAGES, QC_VERDICTS, labelOf, toneOf } from '../utils/records.js';

/**
 * What the enquiry led to [server: records.service `enquiryRecords`]: its sales orders, the QC test
 * sheets on it (with the quality grant), and how its goods went — each dispatch request, the trips
 * it went on and the LR, each naming its SO. One place to answer the buyer's "where is my order".
 */
/**
 * The enquiry's records, read once for the page [server: records.service `enquiryRecords`].
 * `auto: false` leaves the reading to the caller — the enquiry page reads them as the enquiry loads and moves.
 */
export function useEnquiryRecords(enquiryId, { auto = true } = {}) {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const load = useCallback(() => enquiryRecords(enquiryId).then((next) => { setData(next); setError(null); }).catch(setError), [enquiryId]);
  useEffect(() => { if (auto) load(); }, [load, auto]);
  return { data, error, load };
}

/** Once the goods have started going, how they went comes first on the enquiry [pages/EnquiryDetail.jsx]. */
export const dispatchStarted = (data) => Boolean(data?.dispatch?.requests?.length);

/** How the goods went: per model, each request and its loads, the trips and the LR. */
export function EnquiryDispatch({ data, highlight = false }) {
  if (!data?.dispatch || (!data.dispatch.requests.length && !data.dispatch.lr.length)) return null;
  return (
    <Section title="Dispatch details" className={highlight ? 'ring-1 ring-accent/30' : ''}>
      <DispatchBody data={data.dispatch} showOrder={data.orders.length > 1 || data.dispatch.requests.some((row) => row.order)} />
    </Section>
  );
}

/**
 * What the enquiry led to: its sales orders, the QC test sheets on it (with the quality grant),
 * and how its goods went — each naming its SO. `dispatchAbove`: the dispatch is already shown
 * at the top of the page, so it is not repeated here.
 */
export default function EnquiryRecords({ enquiry, records, dispatchAbove = false }) {
  const { canRead, canWrite } = useAuth();
  const { data, error, load } = records;
  if (error) return <Section title="Orders, QC and dispatch"><ErrorState error={error} onRetry={load} /></Section>;
  if (!data) return null;
  /* An enquiry that has not reached an order yet has nothing here to show. */
  if (!data.orders.length && !data.qc?.length && !data.dispatch.requests.length && !data.dispatch.lr.length) return null;

  return (
    <>
      <Section title={`Sales orders (${data.orders.length})`}>
        {data.orders.length ? (
          <ul className="divide-y divide-line/[0.06] text-sm">
            {data.orders.map((order) => (
              <li key={order._id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                <span>
                  {canRead('orders')
                    ? <Link to={`/orders/${order._id}`} className="font-semibold text-steel-100 hover:text-accent">{order.number}</Link>
                    : <span className="font-semibold text-steel-100">{order.number}</span>}
                  <span className="text-steel-400">{order.buyerPo ? ` · PO ${order.buyerPo}` : ''}{order.models ? ` · ${order.models}` : ''}{order.quantity ? ` · ${formatNumber(order.quantity)} pcs` : ''}</span>
                </span>
                <Badge status={order.status}>{orderStageLabel(order.status)}</Badge>
              </li>
            ))}
          </ul>
        ) : <p className="text-sm text-steel-400">No sales order yet.</p>}
      </Section>

      {data.qc && (
        <Section
          title={`QC records (${data.qc.length})`}
          actions={canWrite('quality') && <Link to={`/qc-records/new?enquiry=${enquiry._id}&stage=final`} className="btn-secondary px-3 py-1.5 text-xs">New QC record</Link>}
        >
          {data.qc.length ? (
            <ul className="divide-y divide-line/[0.06] text-sm">
              {data.qc.map((row) => (
                <li key={row._id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                  <span>
                    <Link to={`/qc-records/${row._id}`} className="font-semibold text-steel-100 hover:text-accent">{row.number}</Link>
                    <span className="text-steel-400"> · {labelOf(QC_STAGES, row.stage)}{row.order?.number ? ` · ${row.order.number}` : ''} · {row.modelNumber || row.mould?.mouldCode || ''} · {formatDate(row.inspectedAt)}</span>
                    {row.failedTests?.length > 0 && <span className="block text-xs text-danger-400">Failed {row.failedTests.join(', ')}</span>}
                  </span>
                  <span className="flex items-center gap-2">
                    <Badge tone={toneOf(QC_VERDICTS, row.verdict)}>{labelOf(QC_VERDICTS, row.verdict)}</Badge>
                    <button type="button" className="text-xs font-semibold text-accent" onClick={() => qcRecordsApi.certificate(row)}>Report</button>
                  </span>
                </li>
              ))}
            </ul>
          ) : <p className="text-sm text-steel-400">No QC record on this enquiry yet.</p>}
        </Section>
      )}

      {!dispatchAbove && <EnquiryDispatch data={data} />}
    </>
  );
}
