import { useCallback } from 'react';
import { Link } from 'react-router-dom';
import { dashboards } from '../api/endpoints.js';
import { useRecord } from '../hooks/useRecords.js';
import { Badge, ErrorState, PageHeader, Section, Spinner } from '../components/ui.jsx';
import TodoBoard from '../components/TodoBoard.jsx';
import { formatCompactCurrency, formatDate } from '../utils/format.js';
import { LOST_REASONS, SOURCES, optionLabel, sampleStageLabel, stageLabel } from '../utils/pipeline.js';

/**
 * Marketing's own day and its own numbers [§21].
 *
 * Two things the dashboards guide insists on, and both change what this looks like.
 *
 * **Action required today comes before any analysis.** A dashboard that opens with a
 * conversion chart is one you read on a Friday; this one opens with the calls to make.
 *
 * **Ageing beats counts, and every figure opens.** "12 pending" hides the one that has sat
 * three weeks, so anything with a clock is ranked worst-first with its age, and every row is
 * a link — a number nobody can open is a number nobody trusts.
 *
 * The rows §21 asks for span every module. These are the ones the built modules can answer;
 * pricing, quotations, orders and payments join as they land.
 */

const Tile = ({ label, value, hint, tone = 'neutral', to }) => {
  const tones = {
    neutral: 'text-steel-50',
    warn: 'text-warn-400',
    danger: 'text-danger-400',
    success: 'text-success-400',
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
};

/** A worst-first list. The empty state is a result, not a gap — say so plainly. */
function Ranked({ title, blurb, rows, count, empty, render }) {
  return (
    <Section title={count ? `${title} (${count})` : title}>
      {blurb && <p className="mb-3 text-xs leading-relaxed text-steel-500">{blurb}</p>}
      {rows?.length ? (
        <ul className="divide-y divide-line/[0.04]">{rows.map(render)}</ul>
      ) : (
        <p className="py-5 text-center text-sm text-steel-500">{empty}</p>
      )}
      {count > (rows?.length || 0) && (
        <p className="mt-2 text-center text-[0.6875rem] text-steel-500">
          Showing the {rows.length} worst of {count}.
        </p>
      )}
    </Section>
  );
}

/** Counts as a proportion, so composition reads at a glance rather than by arithmetic. */
function Breakdown({ rows, labelOf = (row) => row.label, empty }) {
  if (!rows?.length) return <p className="py-4 text-center text-sm text-steel-500">{empty}</p>;

  const peak = Math.max(...rows.map((row) => row.count), 1);

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
              style={{ width: `${Math.round((row.count / peak) * 100)}%` }}
            />
          </div>
        </li>
      ))}
    </ul>
  );
}

