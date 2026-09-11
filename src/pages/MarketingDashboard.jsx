import { useCallback } from 'react';
import { Link } from 'react-router-dom';
import { dashboards } from '../api/endpoints.js';
import { useRecord } from '../hooks/useRecords.js';
import { Badge, ErrorState, PageHeader, Section, Spinner } from '../components/ui.jsx';
import TodoBoard from '../components/TodoBoard.jsx';
import EscalationFeed from '../components/EscalationFeed.jsx';
import { formatCompactCurrency, formatDate, humanise } from '../utils/format.js';
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
        <p className="mt-2 text-center text-xs text-steel-500">
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
          <div className="flex items-baseline justify-between gap-3 text-xs">
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
  /* Absent on a server that has not been redeployed yet, so the screen must not assume it. */
  const concerns = data.concernsRaised || { count: 0, rows: [] };

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

      {/*
        Orders the plant or the yard has stopped, on the screen of the person who has to ring the
        buyer about them. Scoped to their own customers by the same rule as everything else here
        — an escalation carries the order number and the customer's name, and §29 does not stop
        applying because the record is an alarm.
      */}
      <div className="mb-5">
        <EscalationFeed title="Orders the floor has stopped on" />
      </div>

      {/* §37: action required today, before any analysis. */}
      <div className="mb-5 grid gap-2 sm:grid-cols-3 lg:grid-cols-5">
        {/*
          Raised *at* me, not by me. Somebody else has found a problem on an order of mine and
          the buyer does not know yet — which is the one thing on this screen where the cost of
          not seeing it lands on a customer rather than on a pipeline number.
        */}
        <Tile
          label="Concerns on your orders"
          value={concerns.count}
          hint={concerns.count ? 'Raised by another department' : 'Nobody has flagged anything'}
          tone={concerns.count ? 'danger' : 'neutral'}
        />
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

        {/*
          The whole point of the chain: despatch finds an urgent order blocked, raises it with
          production, and the person who has to ring the buyer sees both the concern and the
          answer — without being party to a conversation held between two other departments.
        */}
        <Ranked
          title="Concerns raised on your orders"
          blurb="Another department has flagged something on an order of yours."
          rows={concerns.rows}
          count={concerns.count}
          empty="Nobody has raised anything on your orders."
          render={(row) => (
            <li key={row._id} className="py-2.5">
              <div className="flex items-baseline justify-between gap-3">
                <Link
                  to={`/orders/${row.orderId}`}
                  className="text-sm font-semibold text-steel-100 hover:text-accent"
                >
                  {row.order || row.number}
                </Link>
                <span
                  className={`shrink-0 text-xs font-semibold ${
                    row.overdue ? 'text-danger-400' : 'text-steel-400'
                  }`}
                >
                  {row.overdue ? 'Past its promise' : humanise(row.status)}
                </span>
              </div>
              <p className="mt-0.5 text-xs text-steel-400">
                {row.by || 'Somebody'}
                {row.byDepartment ? ` (${humanise(row.byDepartment)})` : ''} → {humanise(row.askedOf)}
                {row.priority !== 'normal' ? ` · ${row.priority}` : ''}
              </p>
              <p className="mt-1 text-sm text-steel-200">{row.question}</p>
              {/* The answer, where there is one — otherwise the owner opens the order to find
                  out whether the thing they were told about has moved. */}
              {row.latestAnswer && (
                <p className="mt-1 rounded-lg border border-line/[0.08] bg-line/[0.03] px-2.5 py-1.5 text-xs text-steel-200">
                  <span className="font-bold">{row.latestAnswer.by || 'Answered'}:</span>{' '}
                  {row.latestAnswer.body}
                </p>
              )}
            </li>
          )}
        />

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
