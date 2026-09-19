import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { workspace } from '../api/endpoints.js';
import { Field, FormError, Modal, Notice } from './ui.jsx';
import { DEPARTMENTS, departmentLabel } from '../utils/pipeline.js';
import { formatDate } from '../utils/format.js';

/**
 * Handing a task to another department [BLUEPRINT §25, §35].
 *
 * The plant already had two ways to say "this is somebody else's problem": ring them, or raise
 * an order escalation, which is about an *order* being stopped. Neither covers the ordinary
 * case — one job, on the wrong queue, that somebody else has to do. That was a phone call, and
 * a phone call leaves no record of who was told or whether anything happened.
 *
 * So the task moves, with a sentence. The sentence is the whole value: the department receiving
 * it has not seen the record, and "sent to despatch" tells them nothing they can act on.
 */
export function EscalateTaskDialog({ task, open, onClose, onEscalated }) {
  const [department, setDepartment] = useState('');
  const [reason, setReason] = useState('');
  const [urgent, setUrgent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  /** What was proposed, kept so the record can say the priority was a suggestion. */
  const [suggestion, setSuggestion] = useState(null);
  const [asking, setAsking] = useState(false);

  /*
   * Asked as the dialog opens, and never waited for.
   *
   * The dropdown and the box are usable from the first frame; when the answer arrives it fills
   * in whatever the person has not already typed. That ordering is the whole point — a form
   * that greys itself out for a second while something thinks is a form that is slower than the
   * dropdown it was meant to replace, and on a Tiruppur line that second is sometimes ten.
   *
   * `live` guards the late arrival: open the dialog, close it, open it on another task, and the
   * first answer must not land in the second task's form.
   */
  useEffect(() => {
    if (!open || !task?._id) return undefined;
    let live = true;
    setAsking(true);
    setSuggestion(null);

    workspace.todos
      .suggest(task._id)
      .then((answer) => {
        if (!live) return;
        setSuggestion(answer);
        /* Only ever fills a blank. Somebody who has started typing is not overruled by this. */
        if (answer?.department) setDepartment((current) => current || answer.department);
        if (answer?.reason) setReason((current) => current || answer.reason);
        if (answer?.priority === 'high') setUrgent(true);
      })
      .catch(() => {
        /* Swallowed on purpose: the form works without it, and an error box about a suggestion
           nobody asked for is worse than no suggestion. */
      })
      .finally(() => {
        if (live) setAsking(false);
      });

    return () => {
      live = false;
    };
  }, [open, task?._id]);

  const close = () => {
    setDepartment('');
    setReason('');
    setUrgent(false);
    setSuggestion(null);
    setError(null);
    onClose();
  };

  /* True while the two fields still hold exactly what was proposed — which is what makes the
     priority a suggestion rather than a decision. Edit either and it becomes yours. */
  const untouched =
    suggestion?.department === department && suggestion?.reason === reason;

  const submit = async (event) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await onEscalated({
        id: task._id,
        department,
        reason: reason.trim(),
        ...(urgent && { priority: 'high' }),
        /* Attributed only where it really came from the suggestion and was not edited. */
        ...(urgent && untouched && suggestion?.priority === 'high' && suggestion?.from
          ? { suggestedBy: suggestion.from, suggestedReason: suggestion.reason || undefined }
          : {}),
      });
      close();
    } catch (failure) {
      setError(failure);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open={open}
      title="Hand this to another department"
      description={task?.title}
      onClose={close}
    >
      <form onSubmit={submit} className="space-y-4">
        <Notice tone="info">
          <p>
            It leaves this queue and lands on theirs, highlighted, with your name and the reason
            on it. You keep it in your own list marked with where it went, so you can see whether
            anybody picked it up.
          </p>
        </Notice>

        <Field
          label="Who has to do it"
          hint={
            asking
              ? 'Reading the task…'
              : suggestion?.department
                ? `Suggested${suggestion.from === 'model' ? '' : ' from the wording'} — change it if it is wrong`
                : undefined
          }
          required
        >
          <select
            className="input"
            autoFocus
            value={department}
            onChange={(event) => setDepartment(event.target.value)}
          >
            <option value="">Choose a department…</option>
            {/* Never the queue it is already on — that would only clear whoever is holding it,
                which is a confusing way to do nothing. */}
            {DEPARTMENTS.filter((entry) => entry.key !== task?.department).map((entry) => (
              <option key={entry.key} value={entry.key}>{entry.label}</option>
            ))}
          </select>
        </Field>

        <Field
          label="Why it is going to them"
          hint="They have not seen the record — a sentence they can act on" required>
          <textarea
            rows={3}
            className="input"
            placeholder="Lorry is at the gate and the e-way bill is not cut"
            value={reason}
            onChange={(event) => setReason(event.target.value)}
          />
        </Field>

        {/*
          Urgency, ticked rather than assumed.

          The suggestion pre-ticks this where something is waiting on the job, and the label says
          it was suggested — so the person either agrees by leaving it or disagrees by clearing
          it, and either way somebody has looked. A card headed "urgent" filled by a model that
          nobody checked is a card people stop reading the second time it is wrong.
        */}
        <label className="flex cursor-pointer items-start gap-2.5">
          <input
            type="checkbox"
            className="mt-0.5 h-4 w-4 shrink-0 rounded border-line/25"
            checked={urgent}
            onChange={(event) => setUrgent(event.target.checked)}
          />
          <span className="text-sm">
            <span className="font-semibold text-steel-100">Something is waiting on this</span>
            <span className="block text-xs text-steel-400">
              Puts it at the top of their card as urgent.
              {urgent && suggestion?.priority === 'high' && untouched
                ? ' Suggested — untick it if nothing is actually held up.'
                : ''}
            </span>
          </span>
        </label>

        {/* What it thought, in its own words. A suggestion somebody can check is one they can
            reasonably trust; one that only shows its conclusion has to be taken on faith. */}
        {suggestion?.reason && suggestion.department && (
          <p className="rounded-md bg-line/[0.04] px-3 py-2 text-xs text-steel-400">
            {suggestion.from === 'model' ? 'Read as' : 'Matched as'}{' '}
            <span className="font-semibold text-steel-300">
              {departmentLabel(suggestion.department)}
            </span>
            : {suggestion.reason}
          </p>
        )}

        <FormError error={error} />

        <div className="flex flex-wrap items-center justify-end gap-2 border-t border-line/[0.06] pt-4">
          {(!department || reason.trim().length < 10) && (
            <p className="mr-auto text-xs text-steel-500">
              {!department ? 'Choose who has to do it.' : 'Say why, in a sentence.'}
            </p>
          )}
          <button type="button" className="btn-secondary" onClick={close}>Keep it here</button>
          <button
            type="submit"
            className="btn-primary"
            disabled={busy || !department || reason.trim().length < 10}
          >
            {/* Named once a department is chosen, because "Hand it to Despatch" is a press
                somebody can check before making it. Before that it stays the generic verb: an
                ellipsis standing in for the department read as a truncated label. */}
            {busy
              ? 'Sending…'
              : department
                ? `Hand it to ${departmentLabel(department)}`
                : 'Hand it on'}
          </button>
        </div>
      </form>
    </Modal>
  );
}