export default function MarketingDashboard() {
  const fetch = useCallback(() => dashboards.marketing(), []);
  const { data, loading, error, reload } = useRecord(fetch, 'marketing');

  if (loading) return <Spinner label="Gathering your day" />;
  if (error) return <ErrorState error={error} onRetry={reload} />;
  if (!data) return null;

  const { today, performance, dormantCustomers } = data;

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader
        title="Marketing dashboard"
        subtitle="What needs doing today, then how the month is going"
      />

      {/*
        * The tasks first — including every one the plant raised itself. They used to live
        * behind a dock icon in the corner, which meant the queue the morning should be planned
        * from had to be opened to be read, and mostly was not.
        */}
      <div className="mb-5">
        <TodoBoard />
      </div>

      {/* §37: action required today, before any analysis. */}
      <div className="mb-5 grid gap-2 sm:grid-cols-3 lg:grid-cols-5">
        <Tile
          label="Follow-ups overdue"
          value={today.overdueFollowUps.count}
          hint="Past their date"
          tone={today.overdueFollowUps.count ? 'danger' : 'neutral'}
          to="/enquiries"
        />
        <Tile
          label="Due today"
          value={today.dueToday.count}
          hint="Today's call list"
          tone={today.dueToday.count ? 'warn' : 'neutral'}
          to="/enquiries"
        />
        <Tile
          label="Samples overdue"
          value={today.samplesOverdue.count}
          hint="Still on the bench"
          tone={today.samplesOverdue.count ? 'danger' : 'neutral'}
          to="/samples"
        />
        <Tile
          label="Awaiting the buyer"
          value={today.awaitingFeedback.count}
          hint="Sample is with them"
          tone={today.awaitingFeedback.count ? 'warn' : 'neutral'}
          to="/samples"
        />
        <Tile
          label="No next action"
          value={today.noNextAction.count}
          hint="Against the rule"
          tone={today.noNextAction.count ? 'danger' : 'success'}
          to="/enquiries"
        />
      </div>

      <div className="mb-5 grid gap-5 lg:grid-cols-2">
        <Ranked
          title="Follow-ups overdue"
          blurb="Oldest first. These are the calls that should have happened already."
          rows={today.overdueFollowUps.rows}
          count={today.overdueFollowUps.count}
          empty="Nothing overdue. Every open enquiry is inside its date."
          render={(row) => (
            <li key={row._id} className="flex items-baseline justify-between gap-3 py-2.5">
              <div className="min-w-0">
                <Link to={`/enquiries/${row._id}`} className="text-sm font-semibold text-steel-100 hover:text-accent">
                  {row.number}
                </Link>
                <p className="truncate text-xs text-steel-400">
                  {[row.customer, row.nextAction].filter(Boolean).join(' · ')}
                </p>
              </div>
              <span className="shrink-0 text-xs font-semibold tabular-nums text-danger-400">
                {row.overdueDays}d late
              </span>
            </li>
          )}
        />

        <Ranked
          title="Awaiting the buyer's answer"
          blurb="The commonest silent stall: it reached them, and then nothing."
          rows={today.awaitingFeedback.rows}
          count={today.awaitingFeedback.count}
          empty="Nothing sitting with a customer."
          render={(row) => (
            <li key={row._id} className="flex items-baseline justify-between gap-3 py-2.5">
              <div className="min-w-0">
                <Link to={`/samples/${row._id}`} className="text-sm font-semibold text-steel-100 hover:text-accent">
                  {row.number}
                </Link>
                <p className="truncate text-xs text-steel-400">
                  {[row.customer, row.modelNumber].filter(Boolean).join(' · ')}
                </p>
              </div>
              <div className="shrink-0 text-right">
                <Badge status={row.status}>{sampleStageLabel(row.status)}</Badge>
                <p className="mt-0.5 text-xs tabular-nums text-steel-500">{row.ageDays}d</p>
              </div>
            </li>
          )}
        />

        {today.noNextAction.count > 0 && (
          <Ranked
            title="Open with no next action"
            blurb="The blueprint forbids this state — an enquiry with no next step is the one that goes quiet."
            rows={today.noNextAction.rows}
            count={today.noNextAction.count}
            empty=""
            render={(row) => (
              <li key={row._id} className="flex items-baseline justify-between gap-3 py-2.5">
                <Link to={`/enquiries/${row._id}`} className="text-sm font-semibold text-steel-100 hover:text-accent">
                  {row.number}
                </Link>
                <span className="text-xs text-steel-400">{row.customer}</span>
              </li>
            )}
          />
        )}

        <Ranked
          title="Samples overdue"
          blurb="Past their required date and still on the bench."
          rows={today.samplesOverdue.rows}
          count={today.samplesOverdue.count}
          empty="The bench is inside its dates."
          render={(row) => (
            <li key={row._id} className="flex items-baseline justify-between gap-3 py-2.5">
              <div className="min-w-0">
                <Link to={`/samples/${row._id}`} className="text-sm font-semibold text-steel-100 hover:text-accent">
                  {row.number}
                </Link>
                <p className="truncate text-xs text-steel-400">
                  {[row.customer, row.modelNumber].filter(Boolean).join(' · ')}
                </p>
              </div>
              <span className="shrink-0 text-xs font-semibold tabular-nums text-danger-400">
                {row.lateDays}d late
              </span>
            </li>
          )}
        />
      </div>

      {/* Then the analysis. */}
      <div className="mb-5 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        <Tile
          label="Open enquiries"
          value={performance.openEnquiries.count}
          hint={formatCompactCurrency(performance.openEnquiries.value)}
        />
        <Tile
          label="Raised this month"
          value={performance.raisedThisMonth.count}
          hint={formatCompactCurrency(performance.raisedThisMonth.value)}
        />
        <Tile
          label="Won"
          value={performance.won.count}
          hint={formatCompactCurrency(performance.won.value)}
          tone="success"
        />
        <Tile
          label="Win rate"
          value={performance.winRatePercent === null ? '—' : `${performance.winRatePercent}%`}
          hint={`${performance.lost.count} lost · ${formatCompactCurrency(performance.lost.value)}`}
          tone={performance.winRatePercent !== null && performance.winRatePercent < 40 ? 'warn' : 'neutral'}
        />
      </div>

      <div className="grid gap-5 lg:grid-cols-3">
        <Section title="Open by stage">
          <Breakdown
            rows={performance.byStage}
            labelOf={(row) => stageLabel(row.label)}
            empty="Nothing open."
          />
        </Section>

        <Section title="Where enquiries come from">
          <Breakdown
            rows={performance.bySource}
            labelOf={(row) => optionLabel(SOURCES, row.label)}
            empty="No enquiries yet."
          />
        </Section>

        <Section title="Why they were lost">
          <Breakdown
            rows={performance.lostReasons}
            labelOf={(row) => optionLabel(LOST_REASONS, row.label)}
            empty="Nothing lost yet."
          />
        </Section>
      </div>

      <Section title={`Customers gone quiet (${dormantCustomers.count})`} className="mt-5">
        <p className="mb-3 text-xs leading-relaxed text-steel-500">
          No enquiry in {dormantCustomers.days} days. A customer who stops asking has usually
          started asking somebody else.
        </p>
        {dormantCustomers.rows.length ? (
          <ul className="divide-y divide-line/[0.04]">
            {dormantCustomers.rows.map((row) => (
              <li key={row._id} className="flex items-baseline justify-between gap-3 py-2.5">
                <Link to={`/customers/${row._id}`} className="text-sm font-semibold text-steel-100 hover:text-accent">
                  {row.name}
                </Link>
                <span className="text-xs text-steel-500">
                  {row.lastEnquiryAt ? `Last: ${formatDate(row.lastEnquiryAt)}` : 'Never enquired'}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="py-5 text-center text-sm text-steel-500">Everyone has been in touch.</p>
        )}
      </Section>
    </div>
  );
}
