import { formatNumber } from '../../utils/format.js';
import { shortDay } from '../../utils/planningBoard.js';
import Swatch from './Swatch.jsx';
import { WeightTag } from './Weightage.jsx';

/**
 * A job waiting for a machine [pages/PlanningBoard.jsx]. Three ways to place it, all on the
 * card: "Put on IM-05" puts it on its best machine in one tap; "Choose machine" lights up every
 * machine with how it ranks, and a tap on one places it; or drag the card onto a machine.
 */
export default function JobCard({ job, picked = false, mayPlan, busy, onPick, onOpen, onPlace, onDragStart, onDragEnd }) {
  const best = job.best;
  /* The auto-planner's proposal for a Production task's model, waiting for the in charge [floor planning]. */
  const proposal = job.proposal;
  return (
    <article
      draggable={mayPlan}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      aria-label={`${job.number}, ${job.mould?.mouldCode || job.modelNumber}, ${job.colour || 'no colour'}`}
      className={`group relative rounded-xl border bg-ink-850 p-3 shadow-raised transition duration-150 ${mayPlan ? 'cursor-grab active:cursor-grabbing' : ''} ${
        picked ? 'border-accent ring-2 ring-accent/50 shadow-glow' : job.late ? 'border-danger-500/40 hover:border-danger-500/70' : 'border-line/[0.08] hover:-translate-y-0.5 hover:border-accent/40'
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="flex items-center gap-2">
            <Swatch colour={job.colour} />
            <span className="truncate text-base font-bold tracking-tight text-steel-50">{job.mould?.mouldCode || job.modelNumber || 'No mould'}</span>
            <span className="truncate text-sm text-steel-300">{job.colour || '—'}</span>
            <WeightTag job={job} />
          </p>
          <p className="mt-0.5 text-xs text-steel-400">
            <span className="font-semibold tabular-nums text-steel-200">{job.forTask && !job.quantity ? 'Pieces not known' : `${formatNumber(job.toMake)} pcs`}</span>
            {job.pressDays ? ` · ${job.pressDays} day${job.pressDays === 1 ? '' : 's'}` : ''}
            {job.customer ? ` · ${job.customer}` : ''}
          </p>
          {/* A Production task's model [floor planning]: which enquiry, and where it goes after moulding. */}
          {job.forTask && (
            <p className="mt-0.5 truncate text-xs text-accent" title={job.forTask.route}>
              {job.forTask.enquiry ? `${job.forTask.enquiry} · ` : ''}{job.forTask.route}
            </p>
          )}
        </div>
        {job.dueDate && (
          <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold tabular-nums ${job.late ? 'bg-danger-500/15 text-danger-400' : 'bg-line/[0.06] text-steel-300'}`}>
            {job.forTask ? 'Moulding due' : 'Due'} {shortDay(job.dueDate)}{job.late ? ' · late' : ''}
          </span>
        )}
      </div>

      {proposal?.machine && (
        <div className={`mt-2.5 rounded-lg px-2.5 py-2 ${proposal.late ? 'bg-danger-500/[0.08]' : 'bg-aqua-500/[0.08]'}`}>
          <div className="flex items-center justify-between gap-2">
            <p className="min-w-0 text-xs text-steel-200">
              <span className="text-aqua-300" aria-hidden="true">✦ </span>
              Proposed: <span className="font-bold text-steel-50">{proposal.machine.code}</span>
              <span className={proposal.late ? 'text-danger-400' : 'text-steel-400'}> · done {shortDay(proposal.end)}{proposal.late ? ' · late' : ''}</span>
            </p>
            {mayPlan && (
              <button type="button" className="btn-primary shrink-0 px-3 py-1.5 text-xs" disabled={busy} onClick={() => onPlace(proposal.machine)}>Confirm</button>
            )}
          </div>
          {proposal.learned?.[0] && <p className="mt-1 truncate text-xs text-aqua-300" title={proposal.learned.join(' · ')}>{proposal.learned[0]}</p>}
        </div>
      )}

      {/* Its best machine, and one tap to put it there [server: pressScore.service]. */}
      {!proposal?.machine && best?.machine && (
        <div className={`mt-2.5 flex items-center justify-between gap-2 rounded-lg px-2.5 py-2 ${best.late ? 'bg-warn-500/[0.08]' : 'bg-success-500/[0.08]'}`}>
          <p className="min-w-0 text-xs text-steel-200" title={best.summary}>
            <span className={best.late ? 'text-warn-400' : 'text-success-400'} aria-hidden="true">★ </span>
            Best: <span className="font-bold text-steel-50">{best.machine.code}</span>
            <span className="text-steel-400"> · done {shortDay(best.end)}{best.late ? ' · late' : ''}</span>
          </p>
          {mayPlan && (
            <button type="button" className="btn-primary shrink-0 px-3 py-1.5 text-xs" disabled={busy} onClick={() => onPlace(best.machine)}>
              Put on {best.machine.code}
            </button>
          )}
        </div>
      )}
      {best && !best.machine && (
        <p className="mt-2.5 rounded-lg bg-danger-500/[0.08] px-2.5 py-2 text-xs text-danger-400">✗ No machine can take it — {best.why}</p>
      )}

      <div className="mt-2.5 flex items-center justify-between gap-2">
        <span className="text-xs text-steel-500">{job.number}</span>
        <div className="flex items-center gap-1.5">
          <button type="button" className="row-action px-2 py-1 text-xs" onClick={onOpen}>Details</button>
          {/* Nothing to choose from when no machine can take the mould. */}
          {mayPlan && best?.machine !== null && (
            <button type="button" aria-pressed={picked} className={`${picked ? 'btn-primary' : 'btn-secondary'} px-3 py-1.5 text-xs`} onClick={onPick}>
              {picked ? 'Cancel' : 'Choose machine'}
            </button>
          )}
        </div>
      </div>
    </article>
  );
}
