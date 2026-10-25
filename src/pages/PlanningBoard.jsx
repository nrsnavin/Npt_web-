import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { production as productionApi, workOrdersApi } from '../api/endpoints.js';
import { useAuth } from '../context/AuthContext.jsx';
import { Badge, ErrorState, Field, FormError, Modal, Notice, PageHeader, Spinner } from '../components/ui.jsx';
import MachineSelect from '../components/MachineSelect.jsx';
import PressChoices from '../components/PressChoices.jsx';
import { useToast } from '../context/ToastContext.jsx';
import { formatDate, formatNumber } from '../utils/format.js';
import { BAR_TONE, RANK_TONE, barSpan, dayHeading, indexChoices, loadShare, rankWords, shortDay } from '../utils/planningBoard.js';

/** One job opened from the board: where it is, what the fit says, and what can be done. */
function JobDialog({ job, press, mayPlan, mayRun, onClose, onChanged }) {
  const { toast, warn } = useToast();
  const [machine, setMachine] = useState(press?._id || '');
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState(null);
  /* Every press scored for this job, best first [server: pressScore.service] — not for a job already running. */
  const [ranked, setRanked] = useState(null);
  const [rankError, setRankError] = useState(null);
  const ranks = mayPlan && job.status !== 'running';
  useEffect(() => {
    if (!ranks) return undefined;
    let live = true;
    productionApi.choices(job._id).then((value) => live && setRanked(value)).catch((failure) => live && setRankError(failure));
    return () => { live = false; };
  }, [job._id, ranks]);
  const send = async (body, done) => {
    setBusy(true);
    setProblem(null);
    try {
      const answer = await workOrdersApi.plan({ id: job._id, updatedAt: job.updatedAt, ...body });
      toast(done, `${job.number}${answer?.machine?.code ? ` on ${answer.machine.code}` : ''}`);
      onChanged();
      onClose();
    } catch (failure) {
      setProblem(failure);
      setBusy(false);
      if (failure?.status === 409) warn('Someone changed it first', 'The board has been reloaded.');
    }
  };
  return (
    <Modal open onClose={onClose} title={`${job.number} · ${job.mould?.mouldCode || job.modelNumber || ''}`} description={[job.customer, job.order, job.colour].filter(Boolean).join(' · ')}>
      <div className="space-y-4">
        <dl className="grid grid-cols-2 gap-3 text-sm">
          <div><dt className="text-xs text-steel-500">To make</dt><dd className="text-steel-100">{formatNumber(job.toMake)} of {formatNumber(job.quantity)}</dd></div>
          <div><dt className="text-xs text-steel-500">Press days</dt><dd className="text-steel-100">{job.pressDays ?? '—'}{job.perDay ? ` at ${formatNumber(job.perDay)} a day` : ''}</dd></div>
          <div><dt className="text-xs text-steel-500">Planned</dt><dd className="text-steel-100">{job.plannedStart ? `${formatDate(job.plannedStart)} to ${formatDate(job.plannedEnd)}` : 'Not on a press'}</dd></div>
          <div><dt className="text-xs text-steel-500">Due</dt><dd className={job.late ? 'font-semibold text-danger-400' : 'text-steel-100'}>{job.dueDate ? formatDate(job.dueDate) : '—'}{job.late ? ' — the plan ends after it' : ''}</dd></div>
          {job.predictedEnd && (
            <div className="col-span-2">
              <dt className="text-xs text-steel-500">History predicts</dt>
              <dd className={job.predictedLate ? 'font-semibold text-warn-400' : 'text-steel-100'}>
                {formatDate(job.predictedEnd)}{job.slip > 1 ? ` — this mould runs ${Math.round((job.slip - 1) * 100)}% over standard` : ' — on standard'}{job.predictedLate && !job.late ? '; after the due date' : ''}
              </dd>
            </div>
          )}
        </dl>
        {job.fit?.blocks?.length > 0 && <Notice tone="danger">{job.fit.blocks.join(' · ')}</Notice>}
        {job.fit?.warnings?.length > 0 && <Notice tone="warn">{job.fit.warnings.join(' · ')}</Notice>}
        {job.short?.length > 0 && <Notice tone="warn">Will run short: {job.short.map((item) => `${item.name} ${formatNumber(item.short)} ${item.unit}`).join(' · ')} — <Link to="/production/materials" className="underline">material needs</Link></Notice>}
        {problem && <FormError error={problem} />}
        {/* Planning (press, order, release) is the Production in charge's; starting the run and the job card, the floor's. */}
        {(mayPlan || mayRun) && (
          <>
            {ranks && (
              <section aria-label="Which press" className="space-y-2">
                <p className="text-sm font-semibold text-steel-100">{press ? 'Is there a better press?' : 'Which press?'}</p>
                {!ranked && !rankError && <Spinner label="Scoring the presses" />}
                {rankError && <p className="text-xs text-danger-400">{rankError.message}</p>}
                <PressChoices result={ranked} currentPressId={press?._id} busy={busy} onPick={(choice) => send({ machine: choice.machine._id }, 'Planned')} />
              </section>
            )}
            {mayPlan && <div className="flex flex-wrap items-end gap-2">
              <Field label="Or pick any press" className="min-w-[14rem] flex-1"><MachineSelect value={machine} onChange={setMachine} emptyLabel="Take it off the press" /></Field>
              <button type="button" className="btn-primary" disabled={busy || machine === (press?._id || '')} onClick={() => send({ machine: machine || null }, machine ? 'Moved' : 'Taken off the press')}>
                {machine ? 'Move here' : 'Take off'}
              </button>
            </div>}
            {press && (
              <div className="flex flex-wrap gap-2">
                {mayPlan && <button type="button" className="btn-secondary" disabled={busy || job.sequence <= 1} onClick={() => send({ step: -1 }, 'Runs earlier')}>Run earlier</button>}
                {mayPlan && <button type="button" className="btn-secondary" disabled={busy} onClick={() => send({ step: 1 }, 'Runs later')}>Run later</button>}
                {mayPlan && job.status === 'planned' && <button type="button" className="btn-secondary" disabled={busy} onClick={() => send({ move: 'release' }, 'Released to the floor')}>Release to the floor</button>}
                {['planned', 'released', 'paused'].includes(job.status) && <Link className="btn-secondary" to={`/mould-runs?start=1&workOrder=${job._id}`}>Start the run</Link>}
                <button type="button" className="btn-secondary" onClick={() => workOrdersApi.jobCard(job._id)}>Job card</button>
              </div>
            )}
          </>
        )}
      </div>
    </Modal>
  );
}

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
 * The planning board [server: planning.service]: every press by day for the next two weeks, its
 * work orders back to back, the load on each day, and the work orders not on a press yet. Drag a
 * job onto a press to plan it there — a mould the press cannot hold is refused — and put a press
 * light to dark to cut colour changes.
 */
