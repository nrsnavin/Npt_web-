import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { quality as qualityApi } from '../api/endpoints.js';
import { ErrorState, PageHeader, Section, Spinner } from '../components/ui.jsx';
import { formatCurrency, formatDate, formatNumber } from '../utils/format.js';
import { inspectionStageLabel } from '../utils/pipeline.js';

/**
 * What quality found, over a period [BLUEPRINT §15].
 *
 * Four questions, in the order that decides what anybody does about them:
 *
 *   **Which tool** — sends somebody to a press.
 *   **Which defect** — decides where the effort goes.
 *   **Which resin** — separates a material problem from a tool problem, which is the argument
 *   the plant and the material store have every month with nothing to settle it.
 *   **The overrides** — say whether the dispatch warning is a judgement or a rubber stamp.
 *
 * Everything a quality report could show is downstream of those, and a screen with twelve
 * charts is a screen nobody opens twice.
 *
 * **Sorted by rate, not by volume.** A tool that made ten thousand and scrapped four hundred is
 * worse than one that made a million and scrapped a thousand — and a chart sorted by count puts
 * the big run on top every time and hides the bad tool underneath it. The server does this
 * ordering; the screen must not undo it.
 */

/** The window. Ninety days by default, because a defect trend needs more than a month. */
const RANGES = [
  { value: '30', label: 'Last 30 days' },
  { value: '90', label: 'Last 90 days' },
  { value: '180', label: 'Last six months' },
  { value: '365', label: 'Last year' },
];

const sinceFor = (days) => {
  const date = new Date();
  date.setDate(date.getDate() - Number(days));
  return date.toISOString().slice(0, 10);
};

function Headline({ label, value, hint, lit }) {
  return (
    <div className={`card px-5 py-4 ${lit ? 'ring-1 ring-danger-500/40' : ''}`}>
      <p className="eyebrow">{label}</p>
      <p className={`mt-1 text-[1.6rem] font-extrabold leading-tight ${lit ? 'text-danger-400' : 'text-steel-50'}`}>
        {value}
      </p>
      <p className="mt-1.5 text-xs text-steel-500">{hint}</p>
    </div>
  );
}

/**
 * A tally, drawn as bars.
 *
 * Bars rather than numbers alone because the question these answer is comparative — not "what
 * is this tool's rate" but "which tool is worst" — and a column of percentages makes the reader
 * do that comparison themselves.
 */
function Tally({ title, hint, rows, empty, labelOf = (row) => row.label }) {
  if (!rows?.length) {
    return (
      <Section title={title}>
        <p className="text-sm text-steel-500">{empty}</p>
      </Section>
    );
  }

  const worst = rows[0].rejectionPercent || 0;

  return (
    <Section title={title}>
      <p className="-mt-1 mb-3 text-sm text-steel-400">{hint}</p>
      <ul className="divide-y divide-line/[0.04]">
        {rows.map((row) => (
          <li key={row.key} className="py-2.5">
            <div className="flex items-baseline justify-between gap-4">
              <p className="text-sm font-semibold text-steel-100">{labelOf(row)}</p>
              <p className="text-sm font-bold tabular-nums text-steel-100">{row.rejectionPercent}%</p>
            </div>
            <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-line/[0.08]">
              <div
                className={`h-full rounded-full ${row.rejectionPercent >= 5 ? 'bg-danger-500' : 'bg-flame-500'}`}
                style={{ width: `${worst ? Math.max(2, Math.round((row.rejectionPercent / worst) * 100)) : 0}%` }}
              />
            </div>
            <p className="mt-1 text-xs text-steel-500">
              {formatNumber(row.rejected)} of {formatNumber(row.inspected)} checked ·{' '}
              {row.inspections} {row.inspections === 1 ? 'inspection' : 'inspections'}
            </p>
          </li>
        ))}
      </ul>
    </Section>
  );
}

