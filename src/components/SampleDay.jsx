import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { samples as samplesApi } from '../api/endpoints.js';
import { formatDate } from '../utils/format.js';

/**
 * The sample bench's day, on the home screen [BLUEPRINT §4–6].
 *
 * A different question from `/samples/dashboard`, which answers *how is the team doing* —
 * ageing, rework rate, throughput — and is opened on a Monday. This answers *what do I pick up
 * next*, which is opened every hour, and the two would fight for the same screen.
 *
 * Three groups, in the order the bench should work them, and each one earns its place by
 * naming a different failure:
 *
 * **Just in** — nobody has started it. The count that matters is not how many arrived but how
 * many nobody has *claimed*: a shared queue's characteristic failure is a request that belongs
 * to everybody and therefore to nobody, and a personal to-do list does not have it.
 *
 * **Late** — past the date it was wanted, and still ours. A sample sitting with the customer is
 * not the bench being late, so those are excluded on the same list §25's own alarm uses.
 *
 * **In work** — started, on time, and every row says *what the next thing is*. "Pending action:
 * 7" is a number nobody can act on; seven rows reading "get it printed" and "say whether there
 * is stock" is a morning's plan. The sentence comes from the server so the bench and the API
 * cannot disagree about what a status means.
 */

/** Oldest at the top, and how long it has been waiting said out loud — §22's own principle. */
function Row({ sample, showNextStep }) {
  return (
    <li className="flex items-start justify-between gap-3 py-2">
      <div className="min-w-0">
        <p className="truncate text-[0.8125rem] font-semibold text-steel-100">
          <Link to={sample.link} className="hover:text-accent">
            {sample.model}
          </Link>
          {sample.colour ? <span className="font-normal text-steel-400"> · {sample.colour}</span> : null}
        </p>
        <p className="truncate text-xs text-steel-500">
          {sample.number}
          {sample.customer ? ` · ${sample.customer}` : ''}
          {/*
            The customer's owner [§29], not the person who raised it. A request is often raised
            by whoever took the call; the buyer belongs to one marketing person, and they are
            who will ring when it slips.
          */}
          {sample.customerOwner
            ? ` · ${sample.customerOwner}`
            : sample.requestedBy
              ? ` · for ${sample.requestedBy}`
              : ''}
        </p>
        {showNextStep && sample.nextStep && (
          <p className="mt-0.5 text-xs font-semibold text-flame-400">{sample.nextStep}</p>
        )}
      </div>

      <div className="shrink-0 text-right">
        {sample.daysLate > 0 ? (
          <p className="text-xs font-semibold text-danger-400">
            {sample.daysLate} day{sample.daysLate === 1 ? '' : 's'} late
          </p>
        ) : (
          <p className="text-xs text-steel-400">
            {sample.requiredDate ? formatDate(sample.requiredDate) : 'No date'}
          </p>
        )}
        <p className="mt-0.5 text-[0.6875rem] text-steel-500">
          {/* Unclaimed is the state worth naming: it is nobody's until somebody takes it. */}
          {sample.assignedTo ? (sample.mine ? 'Yours' : sample.assignedTo) : 'Unclaimed'}
        </p>
      </div>
    </li>
  );
}

function Group({ title, tone, empty, samples, showNextStep, limit = 5 }) {
  const shown = samples.slice(0, limit);
  const hidden = samples.length - shown.length;

  return (
    <div>
      <p className={`eyebrow mb-1 ${tone}`}>
        {title}
        {samples.length ? ` · ${samples.length}` : ''}
      </p>
      {shown.length === 0 ? (
        <p className="py-2 text-xs text-steel-500">{empty}</p>
      ) : (
        <>
          <ul className="divide-y divide-line/[0.05]">
            {shown.map((sample) => (
              <Row key={sample._id} sample={sample} showNextStep={showNextStep} />
            ))}
          </ul>
          {hidden > 0 && (
            <Link to="/samples" className="mt-1 inline-block text-xs text-steel-400 hover:text-accent">
              {hidden} more on the queue →
            </Link>
          )}
        </>
      )}
    </div>
  );
}

export default function SampleDay() {
  const [day, setDay] = useState(null);
  const [meta, setMeta] = useState({});
  const [failed, setFailed] = useState(false);

  const load = useCallback(async () => {
    try {
      const response = await samplesApi.day();
      setDay(response.data);
      setMeta(response.meta || {});
    } catch (error) {
      /* A panel that will not load must not take the day screen with it. */
      setFailed(true);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  if (failed) return null;

  return (
    <section className="card p-5">
      <div className="mb-4 flex items-start justify-between gap-3">
        <div>
          <h2 className="text-[0.9375rem] font-bold tracking-tight text-steel-50">The bench</h2>
          <p className="mt-0.5 text-xs text-steel-400">
            {day
              ? meta.unclaimed
                ? `${meta.unclaimed} open request${meta.unclaimed === 1 ? '' : 's'} nobody has picked up`
                : 'Every open request has somebody on it'
              : 'Loading…'}
          </p>
        </div>
        <Link to="/samples" className="btn-secondary px-3 py-1.5 text-xs">
          The queue
        </Link>
      </div>

      {day && (
        <>
          <div className="mb-4 grid grid-cols-3 gap-3">
            {[
              { label: 'Just in', value: meta.fresh || 0, lit: 'text-steel-50' },
              { label: 'Late', value: meta.overdue || 0, lit: meta.overdue ? 'text-danger-400' : 'text-success-400' },
              { label: 'In work', value: meta.inWork || 0, lit: 'text-steel-50' },
            ].map((tile) => (
              <div key={tile.label} className="rounded-lg border border-line/[0.06] px-3 py-2.5">
                <p className="eyebrow">{tile.label}</p>
                <p className={`stat-value mt-1 ${tile.lit}`}>{tile.value}</p>
              </div>
            ))}
          </div>

          <div className="space-y-5">
            {/* Late first: it is the only group where the answer is "stop what you are doing". */}
            <Group
              title="Late"
              tone="text-danger-400"
              empty="Nothing past the date it was wanted."
              samples={day.overdue}
              showNextStep
            />
            <Group
              title="Just in"
              tone="text-warn-400"
              empty="Nothing new on the bench."
              samples={day.fresh}
            />
            <Group
              title="In work"
              tone="text-steel-400"
              empty="Nothing started and waiting."
              samples={day.inWork}
              showNextStep
            />
          </div>
        </>
      )}
    </section>
  );
}
