import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { payments as paymentsApi } from '../api/endpoints.js';
import { useAuth } from '../context/AuthContext.jsx';
import { ErrorState, PageHeader, Spinner } from '../components/ui.jsx';
import FollowUpForm from '../components/FollowUp.jsx';
import { formatCurrency, formatDate } from '../utils/format.js';

/**
 * The chase, as a day's work [BLUEPRINT §20, §25].
 *
 * **Grouped by which conversation it is, not by how much is owed.** A list sorted by value has
 * the biggest customer at the top every morning whether or not anything has changed, and a
 * chaser who works down it is having the same conversation with the same person all week. The
 * four groups here are four genuinely different calls:
 *
 *   **A broken promise.** They named a day and it has gone. The only call that opens with
 *   something to hold the buyer to, which is why it leads — and why the promise and the person
 *   who made it are printed on the row rather than behind a click.
 *
 *   **Overdue, nobody has rung.** No commitment has been got out of them yet. Different call,
 *   different opening, and a list that showed both as merely "overdue" would have the chaser
 *   making the wrong one.
 *
 *   **Due this week.** The cheap call, made before it is late. The only group on this screen
 *   that can still prevent the problem rather than recover from it.
 *
 *   **Promised, still ahead.** Nothing to do. Shown so nobody rings them by mistake — a buyer
 *   chased three days before the day they promised learns that the promise did not matter.
 *
 * **A call is logged from the row.** The whole failure this module exists to fix is a chase
 * that happens on the phone and never reaches the record, and a screen that made somebody open
 * a second page to write one sentence reproduces it exactly.
 */

const GROUPS = [
  {
    key: 'broken',
    title: 'They promised, and the day has gone',
    hint: 'Start here — this is the only call with something to hold them to',
    tone: 'danger',
  },
  {
    key: 'overdue',
    title: 'Overdue, and nobody has rung',
    hint: 'No commitment out of them yet',
    tone: 'danger',
  },
  {
    key: 'soon',
    title: 'Due this week',
    hint: 'The cheap call — before it is late, not after',
    tone: 'warn',
  },
  {
    key: 'promised',
    title: 'Promised, still ahead of the day',
    hint: 'Nothing to do. Here so nobody rings them by mistake',
    tone: 'calm',
  },
];

const EDGE = {
  danger: 'border-danger-500/40 bg-danger-500/[0.04]',
  warn: 'border-warn-500/40 bg-warn-500/[0.04]',
  calm: 'border-line/10',
};

const TEXT = {
  danger: 'text-danger-400',
  warn: 'text-warn-400',
  calm: 'text-steel-300',
};

/** A headline figure. Money as money — a chase screen's numbers are rupees, not counts. */
function Count({ label, value, hint, tone }) {
  return (
    <div className={`card px-5 py-4 ${tone === 'danger' && value ? 'ring-1 ring-danger-500/40' : ''}`}>
      <p className="text-base font-bold text-steel-200">{label}</p>
      <p className={`mt-1 text-[1.75rem] font-extrabold leading-tight ${TEXT[tone] || 'text-steel-50'}`}>
        {value}
      </p>
      <p className="mt-1.5 text-sm text-steel-400">{hint}</p>
    </div>
  );
}

/**
 * Why this row is in this group, in a sentence.
 *
 * The same rule the plant's day screen is built on: every row says why it is where it is. A
 * chaser who cannot see why one invoice sits above another goes back to their own notebook,
 * and then the screen is decoration.
 */
function why(row, group) {
  const late = -(row.daysToDue ?? 0);

  if (group === 'broken') {
    return [
      `Promised ${formatDate(row.promise.date)}${row.promise.spokeTo ? ` by ${row.promise.spokeTo}` : ''} — and it has gone`,
      `${late} days past its due date`,
    ];
  }
  if (group === 'overdue') {
    return [`${late} days overdue, and no promise on record`];
  }
  if (group === 'soon') {
    return [row.daysToDue === 0 ? 'Falls due today' : `Falls due in ${row.daysToDue} days`];
  }
  return [
    `Promised ${formatDate(row.promise.date)}${row.promise.spokeTo ? ` by ${row.promise.spokeTo}` : ''}`,
  ];
}

