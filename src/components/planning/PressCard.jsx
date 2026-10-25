import { useState } from 'react';
import { formatNumber } from '../../utils/format.js';
import { PRESS_STATE, RANK_TONE, rankWords, shortDay } from '../../utils/planningBoard.js';
import Swatch from './Swatch.jsx';

/**
 * One machine on the wall [pages/PlanningBoard.jsx]: its state in a word, the job running on it
 * and how far along it is, the jobs after it, and when it is free.
 *
 * While a job is being moved (dragged, or picked with "Choose machine"), the card says how it
 * ranks for that job — ★ Best, 2nd, 3rd, with the day it would be done — or that it cannot take
 * the mould and why. Then the whole card is the target: drop on it, or tap it.
 */
export default function PressCard({ press, summary, moving, choice, cannot, onPlace, onOpenJob, onSortColour, mayPlan }) {
  const [over, setOver] = useState(false);
  const look = PRESS_STATE[summary.state] || PRESS_STATE.free;
  const target = Boolean(moving && mayPlan);
  const best = choice?.rank === 1;
  const place = () => target && onPlace(press.machine);
  const { running, upcoming, progress } = summary;

  return (
    <div
      role={target ? 'button' : undefined}
      tabIndex={target ? 0 : undefined}
      aria-label={target ? `Put ${moving.number} on ${press.machine.code}${cannot ? ` — cannot: ${cannot}` : choice ? ` — ${rankWords(choice.rank)}, done ${shortDay(choice.end)}` : ''}` : undefined}
      onClick={target ? place : undefined}
      onKeyDown={target ? (event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); place(); } } : undefined}
      onDragOver={(event) => { if (mayPlan) { event.preventDefault(); if (!over) setOver(true); } }}
      onDragLeave={() => setOver(false)}
      onDrop={(event) => { event.preventDefault(); setOver(false); onPlace(press.machine); }}
      className={`relative flex flex-col rounded-2xl border bg-ink-850 p-4 shadow-raised transition duration-200 ${
        target ? 'cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-accent' : ''
      } ${
        over ? 'scale-[1.02] border-accent ring-2 ring-accent/60' : best ? 'border-success-500/60 ring-2 ring-success-500/40' : 'border-line/[0.08]'
      } ${target && cannot ? 'opacity-45 grayscale' : ''} ${target && !cannot && !over ? 'hover:-translate-y-0.5 hover:border-accent/50' : ''}`}
    >
      {/* How it ranks for the job being moved. */}
      {target && (choice || cannot) && (
        <div className={`-mx-4 -mt-4 mb-3 rounded-t-2xl px-4 py-1.5 text-xs font-semibold ${cannot ? 'bg-danger-500/10 text-danger-400' : choice.rank <= 3 ? RANK_TONE[choice.rank].replace(/border-\S+/, '') : 'bg-line/[0.04] text-steel-400'}`}>
          {cannot
            ? <span className="block truncate" title={cannot}>✗ Can’t take it — {cannot}</span>
            : <>{choice.rank === 1 ? '★ ' : ''}{choice.rank <= 3 ? rankWords(choice.rank) : `#${choice.rank}`} · done {shortDay(choice.end)}{choice.late ? ` · ${choice.lateDays} day${choice.lateDays === 1 ? '' : 's'} late` : ''}</>}
        </div>
      )}

      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-lg font-bold leading-tight tracking-tight text-steel-50">{press.machine.code}</p>
          <p className="text-xs text-steel-400">{[press.machine.tonnage && `${press.machine.tonnage} T`, press.machine.shotCapacityGrams && `${press.machine.shotCapacityGrams} g shot`].filter(Boolean).join(' · ') || '—'}</p>
        </div>
        <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ${look.pill}`}>
          <span className="relative flex h-2 w-2" aria-hidden="true">
            {look.pulse && <span className={`absolute inline-flex h-full w-full animate-ping rounded-full ${look.dot} opacity-60`} />}
            <span className={`relative inline-flex h-2 w-2 rounded-full ${look.dot}`} />
          </span>
          {look.words}
        </span>
      </div>

      {/* Now: the job running, and how far along it is. */}
      <div className="mt-3 flex-1">
        {running ? (
          <button type="button" disabled={target} onClick={() => onOpenJob(running)} className="w-full rounded-xl bg-line/[0.03] p-2.5 text-left transition hover:bg-line/[0.06] disabled:hover:bg-line/[0.03]">
            <p className="flex items-center gap-2 text-sm">
              <Swatch colour={running.colour} />
              <span className="font-semibold text-steel-50">{running.mould?.mouldCode || running.modelNumber}</span>
              <span className="truncate text-steel-300">{running.colour}</span>
            </p>
            {running.forTask && <p className="mt-0.5 truncate text-xs text-accent">{running.forTask.enquiry ? `${running.forTask.enquiry} · ` : ''}{running.forTask.route}</p>}
            {progress != null && (
              <>
                <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-line/[0.08]" role="progressbar" aria-valuenow={progress} aria-valuemin={0} aria-valuemax={100} aria-label={`${running.number} made`}>
                  <div className="h-2 rounded-full bg-success-500 transition-[width] duration-500" style={{ width: `${progress}%` }} />
                </div>
                <p className="mt-1 flex justify-between text-xs tabular-nums text-steel-400">
                  <span>{formatNumber(running.goodQty || 0)} of {formatNumber(running.quantity)}</span>
                  <span className="font-semibold text-steel-200">{progress}%</span>
                </p>
              </>
            )}
          </button>
        ) : (
          <p className={`rounded-xl border border-dashed px-3 py-3 text-center text-sm ${summary.state === 'down' ? 'border-danger-500/40 text-danger-400' : summary.state === 'service' ? 'border-warn-500/40 text-warn-400' : 'border-line/[0.12] text-steel-400'}`}>
            {summary.state === 'down' ? 'Stopped — broken down' : summary.state === 'service' ? 'In maintenance' : upcoming.length ? 'Nothing running yet' : 'Free — ready for a job'}
          </p>
        )}

        {/* Next: the jobs after it. */}
        {upcoming.length > 0 && (
          <ul className="mt-2.5 space-y-1" aria-label={`Next on ${press.machine.code}`}>
            {upcoming.slice(0, 3).map((job, index) => (
              <li key={job._id}>
                <button type="button" disabled={target} onClick={() => onOpenJob(job)} className="flex w-full items-center gap-2 rounded-lg px-1.5 py-1 text-left text-xs transition hover:bg-line/[0.05] disabled:hover:bg-transparent">
                  <Swatch colour={job.colour} className="h-2.5 w-2.5" />
                  <span className="shrink-0 whitespace-nowrap font-semibold text-steel-200">{job.mould?.mouldCode || job.modelNumber}</span>
                  <span className="truncate text-steel-400" title={job.forTask?.route}>{job.colour} · {formatNumber(job.toMake)}{job.forTask?.enquiry ? ` · ${job.forTask.enquiry}` : ''}</span>
                  {/* A task job next on an idle press whose first piece the floor has not approved [floor planning]. */}
                  {index === 0 && !running && job.forTask && !job.forTask.firstPiece && (
                    <span className="shrink-0 rounded-full bg-aqua-500/10 px-1.5 text-xs font-semibold text-aqua-300" title="Mould change and first piece not approved on the floor tablet yet">first piece</span>
                  )}
                  <span className={`ml-auto shrink-0 tabular-nums ${job.late ? 'font-semibold text-danger-400' : 'text-steel-500'}`}>
                    {job.plannedEnd ? `till ${shortDay(job.plannedEnd)}` : ''}{job.late ? ' · late' : ''}
                  </span>
                </button>
              </li>
            ))}
            {upcoming.length > 3 && <li className="px-1.5 text-xs text-steel-500">+{upcoming.length - 3} more</li>}
          </ul>
        )}
      </div>

      <div className="mt-3 flex items-center justify-between gap-2 border-t border-line/[0.06] pt-2.5 text-xs">
        <span className="text-steel-400">{summary.freeFrom ? <>Free after <span className="font-semibold text-steel-200">{shortDay(summary.freeFrom)}</span></> : summary.state === 'free' ? <span className="font-semibold text-success-400">Free now</span> : '—'}</span>
        {mayPlan && !target && press.changeoversIfSorted < press.changeovers && (
          <button type="button" className="row-action px-2 py-1 text-xs" onClick={() => onSortColour(press)} title="Run light colours before dark ones">
            Light → dark · saves {press.changeovers - press.changeoversIfSorted}
          </button>
        )}
      </div>

      {over && moving && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center rounded-2xl bg-accent/10 text-sm font-bold text-accent">
          Drop to put {moving.number} here
        </div>
      )}
    </div>
  );
}
