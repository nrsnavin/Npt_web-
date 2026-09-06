import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { samples as samplesApi } from '../api/endpoints.js';
import { useAuth } from '../context/AuthContext.jsx';
import { ErrorState, PageHeader, Spinner } from '../components/ui.jsx';
import { formatDate } from '../utils/format.js';

/**
 * The sample bench's front page.
 *
 * Written for somebody who mixes resin for a living, not for somebody who reads dashboards.
 * The screen it replaced had seven stat tiles, four tables and two paragraphs about turnaround
 * — all of it true, and almost none of it what a person opening the app at eight in the morning
 * came for. They came to find out which hanger to make next.
 *
 * So the whole screen answers one question, and four rules keep it that way:
 *
 * **Three numbers, never seven.** Late, new, in hand. Anything else a manager wants is on the
 * sampling dashboard, one click away, where somebody is actually asking a measuring question.
 *
 * **Every row says what to do, in a sentence.** "Get it printed" rather than a status chip
 * reading "Printing required" — the chip needs somebody to already know what the word means in
 * this plant, and the sentence does not. It comes from the server, so it cannot drift from what
 * the status actually is.
 *
 * **Nothing smaller than the body text, and no colour carrying meaning on its own.** Late rows
 * say the word "late" as well as being red, because a red edge means nothing to somebody who
 * has not been told the convention — and nothing at all to the eight per cent of men who
 * cannot see it.
 *
 * **Plain time, not dates.** "Wanted 2 days ago" is a fact anybody can act on. "04 Sept 2026"
 * asks the reader to do arithmetic against today's date before they know whether to hurry.
 */

/** How long ago, or how long from now, in words. Nobody should have to subtract dates. */
function whenWanted(sample) {
  if (sample.daysLate > 0) {
    return {
      text: sample.daysLate === 1 ? 'Wanted yesterday' : `Wanted ${sample.daysLate} days ago`,
      tone: 'text-danger-400',
    };
  }
  if (!sample.requiredDate) return { text: 'No date given', tone: 'text-steel-400' };

  const days = Math.round(
    (new Date(sample.requiredDate).setHours(0, 0, 0, 0) - new Date().setHours(0, 0, 0, 0)) / 86400000
  );
  if (days <= 0) return { text: 'Wanted today', tone: 'text-warn-400' };
  if (days === 1) return { text: 'Wanted tomorrow', tone: 'text-steel-200' };
  return { text: `Wanted in ${days} days`, tone: 'text-steel-300' };
}

/**
 * One request, as a card rather than a table row.
 *
 * A table asks the reader to match a cell to a heading several rows above it. A card puts the
 * four things about one job next to each other, and it survives being read on a phone at the
 * bench, which a seven-column table does not.
 */
function Job({ sample, urgent }) {
  const when = whenWanted(sample);

  return (
    <li>
      <Link
        to={sample.link}
        className={`block rounded-xl border p-4 transition-colors hover:border-accent/50 hover:bg-line/[0.03] ${
          urgent ? 'border-danger-500/40 bg-danger-500/[0.04]' : 'border-line/10'
        }`}
      >
        <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
          <p className="text-base font-bold text-steel-50">
            {sample.model}
            {sample.colour ? <span className="font-semibold text-steel-300"> · {sample.colour}</span> : null}
          </p>
          {/* The word as well as the colour: red alone tells a colour-blind reader nothing. */}
          <p className={`text-sm font-bold ${when.tone}`}>{when.text}</p>
        </div>

        <p className="mt-1 text-sm text-steel-300">
          {sample.customer ? `For ${sample.customer}` : 'No customer — an internal trial'}
          {sample.customerOwner ? ` · ${sample.customerOwner}` : ''}
        </p>

        {/*
          Only when the colour is a condition. The bench's costliest wrong turn is reaching for a
          near-enough drum on a request that could not take one, and by the time the buyer says so
          the fortnight is gone. The permissive case needs no line — the colour is printed beside
          the model above, and "you may substitute" is what the absence of this already means.
        */}
        {sample.colourMandatory && sample.colour && (
          <p className="mt-2 text-sm font-bold text-danger-400">
            Must be {sample.colour} — no substitute
          </p>
        )}

        {/* The whole point of the card. A sentence, not a status word to be decoded. */}
        {sample.nextStep && (
          <p className="mt-3 text-base font-bold text-accent">→ {sample.nextStep}</p>
        )}

        <p className="mt-3 border-t border-line/[0.06] pt-2 text-sm text-steel-400">
          {sample.number}
          {' · '}
          {sample.assignedTo
            ? sample.mine
              ? 'You are making this'
              : `${sample.assignedTo} is making this`
            : 'Nobody has taken this yet'}
        </p>
      </Link>
    </li>
  );
}

