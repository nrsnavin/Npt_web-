import { useCallback } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { leads as leadsApi } from '../api/endpoints.js';
import { useRecord } from '../hooks/useRecords.js';
import { ErrorState, PageHeader, Section, Spinner } from '../components/ui.jsx';
import LeadMap from '../components/LeadMap.jsx';
import Scoreboard from '../components/Scoreboard.jsx';
import { humanise } from '../utils/format.js';

/**
 * The shape of the lead book.
 *
 * Its own page rather than a strip above the list, for the reason the sampling side already
 * splits the two: the list answers "what am I working on", and this answers "what shape is the
 * book in" — different questions, asked at different times, by people who mostly are not the
 * same person. Stacked together they made the list screen something to scroll past, and buried
 * the charts under whichever filter happened to be set.
 *
 * Nothing here is a new figure. Everything is the same arithmetic the list is built from, drawn
 * so it can be read at a glance rather than counted.
 *
 * Three rules the charts keep.
 *
 * **One hue, not a palette.** Every chart compares magnitude within one thing — how many leads
 * at each stage, from each source, in each age band. That is a sequential job, and sequential
 * is one hue, more-is-darker. Handing each stage its own colour would say the stages are
 * *identities* to be told apart, which is not the question anybody has.
 *
 * **The funnel keeps stage order.** Sorted by size it is not a funnel, it is a bar chart that
 * has lost the one thing it was drawing. Everything else is sorted by size, because for those
 * the order carries nothing.
 *
 * **Every count carries its denominator.** A share with no total beside it is the commonest way
 * a dashboard misleads without saying anything false — 100% of two leads is not a track record,
 * and a percentage on its own cannot admit that.
 */

/** Bars scaled to the largest in the set: the eye compares within a chart, never across two. */
function Bars({ rows, total, emptyLabel = 'Nothing yet' }) {
  if (!rows?.length || !rows.some((row) => row.value)) {
    return <p className="py-4 text-center text-sm text-steel-500">{emptyLabel}</p>;
  }

  const largest = Math.max(...rows.map((row) => row.value), 1);

  return (
    <ul className="space-y-2.5">
      {rows.map((row) => {
        const share = total ? Math.round((row.value / total) * 100) : null;

        return (
          <li key={row.label}>
            <div className="flex items-baseline justify-between gap-3">
              <span className="truncate text-[0.8125rem] text-steel-200">{humanise(row.label)}</span>
              {/* The count is the figure; the share is context beside it, never instead. */}
              <span className="shrink-0 text-[0.8125rem] tabular-nums text-steel-100">
                {row.value}
                {share !== null && <span className="ml-1.5 text-[0.6875rem] text-steel-500">{share}%</span>}
              </span>
            </div>
            <div
              className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-line/[0.06]"
              role="img"
              aria-label={`${humanise(row.label)}: ${row.value}`}
            >
              <div
                className={`h-full rounded-full bg-flame-500 ${row.value ? '' : 'opacity-0'}`}
                style={{ width: `${Math.max((row.value / largest) * 100, row.value ? 3 : 0)}%` }}
              />
            </div>
          </li>
        );
      })}
    </ul>
  );
}

/**
 * The funnel, drawn as one.
 *
 * Stage order is the point — each bar is a proportion of the one above it, and the step where
 * the width collapses is the answer somebody came for. Sorting this by size would throw that
 * away for a tidier picture.
 */
function Funnel({ rows, total }) {
  const open = rows.filter((row) => !['converted', 'disqualified'].includes(row.label));
  const closed = rows.filter((row) => ['converted', 'disqualified'].includes(row.label));
  const largest = Math.max(...rows.map((row) => row.value), 1);

  const bar = (row) => {
    /*
     * Status colours only where the thing genuinely is an outcome. Won and lost are states with
     * meaning the reader already knows; the working stages are magnitude, and giving them each
     * a hue would claim they are identities to be told apart.
     */
    const fill =
      row.label === 'converted'
        ? 'bg-success-500'
        : row.label === 'disqualified'
          ? 'bg-steel-500'
          : 'bg-flame-500';

    return (
      <li key={row.label}>
        <div className="flex items-baseline justify-between gap-3">
          <span className="text-[0.8125rem] text-steel-200">{humanise(row.label)}</span>
          <span className="text-[0.8125rem] tabular-nums text-steel-100">
            {row.value}
            {total ? (
              <span className="ml-1.5 text-[0.6875rem] text-steel-500">
                {Math.round((row.value / total) * 100)}%
              </span>
            ) : null}
          </span>
        </div>
        <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-line/[0.06]">
          <div
            className={`h-full rounded-full ${fill}`}
            style={{ width: `${Math.max((row.value / largest) * 100, row.value ? 3 : 0)}%` }}
          />
        </div>
      </li>
    );
  };

  return (
    <div className="space-y-3">
      <ul className="space-y-2.5">{open.map(bar)}</ul>
      <div className="border-t border-line/[0.06] pt-3">
        <p className="mb-2 text-[0.625rem] font-bold uppercase tracking-[0.08em] text-steel-500">Decided</p>
        <ul className="space-y-2.5">{closed.map(bar)}</ul>
      </div>
    </div>
  );
}

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

