import { useCallback } from 'react';
import { Link } from 'react-router-dom';
import { samples as samplesApi } from '../api/endpoints.js';
import { useRecord } from '../hooks/useRecords.js';
import { Badge, ErrorState, PageHeader, Section, Spinner } from '../components/ui.jsx';
import { formatNumber } from '../utils/format.js';
import { SAMPLE_PURPOSES, optionLabel, sampleStageLabel } from '../utils/pipeline.js';

/**
 * The sampling dashboard [BLUEPRINT §22, docs/DASHBOARDS.md §4].
 *
 * Built around two rules from that spec. **Ageing beats counts**: "12 pending" hides the one
 * that has sat for three weeks, so the queues are ranked worst-first with an age on every
 * row. And **rework rate is this team's quality signal** — a high approval rate next to a
 * high modification rate means samples are going out before they are right, which neither
 * number shows on its own.
 */

function Tile({ label, value, hint, tone = 'neutral', to }) {
  const tones = {
    neutral: 'text-steel-50',
    warn: 'text-warn-400',
    danger: 'text-danger-400',
  };

  const body = (
    <>
      <p className="eyebrow">{label}</p>
      <p className={`stat-value mt-1.5 ${tones[tone]}`}>{value}</p>
      {hint && <p className="mt-1 text-xs text-steel-500">{hint}</p>}
    </>
  );

  return to ? (
    <Link to={to} className="card-interactive block px-4 py-3.5">{body}</Link>
  ) : (
    <div className="card px-4 py-3.5">{body}</div>
  );
}

/** A count breakdown as proportional bars, which read faster than a list of numbers. */
function Breakdown({ rows, labelOf = (row) => row.label }) {
  if (!rows?.length) return <p className="text-sm text-steel-500">Nothing yet.</p>;

  const highest = Math.max(...rows.map((row) => row.count));

  return (
    <ul className="space-y-2.5">
      {rows.map((row) => (
        <li key={row.label}>
          <div className="flex items-baseline justify-between gap-3 text-[0.8125rem]">
            <span className="truncate text-steel-200">{labelOf(row)}</span>
            <span className="tabular-nums font-semibold text-steel-100">{row.count}</span>
          </div>
          <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-line/[0.06]">
            <div
              className="h-full rounded-full bg-flame-500"
              style={{ width: `${Math.round((row.count / highest) * 100)}%` }}
            />
          </div>
        </li>
      ))}
    </ul>
  );
}

