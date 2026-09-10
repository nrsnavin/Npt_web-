import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { dispatches as dispatchApi } from '../api/endpoints.js';
import { useAuth } from '../context/AuthContext.jsx';
import { ErrorState, PageHeader, Spinner } from '../components/ui.jsx';
import QueryAnswer from '../components/QueryAnswer.jsx';
import { DispatchStatusPicker } from '../components/DispatchStatus.jsx';
import UrgentOrder from '../components/UrgentOrder.jsx';
import { formatDate, formatNumber } from '../utils/format.js';

/**
 * The despatch team's front page.
 *
 * Built like the plant's, and grouped differently on purpose. A press queue can be ranked by how
 * bad each line is, because everything on it is the same work: make pieces. A despatch queue
 * cannot — a consignment waiting on an invoice, one sitting shippable on the floor, and one
 * three days late on the road need three unrelated actions from three different people. Ranking
 * those against each other produces an ordered list nobody can work from. So the groups are
 * **things to do**, in the order a day is actually spent:
 *
 *   Ring the transporter · Chase the paperwork · Load it · Get the receipt
 *
 * Chasing leads because it is the only group with a customer already let down. Paperwork sits
 * above loading because it needs somebody *else* to act — an invoice from accounts, an LR from a
 * transporter — and the sooner it is asked for the sooner it moves; loading is in the team's own
 * hands and keeps until the afternoon.
 *
 * **Then the group that has no consignment at all.** Anything late, blocked or ready is at least
 * on a screen. Goods packed with nothing claiming them are on none, and that is how stock sits
 * on a floor for a fortnight against an order everybody believes is moving. It is the most
 * useful thing this page does, so it is a section and not a footnote.
 */

const GROUPS = [
  {
    key: 'chase',
    title: 'Ring the transporter',
    hint: 'Past the day the customer was promised, and not there yet',
    tone: 'danger',
  },
  {
    key: 'blocked',
    title: 'Chase the paperwork',
    hint: 'Cannot go until a document arrives — ask now, not when the vehicle is waiting',
    tone: 'warn',
  },
  {
    key: 'load',
    title: 'Ready to load',
    hint: 'Nothing is stopping these. Put them on a vehicle.',
    tone: 'accent',
  },
  {
    key: 'pod',
    title: 'Get the receipt',
    hint: 'Delivered, and the proof has not come back',
    tone: 'neutral',
  },
];

const EDGE = {
  danger: 'border-danger-500/40 bg-danger-500/[0.04]',
  warn: 'border-warn-500/40 bg-warn-500/[0.04]',
  accent: 'border-accent/30 bg-accent/[0.04]',
  neutral: 'border-line/10',
};

const TEXT = {
  danger: 'text-danger-400',
  warn: 'text-warn-400',
  accent: 'text-accent',
  neutral: 'text-steel-300',
};

/** A headline count. Four, because a despatch day genuinely has four kinds of work in it. */
function Count({ label, value, hint, tone }) {
  return (
    <div className={`card px-4 py-4 ${tone === 'danger' && value > 0 ? 'ring-1 ring-danger-500/40' : ''}`}>
      <p className="text-sm font-bold text-steel-200">{label}</p>
      <p className={`mt-1 text-[2rem] font-extrabold leading-none ${TEXT[tone] || 'text-steel-50'}`}>
        {value}
      </p>
      <p className="mt-1.5 text-xs text-steel-400">{hint}</p>
    </div>
  );
}

/** One consignment, as a card: what it is, and the sentence saying what to do with it. */
function Consignment({ row, tone, mayAct, onDone }) {
  return (
    <li className={`rounded-xl border p-4 ${EDGE[tone]}`}>
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <p className="text-base font-bold text-steel-50">
          {row.customer?.name || 'Customer not named'}
        </p>
        <p className="text-sm font-semibold text-steel-300">
          <Link to={row.link} className="transition-colors hover:text-accent">{row.number}</Link>
        </p>
      </div>

      <p className="mt-1 text-sm text-steel-300">
        {formatNumber(row.dispatchQty)} pcs
        {row.lineCount > 1 ? ` · ${row.lineCount} models` : ''}
        {row.order?.number ? ` · ${row.order.number}` : ''}
      </p>

      {/* The whole point of the card: what to do, in a sentence. */}
      {row.urgency.why.map((line) => (
        <p key={line} className={`mt-2 text-base font-bold ${TEXT[tone]}`}>
          {line}
        </p>
      ))}

      <p className="mt-3 border-t border-line/[0.06] pt-2 text-sm text-steel-400">
        {row.lrNumber ? `LR ${row.lrNumber}` : 'No LR yet'}
        {row.vehicleNumber ? ` · ${row.vehicleNumber}` : ''}
        {row.expectedDeliveryDate ? ` · due ${formatDate(row.expectedDeliveryDate)}` : ''}
      </p>

      {/*
        Where it is, and what moves it.

        The stage was the one thing this card never said — "Move these today" reads the same
        whether a load is waiting on a lorry or waiting on an invoice, and those are different
        jobs for different people. The picker offers only what the server allows from here, so
        §19's gate is on the card rather than one screen further in.
      */}
      <div className="mt-3 flex flex-wrap items-center justify-between gap-3 border-t border-line/[0.06] pt-3">
        <DispatchStatusPicker dispatch={row} canAct={mayAct} onDone={onDone} />
        <Link to={row.link} className="btn-secondary">Open it</Link>
      </div>
    </li>
  );
}