export default function QualityReport() {
  const [days, setDays] = useState('90');
  const [report, setReport] = useState(null);
  const [overrides, setOverrides] = useState(null);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    setError(null);
    setReport(null);
    try {
      const since = sinceFor(days);
      /* Together: the overrides are part of the same question — how much did we find, and how
         often did we let it go anyway — and a page that drew one before the other would invite
         reading the rejection rate without the waiver rate beside it. */
      const [summary, waived] = await Promise.all([
        qualityApi.report({ since }),
        qualityApi.overrides({ since }),
      ]);
      setReport(summary);
      setOverrides(waived);
    } catch (loadError) {
      setError(loadError);
    }
  }, [days]);

  useEffect(() => {
    load();
  }, [load]);

  if (error) return <ErrorState error={error} onRetry={load} />;
  if (!report) return <Spinner label="Reading the inspections" />;

  const meta = report.meta || {};
  const data = report.data || {};
  const waived = overrides?.data || [];

  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader
        title="What quality found"
        subtitle={`${formatDate(meta.since)} to ${formatDate(meta.until)}`}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <select
              className="input w-44"
              value={days}
              onChange={(event) => setDays(event.target.value)}
              aria-label="Period"
            >
              {RANGES.map((range) => (
                <option key={range.value} value={range.value}>{range.label}</option>
              ))}
            </select>
            <Link to="/quality" className="btn-secondary">All inspections</Link>
          </div>
        }
      />

      <div className="mb-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Headline
          label="Checked"
          value={formatNumber(meta.inspected || 0)}
          hint={`Across ${meta.inspections || 0} inspections`}
        />
        <Headline
          label="Rejected"
          value={`${meta.rejectionPercent || 0}%`}
          hint={`${formatNumber(meta.rejected || 0)} pieces`}
          lit={meta.rejectionPercent >= 5}
        />
        <Headline
          label="What it was worth"
          value={formatCurrency(meta.costOfRejection || 0)}
          hint="At the rate it would have sold for"
        />
        <Headline
          label="Sent anyway"
          value={waived.length}
          hint="Consignments that went despite the warning"
          lit={waived.length > 0}
        />
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <Tally
          title="Which tool"
          hint="By rejection rate, not by how much it made — otherwise the big run hides the bad tool"
          rows={data.byMould}
          empty="Nothing has been inspected against a tool in this period."
        />

        {/*
          The Pareto. Counted across defects rather than pieces, which is why these can sum
          above the reject total — one piece with a short shot and flash is two faults, and both
          are worth fixing. Said on the screen so nobody reconciles the two and finds a bug that
          is not one.
        */}
        <Section title="Which defect">
          <p className="-mt-1 mb-3 text-sm text-steel-400">
            Counted across faults, so a piece with two problems is two — both are worth fixing
          </p>
          {data.byDefect?.length ? (
            <ul className="divide-y divide-line/[0.04]">
              {data.byDefect.map((row, index) => {
                const worst = data.byDefect[0].count || 0;
                return (
                  <li key={row.key} className="py-2.5">
                    <div className="flex items-baseline justify-between gap-4">
                      <p className="text-sm font-semibold text-steel-100">
                        <span className="mr-2 text-xs text-steel-500">{index + 1}</span>
                        {row.label}
                      </p>
                      <p className="text-sm font-bold tabular-nums text-steel-100">
                        {formatNumber(row.count)}
                      </p>
                    </div>
                    <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-line/[0.08]">
                      <div
                        className="h-full rounded-full bg-flame-500"
                        style={{ width: `${worst ? Math.max(2, Math.round((row.count / worst) * 100)) : 0}%` }}
                      />
                    </div>
                    <p className="mt-1 text-xs text-steel-500">
                      {row.group} · found on {row.inspections}{' '}
                      {row.inspections === 1 ? 'inspection' : 'inspections'}
                    </p>
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="text-sm text-steel-500">No defects were recorded in this period.</p>
          )}
        </Section>

        <Tally
          title="Which resin"
          hint="What separates a material problem from a tool problem"
          rows={data.byMaterial}
          empty="No inspection in this period names a material."
        />

        <Tally
          title="Where it was caught"
          hint="Caught on the press is cheap; caught before it ships is not"
          rows={data.byStage}
          empty="Nothing has been inspected in this period."
          labelOf={(row) => inspectionStageLabel(row.key)}
        />
      </div>

      {/*
        The overrides, last and in full. The plant chose a soft gate over a hard refusal, which
        is the better choice — it lets a real deadline through and leaves a trail — but only
        while somebody can see how often the warning is waved through and by whom. Without this
        list the warning is a dialog people learn to dismiss and quality is decorative.
      */}
      <Section title="Sent despite the warning">
        <p className="-mt-1 mb-3 text-sm text-steel-400">
          The dispatch gate warns rather than refuses. This is what makes that honest.
        </p>
        {waived.length ? (
          <ul className="space-y-3">
            {waived.map((row) => (
              <li key={row._id} className="rounded-lg border border-warn-500/30 bg-warn-500/[0.04] p-3">
                <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                  <p className="text-sm font-bold text-steel-100">
                    <Link to={row.link} className="hover:text-accent">{row.number}</Link>
                    {row.customer?.name ? ` · ${row.customer.name}` : ''}
                  </p>
                  <p className="text-xs text-steel-400">
                    {row.by || 'Somebody'} · {formatDate(row.at)}
                  </p>
                </div>
                <p className="mt-1 text-sm font-semibold text-warn-400">{row.concern}</p>
                <p className="mt-1 text-sm text-steel-200">{row.reason}</p>
                <p className="mt-1.5 text-xs text-steel-500">
                  {formatNumber(row.dispatchQty)} pcs
                  {row.order?.number ? ` · ${row.order.number}` : ''}
                </p>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-steel-500">
            Nothing was sent past the warning in this period.
          </p>
        )}
      </Section>

      <p className="mt-5 text-xs text-steel-500">
        The cost is the rejected quantity at the order line's own rate — what the pieces would
        have sold for. An order of magnitude to argue about, not an accounting figure.
      </p>
    </div>
  );
}