export default function PlanningBoard() {
  const { canWrite, mayPlanProduction } = useAuth();
  /* The board is planned by the Production in charge (or Admin) [server: requireProductionInCharge]; the floor runs it. */
  const mayRun = canWrite('production');
  const mayPlan = mayRun && mayPlanProduction;
  const { toast, warn } = useToast();
  const [board, setBoard] = useState(null);
  const [error, setError] = useState(null);
  const [open, setOpen] = useState(null);
  const [dragging, setDragging] = useState(null);
  /* The presses ranked for the job being dragged, so each row says Best / 2nd / 3rd / can't. */
  const [ranked, setRanked] = useState(null);
  const startDrag = (job) => (event) => {
    setDragging(job);
    try {
      event.dataTransfer.setData('text/plain', String(job._id));
      event.dataTransfer.effectAllowed = 'move';
    } catch { /* some browsers refuse data on a button; the drag still works */ }
    if (job.status === 'running') return setRanked(null);
    setRanked({ jobId: job._id, loading: true });
    productionApi.choices(job._id)
      .then((value) => setRanked((current) => (current?.jobId === job._id ? { jobId: job._id, ...indexChoices(value) } : current)))
      .catch(() => setRanked(null));
    return undefined;
  };
  const endDrag = () => {
    setDragging(null);
    setRanked(null);
  };
  const load = useCallback(() => productionApi.plan().then((value) => { setBoard(value); setError(null); }).catch(setError), []);
  useEffect(() => { load(); }, [load]);

  const dropOn = async (pressId) => {
    const job = dragging;
    const why = pressId && ranked?.cannot?.[String(pressId)];
    endDrag();
    if (!job || !mayPlan) return;
    /* Said at once, without asking the server: the ranking already knows this press cannot hold the mould. */
    if (why) {
      warn(`${job.number} not moved`, why);
      return;
    }
    try {
      const answer = await workOrdersApi.plan({ id: job._id, updatedAt: job.updatedAt, machine: pressId });
      toast(`${job.number} planned`, answer?.machine?.code ? `On ${answer.machine.code}` : '');
    } catch (failure) {
      warn(`${job.number} not moved`, failure.message);
    }
    load();
  };
  const sortByColour = async (press) => {
    try {
      const result = await productionApi.sequenceByColour(press.machine._id);
      toast(`${press.machine.code} put light to dark`, `${result.before} colour changes down to ${result.after}`);
    } catch (failure) {
      warn('Not sorted', failure.message);
    }
    load();
  };

  const columns = board ? `11rem repeat(${board.days.length}, minmax(3.25rem, 1fr))` : '';
  return (
    <div className="space-y-5">
      <PageHeader
        title="Planning board"
        subtitle="Which press makes which work order, day by day. Drag a job onto a press — the board marks the best presses for it — or tap a job to see its best presses."
        actions={(
          <>
            <Link to="/work-orders" className="btn-secondary">Work orders</Link>
            <Link to="/production/materials" className="btn-secondary">Material needs</Link>
            <Link to="/production/insights" className="btn-secondary">Suggest a schedule</Link>
            <Link to="/machines" className="btn-secondary">Plant hours</Link>
          </>
        )}
      />
      {error && <ErrorState error={error} onRetry={load} />}
      {!board && !error && <Spinner label="Loading the board" />}
      {board && (
        <>
          <section aria-label="Not on a press yet" className="card p-4" onDragOver={(event) => mayPlan && event.preventDefault()} onDrop={() => dropOn(null)}>
            <p className="mb-2 text-sm font-semibold text-steel-100">Not on a press yet <span className="font-normal text-steel-400">· {board.unplanned.length}</span></p>
            {board.unplanned.length === 0 && <p className="text-xs text-steel-500">Every open work order is on a press.</p>}
            <div className="flex flex-wrap gap-2">
              {board.unplanned.map((job) => (
                <button
                  key={job._id}
                  type="button"
                  draggable={mayPlan}
                  onDragStart={startDrag(job)}
                  onDragEnd={endDrag}
                  onClick={() => setOpen({ job, press: null })}
                  className={`rounded-lg border px-2.5 py-1.5 text-left text-xs ${job.late ? 'border-danger-500/50 bg-danger-500/[0.07]' : 'border-line/[0.1] bg-line/[0.03]'}`}
                >
                  <span className="font-semibold text-steel-100">{job.mould?.mouldCode || job.modelNumber}</span>
                  <span className="text-steel-400"> · {job.colour || '—'} · {formatNumber(job.toMake)} pcs{job.pressDays ? ` · ${job.pressDays} d` : ''}</span>
                  <span className={`block ${job.late ? 'text-danger-400' : 'text-steel-500'}`}>{job.number}{job.dueDate ? ` · due ${formatDate(job.dueDate)}` : ''}</span>
                  {/* The best press for it, scored [server: pressScore.service]. */}
                  {job.best?.machine && (
                    <span className={`block font-semibold ${job.best.late ? 'text-warn-400' : 'text-success-400'}`} title={job.best.summary}>
                      ★ Best: {job.best.machine.code} · done {shortDay(job.best.end)}{job.best.late ? ' · late' : ''}
                    </span>
                  )}
                  {job.best && !job.best.machine && <span className="block max-w-[16rem] truncate font-semibold text-danger-400" title={job.best.why}>✗ No press can take it — {job.best.why}</span>}
                </button>
              ))}
            </div>
          </section>

          {dragging && ranked && !ranked.loading && (
            <div className="sticky top-0 z-10">
              <Notice tone={ranked.best ? 'info' : 'warn'}>
                {ranked.best
                  ? <>Drop <span className="font-semibold">{dragging.number}</span> on a press. <span className="font-semibold">★ Best: {ranked.best.machine.code}</span> — {ranked.best.summary}</>
                  : ranked.why || `No press can hold ${dragging.mould?.mouldCode || 'this mould'}.`}
              </Notice>
            </div>
          )}
          <div className="card overflow-x-auto" role="grid" aria-label="Presses by day">
            <div className="min-w-[56rem]">
              <div className="grid border-b border-line/[0.08] text-xs text-steel-400" style={{ gridTemplateColumns: columns }}>
                <div className="px-3 py-2 font-semibold">Press</div>
                {board.days.map((entry) => (
                  <div key={entry.day} className={`px-1 py-2 text-center ${entry.off ? 'bg-line/[0.04] text-steel-600' : ''}`}>{dayHeading(entry.day)}</div>
                ))}
              </div>
              {board.presses.map((press) => (
                <div
                  key={press.machine._id}
                  className={`border-b border-line/[0.06] ${dragging ? 'transition-colors hover:bg-accent/[0.05]' : ''} ${ranked?.cannot?.[String(press.machine._id)] ? 'opacity-50' : ''} ${ranked?.byPress?.[String(press.machine._id)]?.rank === 1 ? 'bg-success-500/[0.06]' : ''}`}
                  onDragOver={(event) => mayPlan && event.preventDefault()}
                  onDrop={() => dropOn(press.machine._id)}
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
                            onClick={() => setOpen({ job, press: press.machine })}
                            className={`truncate rounded-md px-2 py-1 text-left text-xs font-semibold ${BAR_TONE[job.status] || 'bg-steel-500/70 text-white'} ${job.late ? 'ring-2 ring-danger-500' : job.predictedLate ? 'ring-2 ring-warn-500' : ''} ${span.clippedLeft ? 'rounded-l-none' : ''} ${span.clippedRight ? 'rounded-r-none' : ''}`}
                            style={{ gridColumn: `${span.from + 2} / ${span.to + 3}` }}
                            title={`${job.number} · ${job.colour || ''} · ${formatNumber(job.toMake)} pcs${job.late ? ' · ends after the due date' : job.predictedLate ? ' · history predicts it ends after the due date' : ''}`}
                          >
                            {job.fit?.warnings?.length || job.short?.length ? '⚠ ' : ''}{job.mould?.mouldCode || job.modelNumber} · {job.colour || '—'} · {formatNumber(job.toMake)}
                          </button>
                        ) : (
                          <button type="button" className="row-action text-left text-xs" style={{ gridColumn: '2 / -1' }} onClick={() => setOpen({ job, press: press.machine })}>
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
          <p className="text-xs text-steel-500">Bars are coloured by status; a red ring means the plan ends after the due date, an amber one that the mould's own history predicts it will; ⚠ means a warning on the press or mould, or a store that will run short. The thin line under each press is its daily load — red is double-booked. While you drag a job, each press says how it ranks for it (★ Best, 2nd, 3rd) or that it can’t take the mould.</p>
        </>
      )}
      {open && <JobDialog job={open.job} press={open.press} mayPlan={mayPlan} mayRun={mayRun} onClose={() => setOpen(null)} onChanged={load} />}
    </div>
  );
}