/** A packed line with nothing claiming it — the thing that is on no other screen. */
function Waiting({ row }) {
  return (
    <li>
      <Link
        to={row.link}
        className="block rounded-xl border border-line/10 p-4 transition-colors hover:border-accent/50 hover:bg-line/[0.03]"
      >
        <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
          <p className="text-base font-bold text-steel-50">
            {row.modelNumber || row.mould?.mouldCode || 'Unnamed model'}
            {row.colour ? <span className="font-semibold text-steel-300"> · {row.colour}</span> : null}
          </p>
          <p className="text-base font-bold text-accent">{formatNumber(row.available)} pcs free</p>
        </div>
        <p className="mt-1 text-sm text-steel-300">
          {row.order.customer?.name || 'Customer not named'} · {row.order.number}
        </p>
        <p className="mt-2 text-sm text-steel-400">
          {row.deliveryDate
            ? `Promised for ${formatDate(row.deliveryDate)}`
            : 'No delivery date agreed'}
          {row.reserved ? ` · ${formatNumber(row.reserved)} already claimed` : ''}
        </p>
      </Link>
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

export default function DispatchHome() {
  const { user, canWrite } = useAuth();
  /* Marketing reads this screen through the same component and gets the stage without the
     menu, which is the §19 split: they see where the goods are, the yard moves them. */
  const mayAct = canWrite('dispatch');
  const [day, setDay] = useState(null);
  const [meta, setMeta] = useState({});
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const response = await dispatchApi.day();
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
  if (!day) return <Spinner label="Loading the yard" />;

  const nothing =
    !GROUPS.some((group) => day[group.key]?.length) &&
    !day.unclaimed.length &&
    !day.urgent?.length &&
    !day.queries.length;

  const lateQuestions = day.queries.filter((query) => query.isOverdue);

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader
        title={`${greeting}, ${user?.name?.split(' ')[0] || ''}`}
        subtitle="What to move today, and who is waiting to be told"
        actions={
          <div className="flex flex-wrap gap-2">
            <Link to="/dispatches" className="btn-secondary">All consignments</Link>
            <Link to="/dispatches/ready" className="btn-ghost">Ready stock</Link>
          </div>
        }
      />

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Count
          label="Chase"
          value={meta.chase || 0}
          hint={meta.chase ? 'Past the promised day' : 'Nothing overdue'}
          tone="danger"
        />
        <Count
          label="Blocked"
          value={meta.blocked || 0}
          hint={meta.blocked ? 'Waiting on paperwork' : 'Nothing is short of papers'}
          tone="warn"
        />
        <Count
          label="Ready to load"
          value={meta.load || 0}
          hint={meta.load ? 'Can go today' : 'Nothing waiting on a vehicle'}
          tone="accent"
        />
        <Count
          label="Questions"
          value={meta.questions || 0}
          hint={
            meta.questionsOverdue
              ? `${meta.questionsOverdue} past the time promised`
              : meta.questions
                ? 'Waiting on an answer from you'
                : 'Nobody is waiting'
          }
          tone={meta.questionsOverdue ? 'danger' : 'neutral'}
        />
      </div>

      {/*
        Late questions first, as on the plant's screen and for the same reason: the yard's own
        work will still be there in ten minutes, and a marketing person past the hour they
        promised a buyer has somebody on the phone right now.
      */}
      <Group
        title="Answer these first"
        hint="Somebody promised the buyer a time and it has gone"
        count={lateQuestions.length}
      >
        {lateQuestions.map((query) => (
          <QueryAnswer key={query._id} query={query} onAnswered={load} />
        ))}
      </Group>

      {/*
        First, above despatch's own work. An order marketing escalated is the one thing on this
        screen that somebody outside the team is already waiting on an answer about — and half
        of them are blocked by a department that does not know it yet.
      */}
      <Group
        title="Marketing marked these urgent"
        hint="What is holding each one, and who can clear it"
        count={day.urgent?.length || 0}
      >
        {(day.urgent || []).map((row) => (
          <UrgentOrder key={row._id} row={row} mine="despatch" onAnswered={load} />
        ))}
      </Group>

      {GROUPS.map((group) => (
        <Group
          key={group.key}
          title={group.title}
          hint={group.hint}
          count={day[group.key]?.length || 0}
        >
          {(day[group.key] || []).map((row) => (
            <Consignment
              key={row._id}
              row={row}
              tone={group.tone}
              mayAct={mayAct}
              /* Reloaded rather than patched: a moved consignment changes which group it
                 belongs to and the counts above it, and a card sitting in the old band with
                 the new stage on it would be lying about both. */
              onDone={load}
            />
          ))}
        </Group>
      ))}

      <Group
        title="Packed, with nothing claiming it"
        hint={
          meta.unclaimedQty
            ? `${formatNumber(meta.unclaimedQty)} pieces are free to put on a lorry — no consignment has been raised for them`
            : 'Free to put on a lorry, with no consignment raised'
        }
        count={day.unclaimed.length}
      >
        {day.unclaimed.map((row) => (
          <Waiting key={`${row.order._id}-${row.modelNumber}-${row.available}`} row={row} />
        ))}
      </Group>

      <Group
        title="Questions waiting"
        hint="Marketing has asked and has not been told"
        count={day.queries.length - lateQuestions.length}
      >
        {day.queries
          .filter((query) => !query.isOverdue)
          .map((query) => (
            <QueryAnswer key={query._id} query={query} onAnswered={load} />
          ))}
      </Group>

      {nothing && (
        <div className="card mt-7 px-6 py-14 text-center">
          <p className="text-lg font-bold text-steel-100">Nothing waiting in the yard.</p>
          <p className="mt-1.5 text-base text-steel-400">
            Consignments appear here the moment the plant packs something.
          </p>
        </div>
      )}
    </div>
  );
}
