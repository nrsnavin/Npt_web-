import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { production as productionApi } from '../api/endpoints.js';
import { ErrorState, Field, Notice, PageHeader, Section, Spinner } from '../components/ui.jsx';
import { formatNumber } from '../utils/format.js';
import { todayInIndia } from '../utils/taskForm.js';

/**
 * What one shift hands the next [server: floor.service `shiftSummary`]: per press, the runs
 * worked, good and rejected pieces, minutes stopped by reason and the problems written down; the
 * presses still called in; and what each job still has to make. Printable for the notice board.
 */
export default function ShiftHandover() {
  const [day, setDay] = useState(todayInIndia());
  const [shift, setShift] = useState('');
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const load = useCallback(() => {
    setError(null);
    productionApi.shiftSummary({ day, shift: shift || undefined }).then(setData).catch(setError);
  }, [day, shift]);
  useEffect(() => { load(); }, [load]);

  return (
    <div className="space-y-5">
      <PageHeader
        title="Shift handover"
        subtitle="What this shift made, what stopped the presses, and what the next shift picks up."
        actions={(
          <>
            <Link to="/floor" className="btn-secondary print:hidden">Floor</Link>
            <button type="button" className="btn-secondary print:hidden" onClick={() => window.print()}>Print</button>
          </>
        )}
      />
      <div className="flex flex-wrap items-end gap-3 print:hidden">
        <Field label="Day"><input type="date" className="input" value={day} max={todayInIndia()} onChange={(event) => setDay(event.target.value)} /></Field>
        <Field label="Shift">
          <select className="input" value={shift} onChange={(event) => setShift(event.target.value)}>
            <option value="">Whole day</option>
            {['A', 'B', 'C', 'General'].map((key) => <option key={key} value={key}>{key === 'General' ? 'General' : `Shift ${key}`}</option>)}
          </select>
        </Field>
      </div>
      {error && <ErrorState error={error} onRetry={load} />}
      {!data && !error && <Spinner label="Putting the handover together" />}
      {data && (
        <>
          <p className="text-sm text-steel-300">
            <span className="font-semibold text-steel-100">{formatNumber(data.totals.good)}</span> good ·{' '}
            <span className="font-semibold text-steel-100">{formatNumber(data.totals.rejected)}</span> rejected ·{' '}
            <span className="font-semibold text-steel-100">{formatNumber(data.totals.minutes)}</span> minutes stopped
          </p>
          {data.calledIn.length > 0 && (
            <Notice tone="danger">Still stopped: {data.calledIn.map((press) => `${press.code} (${press.reason}${press.note ? ` — ${press.note}` : ''})`).join(' · ')}</Notice>
          )}
          {data.presses.length === 0 && <p className="text-sm text-steel-500">No runs in this shift.</p>}
          {data.presses.map((press) => (
            <Section key={press.press} title={`${press.press} — ${formatNumber(press.good)} good, ${formatNumber(press.rejected)} rejected`}>
              <ul className="space-y-1 text-sm">
                {press.runs.map((run) => (
                  <li key={run.number} className="text-steel-200">
                    <span className="font-semibold">{run.mould || run.number}</span>
                    <span className="text-steel-400"> · {[run.customer, run.number, run.operator && `by ${run.operator}`].filter(Boolean).join(' · ')} · {run.status === 'running' ? 'still running' : run.status}</span>
                    {run.workOrder && <span className="text-steel-400"> · {run.workOrder.number}: {formatNumber(run.workOrder.left)} still to make</span>}
                  </li>
                ))}
              </ul>
              {press.downtime.length > 0 && <p className="mt-2 text-sm text-warn-400">Stopped: {press.downtime.map((entry) => `${entry.label} ${formatNumber(entry.minutes)} min`).join(' · ')}</p>}
              {press.problems.length > 0 && <p className="mt-1 text-sm text-steel-300">Noted: {press.problems.join(' · ')}</p>}
            </Section>
          ))}
          {data.rejects.length > 0 && (
            <Section title="Rejects by defect">
              <p className="text-sm text-steel-300">{data.rejects.map((entry) => `${entry.label} ${formatNumber(entry.pieces)}`).join(' · ')}</p>
            </Section>
          )}
        </>
      )}
    </div>
  );
}
