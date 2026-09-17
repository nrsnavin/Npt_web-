import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { workspace } from '../api/endpoints.js';
import { Notice } from './ui.jsx';
import { departmentLabel } from '../utils/pipeline.js';
import { plural } from '../utils/format.js';

/**
 * What matters now [BLUEPRINT §25].
 *
 * The plant raises six kinds of alarm on a timer already — late production, undispatched stock,
 * stalled samples, unanswered queries, overdue money, quiet leads. Nothing goes unflagged. What
 * nobody had was a way to tell, before nine o'clock, which of that pile matters *today*.
 *
 * So this is a ranking, not a seventh alarm. Every figure in it comes from a database query and
 * carries the record it came from; the model's only contribution is the order and one sentence
 * per row saying why that row leads. The screen is built to make that division visible:
 *
 * **The finding's own words are the headline.** Drawn from `headline` and `detail`, which are
 * written in the findings service from real quantities and real names. The model's sentence sits
 * underneath in a quieter voice, marked as commentary on the ordering. A reader can always tell
 * which is the plant talking and which is the review.
 *
 * **It says who ranked it.** "Ordered by the review" or "Ordered by severity" in the header,
 * because a ranking nobody can attribute is one nobody can argue with — and most days, with no
 * API key configured, it is the plant's own arithmetic doing the ordering.
 *
 * **Nothing is raised without a press.** Each row offers "Raise to despatch"; a person decides.
 * Six sweeps already write to real queues, and a seventh writing on a model's judgement is how
 * a queue becomes something people stop reading.
 *
 * **What was left out is still reachable.** The ranked few lead; the rest are one press away, so
 * somebody can see that the review skipped something. That is the only way a ranking can be
 * checked by the person reading it.
 */

/** Blunt on purpose: the scale is approximate, so three bands is all it can honestly carry. */
const band = (severity) => {
  if (severity >= 70) return { label: 'Now', tone: 'text-danger-400' };
  if (severity >= 50) return { label: 'Today', tone: 'text-warn-400' };
  return { label: 'This week', tone: 'text-steel-400' };
};

function Finding({ finding, why, rank, onRaise, busy, raised }) {
  const urgency = band(finding.severity);

  return (
    <li className="rounded-lg border border-line/[0.08] bg-ink-800/40 p-3">
      <div className="flex items-start gap-3">
        {/* The position, so a brief read down the phone has something to refer to. */}
        {rank ? (
          <span className="mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full bg-line/[0.08] text-xs font-bold tabular-nums text-steel-300">
            {rank}
          </span>
        ) : (
          <span aria-hidden className="mt-0.5 h-5 w-5 shrink-0" />
        )}

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
            {/* The database's sentence, with the database's numbers in it. */}
            <p className="text-sm font-semibold text-steel-100">{finding.headline}</p>
            <p className={`text-xs font-bold uppercase tracking-wide ${urgency.tone}`}>
              {urgency.label}
            </p>
          </div>

          <p className="mt-1 text-sm leading-relaxed text-steel-300">{finding.detail}</p>

          {/*
            The review's own sentence, in a quieter voice and labelled.

            It is about the ordering — why this is above the others — never a restatement of the
            problem. Kept visually separate so a reader is never in doubt about which of the two
            sentences came out of the database.
          */}
          {why && (
            <p className="mt-1.5 border-l-2 border-line/[0.1] pl-2.5 text-xs italic text-steel-400">
              {why}
            </p>
          )}

          <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-steel-500">
            <span>{departmentLabel(finding.department)}</span>
            {finding.count > 1 && <span>{finding.count} records</span>}
            {finding.link && (
              <Link to={finding.link} className="transition-colors hover:text-accent">
                Open it
              </Link>
            )}

            {raised ? (
              <span className="ml-auto font-semibold text-success-400">
                On the {departmentLabel(finding.department).toLowerCase()} queue
              </span>
            ) : (
              <button
                type="button"
                className="row-action ml-auto"
                disabled={busy}
                onClick={() => onRaise(finding)}
              >
                {busy ? 'Raising…' : `Raise to ${departmentLabel(finding.department).toLowerCase()}`}
              </button>
            )}
          </div>
        </div>
      </div>
    </li>
  );
}