/** A headline count. Three of these, and the words under them say what to do about it. */
function Count({ label, value, hint, tone }) {
  const tones = {
    danger: 'text-danger-400',
    warn: 'text-warn-400',
    neutral: 'text-steel-50',
  };

  return (
    <div className={`card px-5 py-4 ${tone === 'danger' && value > 0 ? 'ring-1 ring-danger-500/40' : ''}`}>
      <p className="text-base font-bold text-steel-200">{label}</p>
      <p className={`mt-1 text-[2.5rem] font-extrabold leading-none ${tones[tone] || tones.neutral}`}>
        {value}
      </p>
      <p className="mt-1.5 text-sm text-steel-400">{hint}</p>
    </div>
  );
}

function Group({ title, hint, samples, urgent = false }) {
  if (!samples?.length) return null;

  return (
    <section className="mt-7">
      <h2 className="text-lg font-bold tracking-tight text-steel-50">
        {title} <span className="text-steel-400">({samples.length})</span>
      </h2>
      <p className="mt-0.5 text-sm text-steel-400">{hint}</p>
      {/* One column, full width. A work list is read top to bottom like a job sheet, and a
          two-up grid leaves half the screen empty on the ordinary day with two jobs on it. */}
      <ul className="mt-3 space-y-3">
        {samples.map((sample) => (
          <Job key={sample._id} sample={sample} urgent={urgent} />
        ))}
      </ul>
    </section>
  );
}

export default function SampleHome() {
  const { user } = useAuth();
  const [day, setDay] = useState(null);
  const [meta, setMeta] = useState({});
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const response = await samplesApi.day();
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
  if (!day) return <Spinner label="Loading your work" />;

  const nothing = !day.overdue.length && !day.fresh.length && !day.inWork.length;

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader
        title={`${greeting}, ${user?.name?.split(' ')[0] || ''}`}
        subtitle="Everything the bench has to make, and what each one needs next"
        actions={
          <div className="flex flex-wrap gap-2">
            <Link to="/samples" className="btn-secondary">All requests</Link>
            {/* The measuring screen, named for what it is and kept off this one. */}
            <Link to="/samples/dashboard" className="btn-ghost">How we are doing</Link>
          </div>
        }
      />

      <div className="grid gap-3 sm:grid-cols-3">
        <Count
          label="Late"
          value={meta.overdue || 0}
          hint={meta.overdue ? 'Past the day it was wanted' : 'Nothing is late'}
          tone="danger"
        />
        <Count
          label="New"
          value={meta.fresh || 0}
          hint={meta.fresh ? 'Just come in, not started' : 'Nothing new has come in'}
          tone="warn"
        />
        <Count
          label="In hand"
          value={meta.inWork || 0}
          hint={meta.inWork ? 'Started and on time' : 'Nothing on the bench'}
          tone="neutral"
        />
      </div>

      {nothing ? (
        <div className="card mt-7 px-6 py-14 text-center">
          <p className="text-lg font-bold text-steel-100">Nothing waiting on the bench.</p>
          <p className="mt-1.5 text-base text-steel-400">
            New requests appear here the moment marketing asks for one.
          </p>
        </div>
      ) : (
        <>
          {/* Late first, always: it is the only group where the answer is to stop and do it. */}
          <Group
            title="Do these first"
            hint="Already past the day they were wanted"
            samples={day.overdue}
            urgent
          />
          <Group
            title="Just come in"
            hint="Nobody has started these yet"
            samples={day.fresh}
          />
          <Group
            title="On the bench"
            hint="Started, and still inside their date"
            samples={day.inWork}
          />
        </>
      )}
    </div>
  );
}