/**
 * The line under a task saying whose it is, what it is about, and where it came from.
 *
 * On a private list none of this was needed — every task was yours, about nothing in
 * particular. On a shared queue it is the difference between a row somebody picks up and a row
 * everybody assumes is covered.
 */
export function TaskMeta({ task, showDepartment = false }) {
  const owner = task.user?.name;
  const escalated = task.escalation?.at;

  return (
    <>
      <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs">
        {/* Unclaimed first and in the accent colour, because it is the one state that is asking
            somebody to do something about it. */}
        {!task.completed && !owner && (
          <span className="font-semibold text-flame-400">Nobody has this</span>
        )}
        {owner && <span className="text-steel-400">{owner}</span>}
        {showDepartment && task.department && (
          <span className="text-steel-500">{departmentLabel(task.department)}</span>
        )}
        {task.customer?.name && (
          <Link
            to={`/customers/${task.customer._id}`}
            className="truncate text-steel-400 transition-colors hover:text-accent"
          >
            {task.customer.name}
          </Link>
        )}
        {/* The order number, as text. A task can still carry one — the server keeps sales
            orders — but this application has no screen to open, and a link to a route that
            does not exist is worse than a plain number. */}
        {task.order?.number && (
          <span className="text-steel-500">{task.order.number}</span>
        )}
      </div>

      {/* The handover, said in full. A reason truncated to fit is a reason somebody has to open
          the record to read, which is the thing escalating was meant to save them. */}
      {escalated && !task.completed && (
        <p className="mt-1 rounded-md bg-warn-500/10 px-2 py-1 text-xs text-warn-400">
          <span className="font-bold">
            {departmentLabel(task.escalation.from)} → {departmentLabel(task.escalation.to)}
          </span>
          {task.escalation.by?.name ? ` · ${task.escalation.by.name}` : ''}
          {task.escalation.at ? ` · ${formatDate(task.escalation.at)}` : ''}
          {task.escalation.reason ? <span className="block">{task.escalation.reason}</span> : null}
        </p>
      )}
    </>
  );
}
