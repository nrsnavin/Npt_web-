import { useState } from 'react';
import { formatDate } from '../utils/format.js';
import { RANK_TONE, rankWords } from '../utils/planningBoard.js';

/**
 * Which press should make a job [server: pressScore.service]: the best three first, each with
 * its done-by day and the reasons in plain words (✓ for, ✗ against), and one button to put the
 * job there. "Show every press" opens the rest, and the presses that cannot hold the mould with
 * why. The lowest score is best; the score is shown small, for whoever wants to compare.
 */

function ChoiceCard({ choice, current, busy, onPick }) {
  const tone = RANK_TONE[choice.rank] || 'border-line/[0.1] bg-line/[0.03] text-steel-300';
  return (
    <li className={`rounded-lg border p-3 ${choice.rank === 1 ? 'border-success-500/40 bg-success-500/[0.04]' : 'border-line/[0.08]'}`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="flex flex-wrap items-center gap-2">
          <span className={`rounded-md border px-1.5 py-0.5 text-xs font-semibold ${tone}`}>{choice.rank === 1 ? '★ ' : ''}{rankWords(choice.rank)}</span>
          <span className="font-semibold text-steel-50">{choice.machine.code}</span>
          {choice.machine.tonnage ? <span className="text-xs text-steel-400">{choice.machine.tonnage} T</span> : null}
          {choice.machine.location ? <span className="text-xs text-steel-500">· {choice.machine.location}</span> : null}
        </p>
        <p className={`text-sm tabular-nums ${choice.late ? 'font-semibold text-danger-400' : 'text-steel-200'}`}>
          Done {formatDate(choice.end)}{choice.late ? ` · ${choice.lateDays} day${choice.lateDays === 1 ? '' : 's'} late` : ''}
        </p>
      </div>
      <ul className="mt-2 space-y-0.5 text-xs">
        {/* The first reason is the done-by day, already said beside the press. */}
        {choice.reasons.slice(1).map((reason) => (
          <li key={reason.text} className={reason.good ? 'text-steel-300' : 'text-warn-400'}>
            <span aria-hidden="true">{reason.good ? '✓ ' : '✗ '}</span>
            <span className="sr-only">{reason.good ? 'For: ' : 'Against: '}</span>
            {reason.text}
          </li>
        ))}
      </ul>
      <div className="mt-2 flex items-center justify-between gap-2">
        <span className="text-xs text-steel-500" title="Lower is better: 100 a day late, 10 an hour of mould change, 5 a colour step, 2 a day waiting">Score {choice.score}</span>
        {current
          ? <span className="text-xs font-semibold text-steel-400">It is on this press</span>
          : onPick && (
            <button type="button" className={choice.rank === 1 ? 'btn-primary px-3 py-1.5 text-xs' : 'btn-secondary px-3 py-1.5 text-xs'} disabled={busy} onClick={() => onPick(choice)}>
              Put it on {choice.machine.code}
            </button>
          )}
      </div>
    </li>
  );
}

export default function PressChoices({ result, currentPressId = null, busy = false, onPick, top = 3 }) {
  const [all, setAll] = useState(false);
  if (!result) return null;
  if (result.sized === false) return <p className="text-sm text-warn-400">{result.why}</p>;
  const { choices = [], cannot = [] } = result;
  if (!choices.length) {
    /* One reason for every press (the mould is in maintenance, say) is said once. */
    const whys = [...new Set(cannot.map((entry) => entry.why))];
    return (
      <div className="space-y-1 text-sm">
        <p className="font-semibold text-danger-400">No press can take it{whys.length === 1 ? ` — ${whys[0]}` : '.'}</p>
        {whys.length > 1 && cannot.slice(0, 6).map((entry) => <p key={entry.machine._id} className="text-xs text-steel-400">{entry.machine.code}: {entry.why}</p>)}
        {!cannot.length && <p className="text-xs text-steel-400">No presses on the register yet — add them on the Machines page.</p>}
      </div>
    );
  }
  const shown = all ? choices : choices.slice(0, top);
  return (
    <div className="space-y-2">
      <ol className="space-y-2" aria-label="Presses, best first">
        {shown.map((choice) => (
          <ChoiceCard key={choice.machine._id} choice={choice} current={String(choice.machine._id) === String(currentPressId || '')} busy={busy} onPick={onPick} />
        ))}
      </ol>
      {all && cannot.length > 0 && (
        <div className="rounded-lg border border-line/[0.06] p-3">
          <p className="mb-1 text-xs font-semibold text-steel-300">Cannot take it</p>
          <ul className="space-y-0.5 text-xs text-steel-400">
            {cannot.map((entry) => <li key={entry.machine._id}><span className="font-semibold text-steel-200">{entry.machine.code}</span> — {entry.why}</li>)}
          </ul>
        </div>
      )}
      {(choices.length > top || cannot.length > 0) && (
        <button type="button" className="row-action text-xs" onClick={() => setAll(!all)}>
          {all ? 'Show the best three only' : `Show every press (${choices.length} can take it${cannot.length ? `, ${cannot.length} cannot` : ''})`}
        </button>
      )}
    </div>
  );
}
