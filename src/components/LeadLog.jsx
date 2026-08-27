import { useCallback, useEffect, useState } from 'react';
import { leads as leadsApi } from '../api/endpoints.js';
import { useAuth } from '../context/AuthContext.jsx';
import { useWorkspace } from './dock/WorkspaceContext.jsx';
import { Notice, Section } from './ui.jsx';
import { formatDate, humanise } from '../utils/format.js';

/**
 * The lead's log — what has happened, what it adds up to, and what to do next.
 *
 * It was a reverse-chronological list of sentences, which is a filing cabinet: everything is
 * in there and nothing is legible. The redesign is built on one observation — a marketing
 * person opening a lead is not reading history, they are deciding what to do in the next
 * thirty seconds. So the screen answers that first and shows the history underneath.
 *
 * **The strip on top is the answer.** Days since contact, the usual rhythm, whether anyone
 * has actually spoken to them. Three numbers that decide the next move, above the fold, so
 * nobody has to read eleven entries to work out it has been three weeks.
 *
 * **The timeline is a conversation, not a table.** Grouped by month, coloured by channel, with
 * the gaps visible — because the gaps are the story. A four-week hole between two entries is
 * the most important thing on the screen and a flat list hides it completely.
 *
 * **Logging a call and deciding what happens next are one action.** They were two, and the
 * second was optional, which is exactly why leads ended up with no next step. The form asks
 * for both because the moment somebody records a call is the moment they know.
 */

const CHANNELS = {
  call: { label: 'Call', dot: 'bg-success-500', tint: 'text-success-400', two: true },
  meeting: { label: 'Meeting', dot: 'bg-success-500', tint: 'text-success-400', two: true },
  visit: { label: 'Visit', dot: 'bg-success-500', tint: 'text-success-400', two: true },
  whatsapp: { label: 'WhatsApp', dot: 'bg-aqua-500', tint: 'text-aqua-300' },
  email: { label: 'Email', dot: 'bg-aqua-500', tint: 'text-aqua-300' },
  note: { label: 'Note', dot: 'bg-steel-500', tint: 'text-steel-400' },
};

const NEXT_ACTIONS = [
  { value: 'call', label: 'Call them' },
  { value: 'whatsapp', label: 'WhatsApp them' },
  { value: 'email', label: 'Email them' },
  { value: 'meeting', label: 'Meet them' },
  { value: 'visit', label: 'Visit them' },
  { value: 'send_quote', label: 'Send a quote' },
  { value: 'send_sample', label: 'Send a sample' },
  { value: 'other', label: 'Something else' },
];

const inDays = (days) => {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return date.toISOString().slice(0, 10);
};

/** One figure, sized so the number is what the eye lands on. */
function Stat({ label, value, hint, tone = 'neutral' }) {
  const tones = {
    neutral: 'text-steel-100',
    warn: 'text-warn-400',
    danger: 'text-danger-400',
    good: 'text-success-400',
  };

  return (
    <div className="min-w-0 rounded-lg border border-line/[0.06] px-3 py-2.5">
      <p className="text-[0.625rem] font-bold uppercase tracking-[0.08em] text-steel-500">{label}</p>
      <p className={`mt-0.5 text-lg font-bold tabular-nums ${tones[tone]}`}>{value}</p>
      {hint && <p className="text-[0.6875rem] leading-tight text-steel-500">{hint}</p>}
    </div>
  );
}

/**
 * What the log adds up to.
 *
 * Every figure is arithmetic the reader can redo by looking at the entries below — nothing
 * here is a model's opinion. A number somebody cannot reproduce is one they stop believing
 * the first time it surprises them.
 */
