import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { production as productionApi } from '../api/endpoints.js';
import { ErrorState, Field, PageHeader, Section, Spinner } from '../components/ui.jsx';
import { formatNumber } from '../utils/format.js';
import { todayInIndia } from '../utils/taskForm.js';
import { oeeBand, paretoWidths, pctText, weakestFactor } from '../utils/oee.js';

const TONE = { success: 'text-success-400', warn: 'text-warn-400', danger: 'text-danger-400' };
const BAR = { success: 'bg-success-500', warn: 'bg-warn-500', danger: 'bg-danger-500' };
const daysAgo = (days) => todayInIndia(new Date(Date.now() - days * 86400000));

function Figure({ label, value, hint, tone }) {
  return (
    <div className="card p-4">
      <p className="text-xs font-bold uppercase tracking-[0.08em] text-steel-500">{label}</p>
      <p className={`mt-1 text-2xl font-extrabold tabular-nums ${tone ? TONE[tone] : 'text-steel-50'}`}>{pctText(value)}</p>
      {hint && <p className="mt-0.5 text-xs text-steel-400">{hint}</p>}
    </div>
  );
}

function OeeTable({ rows, label }) {
  if (!rows.length) return <p className="text-sm text-steel-500">No finished runs in these days.</p>;
  return (
    <div className="overflow-x-auto">
      <table className="min-w-full text-sm">
        <thead className="table-head">
          <tr>
            <th className="px-3 py-2 text-left">{label}</th>
            <th className="px-3 py-2 text-right">OEE</th>
            <th className="px-3 py-2 text-right">Availability</th>
            <th className="px-3 py-2 text-right">Performance</th>
            <th className="px-3 py-2 text-right">Quality</th>
            <th className="px-3 py-2 text-right">Hours run</th>
            <th className="px-3 py-2 text-right">Good pieces</th>
            <th className="px-3 py-2 text-left">Work on</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-line/[0.04]">
          {rows.map((row) => {
            const band = oeeBand(row.oee);
            const weak = weakestFactor(row);
            return (
              <tr key={row.key}>
                <td className="px-3 py-2 font-semibold text-steel-100">{row.label}<span className="ml-1 text-xs font-normal text-steel-500">{row.runs} {row.runs === 1 ? 'run' : 'runs'}</span></td>
                <td className={`px-3 py-2 text-right font-bold tabular-nums ${band ? TONE[band.tone] : 'text-steel-400'}`}>{pctText(row.oee)}</td>
                <td className="px-3 py-2 text-right tabular-nums text-steel-200">{pctText(row.availability)}</td>
                <td className="px-3 py-2 text-right tabular-nums text-steel-200">{pctText(row.performance)}</td>
                <td className="px-3 py-2 text-right tabular-nums text-steel-200">{pctText(row.quality)}</td>
                <td className="px-3 py-2 text-right tabular-nums text-steel-300">{formatNumber(row.hoursRun)}</td>
                <td className="px-3 py-2 text-right tabular-nums text-steel-300">{formatNumber(row.good)}</td>
                <td className="px-3 py-2 text-xs text-steel-400">{weak && weak.value < 95 ? `${weak.label} — ${weak.cause}` : '—'}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function Pareto({ rows, field, unit, empty }) {
  if (!rows.length) return <p className="text-sm text-steel-500">{empty}</p>;
  return (
    <ul className="space-y-2">
      {paretoWidths(rows, field).map((row) => (
        <li key={row.label}>
          <div className="flex justify-between gap-3 text-sm">
            <span className="text-steel-200">{row.label}{row.planned ? <span className="text-xs text-steel-500"> · planned</span> : null}</span>
            <span className="tabular-nums text-steel-300">{formatNumber(row[field])} {unit}</span>
          </div>
          <div className="mt-1 h-2 rounded-full bg-line/[0.06]">
            <div className={`h-2 rounded-full ${row.planned ? 'bg-steel-500' : row.reason ? 'bg-accent' : 'bg-warn-500'}`} style={{ width: `${row.width}%` }} />
          </div>
        </li>
      ))}
    </ul>
  );
}

/**
 * OEE: how much of the presses' time turned into good pieces [server: services/oee.service.js].
 * The headline and its three factors, the same by press, mould, shift and day, and the losses —
 * what stopped the presses and what the rejects were — biggest first.
 */
export default function Oee() {
  const [from, setFrom] = useState(daysAgo(29));
  const [to, setTo] = useState(todayInIndia());
  const [report, setReport] = useState(null);
  const [error, setError] = useState(null);
  const load = useCallback(() => {
    setError(null);
    productionApi.oee({ from, to }).then(setReport).catch(setError);
  }, [from, to]);
  useEffect(() => { load(); }, [load]);
  const total = report?.total;
  const band = oeeBand(total?.oee);
  const weak = total && weakestFactor(total);

  return (
    <div className="space-y-5">
      <PageHeader
        title="OEE"
        subtitle="How much of the presses' time became good pieces — and what took the rest."
        actions={<Link to="/mould-runs" className="btn-secondary">Mould runs</Link>}
      />
      <div className="flex flex-wrap items-end gap-3">
        <Field label="From"><input type="date" className="input" value={from} max={to} onChange={(event) => setFrom(event.target.value)} /></Field>
        <Field label="To"><input type="date" className="input" value={to} min={from} max={todayInIndia()} onChange={(event) => setTo(event.target.value)} /></Field>
        {[[7, 'Last 7 days'], [30, 'Last 30 days'], [90, 'Last 90 days']].map(([days, label]) => (
          <button key={days} type="button" className="btn-secondary" onClick={() => { setFrom(daysAgo(days - 1)); setTo(todayInIndia()); }}>{label}</button>
        ))}
      </div>
      {error && <ErrorState error={error} onRetry={load} />}
      {!report && !error && <Spinner label="Working out OEE" />}
      {report && (
        <>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <Figure label="OEE" value={total.oee} tone={band?.tone} hint={band ? `${band.label} · ${total.runs} runs` : `${total.runs} runs`} />
            <Figure label="Availability" value={total.availability} hint={`${formatNumber(total.hoursDownUnplanned)} h of unplanned stops`} />
            <Figure label="Performance" value={total.performance} hint="Shots against the standard cycle" />
            <Figure label="Quality" value={total.quality} hint={`${formatNumber(total.rejected)} rejected of ${formatNumber(total.good + total.rejected)}`} />
          </div>
          {weak && weak.value < 95 && (
            <p className="text-sm text-steel-300">The biggest loss is <span className="font-semibold text-steel-100">{weak.label.toLowerCase()}</span> — {weak.cause}. Start with the top items in the losses below.</p>
          )}
          {total.runs === 0 && <p className="text-sm text-steel-500">No finished runs in these days. OEE fills in as runs are finished on the Mould runs page.</p>}

          {report.byDay.length > 1 && (
            <Section title="By day">
              <div className="flex h-36 items-end gap-1" role="img" aria-label="OEE by day">
                {report.byDay.map((day) => {
                  const dayBand = oeeBand(day.oee);
                  return (
                    <div key={day.key} className="flex h-full flex-1 flex-col justify-end" title={`${day.label}: ${pctText(day.oee)}`}>
                      <div className={`w-full rounded-t ${dayBand ? BAR[dayBand.tone] : 'bg-line/[0.1]'}`} style={{ height: `${Math.max(2, day.oee || 0)}%` }} />
                    </div>
                  );
                })}
              </div>
              <div className="mt-1 flex justify-between text-xs text-steel-500"><span>{report.byDay[0].label}</span><span>{report.byDay.at(-1).label}</span></div>
            </Section>
          )}

          <div className="grid gap-5 lg:grid-cols-2">
            <Section title="What stopped the presses">
              <Pareto rows={report.downtimeByReason} field="minutes" unit="min" empty="No stops recorded." />
            </Section>
            <Section title="What the rejects were">
              <Pareto rows={report.rejectsByReason} field="pieces" unit="pcs" empty="No rejects recorded." />
            </Section>
          </div>

          <Section title="By press"><OeeTable rows={report.byMachine} label="Press" /></Section>
          <Section title="By mould"><OeeTable rows={report.byMould} label="Mould" /></Section>
          <Section title="By shift"><OeeTable rows={report.byShift} label="Shift" /></Section>
        </>
      )}
    </div>
  );
}