export default function WhatMattersNow() {
  const [review, setReview] = useState(null);
  const [meta, setMeta] = useState({});
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(null);
  const [raised, setRaised] = useState({});
  const [showRest, setShowRest] = useState(false);

  const load = useCallback(async () => {
    try {
      const response = await workspace.review.read();
      setReview(response.data);
      setMeta(response.meta || {});
      setError(null);
    } catch (failure) {
      /* Not everybody has a slice — an account with no department gets an empty brief, quietly.
         Anything else is worth a line, because a panel that failed to load looks exactly like a
         plant with nothing wrong. */
      if (failure?.status === 403 || failure?.status === 401) {
        setReview({ findings: [], picks: [], summary: null });
      } else setError(failure);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const raise = async (finding) => {
    setBusy(finding.id);
    try {
      await workspace.review.raise({ kind: finding.kind, department: finding.department });
      /* Marked in place rather than removed: the problem has not gone away, it is now somebody's
         job. Taking the row off would read as "fixed", which it is not. */
      setRaised((current) => ({ ...current, [finding.id]: true }));
    } catch (failure) {
      setError(failure);
    } finally {
      setBusy(null);
    }
  };

  if (error) {
    return (
      <Notice tone="warn">
        <p>Could not work out what matters — {error.message}</p>
      </Notice>
    );
  }

  const findings = review?.findings || [];
  if (!findings.length) return null;

  const byId = new Map(findings.map((finding) => [finding.id, finding]));
  const picks = (review.picks || []).map((pick) => ({ ...pick, finding: byId.get(pick.id) }))
    .filter((pick) => pick.finding);
  const pickedIds = new Set(picks.map((pick) => pick.id));
  const rest = findings.filter((finding) => !pickedIds.has(finding.id));

  return (
    <section className="mt-6">
      <div className="card p-4">
        <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
          <h2 className="text-lg font-bold tracking-tight text-steel-50">
            What matters now{' '}
            <span className="text-steel-400">
              ({meta.scope === 'plant' ? 'the whole plant' : departmentLabel(meta.scope)})
            </span>
          </h2>
          {/* Attribution, in the header rather than buried. Most days this reads "by severity". */}
          <p className="text-xs text-steel-500">
            {meta.from === 'model' ? 'Ordered by the review' : 'Ordered by severity'} ·{' '}
            {plural(findings.length, 'problem found', 'problems found')}
          </p>
        </div>

        {/* One line on the shape of the day, when the review had something worth saying. */}
        {review.summary && (
          <p className="mt-1.5 text-sm italic leading-relaxed text-steel-400">{review.summary}</p>
        )}

        <ul className="mt-3 space-y-2.5">
          {picks.map((pick, index) => (
            <Finding
              key={pick.id}
              finding={pick.finding}
              why={pick.why}
              rank={index + 1}
              onRaise={raise}
              busy={busy === pick.id}
              raised={raised[pick.id]}
            />
          ))}
        </ul>

        {/*
          What the review left out, one press away.

          The point is not completeness — it is that a ranking somebody cannot check is a ranking
          they have to take on faith, and the second time it buries something obvious they stop
          reading it altogether.
        */}
        {rest.length > 0 && (
          <>
            <button
              type="button"
              className="btn-ghost mt-3"
              onClick={() => setShowRest((was) => !was)}
            >
              {showRest
                ? 'Hide the rest'
                : `Show the other ${plural(rest.length, 'problem', 'problems')}`}
            </button>

            {showRest && (
              <ul className="mt-2.5 space-y-2.5">
                {rest.map((finding) => (
                  <Finding
                    key={finding.id}
                    finding={finding}
                    rank={null}
                    onRaise={raise}
                    busy={busy === finding.id}
                    raised={raised[finding.id]}
                  />
                ))}
              </ul>
            )}
          </>
        )}
      </div>
    </section>
  );
}
