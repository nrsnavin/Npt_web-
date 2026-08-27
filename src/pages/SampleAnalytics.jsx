import { useCallback, useState } from 'react';
import { samples as samplesApi } from '../api/endpoints.js';
import { useRecord } from '../hooks/useRecords.js';
import { ErrorState, PageHeader, Section, Spinner } from '../components/ui.jsx';
import {
  HANGER_CATEGORIES, HOOK_TYPES, MATERIALS, SAMPLE_PURPOSES, optionLabel, sampleStageLabel,
} from '../utils/pipeline.js';

/**
 * How long fulfilment takes, and what drives the difference.
 *
 * Separate from the dashboard on purpose: that one answers what is late right now, this one
 * answers how long we take and why. Two things the page never does — show a mean without its
 * tail, and show a segment without saying how many samples it is drawn from. A figure over
 * three samples is noise, and presenting it beside one over forty is how a report like this
 * starts costing decisions rather than informing them.
 */

const PERIODS = [
  { value: 1, label: 'This month' },
  { value: 3, label: '3 months' },
  { value: 6, label: '6 months' },
  { value: 12, label: '12 months' },
];

/** An em dash rather than 0: an average of nothing is not "no days". */
const days = (value) => (value === null || value === undefined ? '—' : `${value}d`);
const percent = (value) => (value === null || value === undefined ? '—' : `${value}%`);

function Headline({ label, value, hint, tone = 'neutral' }) {
  const tones = { neutral: 'text-steel-50', warn: 'text-warn-400', danger: 'text-danger-400' };

  return (
    <div className="card px-4 py-3.5">
      <p className="eyebrow">{label}</p>
      <p className={`stat-value mt-1.5 ${tones[tone]}`}>{value}</p>
      {hint && <p className="mt-1 text-xs text-steel-500">{hint}</p>}
    </div>
  );
}

/**
 * A breakdown row per segment.
 *
 * The bar is scaled to the slowest segment, so the eye compares durations rather than
 * counts — the question here is "what takes longer", not "what do we make most of".
 */