/** One thing owed, as a card. Read on a phone, standing in somebody's office. */
function Owed({ row, tone, group, onLogged }) {
  const [calling, setCalling] = useState(false);

  return (
    <li className={`rounded-xl border p-4 ${EDGE[tone]}`}>
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <p className="text-base font-bold text-steel-50">
          {row.customer?.name || 'Customer not named'}
        </p>
        <p className={`text-lg font-extrabold tabular-nums ${TEXT[tone]}`}>
          {formatCurrency(row.balance)}
        </p>
      </div>

      <p className="mt-1 text-sm text-steel-300">
        <Link to={row.link} className="transition-colors hover:text-accent">
          {row.invoiceNumber || row.number}
        </Link>
        {row.kind === 'advance' ? ' · advance, nothing shipped yet' : ''}
        {row.order?.number ? ` · ${row.order.number}` : ''}
        {/* Part paid says so on the row: a balance that is not the invoice is a different
            conversation, and a chaser quoting the whole invoice at somebody who has paid
            half of it has lost the call before it starts. */}
        {row.received > 0 ? ` · ${formatCurrency(row.received)} already in` : ''}
      </p>

      {why(row, group).map((line) => (
        <p key={line} className={`mt-2 text-base font-bold ${TEXT[tone]}`}>{line}</p>
      ))}

      {/*
        What they said last time. The single most useful thing on the screen after the amount:
        without it the next caller starts from nothing, asks the same question and gets the
        same answer, and the buyer learns that nobody is keeping track.
      */}
      {row.lastFollowUp && (
        <p className="mt-2 rounded-lg border border-line/[0.08] bg-line/[0.03] px-3 py-2 text-sm text-steel-200">
          <span className="font-bold text-steel-100">
            {row.lastFollowUp.by || 'Somebody'}
            {row.lastFollowUp.spokeTo ? ` → ${row.lastFollowUp.spokeTo}` : ''}
            {', '}
            {formatDate(row.lastFollowUp.at)}:
          </span>{' '}
          {row.lastFollowUp.note}
        </p>
      )}

      <div className="mt-3 flex flex-wrap items-center justify-between gap-3 border-t border-line/[0.06] pt-3">
        <p className="text-sm text-steel-400">
          {row.owner ? `${row.owner} owns the customer` : 'No owner'}
          {' · due '}
          {formatDate(row.dueBy)}
        </p>
        <div className="flex gap-2">
          <button type="button" className="btn-secondary" onClick={() => setCalling(true)}>
            Log a call
          </button>
          <Link to={row.link} className="btn-ghost">Open it</Link>
        </div>
      </div>

      {/* Logged from the row, because a chase that needs a second page to record one sentence
          is a chase that stays on the phone and never reaches anybody else. */}
      <FollowUpForm
        receivable={calling ? row : null}
        onClose={() => setCalling(false)}
        onSaved={() => { setCalling(false); onLogged(); }}
      />
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

export default function PaymentsHome() {
  const { user } = useAuth();
  const [day, setDay] = useState(null);
  const [meta, setMeta] = useState({});
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const response = await paymentsApi.day();
      setDay(response.data);
      setMeta(response.meta || {});
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
  if (!day) return <Spinner label="Loading what is owed" />;

  const nothing = !GROUPS.some((group) => day[group.key]?.length);

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader
        title={`${greeting}, ${user?.name?.split(' ')[0] || ''}`}
        subtitle="Who to ring today, and what they said last time"
        actions={<Link to="/payments" className="btn-secondary">Everything owed</Link>}
      />

      <div className="grid gap-3 sm:grid-cols-3">
        <Count
          label="Overdue"
          value={formatCurrency(meta.overdueValue || 0)}
          hint={meta.overdue ? `Across ${meta.overdue} invoices` : 'Nothing is late'}
          tone="danger"
        />
        <Count
          label="Promises broken"
          value={meta.broken || 0}
          hint={meta.broken ? 'They named a day and it went' : 'Every promise is still standing'}
          tone="danger"
        />
        <Count
          label="Owed in total"
          value={formatCurrency(meta.outstanding || 0)}
          hint={
            meta.awaitingAdvance
              ? `Including ${formatCurrency(meta.awaitingAdvance)} of advances not in yet`
              : `Across ${meta.open || 0} open items`
          }
          tone="calm"
        />
      </div>

      {GROUPS.map((group) => (
        <Group
          key={group.key}
          title={group.title}
          hint={group.hint}
          count={day[group.key]?.length || 0}
        >
          {(day[group.key] || []).map((row) => (
            <Owed key={row._id} row={row} tone={group.tone} group={group.key} onLogged={load} />
          ))}
        </Group>
      ))}

      {nothing && (
        <div className="card mt-7 px-6 py-14 text-center">
          <p className="text-lg font-bold text-steel-100">Nothing to chase.</p>
          <p className="mt-1.5 text-base text-steel-400">
            An invoice appears here the moment a consignment leaves the yard, and an advance the
            moment somebody raises one against an order.
          </p>
        </div>
      )}
    </div>
  );
}