export default function LeadAnalytics() {
  const navigate = useNavigate();
  const fetch = useCallback(() => leadsApi.overview(), []);
  const { data, error, loading, reload } = useRecord(fetch, 'lead-overview');

  /*
   * A place chosen on the map is a question about the list, so it is answered by going there
   * with the filter in the address. That makes it a link somebody can send to a colleague,
   * which a piece of state inside a chart never is.
   */
  const openPlace = (choice) => {
    if (!choice) return;
    navigate(`/leads?${choice.field}=${encodeURIComponent(choice.value)}`);
  };

  if (loading) return <Spinner />;
  if (error) return <ErrorState error={error} onRetry={reload} />;
  if (!data) return null;

  const quiet = data.untouchedLeads || [];

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader
        title="Lead analytics"
        subtitle="What shape the book is in — where the leads are, how they are moving, and which have quietly stopped."
        actions={
          <Link to="/leads" className="btn-secondary">
            Open the list
          </Link>
        }
      />

      <div className="mb-5 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        <Headline label="Open" value={data.open} hint={`of ${data.total} ever raised`} />
        <Headline
          label="Converted"
          value={data.converted}
          // The denominator, always. A rate alone cannot admit that it is a rate over three.
          hint={
            data.conversionRatePercent === null
              ? 'nothing decided yet'
              : `${data.conversionRatePercent}% of ${data.decided} decided`
          }
        />
        <Headline
          label="Gone quiet"
          value={quiet.length}
          hint="Open, and untouched for a fortnight"
          tone={quiet.length ? 'danger' : 'neutral'}
        />
        <Headline
          label="Never contacted"
          value={quiet.filter((row) => !row.contacts).length}
          hint="Raised and never called"
          tone={quiet.some((row) => !row.contacts) ? 'warn' : 'neutral'}
        />
      </div>

      {/*
        * The map first, and given the room. It is the only thing on the page that answers a
        * question the list cannot answer at all — everything below is the list, counted.
        */}
      <Section title="Where they are" className="mb-5">
        <LeadMap geography={data.geography} onSelect={openPlace} />
      </Section>

      <div className="mb-5 grid gap-4 lg:grid-cols-3">
        <Section title="The funnel">
          <Funnel rows={data.byStage} total={data.total} />
        </Section>

        <Section title="How long the open ones have sat">
          {/* Ageing is the distribution nobody has: "40 open" is a number, and "nine of them
              older than three months" is the problem inside it. */}
          <Bars rows={data.ageing} total={data.open} emptyLabel="Nothing open." />
        </Section>

        <Section title="Where they come from">
          <Bars rows={data.bySource} total={data.total} emptyLabel="No source recorded yet." />
        </Section>
      </div>

      {/*
        * The anomalies. A status field says "contacted" forever, so this is the only thing on
        * the page that can say a lead is only nominally alive.
        */}
      {Boolean(quiet.length) && (
        <Section title={`Gone quiet (${quiet.length})`} className="mb-5">
          <p className="mb-3 text-xs leading-relaxed text-steel-500">
            Open leads nobody has touched in a fortnight. Their status still reads as it did the
            day somebody last opened them, which is exactly why this list has to exist.
          </p>
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="table-head">
                <tr>
                  <th className="px-3 py-2.5">Lead</th>
                  <th className="px-3 py-2.5">Stage</th>
                  <th className="px-3 py-2.5">Owner</th>
                  <th className="px-3 py-2.5">Why</th>
                  <th className="px-3 py-2.5 text-right">Idle</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line/[0.04]">
                {quiet.slice(0, 8).map((row) => (
                  <tr key={row._id} className="row-hover">
                    <td className="px-3 py-3">
                      <Link to={row.link} className="font-semibold text-steel-100 hover:text-accent">
                        {row.company}
                      </Link>
                      <p className="text-xs text-steel-400">{row.number}</p>
                    </td>
                    <td className="px-3 py-3 text-steel-300">{humanise(row.status)}</td>
                    <td className="px-3 py-3 text-steel-400">{row.owner || 'Unassigned'}</td>
                    <td className="px-3 py-3 text-steel-300">{row.reason}</td>
                    <td className="px-3 py-3 text-right font-semibold tabular-nums text-danger-400">
                      {row.idleDays}d
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {quiet.length > 8 && (
            <p className="mt-3 text-xs text-steel-500">Showing the 8 quietest of {quiet.length}.</p>
          )}
        </Section>
      )}

      <Scoreboard />
    </div>
  );
}
