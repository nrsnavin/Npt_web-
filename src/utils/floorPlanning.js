import { shortDay } from './planningBoard.js';

/**
 * Production floor planning, read for the Production in charge [components/TaskPressPlan.jsx,
 * pages/PlanningBoard.jsx]: where one model stands on the presses, and what on the task or the
 * board needs them — a model with no press, a plan ending after moulding is due, a mould no press
 * can take, a first piece not yet approved.
 */

export const SETUP_KEYS = ['mouldOff', 'mouldOn', 'heated', 'firstPiece'];

/** After moulding, in words: "Printing → Assembly", or "Straight to dispatch". */
export const afterMoulding = (route) => [route?.printing && 'Printing', route?.assembly && 'Assembly'].filter(Boolean).join(' → ') || 'Straight to dispatch';

/** One model's place on the presses: `key`, the pill's `tone` and `words`. Null without a work order. */
export function modelPress(row) {
  const wo = row?.workOrder;
  if (!wo) return null;
  if (wo.status === 'completed') return { key: 'made', tone: 'success', words: 'Moulded' };
  if (['running', 'paused'].includes(wo.status)) {
    return { key: wo.status, tone: wo.late ? 'danger' : 'success', words: `${wo.status === 'paused' ? 'Paused' : 'Running'} · ${wo.machine?.code || ''}`.trim() };
  }
  if (wo.machine) return { key: wo.late ? 'late' : 'planned', tone: wo.late ? 'danger' : 'neutral', words: wo.machine.code };
  /* The auto-planner's proposal, waiting for the in charge [server: floorPlanning.service `proposeTaskPlan`]. */
  if (wo.proposal?.machine) return { key: 'proposed', tone: wo.proposal.late ? 'danger' : 'info', words: `Proposed ${wo.proposal.machine.code}` };
  if (wo.mouldMissing) return { key: 'blocked', tone: 'danger', words: 'No mould' };
  if (row.best && !row.best.machine) return { key: 'blocked', tone: 'danger', words: 'No press fits' };
  return { key: 'waiting', tone: 'warn', words: 'Needs a press' };
}

/** Mould change steps ticked on the floor tablet, of four. */
export const setupDone = (wo) => SETUP_KEYS.filter((key) => wo?.setup?.[key]?.at).length;

/** What on a task's models needs the in charge — counts only, zero when nothing does. */
export function pressAttention(models = []) {
  const states = models.map((row) => ({ row, state: modelPress(row) })).filter((entry) => entry.state);
  return {
    waiting: states.filter((entry) => entry.state.key === 'waiting').length,
    blocked: states.filter((entry) => entry.state.key === 'blocked').length,
    late: states.filter((entry) => entry.state.tone === 'danger' && entry.state.key !== 'blocked').length,
    proposed: states.filter((entry) => entry.state.key === 'proposed').length,
    planned: states.filter((entry) => !['waiting', 'blocked', 'proposed'].includes(entry.state.key)).length,
    total: states.length,
  };
}

/** A proposal's days in words: "26 Oct – 28 Oct", with how it lands against moulding due. */
export const proposalWords = (proposal, dueDay) => {
  if (!proposal?.start) return null;
  const days = `${shortDay(proposal.start)} – ${shortDay(proposal.end)}`;
  if (proposal.late) return `${days} · ${proposal.lateDays ? `${proposal.lateDays} day${proposal.lateDays === 1 ? '' : 's'} ` : ''}after moulding due`;
  return dueDay ? `${days} · in time for ${shortDay(dueDay)}` : days;
};

/** The late line under a model: when its plan ends against the day moulding is due. */
export const lateWords = (wo) => (wo?.late && wo.plannedEnd ? `Ends ${shortDay(wo.plannedEnd)} — after moulding is due ${shortDay(wo.dueDay)}` : null);

/**
 * What on the planning board needs the in charge [server: planning.service `planningBoard`]:
 * Production-task models waiting for a press, jobs that will end late, jobs no press can take,
 * and task jobs next on a press whose first piece is not approved.
 */
export function boardAttention(board) {
  const waiting = board?.unplanned || [];
  const queued = (board?.presses || []).flatMap((press) => press.queue || []);
  return {
    tasksWaiting: waiting.filter((job) => job.forTask && !job.proposal && !(job.best && !job.best.machine)).length,
    proposals: waiting.filter((job) => job.proposal).length,
    late: waiting.filter((job) => job.late).length + queued.filter((job) => job.late).length,
    blocked: waiting.filter((job) => job.best && !job.best.machine).length,
    firstPiece: (board?.presses || []).filter((press) => {
      const next = (press.queue || []).find((job) => job.status !== 'running');
      return next?.forTask && !next.forTask.firstPiece && !(press.queue || []).some((job) => job.status === 'running');
    }).length,
  };
}
