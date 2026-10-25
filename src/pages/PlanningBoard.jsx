import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { production as productionApi, workOrdersApi } from '../api/endpoints.js';
import { useAuth } from '../context/AuthContext.jsx';
import { loadPlant } from '../utils/plantSettings.js';
import { ErrorState, Field, FormError, Modal, Notice, PageHeader, Spinner } from '../components/ui.jsx';
import MachineSelect from '../components/MachineSelect.jsx';
import PressChoices from '../components/PressChoices.jsx';
import { useToast } from '../context/ToastContext.jsx';
import { formatDate, formatNumber } from '../utils/format.js';
import { boardStats, byBay, indexChoices, pressSummary, shortDay, sortWaiting } from '../utils/planningBoard.js';
import JobCard from '../components/planning/JobCard.jsx';
import PressCard from '../components/planning/PressCard.jsx';
import Swatch from '../components/planning/Swatch.jsx';
import TimelineView from '../components/planning/TimelineView.jsx';

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


/** Which view the board opens on, remembered on this device. */
const VIEW_KEY = 'npt.planningBoard.view';
const savedView = () => {
  try { return window.localStorage.getItem(VIEW_KEY) === 'timeline' ? 'timeline' : 'machines'; } catch { return 'machines'; }
};

/** A figure across the top that is also the filter it describes. */
function StatTile({ label, value, hint, tone = 'text-steel-50', active, onClick }) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={`rounded-2xl border bg-ink-850 px-4 py-3 text-left shadow-raised transition duration-150 hover:-translate-y-0.5 hover:border-accent/40 ${active ? 'border-accent ring-2 ring-accent/40' : 'border-line/[0.08]'}`}
    >
      <p className="text-xs font-semibold uppercase tracking-wide text-steel-400">{label}</p>
      <p className={`mt-1 text-2xl font-bold tabular-nums tracking-tight ${tone}`}>{value}</p>
      {hint && <p className="text-xs text-steel-500">{hint}</p>}
    </button>
  );
}

/**
 * The planning board [server: planning.service, pressScore.service] — which machine makes which
 * job. Simple on purpose: the jobs waiting for a machine on the left, the machines on the right.
 *
 *   Place a job three ways: "Put on IM-05" (its best machine, one tap, with Undo); "Choose
 *   machine" then tap a machine; or drag the job onto a machine. While a job is being moved every
 *   machine says how it ranks for it — ★ Best, 2nd, 3rd — or that it cannot take the mould.
 *   Machines   one card a machine, grouped by bay: what is running and how far along, what is
 *              next, when it is free.
 *   Timeline   the same machines day by day for two weeks, for whoever wants the dates.
 */
