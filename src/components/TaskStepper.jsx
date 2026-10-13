import { ladderOf } from '../utils/taskState.js';

/**
 * How far along its department's ladder a task is, read without reading: one bar per step,
 * filled as far as the task has climbed — in the accent while it moves, red while it is stuck
 * on a problem step, green once it is finished — and the words "Step 7 of 15 · next Part 2
 * Ready" for whoever wants them. Each bar names its step on hover.
 */
const FILL = { progress: 'bg-accent', blocked: 'bg-danger-500', done: 'bg-success-500' };

export default function TaskStepper({ button, task, className = '' }) {
  const ladder = ladderOf(button, task);
  if (!ladder || ladder.total < 2) return null;
  const { steps, reached, current, next, blocked, finished, total } = ladder;
  const tone = finished ? 'done' : blocked ? 'blocked' : 'progress';
  const filled = finished ? total : reached + 1;
  const words = finished
    ? `All ${total} steps done`
    : `${blocked ? `Stuck at ${current.label} · ` : ''}Step ${Math.max(reached + 1, 1)} of ${total}${next ? ` · next ${next.label}` : ''}`;
  return (
    <div className={className} aria-label={words}>
      <div className="flex gap-0.5" aria-hidden>
        {steps.map((step, index) => (
          <span
            key={step.key}
            title={step.label}
            className={`h-1.5 flex-1 rounded-full ${index < filled ? FILL[tone] : 'bg-line/[0.12]'}`}
          />
        ))}
      </div>
      <p className="mt-1 text-xs text-steel-500">{words}</p>
    </div>
  );
}