function Analytics({ stats }) {
  if (!stats) return null;

  const silence = stats.daysSinceContact;
  const channels = Object.entries(stats.byChannel || {});

  return (
    <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
      <Stat
        label="Since contact"
        value={stats.total ? `${silence}d` : '—'}
        hint={stats.cooling ? 'Longer than their usual gap' : stats.total ? 'Last logged contact' : 'Nothing logged'}
        tone={stats.cooling || silence > 21 ? 'danger' : silence > 10 ? 'warn' : 'good'}
      />
      <Stat
        label="Usual gap"
        value={stats.cadenceDays != null ? `${stats.cadenceDays}d` : '—'}
        hint={stats.total > 1 ? `over ${stats.total} contacts` : 'Not enough contacts yet'}
      />
      <Stat
        label="Spoken to"
        value={stats.twoWayContacts}
        // The figure that explains a lead that has "been worked for months": messages sent
        // into silence look like activity on any count of entries.
        hint={stats.twoWayContacts ? 'calls, meetings, visits' : 'Nobody has actually spoken to them'}
        tone={stats.total && !stats.twoWayContacts ? 'warn' : 'neutral'}
      />
      <Stat
        label="Working it"
        value={stats.spanDays ? `${stats.spanDays}d` : '—'}
        hint={stats.total ? `${stats.total} contacts logged` : 'Not started'}
      />

      {channels.length > 0 && (
        <div className="rounded-lg border border-line/[0.06] px-3 py-2.5 sm:col-span-2 lg:col-span-4">
          <p className="mb-2 text-[0.625rem] font-bold uppercase tracking-[0.08em] text-steel-500">
            How they have been reached
          </p>
          <div className="flex h-2 overflow-hidden rounded-full">
            {channels.map(([type, count]) => (
              <div
                key={type}
                title={`${CHANNELS[type]?.label || type}: ${count}`}
                className={CHANNELS[type]?.dot || 'bg-steel-500'}
                style={{ width: `${(count / stats.total) * 100}%` }}
              />
            ))}
          </div>
          <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1">
            {channels.map(([type, count]) => (
              <span key={type} className="text-[0.6875rem] text-steel-400">
                <span className={`mr-1 inline-block h-1.5 w-1.5 rounded-full align-middle ${CHANNELS[type]?.dot || 'bg-steel-500'}`} />
                {CHANNELS[type]?.label || humanise(type)} {count}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/** The gap between two contacts, drawn rather than left to be worked out. */
function Gap({ days }) {
  if (days < 7) return null;

  return (
    <li className="flex items-center gap-3 py-1 pl-[0.3125rem]">
      <span className="h-6 w-px bg-line/[0.12]" />
      <span className={`text-[0.6875rem] ${days > 21 ? 'text-danger-400' : 'text-steel-500'}`}>
        {days} days of silence
      </span>
    </li>
  );
}

function Timeline({ activities }) {
  if (!activities?.length) {
    return (
      <p className="py-6 text-center text-sm text-steel-500">
        Nothing logged yet. The first call is the one worth writing down.
      </p>
    );
  }

  // Newest first, which is how somebody arriving at this screen reads it.
  const newestFirst = [...activities].sort(
    (a, b) => new Date(b.occurredAt) - new Date(a.occurredAt)
  );

  return (
    <ol className="space-y-1">
      {newestFirst.map((activity, index) => {
        const channel = CHANNELS[activity.type] || CHANNELS.note;
        const previous = newestFirst[index + 1];
        const gap = previous
          ? Math.round((new Date(activity.occurredAt) - new Date(previous.occurredAt)) / 86400000)
          : 0;

        return (
          <li key={activity._id || activity.occurredAt}>
            <div className="flex gap-3">
              <span className={`mt-2 h-2.5 w-2.5 shrink-0 rounded-full ${channel.dot}`} />
              <div className="min-w-0 flex-1 pb-1">
                <div className="flex flex-wrap items-baseline gap-x-2">
                  <span className={`text-[0.6875rem] font-bold uppercase tracking-wide ${channel.tint}`}>
                    {channel.label}
                  </span>
                  <span className="text-[0.6875rem] text-steel-500">{formatDate(activity.occurredAt)}</span>
                </div>
                <p className="mt-0.5 text-sm leading-relaxed text-steel-100">{activity.summary}</p>
              </div>
            </div>
            {/* The gaps are the story, and a flat list hides them completely. */}
            <Gap days={gap} />
          </li>
        );
      })}
    </ol>
  );
}

/**
 * Logging what happened, and deciding what happens next — one form.
 *
 * They were two, and the second was optional. That is exactly why leads ended up with no next
 * step: nobody opens a second dialog to record a decision they have already made in their
 * head. Asking here costs one extra field and is the difference between a follow-up that
 * happens and one that does not.
 */
function LogForm({ leadId, lead, onSaved, onLogged }) {
  const [type, setType] = useState('call');
  const [summary, setSummary] = useState('');
  const [nextAction, setNextAction] = useState(lead.nextAction || '');
  const [nextActionType, setNextActionType] = useState(lead.nextActionType || 'call');
  /*
   * The existing date, but only if it is still ahead. Pre-filling a date that has already
   * passed means somebody logging a call today gets a follow-up dated yesterday and a
   * reminder born overdue — which is how a reminder list becomes something people clear
   * rather than read.
   */
  const [when, setWhen] = useState(() => {
    const existing = lead.nextFollowUpDate ? String(lead.nextFollowUpDate).slice(0, 10) : null;
    return existing && existing >= new Date().toISOString().slice(0, 10) ? existing : inDays(3);
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const submit = async (event) => {
    event.preventDefault();
    if (!summary.trim() || busy) return;

    setBusy(true);
    setError(null);
    try {
      const saved = await leadsApi.addActivity({
        id: leadId,
        type,
        summary: summary.trim(),
        nextAction: nextAction.trim() || undefined,
        nextActionType,
        nextFollowUpDate: when || undefined,
      });
      setSummary('');
      onSaved(saved);
      // The reminder was just created server-side; the dock's list is otherwise stale until
      // the next reload, and a reminder you cannot see is the thing this was built to fix.
      onLogged?.();
    } catch (submitError) {
      setError(submitError);
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="mb-5 rounded-lg border border-line/[0.06] p-3.5">
      <div className="mb-2 flex flex-wrap gap-1.5">
        {Object.entries(CHANNELS)
          .filter(([key]) => key !== 'note')
          .map(([key, channel]) => (
            <button
              key={key}
              type="button"
              onClick={() => setType(key)}
              className={`rounded-full px-2.5 py-1 text-[0.6875rem] font-semibold transition-colors ${
                type === key
                  ? 'bg-flame-500/20 text-flame-400'
                  : 'border border-line/[0.08] text-steel-400 hover:text-steel-100'
              }`}
            >
              {channel.label}
            </button>
          ))}
      </div>

      <textarea
        rows={2}
        className="input"
        placeholder="What was said? The next person reading this will not have been on the call."
        value={summary}
        onChange={(event) => setSummary(event.target.value)}
      />

      <div className="mt-3 border-t border-line/[0.06] pt-3">
        <p className="mb-2 text-[0.625rem] font-bold uppercase tracking-[0.08em] text-steel-500">
          And what happens next
        </p>
        <div className="grid gap-2 sm:grid-cols-[10rem,1fr,9rem]">
          <select
            className="input !py-1.5 text-[0.8125rem]"
            value={nextActionType}
            onChange={(event) => setNextActionType(event.target.value)}
            aria-label="Next action"
          >
            {NEXT_ACTIONS.map((option) => (
              <option key={option.value} value={option.value}>{option.label}</option>
            ))}
          </select>
          <input
            className="input !py-1.5 text-[0.8125rem]"
            placeholder="About what?"
            value={nextAction}
            onChange={(event) => setNextAction(event.target.value)}
            aria-label="Next action detail"
          />
          <input
            type="date"
            className="input !py-1.5 text-[0.8125rem]"
            value={when}
            onChange={(event) => setWhen(event.target.value)}
            aria-label="Follow up on"
          />
        </div>
      </div>

      {error && (
        <div className="mt-3">
          <Notice tone="danger">{error.message}</Notice>
        </div>
      )}

      <div className="mt-3 flex items-center justify-between gap-3">
        <p className="text-[0.6875rem] text-steel-500">
          A reminder goes into your list for the date above.
        </p>
        <button type="submit" className="btn-primary px-3 py-1.5 text-[0.8125rem]" disabled={!summary.trim() || busy}>
          {busy ? 'Saving…' : 'Log it'}
        </button>
      </div>
    </form>
  );
}

const READINESS = {
  ready: { label: 'Ready', tone: 'text-success-400' },
  warming: { label: 'Warming', tone: 'text-aqua-300' },
  cold: { label: 'Cold', tone: 'text-steel-400' },
  stalled: { label: 'Stalled', tone: 'text-warn-400' },
  losing: { label: 'Losing', tone: 'text-danger-400' },
};

/**
 * The read of the log, and what it suggests doing.
 *
 * On a button rather than automatic: it costs a model call, and the suggestion is worth most
 * at the moment somebody is deciding rather than pre-computed at some earlier time and gone
 * stale. Everything in it is a draft — **Use this** fills the form, and nothing reaches the
 * lead until somebody saves.
 */
function Coach({ leadId, onUse }) {
  const [suggestion, setSuggestion] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const ask = async () => {
    setBusy(true);
    setError(null);
    try {
      setSuggestion(await leadsApi.suggest(leadId));
    } catch (askError) {
      setError(askError);
    } finally {
      setBusy(false);
    }
  };

  const readiness = suggestion && (READINESS[suggestion.readiness] || READINESS.cold);

  return (
    <Section
      title="What the log says"
      actions={
        <button type="button" className="btn-secondary px-3 py-1.5 text-xs" onClick={ask} disabled={busy}>
          {busy ? 'Reading…' : suggestion ? 'Read it again' : 'Read the log'}
        </button>
      }
    >
      {error && <Notice tone="danger">{error.message}</Notice>}

      {!suggestion && !error && (
        <p className="text-sm leading-relaxed text-steel-500">
          Reads everything logged against this lead and suggests what to do next. It only
          suggests — nothing changes on the lead until you save it.
        </p>
      )}

      {suggestion && (
        <div className="space-y-3">
          <div className="flex items-baseline gap-2">
            <span className={`text-[0.6875rem] font-bold uppercase tracking-wide ${readiness.tone}`}>
              {readiness.label}
            </span>
            <span className="text-[0.6875rem] text-steel-500">
              {suggestion.readBy === 'model' ? 'read by Jarvis' : 'from the figures alone'}
            </span>
          </div>

          <p className="text-sm leading-relaxed text-steel-200">{suggestion.summary}</p>

          {Boolean(suggestion.blockers?.length) && (
            <div>
              <p className="text-[0.625rem] font-bold uppercase tracking-[0.08em] text-steel-500">
                What is in the way
              </p>
              <ul className="mt-1 space-y-0.5">
                {suggestion.blockers.map((blocker) => (
                  <li key={blocker} className="text-[0.8125rem] text-warn-400">— {blocker}</li>
                ))}
              </ul>
            </div>
          )}

          {Boolean(suggestion.suggestions?.length) && (
            <div>
              <p className="text-[0.625rem] font-bold uppercase tracking-[0.08em] text-steel-500">
                Worth trying
              </p>
              <ul className="mt-1 space-y-0.5">
                {suggestion.suggestions.map((idea) => (
                  <li key={idea} className="text-[0.8125rem] leading-relaxed text-steel-300">— {idea}</li>
                ))}
              </ul>
            </div>
          )}

          <div className="rounded-lg border border-flame-500/25 bg-flame-500/[0.06] px-3 py-2.5">
            <p className="text-[0.625rem] font-bold uppercase tracking-[0.08em] text-steel-500">
              Suggested next step
            </p>
            <p className="mt-0.5 text-sm text-steel-100">{suggestion.nextAction}</p>
            <div className="mt-2 flex items-center justify-between gap-3">
              <span className="text-[0.6875rem] text-steel-500">
                {suggestion.followUpInDays === 0 ? 'Today' : `In ${suggestion.followUpInDays} days`}
              </span>
              <button
                type="button"
                className="btn-secondary px-2.5 py-1 text-[0.6875rem]"
                onClick={() => onUse(suggestion)}
              >
                Use this
              </button>
            </div>
          </div>
        </div>
      )}
    </Section>
  );
}

export default function LeadLog({ lead, onSaved }) {
  const { canWrite } = useAuth();
  const { reload: reloadWorkspace } = useWorkspace();
  const [stats, setStats] = useState(lead.logStats || null);
  const [prefill, setPrefill] = useState(0);

  const mayWrite = canWrite('enquiries');
  const open = !['converted', 'disqualified'].includes(lead.status);

  const load = useCallback(async () => {
    try {
      setStats(await leadsApi.logAnalytics(lead._id));
    } catch {
      // The figures are useful, not load-bearing. The log below is still readable without them.
      setStats(null);
    }
  }, [lead._id]);

  // Recomputed whenever the log changes, so the strip never disagrees with the entries below.
  useEffect(() => {
    load();
  }, [load, lead.activities?.length]);

  const saved = (updated) => {
    onSaved(updated);
    load();
  };

  /*
   * Accepting a suggestion fills the form rather than saving. The person still writes what was
   * said and presses the button — which keeps a model's proposal one deliberate click away
   * from being a commitment on a real buyer.
   */
  const use = (suggestion) => {
    setPrefill((count) => count + 1);
    onSaved({
      ...lead,
      nextAction: suggestion.nextAction,
      nextActionType: suggestion.nextActionType,
      nextFollowUpDate: inDays(suggestion.followUpInDays),
      __unsaved: true,
    });
  };

  return (
    <>
      <Section title="The conversation so far">
        <Analytics stats={stats} />
      </Section>

      {mayWrite && open && <Coach leadId={lead._id} onUse={use} />}

      <Section title={`Log (${lead.activities?.length || 0})`}>
        {mayWrite && open && (
          <LogForm
            key={prefill}
            leadId={lead._id}
            lead={lead}
            onSaved={saved}
            onLogged={reloadWorkspace}
          />
        )}
        <Timeline activities={lead.activities} />
      </Section>
    </>
  );
}