export default function PlanningBoard() {
  const { canWrite, mayPlanProduction } = useAuth();
  /* The board is planned by the Production in charge (or Admin) [server: requireProductionInCharge]; the floor runs it. */
  const mayRun = canWrite('production');
  const mayPlan = mayRun && mayPlanProduction;
  const { toast, warn, undoable } = useToast();
  const [board, setBoard] = useState(null);
  const [error, setError] = useState(null);
  const [open, setOpen] = useState(null);
  const [view, setView] = useState(savedView);
  const [busy, setBusy] = useState(false);
  /* The job being moved: dragged, or picked with "Choose machine". */
  const [dragging, setDragging] = useState(null);
  const [picked, setPicked] = useState(null);
  const moving = dragging || picked;
  /* The machines ranked for the job being moved, so each says Best / 2nd / 3rd / can't. */
  const [ranked, setRanked] = useState(null);
  const [wall, setWall] = useState('all');
  const [search, setSearch] = useState('');
  const [order, setOrder] = useState('late');
  const [lateOnly, setLateOnly] = useState(false);
  const wallRef = useRef(null);

  /* Admin's switch [Profile → Production floor planning]: off, Production tasks are not on this board. */
  const [floorPlanning, setFloorPlanning] = useState(null);
  useEffect(() => { loadPlant().then((plant) => setFloorPlanning(Boolean(plant?.floorPlanning))); }, []);
  const load = useCallback(() => productionApi.plan().then((value) => { setBoard(value); setError(null); }).catch(setError), []);
  useEffect(() => { load(); }, [load]);
  const choose = (next) => {
    setView(next);
    try { window.localStorage.setItem(VIEW_KEY, next); } catch { /* a private window keeps it for the visit */ }
  };

  const rank = (job) => {
    if (!job || job.status === 'running') return setRanked(null);
    setRanked({ jobId: job._id, loading: true });
    productionApi.choices(job._id)
      .then((value) => setRanked((current) => (current?.jobId === job._id ? { jobId: job._id, ...indexChoices(value) } : current)))
      .catch(() => setRanked(null));
    return undefined;
  };
  const stopMoving = () => {
    setDragging(null);
    setPicked(null);
    setRanked(null);
  };
  /* Escape puts a picked job down. */
  useEffect(() => {
    if (!picked) return undefined;
    const onKey = (event) => { if (event.key === 'Escape') stopMoving(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [picked]);
  const startDrag = (job) => (event) => {
    setPicked(null);
    setDragging(job);
    try {
      event.dataTransfer.setData('text/plain', String(job._id));
      event.dataTransfer.effectAllowed = 'move';
    } catch { /* some browsers refuse data on a button; the drag still works */ }
    rank(job);
  };
  /* A drop clears the drag itself; a drag let go anywhere else only forgets it a moment later. */
  const endDrag = () => setTimeout(() => setDragging((current) => (current ? null : current)), 0);
  const pick = (job) => {
    if (picked?._id === job._id) return stopMoving();
    setPicked(job);
    rank(job);
    /* On a phone the machines are below the list: bring them into view. */
    if (window.innerWidth < 1024) setTimeout(() => wallRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50);
    return undefined;
  };

  /** Puts the job being moved (or `job`) on a machine, with an Undo that puts it back. */
  const place = async (machine, job = moving) => {
    if (!job || !mayPlan) return;
    const why = ranked?.jobId === job._id ? ranked.cannot?.[String(machine._id)] : null;
    stopMoving();
    /* Said at once, without asking the server: the ranking already knows this machine cannot hold the mould. */
    if (why) {
      warn(`${job.number} not moved`, why);
      return;
    }
    const from = job.machine?._id || job.machine || null;
    if (from && String(from) === String(machine._id)) return;
    setBusy(true);
    try {
      const answer = await workOrdersApi.plan({ id: job._id, updatedAt: job.updatedAt, machine: machine._id });
      undoable(`${job.number} is on ${machine.code}`, {
        detail: `${job.mould?.mouldCode || job.modelNumber || ''} · ${job.colour || ''}`.trim(),
        onAction: async () => {
          try {
            await workOrdersApi.plan({ id: job._id, updatedAt: answer.updatedAt, machine: from });
            toast('Put back', from ? 'On its machine again' : 'Waiting for a machine again');
          } catch (failure) {
            warn('Could not put it back', failure.message);
          }
          load();
        },
      });
    } catch (failure) {
      warn(`${job.number} not moved`, failure.message);
    } finally {
      setBusy(false);
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

  const stats = board ? boardStats(board) : null;
  const waiting = board ? sortWaiting(board.unplanned, { search, order, lateOnly }) : [];
  const summaries = board ? new Map(board.presses.map((press) => [String(press.machine._id), pressSummary(press)])) : new Map();
  const shown = board ? board.presses.filter((press) => wall === 'all' || summaries.get(String(press.machine._id)).state === wall
    || (wall === 'down' && summaries.get(String(press.machine._id)).state === 'service')) : [];
  const toggleWall = (value) => setWall((current) => (current === value ? 'all' : value));

  return (
    <div className="space-y-5">
      <PageHeader
        title="Planning board"
        subtitle="Put each waiting job on a machine. Tap “Put on…” for the best machine, or pick a machine yourself."
        actions={(
          <>
            <div role="group" aria-label="View" className="inline-flex rounded-xl border border-line/[0.1] bg-ink-850 p-1 shadow-raised">
              {[['machines', 'Machines'], ['timeline', 'Timeline']].map(([value, label]) => (
                <button key={value} type="button" aria-pressed={view === value} onClick={() => choose(value)}
                  className={`rounded-lg px-3.5 py-1.5 text-sm font-semibold transition ${view === value ? 'bg-accent text-white shadow-raised' : 'text-steel-300 hover:text-steel-50'}`}>
                  {label}
                </button>
              ))}
            </div>
            <Link to="/production/insights" className="btn-secondary">Suggest a schedule</Link>
            <Link to="/machines" className="btn-secondary">Machines &amp; hours</Link>
          </>
        )}
      />
      {floorPlanning === false && (
        <Notice tone="info">Production floor planning is off — Production tasks run as before and are not put on presses here. An Admin turns it on in Profile.</Notice>
      )}
      {error && <ErrorState error={error} onRetry={load} />}
      {!board && !error && <Spinner label="Loading the board" />}
      {board && (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <StatTile label="Running" value={`${stats.running} of ${stats.presses}`} hint="Machines making a job now" tone="text-success-400" active={wall === 'running'} onClick={() => toggleWall('running')} />
            <StatTile label="Free" value={stats.free} hint={stats.down ? `${stats.down} stopped` : 'Ready for a job'} active={wall === 'free'} onClick={() => toggleWall('free')} />
            <StatTile label="Waiting for a machine" value={stats.waiting} hint="Jobs not on a machine yet" active={false} onClick={() => { setLateOnly(false); setSearch(''); setWall('all'); }} />
            <StatTile label="Late" value={stats.late} hint="Will end after the due date" tone={stats.late ? 'text-danger-400' : 'text-steel-50'} active={lateOnly} onClick={() => setLateOnly(!lateOnly)} />
          </div>

          {/* The job being moved, its best machine, and the way out. */}
          {moving && (
            <div className="sticky top-2 z-20 animate-fade-up">
              <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-accent/40 bg-ink-800/95 px-4 py-3 shadow-float backdrop-blur">
                <Swatch colour={moving.colour} className="h-4 w-4" />
                <p className="min-w-0 flex-1 text-sm text-steel-200">
                  <span className="font-bold text-steel-50">Moving {moving.mould?.mouldCode || moving.number}</span>
                  <span className="text-steel-400"> · {moving.colour}<span className="hidden sm:inline"> · {formatNumber(moving.toMake)} pcs</span> — {dragging ? 'drop it on a machine' : 'tap a machine'}.</span>
                  {ranked?.loading && <span className="text-steel-500"> Finding the best machine…</span>}
                  {ranked?.best && (
                    <span className="block text-xs text-steel-400">
                      <span className="font-semibold text-success-400">★ Best: {ranked.best.machine.code}</span>
                      <span className="sm:hidden"> · done {shortDay(ranked.best.end)}{ranked.best.late ? ' · late' : ''}</span>
                      <span className="hidden sm:inline"> — {ranked.best.summary}</span>
                    </span>
                  )}
                  {ranked && !ranked.loading && !ranked.best && <span className="block text-xs text-danger-400">{ranked.why || 'No machine can take this mould.'}</span>}
                </p>
                {picked && ranked?.best && (
                  <button type="button" className="btn-primary px-3 py-1.5 text-sm" disabled={busy} onClick={() => place(ranked.best.machine)}>Put on {ranked.best.machine.code}</button>
                )}
                {picked && <button type="button" className="btn-secondary px-3 py-1.5 text-sm" onClick={stopMoving}>Cancel</button>}
              </div>
            </div>
          )}

          {view === 'machines' ? (
            <div className="grid gap-5 lg:grid-cols-[minmax(19rem,22rem)_1fr]">
              {/* Left: the jobs waiting for a machine. */}
              <section aria-label="Waiting for a machine" className="space-y-3 lg:sticky lg:top-4 lg:max-h-[calc(100vh-2rem)] lg:self-start lg:overflow-y-auto lg:pr-1">
                <div className="flex items-center justify-between">
                  <h2 className="text-base font-bold text-steel-50">Waiting for a machine <span className="ml-1 rounded-full bg-line/[0.08] px-2 py-0.5 text-xs font-semibold text-steel-300">{board.unplanned.length}</span></h2>
                </div>
                {board.unplanned.length > 0 && (
                  <div className="space-y-2">
                    <input type="search" className="input" placeholder="Search mould, colour, buyer…" aria-label="Search the waiting jobs" value={search} onChange={(event) => setSearch(event.target.value)} />
                    <div role="group" aria-label="Order" className="flex flex-wrap gap-1.5">
                      {[['late', 'Late first'], ['due', 'Due date'], ['big', 'Biggest']].map(([value, label]) => (
                        <button key={value} type="button" aria-pressed={order === value} onClick={() => setOrder(value)}
                          className={`rounded-full border px-3 py-1 text-xs font-semibold transition ${order === value ? 'border-accent/60 bg-accent/15 text-accent' : 'border-line/[0.1] text-steel-300 hover:border-accent/40'}`}>
                          {label}
                        </button>
                      ))}
                      {lateOnly && <button type="button" onClick={() => setLateOnly(false)} className="rounded-full border border-danger-500/50 bg-danger-500/10 px-3 py-1 text-xs font-semibold text-danger-400">Late only ✕</button>}
                    </div>
                  </div>
                )}
                {board.unplanned.length === 0 && (
                  <div className="rounded-2xl border border-dashed border-line/[0.12] px-4 py-8 text-center">
                    <p className="text-2xl" aria-hidden="true">✓</p>
                    <p className="text-sm font-semibold text-steel-100">Every job is on a machine</p>
                    <p className="text-xs text-steel-500">New work orders appear here when an order is released.</p>
                  </div>
                )}
                {board.unplanned.length > 0 && waiting.length === 0 && <p className="text-sm text-steel-500">Nothing matches — clear the search.</p>}
                <div className="space-y-2.5">
                  {waiting.map((job) => (
                    <JobCard
                      key={job._id}
                      job={job}
                      picked={picked?._id === job._id}
                      mayPlan={mayPlan}
                      busy={busy}
                      onPick={() => pick(job)}
                      onOpen={() => setOpen({ job, press: null })}
                      onPlace={(machine) => place(machine, job)}
                      onDragStart={startDrag(job)}
                      onDragEnd={endDrag}
                    />
                  ))}
                </div>
              </section>

              {/* Right: the machines, by bay. */}
              <section ref={wallRef} aria-label="Machines" className="scroll-mt-24 space-y-5">
                {wall !== 'all' && (
                  <p className="text-sm text-steel-400">Showing {wall === 'down' ? 'stopped' : wall} machines only · <button type="button" className="row-action text-sm" onClick={() => setWall('all')}>Show all</button></p>
                )}
                {board.presses.length === 0 && (
                  <div className="rounded-2xl border border-dashed border-line/[0.12] px-4 py-10 text-center">
                    <p className="text-sm font-semibold text-steel-100">No machines yet</p>
                    <Link to="/machines" className="btn-primary mt-3 inline-flex">Add your machines</Link>
                  </div>
                )}
                {byBay(shown).map(({ bay, presses }) => (
                  <div key={bay || 'none'} className="space-y-2.5">
                    <h3 className="text-xs font-bold uppercase tracking-wider text-steel-400">{bay || 'No bay set'} <span className="font-semibold text-steel-500">· {presses.length}</span></h3>
                    <div className="grid gap-3 [grid-template-columns:repeat(auto-fill,minmax(15.5rem,1fr))]">
                      {presses.map((press) => (
                        <PressCard
                          key={press.machine._id}
                          press={press}
                          summary={summaries.get(String(press.machine._id))}
                          moving={moving}
                          choice={ranked?.byPress?.[String(press.machine._id)]}
                          cannot={ranked?.cannot?.[String(press.machine._id)]}
                          mayPlan={mayPlan}
                          onPlace={(machine) => place(machine)}
                          onOpenJob={(job) => setOpen({ job, press: press.machine })}
                          onSortColour={sortByColour}
                        />
                      ))}
                    </div>
                  </div>
                ))}
              </section>
            </div>
          ) : (
            <>
              {board.unplanned.length > 0 && (
                <section aria-label="Waiting for a machine" className="card p-4">
                  <p className="mb-2 text-sm font-semibold text-steel-100">Waiting for a machine <span className="font-normal text-steel-400">· {board.unplanned.length}</span> <span className="font-normal text-steel-500">— drag one onto a row, or tap it to choose</span></p>
                  <div className="flex flex-wrap gap-2">
                    {waiting.map((job) => (
                      <button key={job._id} type="button" draggable={mayPlan} onDragStart={startDrag(job)} onDragEnd={endDrag} onClick={() => (mayPlan ? pick(job) : setOpen({ job, press: null }))}
                        aria-pressed={picked?._id === job._id}
                        className={`inline-flex items-center gap-2 rounded-xl border px-3 py-2 text-left text-xs transition ${picked?._id === job._id ? 'border-accent ring-2 ring-accent/40' : job.late ? 'border-danger-500/50 bg-danger-500/[0.06]' : 'border-line/[0.1] bg-line/[0.03] hover:border-accent/40'}`}>
                        <Swatch colour={job.colour} />
                        <span><span className="font-semibold text-steel-100">{job.mould?.mouldCode || job.modelNumber}</span><span className="text-steel-400"> · {job.colour} · {formatNumber(job.toMake)}</span>
                          {job.best?.machine && <span className="block text-success-400">★ {job.best.machine.code} · done {shortDay(job.best.end)}</span>}</span>
                      </button>
                    ))}
                  </div>
                </section>
              )}
              <TimelineView board={board} ranked={ranked} moving={moving} mayPlan={mayPlan} startDrag={startDrag} endDrag={endDrag}
                onPlace={(machine) => place(machine)} onOpen={(job, press) => setOpen({ job, press })} onSortColour={sortByColour} />
              <p className="text-xs text-steel-500">Bars are coloured by status; a red ring means the plan ends after the due date, an amber one that the mould’s own history predicts it will; ⚠ means a warning on the machine or mould, or a store that will run short. The thin line under each machine is its daily load — red is double-booked.</p>
            </>
          )}
        </>
      )}
      {open && <JobDialog job={open.job} press={open.press} mayPlan={mayPlan} mayRun={mayRun} onClose={() => setOpen(null)} onChanged={load} />}
    </div>
  );
}