function SegmentTable({ rows, labelOf = (row) => row.label, empty }) {
  if (!rows?.length) return <p className="py-4 text-center text-sm text-steel-500">{empty}</p>;

  const slowest = Math.max(...rows.map((row) => row.averageDays || 0), 1);

  return (
    <div className="overflow-x-auto">
      <table className="min-w-full text-sm">
        <thead className="table-head">
          <tr>
            <th className="px-3 py-2.5">Segment</th>
            <th className="px-3 py-2.5 text-right">n</th>
            <th className="px-3 py-2.5 text-right">Average</th>
            <th className="px-3 py-2.5 text-right">Median</th>
            <th className="px-3 py-2.5 text-right">Worst</th>
            <th className="px-3 py-2.5 text-right">On time</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-line/[0.04]">
          {rows.map((row) => (
            <tr key={row.label} className={`row-hover ${row.reliable ? '' : 'opacity-60'}`}>
              <td className="px-3 py-3">
                <p className="font-medium text-steel-100">{labelOf(row)}</p>
                <div className="mt-1.5 h-1.5 w-32 overflow-hidden rounded-full bg-line/[0.06]">
                  <div
                    className="h-full rounded-full bg-flame-500"
                    style={{ width: `${Math.round(((row.averageDays || 0) / slowest) * 100)}%` }}
                  />
                </div>
              </td>
              <td className="px-3 py-3 text-right tabular-nums text-steel-300">
                {row.fulfilled}
                {/* Said plainly rather than hidden, so a thin row is judged as thin. */}
                {!row.reliable && (
                  <span className="ml-1 text-[0.625rem] uppercase text-steel-500" title="Too few to read into">
                    thin
                  </span>
                )}
              </td>
              <td className="px-3 py-3 text-right tabular-nums font-semibold text-steel-100">
                {days(row.averageDays)}
              </td>
              <td className="px-3 py-3 text-right tabular-nums text-steel-300">{days(row.medianDays)}</td>
              <td
                className={`px-3 py-3 text-right tabular-nums ${
                  row.worstDays && row.averageDays && row.worstDays > row.averageDays * 2
                    ? 'font-semibold text-danger-400'
                    : 'text-steel-300'
                }`}
              >
                {days(row.worstDays)}
              </td>
              <td className="px-3 py-3 text-right tabular-nums text-steel-300">
                {percent(row.onTimePercent)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Average days spent in each stage, longest first. */
function StageList({ rows, muted = false }) {
  if (!rows.length) return null;

  return (
    <ul className="space-y-2.5">
      {rows.map((row) => (
        <li key={row.label} className="flex items-baseline justify-between gap-3 text-[0.8125rem]">
          <span className={`truncate ${muted ? 'text-steel-400' : 'text-steel-200'}`}>
            {sampleStageLabel(row.label)}
          </span>
          <span
            className={`tabular-nums font-semibold ${muted ? 'text-steel-400' : 'text-steel-100'}`}
          >
            {days(row.averageDays)}
          </span>
        </li>
      ))}
    </ul>
  );
}

/** Raised against fulfilled, month by month. Raised above fulfilled means a growing queue. */
function Trend({ months }) {
  if (!months?.length) return null;

  const peak = Math.max(...months.flatMap((month) => [month.raised, month.fulfilled]), 1);

  return (
    <div className="flex items-end gap-1.5 overflow-x-auto pb-1">
      {months.map((month) => (
        <div key={month.month} className="flex min-w-[2.25rem] flex-1 flex-col items-center gap-1.5">
          <div className="flex h-40 w-full items-end justify-center gap-[3px]">
            <div
              className="w-2.5 rounded-t bg-line/20"
              style={{ height: `${Math.max(2, (month.raised / peak) * 100)}%` }}
              title={`${month.raised} raised`}
            />
            <div
              className="w-2.5 rounded-t bg-flame-500"
              style={{ height: `${Math.max(2, (month.fulfilled / peak) * 100)}%` }}
              title={`${month.fulfilled} fulfilled`}
            />
          </div>
          <p className="text-[0.625rem] tabular-nums text-steel-500">{month.month.slice(2)}</p>
          {/* A month with nothing fulfilled has no average, and a column of dashes reads as
              data. Left blank so the eye goes to the months that have one. */}
          <p className="h-4 text-[0.6875rem] tabular-nums font-semibold text-steel-300">
            {month.averageDays == null ? '' : days(month.averageDays)}
          </p>
        </div>
      ))}
    </div>
  );
}

export default function SampleAnalytics() {
  const [months, setMonths] = useState(1);

  const fetch = useCallback((period) => samplesApi.analytics({ months: period }), []);
  const { data, loading, error, reload } = useRecord(fetch, months);

  if (loading) return <Spinner label="Building the analytics" />;
  if (error) return <ErrorState error={error} onRetry={reload} />;
  if (!data) return null;

  const { headline, trend, timeInStage, byPurpose, byPrinting, byHookType, byMaterial, byCategory, byQuantity } = data;

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader
        title="Sample analytics"
        subtitle="How long fulfilment takes, and what makes the difference"
        actions={
          <div role="tablist" aria-label="Period" className="tab-track grid-flow-col">
            {PERIODS.map((option) => (
              <button
                key={option.value}
                type="button"
                role="tab"
                aria-selected={months === option.value}
                onClick={() => setMonths(option.value)}
                className="tab py-1.5"
              >
                {option.label}
              </button>
            ))}
          </div>
        }
      />

      <div className="mb-5 grid gap-2 sm:grid-cols-3 lg:grid-cols-5">
        <Headline
          label="Fulfilled"
          value={headline.fulfilled}
          hint={`${headline.raised} raised in the same period`}
        />
        <Headline
          label="Average"
          value={days(headline.averageDays)}
          hint="Request to ready"
        />
        <Headline label="Median" value={days(headline.medianDays)} hint="The typical sample" />
        <Headline
          label="Worst"
          value={days(headline.worstDays)}
          hint={`p90 ${days(headline.p90Days)}`}
          tone={
            headline.worstDays && headline.averageDays && headline.worstDays > headline.averageDays * 2
              ? 'danger'
              : 'neutral'
          }
        />
        <Headline
          label="On time"
          value={percent(headline.onTimePercent)}
          hint={headline.onTimeOf ? `of ${headline.onTimeOf} with a date` : 'no dates set'}
          tone={headline.onTimePercent !== null && headline.onTimePercent < 80 ? 'warn' : 'neutral'}
        />
      </div>

      <div className="mb-5 grid gap-5 lg:grid-cols-3">
        <Section title="Raised against fulfilled" className="lg:col-span-2">
          <p className="mb-3 text-xs leading-relaxed text-steel-500">
            The last {data.trendMonths} months, whichever period is selected above &mdash; the
            question a trend answers is whether this month is better than the ones before it.
            Grey is raised, orange is fulfilled, and the figure below each month is that
            month&rsquo;s average turnaround. Raised standing above fulfilled month after month
            is a queue growing, whatever the averages say.
          </p>
          <Trend months={trend} />
        </Section>

        <Section title="Where the days go">
          <p className="mb-3 text-xs leading-relaxed text-steel-500">
            Average time spent in each stage. Total duration says a sample took nine days;
            this says which six of them to do something about.
          </p>
          {timeInStage.length ? (
            <>
              <StageList rows={timeInStage.filter((row) => row.beforeReady)} />
              {/* Kept apart from the bench's own stages: the headline turnaround stops at
                  ready, and these days belong to the courier and the customer. */}
              {timeInStage.some((row) => !row.beforeReady) && (
                <>
                  <p className="mb-2 mt-4 border-t border-line/[0.06] pt-3 text-[0.6875rem] uppercase tracking-[0.08em] text-steel-500">
                    After it was ready
                  </p>
                  <StageList rows={timeInStage.filter((row) => !row.beforeReady)} muted />
                </>
              )}
            </>
          ) : (
            <p className="text-sm text-steel-500">Nothing fulfilled in this period.</p>
          )}
        </Section>
      </div>

      <div className="space-y-5">
        <Section title="By what it is for">
          <SegmentTable
            rows={byPurpose}
            labelOf={(row) => optionLabel(SAMPLE_PURPOSES, row.label)}
            empty="Nothing fulfilled in this period."
          />
        </Section>

        <Section title="Printed against plain">
          <p className="mb-3 text-xs leading-relaxed text-steel-500">
            Printing adds artwork and a print run to every sample that carries it.
          </p>
          <SegmentTable
            rows={byPrinting}
            labelOf={(row) => (row.label === 'printed' ? 'With printing' : 'No printing')}
            empty="Nothing fulfilled in this period."
          />
        </Section>

        <Section title="By hook">
          <SegmentTable
            rows={byHookType}
            labelOf={(row) => optionLabel(HOOK_TYPES, row.label)}
            empty="No hook type recorded on the samples in this period."
          />
        </Section>

        <Section title="By material">
          <SegmentTable
            rows={byMaterial}
            labelOf={(row) => optionLabel(MATERIALS, row.label)}
            empty="Nothing fulfilled in this period."
          />
        </Section>

        <Section title="By category">
          <SegmentTable
            rows={byCategory}
            labelOf={(row) => optionLabel(HANGER_CATEGORIES, row.label)}
            empty="Nothing fulfilled in this period."
          />
        </Section>

        <Section title="By how many were asked for">
          <SegmentTable rows={byQuantity} empty="Nothing fulfilled in this period." />
        </Section>
      </div>

      <p className="mt-5 text-xs leading-relaxed text-steel-500">
        Fulfilment is measured from the request to the sample being ready — the span the bench
        controls. A courier holding a parcel is a real delay but not this team&rsquo;s, so it is
        reported separately: to the customer, {days(headline.toCustomerAverageDays)} on average.
        Rows marked <span className="uppercase">thin</span> are drawn from too few samples to
        read into.
      </p>
    </div>
  );
}
