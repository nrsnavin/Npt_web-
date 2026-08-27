import { useCallback } from 'react';
import { Link } from 'react-router-dom';
import { leads as leadsApi } from '../api/endpoints.js';
import { useRecord } from '../hooks/useRecords.js';
import { Section } from './ui.jsx';
import LeadMap from './LeadMap.jsx';
import { humanise } from '../utils/format.js';

/**
 * The shape of the lead book, read at a glance.
 *
 * Deliberately built from the chart language this app already speaks — horizontal bars in one
 * hue, scaled to the largest value, labels beside the marks. A second visual vocabulary on a
 * neighbouring screen is its own kind of bug: the reader has to learn which of two things a
 * bar means before they can read either.
 *
 * Three rules the charts here keep.
 *
 * **One hue, not a palette.** Every chart on this screen compares magnitude within one thing —
 * how many leads at each stage, from each source, in each age band. That is a sequential job,
 * and sequential is one hue, more-is-darker. Handing each stage its own colour would say the
 * stages are *identities* to be told apart, which is not the question anybody has.
 *
 * **The funnel keeps stage order.** Sorted by size it is not a funnel, it is a bar chart that
 * has lost the one thing it was drawing. Everything else here is sorted by size, because for
 * those the order carries nothing.
 *
 * **Every count carries its denominator.** A share with no total beside it is the commonest
 * way a dashboard misleads without saying anything false — 100% of two leads is not a track
 * record, and a percentage on its own cannot admit that.
 */

/** Bars scaled to the largest in the set: the eye compares within a chart, never across two. */
function Bars({ rows, total, tone = 'flame', emptyLabel = 'Nothing yet' }) {
  if (!rows?.length || !rows.some((row) => row.value)) {
    return <p className="py-4 text-center text-sm text-steel-500">{emptyLabel}</p>;
  }

  const largest = Math.max(...rows.map((row) => row.value), 1);
  const fill = tone === 'danger' ? 'bg-danger-500' : 'bg-flame-500';

  return (
    <ul className="space-y-2">
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
              className="mt-1 h-1.5 overflow-hidden rounded-full bg-line/[0.06]"
              role="img"
              aria-label={`${humanise(row.label)}: ${row.value}`}
            >
              <div
                // Rounded at the data end, anchored to the baseline.
                className={`h-full rounded-full ${fill} ${row.value ? '' : 'opacity-0'}`}
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
     * Status colours only where the thing genuinely is an outcome. Won and lost are states
     * with meaning the reader already knows; the working stages are magnitude, and giving
     * them each a hue would claim they are identities to be told apart.
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
            {total ? <span className="ml-1.5 text-[0.6875rem] text-steel-500">{Math.round((row.value / total) * 100)}%</span> : null}
          </span>
        </div>
        <div className="mt-1 h-2 overflow-hidden rounded-full bg-line/[0.06]">
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
      <ul className="space-y-2">{open.map(bar)}</ul>
      <div className="border-t border-line/[0.06] pt-3">
        <p className="mb-2 text-[0.625rem] font-bold uppercase tracking-[0.08em] text-steel-500">
          Decided
        </p>
        <ul className="space-y-2">{closed.map(bar)}</ul>
      </div>
    </div>
  );
}

function Tile({ label, value, hint, tone = 'neutral' }) {
  const tones = { neutral: 'text-steel-50', warn: 'text-warn-400', danger: 'text-danger-400' };

  return (
    <div className="card px-4 py-3">
      <p className="eyebrow">{label}</p>
      <p className={`stat-value mt-1 ${tones[tone]}`}>{value}</p>
      {hint && <p className="mt-0.5 text-xs text-steel-500">{hint}</p>}
    </div>
  );
}

export default function LeadAnalytics({ place = null, onPlaceChange }) {
  const fetch = useCallback(() => leadsApi.overview(), []);
  const { data, error } = useRecord(fetch, 'lead-overview');

  // Analytics that cannot load must not take the list screen down with them.
  if (error || !data) return null;

  const quiet = data.untouchedLeads || [];

  return (
    <div className="mb-5 space-y-4">
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        <Tile label="Open" value={data.open} hint={`of ${data.total} ever raised`} />
        <Tile
          label="Converted"
          value={data.converted}
          // The denominator, always. A rate alone cannot admit that it is a rate over three.
          hint={
            data.conversionRatePercent === null
              ? 'nothing decided yet'
              : `${data.conversionRatePercent}% of ${data.decided} decided`
          }
        />
        <Tile
          label="Gone quiet"
          value={quiet.length}
          hint="Open, and untouched for a fortnight"
          tone={quiet.length ? 'danger' : 'neutral'}
        />
        <Tile
          label="Never contacted"
          value={quiet.filter((row) => !row.contacts).length}
          hint="Raised and never called"
          tone={quiet.some((row) => !row.contacts) ? 'warn' : 'neutral'}
        />
      </div>

      {/*
        * The anomalies first when there are any. A status field says "contacted" forever, so
        * this is the only thing on the screen that can say a lead is only nominally alive.
        */}
      {Boolean(quiet.length) && (
        <Section title={`Gone quiet (${quiet.length})`}>
          <p className="mb-3 text-xs leading-relaxed text-steel-500">
            Open leads nobody has touched in a fortnight. Their status still reads as it did
            the day somebody last opened them, which is exactly why this list has to exist.
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
                    <td className="px-3 py-3 text-right tabular-nums font-semibold text-danger-400">
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

      <div className="grid gap-4 lg:grid-cols-3">
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
        * Where they are, as a map rather than a ranking. The sorted list this replaced answered
        * one question — which town has the most — and hid the ones somebody came for: whether
        * this is one town with outliers or four states, and whether a whole region has gone
        * quiet. The values live beside the map, because nobody reads eleven off a circle.
        */}
      <Section title="Where they are">
        <LeadMap geography={data.geography} selected={place} onSelect={onPlaceChange} />
      </Section>
    </div>
  );
}