/** Worst first, with how long it has been that way. */
function AgeTable({ rows, empty, ageLabel = 'Waiting' }) {
  if (!rows?.length) return <p className="py-4 text-center text-sm text-steel-500">{empty}</p>;

  return (
    <div className="overflow-x-auto">
      <table className="min-w-full text-sm">
        <thead className="table-head">
          <tr>
            <th className="px-3 py-2.5">Request</th>
            <th className="px-3 py-2.5">Customer</th>
            <th className="px-3 py-2.5">Stage</th>
            <th className="px-3 py-2.5 text-right">{ageLabel}</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-line/[0.04]">
          {rows.map((row) => (
            <tr key={row._id} className="row-hover">
              <td className="whitespace-nowrap px-3 py-3">
                <Link to={`/samples/${row._id}`} className="font-semibold text-steel-100 hover:text-accent">
                  {row.number}
                </Link>
                {row.escalationLevel > 0 && (
                  <span className="ml-2">
                    <Badge tone="danger">{row.escalationLevel === 2 ? 'Manager' : 'Escalated'}</Badge>
                  </span>
                )}
                {row.modelNumber && <p className="text-xs text-steel-500">{row.modelNumber}</p>}
              </td>
              <td className="px-3 py-3 text-steel-300">
                {row.customer || <span className="text-xs text-steel-500">Internal</span>}
              </td>
              <td className="whitespace-nowrap px-3 py-3">
                <Badge status={row.status}>{sampleStageLabel(row.status)}</Badge>
              </td>
              <td
                className={`whitespace-nowrap px-3 py-3 text-right tabular-nums ${
                  row.ageDays >= 7 ? 'font-semibold text-danger-400' : 'text-steel-300'
                }`}
              >
                {row.ageDays} {row.ageDays === 1 ? 'day' : 'days'}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function SamplingDashboard() {
  const fetch = useCallback(() => samplesApi.dashboard(), []);
  const { data, loading, error, reload } = useRecord(fetch, 'sampling');

  if (loading) return <Spinner label="Loading the sampling dashboard" />;
  if (error) return <ErrorState error={error} onRetry={reload} />;
  if (!data) return null;

  const { tiles, turnaround, quality, queueByStatus, byPurpose, byRequester, oldestOpen, awaitingFeedback } = data;

  // An average of nothing is not zero days, and saying "0" would read as instant.
  const days = (value) => (value === null ? '—' : `${value}d`);

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader
        title="Sampling dashboard"
        subtitle="Where the bench is, what is late, and whether samples are going out right"
      />

      <div className="mb-5 grid gap-2 sm:grid-cols-3 lg:grid-cols-6">
        <Tile label="Open" value={tiles.openTotal} to="/samples" />
        <Tile label="Raised this week" value={tiles.raisedThisWeek} />
        <Tile
          label="Due today"
          value={tiles.dueToday}
          tone={tiles.dueToday ? 'warn' : 'neutral'}
          to="/samples"
        />
        <Tile
          label="Overdue"
          value={tiles.overdue}
          tone={tiles.overdue ? 'danger' : 'neutral'}
          to="/samples"
        />
        <Tile
          label="Escalated"
          value={tiles.escalated}
          hint="§25 has been raised"
          tone={tiles.escalated ? 'danger' : 'neutral'}
        />
        <Tile label="Unassigned" value={tiles.unassigned} hint="Nobody has picked these up" />
      </div>

      <div className="grid gap-5 lg:grid-cols-3">
        <div className="space-y-5 lg:col-span-2">
          <Section title="Oldest open requests">
            <AgeTable rows={oldestOpen} empty="Nothing is sitting on the bench." ageLabel="On the bench" />
          </Section>

          <Section title="Awaiting customer feedback">
            <p className="mb-3 text-xs leading-relaxed text-steel-500">
              The commonest silent stall: it reached them, and then nothing.
            </p>
            <AgeTable rows={awaitingFeedback} empty="Nobody is sitting on an answer." ageLabel="Since sent" />
          </Section>
        </div>

        <div className="space-y-5">
          <Section title="Turnaround">
            <dl className="space-y-4">
              <div>
                <dt className="text-[0.6875rem] font-bold uppercase tracking-[0.08em] text-steel-500">
                  Request to ready
                </dt>
                <dd className="stat-value mt-1">{days(turnaround.requestToReadyDays)}</dd>
              </div>
              <div>
                <dt className="text-[0.6875rem] font-bold uppercase tracking-[0.08em] text-steel-500">
                  Ready to dispatched
                </dt>
                <dd className="stat-value mt-1">{days(turnaround.readyToDispatchDays)}</dd>
              </div>
            </dl>
            <p className="mt-4 text-xs leading-relaxed text-steel-500">
              Split because the halves have different owners: getting there is the bench&rsquo;s,
              getting it out of the door is arranging a courier.
            </p>
          </Section>

          <Section title="Quality">
            <div className="flex items-baseline gap-3">
              <p className={`stat-value ${quality.reworkRatePercent >= 30 ? '!text-danger-400' : ''}`}>
                {quality.reworkRatePercent === null ? '—' : `${quality.reworkRatePercent}%`}
              </p>
              <p className="text-[0.8125rem] text-steel-400">needed another attempt</p>
            </div>
            <p className="mt-1 text-xs text-steel-500">
              {formatNumber(quality.answered)} answered · {quality.approved} approved ·{' '}
              {quality.modificationRequired} modified · {quality.rejected} rejected
            </p>
            <p className="mt-3 text-xs leading-relaxed text-steel-500">
              A high approval rate next to a high rework rate means samples are going out
              before they are right.
            </p>
          </Section>

          <Section title="Queue by stage">
            <Breakdown rows={queueByStatus} labelOf={(row) => sampleStageLabel(row.label)} />
          </Section>

          <Section title="By purpose">
            <Breakdown rows={byPurpose} labelOf={(row) => optionLabel(SAMPLE_PURPOSES, row.label)} />
          </Section>

          {byRequester.length > 0 && (
            <Section title="Open, by who asked">
              <Breakdown rows={byRequester} />
            </Section>
          )}
        </div>
      </div>
    </div>
  );
}
