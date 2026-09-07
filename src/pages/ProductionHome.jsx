import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { production as productionApi } from '../api/endpoints.js';
import { useAuth } from '../context/AuthContext.jsx';
import { ErrorState, PageHeader, Spinner } from '../components/ui.jsx';
import QueryAnswer from '../components/QueryAnswer.jsx';
import { formatNumber } from '../utils/format.js';

/**
 * The plant's front page.
 *
 * It answers two questions rather than one, because those are the two a supervisor actually
 * opens the app with: **what goes on a press this morning**, and **what has somebody asked me
 * that I have not answered**. They are unrelated as data and inseparable in practice — the
 * question is nearly always about the job — so splitting them across two screens is how a
 * question sits unanswered beside the very line it is about.
 *
 * Three rules, the same ones the sample bench's screen is built on:
 *
 * **Every row says why it is where it is.** "38,000 still to make, and 2 days to do it" rather
 * than a red chip or a priority score. A supervisor who cannot see why line 4 sits above line 9
 * goes back to the whiteboard, and then the screen is decoration.
 *
 * **This is a shortlist, not the register.** Everything that is late or heading that way, then
 * ten of what is next. The full list is one click away and is a different tool — filterable,
 * paged, for looking something up rather than for deciding what to do now.
 *
 * **A raised priority shows who raised it and why.** The plant is being asked to reorder its
 * day on somebody's say-so and is entitled to know whose. It is also the only thing that keeps
 * the flag honest: if one person's orders are all critical, everybody can see it.
 */

/** The bands, in the words a supervisor would use rather than the keys the server sends. */
const BANDS = {
  late: { label: 'Past its date', tone: 'danger' },
  at_risk: { label: 'Will miss', tone: 'warn' },
  soon: { label: 'Due soon', tone: 'neutral' },
  normal: { label: '', tone: 'neutral' },
};

const TONE = {
  danger: 'text-danger-400',
  warn: 'text-warn-400',
  neutral: 'text-steel-300',
};

/** A headline count. Three, and the words under them say what to do about it. */
function Count({ label, value, hint, tone }) {
  return (
    <div className={`card px-5 py-4 ${tone === 'danger' && value > 0 ? 'ring-1 ring-danger-500/40' : ''}`}>
      <p className="text-base font-bold text-steel-200">{label}</p>
      <p className={`mt-1 text-[2.5rem] font-extrabold leading-none ${TONE[tone] || 'text-steel-50'}`}>
        {value}
      </p>
      <p className="mt-1.5 text-sm text-steel-400">{hint}</p>
    </div>
  );
}

/**
 * One line to run, as a card.
 *
 * A card rather than a table row for the same reason the bench's screen uses one: a table asks
 * the reader to match a cell to a heading several rows above it, and this is read standing up.
 */
