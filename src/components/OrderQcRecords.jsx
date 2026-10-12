import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { qcRecordsApi } from '../api/endpoints.js';
import { useAuth } from '../context/AuthContext.jsx';
import { Badge, ErrorState, Section } from './ui.jsx';
import { formatDate } from '../utils/format.js';
import { QC_STAGES, QC_VERDICTS, labelOf, toneOf } from '../utils/records.js';

/**
 * The SO's QC records [server: records.service `qcForOrder`]: each line of the order with its latest
 * verdict and a button to fill a sheet for it, then every sheet against the order. A sheet filled
 * from the enquiry or its Quality task lands here too — the server ties it to the enquiry's SO.
 */
export default function OrderQcRecords({ order }) {
  const { canWrite } = useAuth();
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const load = useCallback(() => qcRecordsApi.onOrder(order._id).then((next) => { setData(next); setError(null); }).catch(setError), [order._id]);
  useEffect(() => { load(); }, [load]);
  const newFor = (line) => `/qc-records/new?order=${order._id}${line ? `&orderLine=${line}` : ''}${order.enquiry ? `&enquiry=${order.enquiry._id || order.enquiry}` : ''}&stage=final`;

  return (
    <Section
      title={`QC records${data ? ` (${data.data.length})` : ''}`}
      actions={canWrite('quality') && <Link to={newFor()} className="btn-secondary px-3 py-1.5 text-xs">New QC record</Link>}
    >
      {error && <ErrorState error={error} onRetry={load} />}
      {!data && !error && <p className="text-sm text-steel-400">Loading…</p>}
      {data && (
        <div className="space-y-4">
          {data.lines.length > 0 && (
            <ul className="divide-y divide-line/[0.06] text-sm" aria-label="Latest verdict per line">
              {data.lines.map((line) => (
                <li key={line.line} className="flex flex-wrap items-center justify-between gap-2 py-2">
                  <span className="font-semibold text-steel-100">{line.modelNumber || 'Line'}</span>
                  <span className="flex items-center gap-2">
                    {line.verdict
                      ? <Link to={`/qc-records/${line.record._id}`}><Badge tone={toneOf(QC_VERDICTS, line.verdict)}>{labelOf(QC_VERDICTS, line.verdict)} · {line.record.number}</Badge></Link>
                      : <span className="text-xs text-steel-500">Not checked yet</span>}
                    {canWrite('quality') && <Link to={newFor(line.line)} className="text-xs font-semibold text-accent">Check this line</Link>}
                  </span>
                </li>
              ))}
            </ul>
          )}
          {data.data.length > 0 ? (
            <ul className="divide-y divide-line/[0.06] text-sm">
              {data.data.map((row) => (
                <li key={row._id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                  <span>
                    <Link to={`/qc-records/${row._id}`} className="font-semibold text-steel-100 hover:text-accent">{row.number}</Link>
                    <span className="text-steel-400"> · {labelOf(QC_STAGES, row.stage)} · {row.modelNumber || row.mould?.mouldCode || ''} · {formatDate(row.inspectedAt)}</span>
                    {row.breaking?.minKg != null && <span className="text-steel-400"> · breaking {row.breaking.minKg} kgf min</span>}
                    {row.failedTests?.length > 0 && <span className="block text-xs text-danger-400">Failed {row.failedTests.join(', ')}</span>}
                  </span>
                  <span className="flex items-center gap-2">
                    <Badge tone={toneOf(QC_VERDICTS, row.verdict)}>{labelOf(QC_VERDICTS, row.verdict)}</Badge>
                    <button type="button" className="text-xs font-semibold text-accent" onClick={() => qcRecordsApi.certificate(row)}>Report</button>
                  </span>
                </li>
              ))}
            </ul>
          ) : <p className="text-sm text-steel-400">No QC record on this order yet.</p>}
        </div>
      )}
    </Section>
  );
}
