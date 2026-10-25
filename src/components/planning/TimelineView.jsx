import { Badge } from '../ui.jsx';
import { formatDate, formatNumber } from '../../utils/format.js';
import { BAR_TONE, RANK_TONE, barSpan, dayHeading, loadShare, rankWords, shortDay } from '../../utils/planningBoard.js';
import Swatch from './Swatch.jsx';

/** While a job is dragged: how this press ranks for it, or why it cannot take it. */
function PressRankTag({ pressId, ranked }) {
  if (!ranked) return null;
  if (ranked.loading) return <p className="mt-1 text-xs text-steel-500">Scoring…</p>;
  const why = ranked.cannot?.[pressId];
  if (why) {
    return (
      <div className="mt-1 text-xs" title={why}>
        <p className="font-semibold text-danger-400">✗ Can’t take it</p>
        <p className="truncate text-steel-400">{why}</p>
      </div>
    );
  }
  const choice = ranked.byPress?.[pressId];
  if (!choice) return null;
  return (
    <p className={`mt-1 inline-flex rounded-md border px-1.5 py-0.5 text-xs font-semibold ${RANK_TONE[choice.rank] || 'border-line/[0.1] text-steel-400'}`} title={choice.summary}>
      {choice.rank === 1 ? '★ ' : ''}{choice.rank <= 3 ? rankWords(choice.rank) : `Score ${choice.score}`} · done {shortDay(choice.end)}{choice.late ? ' · late' : ''}
    </p>
  );
}

/**
 * The timeline [pages/PlanningBoard.jsx]: every machine by day for the next two weeks, its jobs
 * back to back as bars, and the load on each day. A job being moved can be dropped on a row, or
 * the row tapped.
 */
export default function TimelineView({ board, ranked, moving, mayPlan, startDrag, endDrag, onPlace, onOpen, onSortColour }) {
  const columns = `11rem repeat(${board.days.length}, minmax(3.25rem, 1fr))`;
  const dragging = moving;
  const dropOn = (pressId) => {
    const press = board.presses.find((entry) => String(entry.machine._id) === String(pressId));
    if (press) onPlace(press.machine);
  };
  const setOpen = ({ job, press }) => onOpen(job, press);
  const sortByColour = onSortColour;
  return (
          <div className="card overflow-x-auto" role="grid" aria-label="Presses by day">
            <div className="min-w-[56rem]">
              <div className="grid border-b border-line/[0.08] text-xs text-steel-400" style={{ gridTemplateColumns: columns }}>
                <div className="px-3 py-2 font-semibold">Press</div>
                {board.days.map((entry, index) => (
                  <div key={entry.day} className={`px-1 py-2 text-center ${entry.off ? 'bg-line/[0.04] text-steel-600' : ''} ${index === 0 ? 'font-bold text-accent' : ''}`}>{index === 0 ? 'Today' : dayHeading(entry.day)}</div>
                ))}
              </div>
              {board.presses.map((press) => (
                <div
                  key={press.machine._id}
                  className={`border-b border-line/[0.06] ${dragging ? 'transition-colors hover:bg-accent/[0.05]' : ''} ${ranked?.cannot?.[String(press.machine._id)] ? 'opacity-50' : ''} ${ranked?.byPress?.[String(press.machine._id)]?.rank === 1 ? 'bg-success-500/[0.06]' : ''}`}
                  onDragOver={(event) => mayPlan && event.preventDefault()}
                  onDrop={() => dropOn(press.machine._id)}
                  onClick={moving && mayPlan ? () => dropOn(press.machine._id) : undefined}
                  aria-label={press.machine.code}
                >
                  <div className="grid items-center" style={{ gridTemplateColumns: columns }}>
                    <div className="px-3 py-2">
                      <p className="font-semibold text-steel-100">{press.machine.code}{press.machine.tonnage ? <span className="font-normal text-steel-400"> · {press.machine.tonnage}T</span> : null}</p>
                      <p className="text-xs text-steel-500">
                        {press.queue.length} {press.queue.length === 1 ? 'job' : 'jobs'}
                        {press.changeovers ? ` · ${press.changeovers} colour ${press.changeovers === 1 ? 'change' : 'changes'}` : ''}
                      </p>
                      {press.machine.status !== 'idle' && press.machine.status !== 'running' && <Badge tone="danger">{press.machine.status}</Badge>}
                      {dragging && <PressRankTag pressId={String(press.machine._id)} ranked={ranked} />}
                      {mayPlan && press.changeoversIfSorted < press.changeovers && (
                        <button type="button" className="row-action mt-1 block text-xs" onClick={() => sortByColour(press)}>Light to dark · saves {press.changeovers - press.changeoversIfSorted}</button>
                      )}
                    </div>
                    {press.load.map((hours, index) => {
                      const share = loadShare(hours, board.hoursPerDay);
                      return (
                        <div key={board.days[index].day} className={`mx-0.5 h-1.5 self-start rounded-full ${board.days[index].off ? '' : share > 100 ? 'bg-danger-500' : share > 0 ? 'bg-success-500/60' : 'bg-line/[0.06]'}`} title={board.days[index].off ? 'Day off' : `${share}% of the day booked`} />
                      );
                    })}
                  </div>
                  {press.queue.map((job) => {
                    const span = barSpan(job, board.days);
                    return (
                      <div key={job._id} className="grid items-center pb-1" style={{ gridTemplateColumns: columns }}>
                        <div className="truncate px-3 text-xs text-steel-500">{job.sequence ? `${job.sequence}. ` : ''}{job.number}</div>
                        {span ? (
                          <button
                            type="button"
                            draggable={mayPlan}
                            onDragStart={startDrag(job)}
                            onDragEnd={endDrag}
                            onClick={(event) => { event.stopPropagation(); setOpen({ job, press: press.machine }); }}
                            className={`truncate rounded-md px-2 py-1 text-left text-xs font-semibold ${BAR_TONE[job.status] || 'bg-steel-500/70 text-white'} ${job.late ? 'ring-2 ring-danger-500' : job.predictedLate ? 'ring-2 ring-warn-500' : ''} ${span.clippedLeft ? 'rounded-l-none' : ''} ${span.clippedRight ? 'rounded-r-none' : ''}`}
                            style={{ gridColumn: `${span.from + 2} / ${span.to + 3}` }}
                            title={`${job.number} · ${job.colour || ''} · ${formatNumber(job.toMake)} pcs${job.late ? ' · ends after the due date' : job.predictedLate ? ' · history predicts it ends after the due date' : ''}`}
                          >
                            <span className="inline-flex items-center gap-1.5"><Swatch colour={job.colour} className="h-2.5 w-2.5" />{job.fit?.warnings?.length || job.short?.length ? '⚠ ' : ''}{job.mould?.mouldCode || job.modelNumber} · {job.colour || '—'} · {formatNumber(job.toMake)}</span>
                          </button>
                        ) : (
                          <button type="button" className="row-action text-left text-xs" style={{ gridColumn: '2 / -1' }} onClick={(event) => { event.stopPropagation(); setOpen({ job, press: press.machine }); }}>
                            {job.plannedStart ? `Outside these days — ${formatDate(job.plannedStart)}` : 'Not dated yet'} · {job.mould?.mouldCode || job.modelNumber}
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
              ))}
              {board.presses.length === 0 && <p className="p-4 text-sm text-steel-500">No presses yet. Add them on the Machines page.</p>}
            </div>
          </div>
  );
}
