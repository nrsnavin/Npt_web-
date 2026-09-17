import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { dispatches as dispatchApi } from '../api/endpoints.js';
import { useAuth } from '../context/AuthContext.jsx';
import { ErrorState, PageHeader, Spinner } from '../components/ui.jsx';
import QueryAnswer from '../components/QueryAnswer.jsx';
import { DispatchStatusPicker } from '../components/DispatchStatus.jsx';
import UrgentOrder from '../components/UrgentOrder.jsx';
import {
  FillPaperwork, PriorityFlag, PromisedDate, TellMarketing,
} from '../components/DispatchUrgency.jsx';
import EscalationFeed from '../components/EscalationFeed.jsx';
import EscalatedTasks from '../components/EscalatedTasks.jsx';
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
function Consignment({ row, tone, mayAct, mayPromise, onDone }) {
  /* A flagged row is outlined as well as badged. Inside a group where every card is the same
     colour, the badge alone is a line of text among five others — the ring is what makes it the
     one you reach for first, which is the whole of what a priority buys on this screen. */
  const flagged = row.order?.priority === 'critical';

  return (
    <li
      className={`rounded-xl border p-4 ${EDGE[tone]} ${
        flagged ? 'ring-1 ring-danger-500/40' : ''
      }`}
    >
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

      {/* What marketing asked for, above the instruction — it is why this row is where it is. */}
      <PriorityFlag order={row.order} />

      {/* The whole point of the card: what to do, in a sentence. */}
      {row.urgency.why.map((line) => (
        <p key={line} className={`mt-2 text-base font-bold ${TEXT[tone]}`}>
          {line}
        </p>
      ))}

      {/* What the customer was actually told, which is the date lateness is counted against. */}
      <PromisedDate row={row} mayPromise={mayPromise} onChanged={onDone} />

      <p className="mt-3 border-t border-line/[0.06] pt-2 text-sm text-steel-400">
        {row.lrNumber ? `LR ${row.lrNumber}` : 'No LR yet'}
        {row.vehicleNumber ? ` · ${row.vehicleNumber}` : ''}
        {/* Only when the line above is not already showing it. With a promise recorded, that
            line says "promised the 12th · we planned the 18th", and repeating "due 18 Sept"
            here makes the reader check whether the two dates are the same thing. */}
        {row.expectedDeliveryDate && !row.promise?.date
          ? ` · due ${formatDate(row.expectedDeliveryDate)}`
          : ''}
      </p>

      {/* The documents it is short of, typed here rather than a screen away — on the group whose
          whole job is chasing them, that is the job. */}
      {mayAct && <FillPaperwork row={row} onFilled={onDone} />}

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

      {/* And the answer, back up the thread the flag came down. */}
      {mayAct && <TellMarketing row={row} />}
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

/**
 * Narrowing the whole board to one buyer or one order.
 *
 * The question that most often interrupts a despatch day is a customer ringing about a specific
 * order, and answering it meant reading four groups looking for a name. Filtered in the browser
 * rather than re-fetched: the day is one reply and already in hand, and a round trip to hide
 * rows the screen is holding would make the answer slower than scrolling.
 */
function Filter({ value, onChange, options }) {
  return (
    <div className="mt-5 flex flex-wrap items-center gap-2">
      <input
        className="input max-w-xs"
        placeholder="Find a customer, order or consignment…"
        aria-label="Narrow the board"
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
      {value && (
        <button type="button" className="btn-ghost" onClick={() => onChange('')}>
          Clear
        </button>
      )}
      {/* The buyers actually on the board, so the commonest filter is one press rather than
          a correctly-spelled guess. */}
      {!value &&
        options.slice(0, 4).map((name) => (
          <button key={name} type="button" className="row-action" onClick={() => onChange(name)}>
            {name}
          </button>
        ))}
    </div>
  );
}

export default function DispatchHome() {
  const { user, canWrite } = useAuth();
  /* Marketing reads this screen through the same component and gets the stage without the
     menu, which is the §19 split: they see where the goods are, the yard moves them. */
  const mayAct = canWrite('dispatch');
  /*
   * Recording what a customer was told is marketing's, and the server enforces it — this only
   * decides whether the control is offered. Management can too, because they are who answers
   * when the person who sold it is on leave.
   */
  const mayPromise = user?.department === 'marketing' || user?.role === 'admin' ||
    user?.department === 'management';
  const [day, setDay] = useState(null);
  const [meta, setMeta] = useState({});
  const [error, setError] = useState(null);
  const [term, setTerm] = useState('');

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

  /*
   * One matcher over everything a person would type: a buyer, an order number, a consignment
   * number, or a lorry. Anything less and the filter is a lookup table nobody can remember.
   *
   * It runs over the urgent orders too, and that is not a detail. A control that sits on the
   * board and silently exempts one section is worse than no control: somebody narrows to a
   * buyer, reads what is left, and concludes those are all the rows for that buyer.
   */
  const needle = term.trim().toLowerCase();
  const matches = (row) =>
    !needle ||
    [row.customer?.name, row.order?.number, row.number, row.lrNumber, row.vehicleNumber]
      .some((field) => String(field || '').toLowerCase().includes(needle));

  const shown = (key) => (day[key] || []).filter(matches);
  const urgent = (day.urgent || []).filter(matches);

  /* Deduplicated, in the order they appear — the buyers on the board today, not every buyer. */
  const customers = [
    ...new Set(
      GROUPS.flatMap((group) => day[group.key] || [])
        .map((row) => row.customer?.name)
        .filter(Boolean)
    ),
  ];

  const nothing =
    !GROUPS.some((group) => day[group.key]?.length) &&
    !day.unclaimed.length &&
    !day.urgent?.length &&
    !day.queries.length;

  /* Filtered to nothing is a different state from an empty yard, and saying so is what stops
     somebody concluding the board is broken when they have simply mistyped a name. */
  const hidden =
    needle && !urgent.length && !GROUPS.some((group) => shown(group.key).length);

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

      <Filter value={term} onChange={setTerm} options={customers} />

      {hidden && (
        <p className="mt-5 rounded-lg border border-line/[0.08] px-4 py-6 text-center text-sm text-steel-400">
          Nothing in the yard matches &ldquo;{term}&rdquo;.
        </p>
      )}

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
        What is stopped, the yard's own escalations among them. Above everything else on the
        screen: a lorry that cannot be loaded outranks the queue of ones that can, and this is
        where somebody sees whether the e-way bill they escalated this morning has been raised.
      */}
      <EscalatedTasks />
      <EscalationFeed />

      {/*
        First, above despatch's own work. An order marketing escalated is the one thing on this
        screen that somebody outside the team is already waiting on an answer about — and half
        of them are blocked by a department that does not know it yet.
      */}
      <Group
        title="Marketing marked these urgent"
        hint="What is holding each one, and who can clear it"
        count={urgent.length}
      >
        {urgent.map((row) => (
          <UrgentOrder key={row._id} row={row} mine="despatch" onAnswered={load} />
        ))}
      </Group>

      {GROUPS.map((group) => (
        <Group
          key={group.key}
          title={group.title}
          hint={group.hint}
          count={shown(group.key).length}
        >
          {shown(group.key).map((row) => (
            <Consignment
              key={row._id}
              row={row}
              tone={group.tone}
              mayAct={mayAct}
              mayPromise={mayPromise}
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
