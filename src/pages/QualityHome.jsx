import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { quality as qualityApi } from '../api/endpoints.js';
import { useAuth } from '../context/AuthContext.jsx';
import useQualityOptions from '../hooks/useQualityOptions.js';
import { ErrorState, PageHeader, Spinner } from '../components/ui.jsx';
import { formatCurrency, formatDate, formatNumber } from '../utils/format.js';
import { inspectionStageLabel } from '../utils/pipeline.js';

/**
 * The bench's front page [BLUEPRINT §15].
 *
 * **What is stopping something, first.** A rejected final inspection sets `quality_hold` on the
 * line and nothing ships until somebody clears it — so the held lots are not one section among
 * several, they are the reason this screen exists. Everything else on it is context for them.
 *
 * The three figures underneath are the ones a quality head is asked about rather than the ones
 * that are easy to compute: **how much was scrapped**, **what it was worth**, and **how often
 * the dispatch warning was overridden**. The last is the one that keeps the rest honest — the
 * plant chose a soft gate over a hard refusal, which is the better choice, but only while
 * somebody can see how often the warning is waved through and by whom.
 *
 * Two requests rather than one, and they are awaited together. There is no `/quality/day` on
 * the server the way there is for the plant and the yard, and rendering half a screen while the
 * second reply is in flight would show "nothing is held" to somebody whose line is held.
 */

const TONE = {
  danger: 'text-danger-400',
  warn: 'text-warn-400',
  calm: 'text-steel-50',
};

function Count({ label, value, hint, tone }) {
  return (
    <div className={`card px-5 py-4 ${tone === 'danger' && value ? 'ring-1 ring-danger-500/40' : ''}`}>
      <p className="text-base font-bold text-steel-200">{label}</p>
      <p className={`mt-1 text-[1.75rem] font-extrabold leading-tight ${TONE[tone] || TONE.calm}`}>
        {value}
      </p>
      <p className="mt-1.5 text-sm text-steel-400">{hint}</p>
    </div>
  );
}

/**
 * One held lot.
 *
 * The defects are on the card rather than behind the inspection, because the question asked of
 * a held lot is always "what is wrong with it" and the answer decides who is rung next — a
 * short shot is the press, a wrong shade is the material store.
 */
function Held({ row, defectLabel }) {
  return (
    <li className="rounded-xl border border-danger-500/40 bg-danger-500/[0.04] p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <p className="text-base font-bold text-steel-50">
          {row.modelNumber || row.mould?.mouldCode || 'Unnamed model'}
          {row.colour ? <span className="font-semibold text-steel-300"> · {row.colour}</span> : null}
        </p>
        <p className="text-sm font-bold text-danger-400">
          {inspectionStageLabel(row.stage)} · rejected
        </p>
      </div>

      <p className="mt-1 text-sm text-steel-300">
        {row.order?.customer?.name || 'Customer not named'}
        {row.order?.number ? (
          <>
            {' · '}
            <Link to={`/orders/${row.order._id}`} className="transition-colors hover:text-accent">
              {row.order.number}
            </Link>
          </>
        ) : null}
      </p>

      <p className="mt-2 text-base font-bold text-danger-400">
        {formatNumber(row.quantityRejected)} rejected of {formatNumber(row.quantityInspected)} checked
        {row.rejectionPercent ? ` · ${row.rejectionPercent}%` : ''}
      </p>

      {/* What is actually wrong with it, which is what decides who gets rung. */}
      {row.defects?.length > 0 && (
        <ul className="mt-2 flex flex-wrap gap-1.5">
          {row.defects.map((defect) => (
            <li
              key={defect.type}
              className="rounded-md border border-line/[0.1] bg-line/[0.03] px-2 py-1 text-xs font-semibold text-steel-200"
            >
              {defectLabel(defect.type)}
              {defect.count ? ` · ${formatNumber(defect.count)}` : ''}
            </li>
          ))}
        </ul>
      )}

      {row.remarks && <p className="mt-2 text-sm text-steel-300">{row.remarks}</p>}

      <p className="mt-3 border-t border-line/[0.06] pt-2 text-sm text-steel-400">
        {row.inspectedBy?.name || 'Somebody'} · {formatDate(row.inspectedAt)}
        {row.dispatch?.number ? ` · was for ${row.dispatch.number}` : ''}
      </p>
    </li>
  );
}

/** A tally row, drawn as a bar so the outlier is visible before anything is read. */
function Rate({ row, worst }) {
  const width = worst ? Math.max(2, Math.round((row.rejectionPercent / worst) * 100)) : 0;

  return (
    <li className="py-2">
      <div className="flex items-baseline justify-between gap-4">
        <p className="text-sm font-semibold text-steel-100">{row.label}</p>
        <p className="text-sm font-bold tabular-nums text-steel-100">{row.rejectionPercent}%</p>
      </div>
      <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-line/[0.08]">
        <div
          className={`h-full rounded-full ${row.rejectionPercent >= 5 ? 'bg-danger-500' : 'bg-flame-500'}`}
          style={{ width: `${width}%` }}
        />
      </div>
      <p className="mt-1 text-xs text-steel-500">
        {formatNumber(row.rejected)} of {formatNumber(row.inspected)} checked · {row.inspections}{' '}
        {row.inspections === 1 ? 'inspection' : 'inspections'}
      </p>
    </li>
  );
}

