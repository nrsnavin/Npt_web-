import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { production as productionApi, workOrdersApi } from '../api/endpoints.js';
import { useAuth } from '../context/AuthContext.jsx';
import { Badge, ErrorState, Field, FormError, Modal, Notice, PageHeader, Spinner } from '../components/ui.jsx';
import MachineSelect from '../components/MachineSelect.jsx';
import { useToast } from '../context/ToastContext.jsx';
import { formatDate, formatNumber } from '../utils/format.js';
import { BAR_TONE, barSpan, dayHeading, loadShare } from '../utils/planningBoard.js';

/** One job opened from the board: where it is, what the fit says, and what can be done. */
function JobDialog({ job, press, mayPlan, onClose, onChanged }) {
  const { toast, warn } = useToast();
  const [machine, setMachine] = useState(press?._id || '');
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState(null);
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
        </dl>
        {job.fit?.blocks?.length > 0 && <Notice tone="danger">{job.fit.blocks.join(' · ')}</Notice>}
        {job.fit?.warnings?.length > 0 && <Notice tone="warn">{job.fit.warnings.join(' · ')}</Notice>}
        {job.short?.length > 0 && <Notice tone="warn">Will run short: {job.short.map((item) => `${item.name} ${formatNumber(item.short)} ${item.unit}`).join(' · ')} — <Link to="/production/materials" className="underline">material needs</Link></Notice>}
        {problem && <FormError error={problem} />}
        {mayPlan && (
          <>
            <div className="flex flex-wrap items-end gap-2">
              <Field label="Press" className="min-w-[14rem] flex-1"><MachineSelect value={machine} onChange={setMachine} emptyLabel="Take it off the press" /></Field>
              <button type="button" className="btn-primary" disabled={busy || machine === (press?._id || '')} onClick={() => send({ machine: machine || null }, machine ? 'Moved' : 'Taken off the press')}>
                {machine ? 'Move here' : 'Take off'}
              </button>
            </div>
            {press && (
              <div className="flex flex-wrap gap-2">
                <button type="button" className="btn-secondary" disabled={busy || job.sequence <= 1} onClick={() => send({ step: -1 }, 'Runs earlier')}>Run earlier</button>
                <button type="button" className="btn-secondary" disabled={busy} onClick={() => send({ step: 1 }, 'Runs later')}>Run later</button>
                {job.status === 'planned' && <button type="button" className="btn-secondary" disabled={busy} onClick={() => send({ move: 'release' }, 'Released to the floor')}>Release to the floor</button>}
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

/**
 * The planning board [server: planning.service]: every press by day for the next two weeks, its
 * work orders back to back, the load on each day, and the work orders not on a press yet. Drag a
 * job onto a press to plan it there — a mould the press cannot hold is refused — and put a press
 * light to dark to cut colour changes.
 */
export default function PlanningBoard() {
  const { canWrite } = useAuth();
  const mayPlan = canWrite('production');
  const { toast, warn } = useToast();
  const [board, setBoard] = useState(null);
  const [error, setError] = useState(null);
  const [open, setOpen] = useState(null);
  const [dragging, setDragging] = useState(null);
  const load = useCallback(() => productionApi.plan().then((value) => { setBoard(value); setError(null); }).catch(setError), []);
  useEffect(() => { load(); }, [load]);

  const dropOn = async (pressId) => {
    const job = dragging;
    setDragging(null);
    if (!job || !mayPlan) return;
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
        subtitle="Which press makes which work order, day by day. Drag a job onto a press to plan it."
        actions={(
          <>
            <Link to="/work-orders" className="btn-secondary">Work orders</Link>
            <Link to="/production/materials" className="btn-secondary">Material needs</Link>
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
                  onDragStart={() => setDragging(job)}
                  onClick={() => setOpen({ job, press: null })}
                  className={`rounded-lg border px-2.5 py-1.5 text-left text-xs ${job.late ? 'border-danger-500/50 bg-danger-500/[0.07]' : 'border-line/[0.1] bg-line/[0.03]'}`}
                >
                  <span className="font-semibold text-steel-100">{job.mould?.mouldCode || job.modelNumber}</span>
                  <span className="text-steel-400"> · {job.colour || '—'} · {formatNumber(job.toMake)} pcs{job.pressDays ? ` · ${job.pressDays} d` : ''}</span>
                  <span className={`block ${job.late ? 'text-danger-400' : 'text-steel-500'}`}>{job.number}{job.dueDate ? ` · due ${formatDate(job.dueDate)}` : ''}</span>
                </button>
              ))}
            </div>
          </section>

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
                  className={`border-b border-line/[0.06] ${dragging ? 'transition-colors hover:bg-accent/[0.05]' : ''}`}
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
                            onDragStart={() => setDragging(job)}
                            onClick={() => setOpen({ job, press: press.machine })}
                            className={`truncate rounded-md px-2 py-1 text-left text-xs font-semibold ${BAR_TONE[job.status] || 'bg-steel-500/70 text-white'} ${job.late ? 'ring-2 ring-danger-500' : ''} ${span.clippedLeft ? 'rounded-l-none' : ''} ${span.clippedRight ? 'rounded-r-none' : ''}`}
                            style={{ gridColumn: `${span.from + 2} / ${span.to + 3}` }}
                            title={`${job.number} · ${job.colour || ''} · ${formatNumber(job.toMake)} pcs${job.late ? ' · ends after the due date' : ''}`}
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
          <p className="text-xs text-steel-500">Bars are coloured by status; a red ring means the plan ends after the due date; ⚠ means a warning on the press or mould, or a store that will run short. The thin line under each press is its daily load — red is double-booked.</p>
        </>
      )}
      {open && <JobDialog job={open.job} press={open.press} mayPlan={mayPlan} onClose={() => setOpen(null)} onChanged={load} />}
    </div>
  );
}
