import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { qcReportApi } from '../api/endpoints.js';
import { EmptyState, ErrorState, Meter, PageHeader, Section, Spinner } from '../components/ui.jsx';
import { formatNumber } from '../utils/format.js';
import { QC_VERDICTS, labelOf } from '../utils/records.js';

/**
 * Where the rejects come from [server: records.service `qcReport`]: the QC sheets' verdicts, the
 * tests that failed most, the defects counted, and the reject rate by mould and by machine — the
 * press's own rejects from the runs beside the sampled rejects from QC. Worst first.
 */

const indiaDay = (offset = 0) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date(Date.now() + offset * 86400000));
const rate = (value) => (value == null ? '—' : `${value}%`);
const tone = (value) => (value == null ? 'accent' : value >= 5 ? 'danger' : value >= 2 ? 'warn' : 'good');

function Figure({ label, value, note }) {
  return (
    <div className="rounded-xl border border-line/[0.08] p-4">
      <p className="text-xs font-semibold text-steel-400">{label}</p>
      <p className="mt-1 text-2xl font-bold tabular-nums text-steel-50">{value}</p>
      {note && <p className="mt-0.5 text-xs text-steel-400">{note}</p>}
    </div>
  );
}

function Counts({ rows, empty }) {
  if (!rows.length) return <p className="text-sm text-steel-400">{empty}</p>;
  const top = Math.max(...rows.map((row) => row.count));
  return (
    <ul className="space-y-2 text-sm">
      {rows.map((row) => (
        <li key={row.label || row.name}>
          <div className="flex justify-between gap-2"><span className="text-steel-200">{row.label || row.name}</span><span className="tabular-nums text-steel-100">{formatNumber(row.count)}</span></div>
          <Meter percent={(row.count / top) * 100} label={`${row.label || row.name}: ${row.count}`} tone="danger" className="mt-1" />
        </li>
      ))}
    </ul>
  );
}

export default function QcReport() {
  const [from, setFrom] = useState(indiaDay(-29));
  const [to, setTo] = useState(indiaDay());
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const load = useCallback(() => qcReportApi({ from, to }).then((answer) => { setData(answer); setError(null); }).catch(setError), [from, to]);
  useEffect(() => { load(); }, [load]);
  const pressRate = data?.pressRejects?.made ? Math.round((data.pressRejects.rejected / data.pressRejects.made) * 1000) / 10 : null;

  return (
    <div className="space-y-6">
      <PageHeader title="Reject report" subtitle="Which moulds, machines, defects and tests the rejects come from — worst first." actions={<Link to="/qc-records" className="btn-secondary">QC records</Link>} />
      <div className="flex flex-wrap items-end gap-3">
        <label className="text-sm text-steel-300">From <input type="date" className="input mt-1 w-auto" value={from} max={to} onChange={(event) => setFrom(event.target.value)} /></label>
        <label className="text-sm text-steel-300">To <input type="date" className="input mt-1 w-auto" value={to} min={from} onChange={(event) => setTo(event.target.value)} /></label>
      </div>
      {error && <ErrorState error={error} onRetry={load} />}
      {!data && !error && <Spinner label="Adding it up" />}
      {data && !data.sheets && !data.pressRejects.made && <EmptyState title="Nothing checked or run in these days" description="QC records and finished mould runs are counted here." />}
      {data && (data.sheets > 0 || data.pressRejects.made > 0) && (
        <>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <Figure label="QC sheets" value={data.sheets} note={QC_VERDICTS.map((verdict) => (data.verdicts[verdict.value] ? `${data.verdicts[verdict.value]} ${labelOf(QC_VERDICTS, verdict.value).toLowerCase()}` : null)).filter(Boolean).join(' · ')} />
            <Figure label="Rejected at the press" value={rate(pressRate)} note={`${formatNumber(data.pressRejects.rejected)} of ${formatNumber(data.pressRejects.made)} pieces`} />
            <Figure label="Failed tests" value={data.failedTests.reduce((sum, row) => sum + row.count, 0)} note={data.failedTests[0] ? `Most: ${data.failedTests[0].name}` : undefined} />
            <Figure label="Defects counted" value={formatNumber(data.defects.reduce((sum, row) => sum + row.count, 0))} note={data.defects[0] ? `Most: ${data.defects[0].label}` : undefined} />
          </div>

          <div className="grid gap-5 lg:grid-cols-2">
            <Section title="By mould">
              {data.moulds.length ? (
                <div className="overflow-x-auto">
                  <table className="min-w-full text-sm">
                    <thead><tr className="text-left text-xs text-steel-400"><th className="pb-2 font-semibold">Mould</th><th className="pb-2 text-right font-semibold">Press rejects</th><th className="pb-2 text-right font-semibold">QC sample</th><th className="pb-2 text-right font-semibold">Failed sheets</th></tr></thead>
                    <tbody className="divide-y divide-line/[0.06]">
                      {data.moulds.map((row) => (
                        <tr key={row.mould._id}>
                          <td className="py-2"><Link to={`/moulds/${row.mould._id}`} className="font-semibold text-steel-100 hover:text-accent">{row.mould.code}</Link><p className="text-xs text-steel-500">{row.mould.name}</p></td>
                          <td className="py-2 text-right tabular-nums text-steel-200">{rate(row.rejectPercent)}<p className="text-xs text-steel-500">{row.made ? `${formatNumber(row.rejectedMade)} of ${formatNumber(row.made)}` : ''}</p></td>
                          <td className="py-2 text-right tabular-nums text-steel-200">{rate(row.sampleRejectPercent)}<p className="text-xs text-steel-500">{row.sampled ? `${formatNumber(row.rejectedSampled)} of ${formatNumber(row.sampled)}` : ''}</p></td>
                          <td className="py-2 text-right tabular-nums text-steel-200">{row.failedSheets} of {row.sheets}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : <p className="text-sm text-steel-400">No sheet or run named a mould.</p>}
            </Section>

            <Section title="By machine">
              {data.machines.length ? (
                <ul className="space-y-3">
                  {data.machines.map((row) => (
                    <li key={row.machine._id}>
                      <div className="flex items-baseline justify-between gap-2 text-sm">
                        <Link to={`/machines/${row.machine._id}`} className="font-semibold text-steel-100 hover:text-accent">{row.machine.code}{row.machine.name ? <span className="font-normal text-steel-400"> · {row.machine.name}</span> : null}</Link>
                        <span className="tabular-nums text-steel-300">{rate(row.rejectPercent)} · {row.runs} {row.runs === 1 ? 'run' : 'runs'}{row.downtimeMinutes ? ` · ${row.downtimeMinutes} min stopped` : ''}</span>
                      </div>
                      <Meter className="mt-1" percent={Math.min(100, (row.rejectPercent || 0) * 10)} tone={tone(row.rejectPercent)} label={`${row.machine.code} rejects ${rate(row.rejectPercent)}`} />
                    </li>
                  ))}
                </ul>
              ) : <p className="text-sm text-steel-400">No finished run on a machine in these days.</p>}
            </Section>

            <Section title="Defects"><Counts rows={data.defects} empty="No defects recorded." /></Section>
            <Section title="Tests that failed"><Counts rows={data.failedTests} empty="No test failed." /></Section>
          </div>
        </>
      )}
    </div>
  );
}