function Job({ row }) {
  const raised = row.order.priority !== 'normal';

  /*
   * A row pulled up by marketing is labelled by the request, not by the band it landed in.
   *
   * Labelling it by the band produced a badge that contradicted the sentence under it: an order
   * due in 45 days, marked critical, read "Will miss" directly above "Due in 45 days — not
   * pressing on its own dates". Whichever line a supervisor believed, the screen had told them
   * something false. Naming the request keeps the row honest on both lines — it is near the top
   * because somebody asked, and it says so.
   */
  const band = row.urgency.lifted
    ? {
        label: row.order.priority === 'critical' ? 'Critical — asked for' : 'Pulled forward',
        tone: row.order.priority === 'critical' ? 'danger' : 'warn',
      }
    : BANDS[row.urgency.band] || BANDS.normal;

  return (
    <li>
      <Link
        to={row.link}
        className={`block rounded-xl border p-4 transition-colors hover:border-accent/50 hover:bg-line/[0.03] ${
          row.urgency.band === 'late'
            ? 'border-danger-500/40 bg-danger-500/[0.04]'
            : row.urgency.band === 'at_risk'
              ? 'border-warn-500/40 bg-warn-500/[0.04]'
              : 'border-line/10'
        }`}
      >
        <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
          <p className="text-base font-bold text-steel-50">
            {row.modelNumber || row.mould?.mouldCode || 'Unnamed model'}
            {row.colour ? <span className="font-semibold text-steel-300"> · {row.colour}</span> : null}
          </p>
          {/* The word as well as the colour: a red edge means nothing to somebody who has not
              been told the convention, and nothing at all to those who cannot see it. */}
          {band.label && (
            <p className={`text-sm font-bold ${TONE[band.tone]}`}>{band.label}</p>
          )}
        </div>

        <p className="mt-1 text-sm text-steel-300">
          {row.order.customer?.name || 'Customer not named'} · {row.order.number}
        </p>

        {/* The whole point of the card: the two numbers that put it here, in a sentence. */}
        {row.urgency.why.map((line) => (
          <p key={line} className="mt-2 text-base font-bold text-accent">
            {line}
          </p>
        ))}

        {/*
          Who asked, and why. Shown on the row rather than behind a hover, because a supervisor
          moving a job deserves to see the argument for moving it — and because a flag whose
          author is visible is a flag people set carefully.
        */}
        {raised && row.order.priorityReason && (
          <p className="mt-2 rounded-lg border border-line/[0.08] bg-line/[0.03] px-3 py-2 text-sm text-steel-200">
            <span className="font-bold text-steel-100">{row.order.priorityBy || 'Marketing'}:</span>{' '}
            {row.order.priorityReason}
          </p>
        )}

        <p className="mt-3 border-t border-line/[0.06] pt-2 text-sm text-steel-400">
          {formatNumber(row.toMakeQty)} of {formatNumber(row.quantity)} still to make
          {row.madePercent ? ` · ${row.madePercent}% done` : ''}
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

export default function ProductionHome() {
  const { user } = useAuth();
  const [day, setDay] = useState(null);
  const [meta, setMeta] = useState({});
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const response = await productionApi.day();
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
  if (!day) return <Spinner label="Loading the plant's day" />;

  const nothing = !day.pressing.length && !day.next.length && !day.queries.length;

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader
        title={`${greeting}, ${user?.name?.split(' ')[0] || ''}`}
        subtitle="What to run next, and who is waiting to be told"
        actions={
          <div className="flex flex-wrap gap-2">
            <Link to="/production" className="btn-secondary">All lines</Link>
            <Link to="/order-queries" className="btn-ghost">All questions</Link>
          </div>
        }
      />

      <div className="grid gap-3 sm:grid-cols-3">
        <Count
          label="Past its date"
          value={meta.late || 0}
          hint={meta.late ? 'Already broke a promise' : 'Nothing is late'}
          tone="danger"
        />
        <Count
          label="Will miss"
          value={meta.atRisk || 0}
          hint={meta.atRisk ? 'Not enough days left to make it' : 'Everything else fits'}
          tone="warn"
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
        Questions first when any are late. The queue is the plant's own work and will still be
        there in ten minutes; a marketing person past the hour they promised a buyer has somebody
        waiting on the phone, and that is the one thing on this screen with a person attached.
      */}
      {Boolean(meta.questionsOverdue) && (
        <Group
          title="Answer these first"
          hint="Somebody promised the buyer a time and it has gone"
          count={day.queries.filter((query) => query.isOverdue).length}
        >
          {day.queries
            .filter((query) => query.isOverdue)
            .map((query) => (
              <QueryAnswer key={query._id} query={query} onAnswered={load} />
            ))}
        </Group>
      )}

      <Group
        title="Run these first"
        hint="Late, or not enough days left to make what is left"
        count={day.pressing.length}
      >
        {day.pressing.map((row) => (
          <Job key={row.lineId} row={row} />
        ))}
      </Group>

      <Group
        title="Questions waiting"
        hint="Marketing has asked and has not been told"
        count={day.queries.filter((query) => !query.isOverdue).length}
      >
        {day.queries
          .filter((query) => !query.isOverdue)
          .map((query) => (
            <QueryAnswer key={query._id} query={query} onAnswered={load} />
          ))}
      </Group>

      <Group
        title="Coming up"
        hint="The next ten, in the order they will need the press"
        count={day.next.length}
      >
        {day.next.map((row) => (
          <Job key={row.lineId} row={row} />
        ))}
      </Group>

      {nothing && (
        <div className="card mt-7 px-6 py-14 text-center">
          <p className="text-lg font-bold text-steel-100">Nothing waiting on the plant.</p>
          <p className="mt-1.5 text-base text-steel-400">
            Lines appear here the moment an order is released to production.
          </p>
        </div>
      )}
    </div>
  );
}