function Group({ title, hint, children, count }) {
  if (!count) return null;

  return (
    <section className="mt-7">
      <h2 className="text-lg font-bold tracking-tight text-steel-50">
        {title} <span className="text-steel-400">({count})</span>
      </h2>
      <p className="mt-0.5 text-sm text-steel-400">{hint}</p>
      <ul className="mt-3 space-y-3">{children}</ul>
    </section>
  );
}

export default function QualityHome() {
  const { user } = useAuth();
  const { defectLabel } = useQualityOptions();
  const [held, setHeld] = useState(null);
  const [report, setReport] = useState(null);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      /*
       * Together, not in sequence. Rendering the first reply while the second is in flight
       * would show "nothing is held" to somebody whose line is held, which is the one thing
       * this screen must never say wrongly.
       */
      const [holds, summary] = await Promise.all([
        qualityApi.list({ held: 'true', limit: 25 }),
        qualityApi.report(),
      ]);
      setHeld(holds);
      setReport(summary);
    } catch (loadError) {
      setError(loadError);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const greeting = useMemo(() => {
    const hour = new Date().getHours();
    if (hour < 12) return 'Good morning';
    if (hour < 17) return 'Good afternoon';
    return 'Good evening';
  }, []);

  if (error) return <ErrorState error={error} onRetry={load} />;
  if (!held || !report) return <Spinner label="Loading what quality found" />;

  const meta = report.meta || {};
  const rows = held.data || [];
  const worstMould = report.data?.byMould?.[0]?.rejectionPercent || 0;

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader
        title={`${greeting}, ${user?.name?.split(' ')[0] || ''}`}
        subtitle="What is held, and what the last ninety days found"
        actions={
          <div className="flex flex-wrap gap-2">
            <Link to="/quality" className="btn-secondary">All inspections</Link>
            <Link to="/quality/report" className="btn-ghost">The report</Link>
          </div>
        }
      />

      <div className="grid gap-3 sm:grid-cols-3">
        <Count
          label="Held"
          value={rows.length}
          hint={rows.length ? 'Nothing on these lines can ship' : 'Nothing is held'}
          tone="danger"
        />
        <Count
          label="Rejected"
          value={`${meta.rejectionPercent || 0}%`}
          hint={`${formatNumber(meta.rejected || 0)} of ${formatNumber(meta.inspected || 0)} checked`}
          tone={meta.rejectionPercent >= 5 ? 'danger' : 'warn'}
        />
        <Count
          label="What it was worth"
          value={formatCurrency(meta.costOfRejection || 0)}
          hint="At the rate it would have sold for — an order of magnitude, not an accounting figure"
          tone="calm"
        />
      </div>

      <Group
        title="Held right now"
        hint="A rejected final inspection stops the line — nothing ships until it is cleared"
        count={rows.length}
      >
        {rows.map((row) => (
          <Held key={row._id} row={row} defectLabel={defectLabel} />
        ))}
      </Group>

      {/*
        Which tool, by rate rather than by volume. A tool that made ten thousand and scrapped
        four hundred is worse than one that made a million and scrapped a thousand, and a chart
        sorted by count would put the big run on top every time and hide it.
      */}
      {report.data?.byMould?.length > 0 && (
        <section className="mt-7">
          <h2 className="text-lg font-bold tracking-tight text-steel-50">Worst tools</h2>
          <p className="mt-0.5 text-sm text-steel-400">
            By rejection rate, not by how much they made
          </p>
          <ul className="card mt-3 divide-y divide-line/[0.04] px-5 py-2">
            {report.data.byMould.slice(0, 5).map((row) => (
              <Rate key={row.key} row={row} worst={worstMould} />
            ))}
          </ul>
        </section>
      )}

      {report.data?.byDefect?.length > 0 && (
        <section className="mt-7">
          <h2 className="text-lg font-bold tracking-tight text-steel-50">What is going wrong</h2>
          <p className="mt-0.5 text-sm text-steel-400">
            Counted across faults, so one piece with two problems is two — both are worth fixing
          </p>
          <ul className="card mt-3 divide-y divide-line/[0.04] px-5 py-2">
            {report.data.byDefect.slice(0, 6).map((row) => (
              <li key={row.key} className="flex items-baseline justify-between gap-4 py-2.5">
                <span className="text-sm font-semibold text-steel-100">{row.label}</span>
                <span className="text-sm font-bold tabular-nums text-steel-300">
                  {formatNumber(row.count)}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {rows.length === 0 && !meta.inspections && (
        <div className="card mt-7 px-6 py-14 text-center">
          <p className="text-lg font-bold text-steel-100">Nothing inspected yet.</p>
          <p className="mt-1.5 text-base text-steel-400">
            An inspection is recorded against a line of a released order, from the order's own
            screen — what was checked, what was wrong with it, and whether it can go.
          </p>
        </div>
      )}
    </div>
  );
}
