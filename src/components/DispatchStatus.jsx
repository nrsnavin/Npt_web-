import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { dispatches as dispatchApi } from '../api/endpoints.js';
import { Badge, Field, Modal, Notice, Section } from './ui.jsx';
import { CLOSED_DISPATCH_STAGES, dispatchStageLabel } from '../utils/pipeline.js';

/**
 * Moving a consignment [BLUEPRINT §18–19].
 *
 * The same argument as the plant's stage picker, with one difference that changes the shape of
 * it: a production line has a *status* somebody sets, and a consignment has **actions** the
 * server decides are available from where it is. §18's ladder is ten rungs and a free dropdown
 * of ten would let somebody step from "request received" to "delivered" with no invoice, no
 * lorry and no LR — so the list of what can be done comes from the server, per consignment, and
 * the screen never invents a move.
 *
 * Everything a caller needs is here rather than on any one screen, because three screens run
 * these actions — the yard's day, the register and the consignment itself — and three copies of
 * the quality override would be three places for one of them to forget it.
 *
 * Three things the logic has to get right, none of them obvious from the action list:
 *
 * **`needs`** is what an action cannot be done without: the lorry number to load, a reason to
 * cancel. Those open a small form. Everything else is one press.
 *
 * **`blockedBy`** is §19's gate — dispatched refuses until the invoice, LR and transporter
 * exist. Listed disabled with the reason rather than hidden, because hiding the button hides
 * the thing the person is working towards.
 *
 * **The 409** is quality's soft gate [§15]: a first attempt to dispatch something unchecked or
 * failed comes back asking for a reason, not refusing. It is answerable, so it opens its own
 * dialog rather than showing a red error nobody can act on.
 */

/** What the two fields any action asks for are actually called, in the yard's words. */
const NEED_LABELS = {
  cancellationReason: 'Why is it cancelled?',
  vehicleNumber: 'Which lorry?',
};

/**
 * The actions for one consignment, and everything that happens when one is pressed.
 *
 * A hook rather than a component because the panel and the picker draw the same actions very
 * differently — a grid of cards on the consignment's own page, a menu off the badge everywhere
 * else — while needing identical behaviour behind them.
 */
export function useDispatchActions(dispatch, onDone) {
  const [actions, setActions] = useState(null);
  const [chosen, setChosen] = useState(null);
  const [values, setValues] = useState({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [override, setOverride] = useState(null);
  const [overrideReason, setOverrideReason] = useState('');

  /* Re-loaded whenever the status moves: what can be done from `packing` is not what can be
     done from `dispatched`, and a stale list offers an action the server will refuse. */
  useEffect(() => {
    let live = true;
    dispatchApi
      .actions(dispatch._id)
      .then((next) => live && setActions(next))
      .catch(() => live && setActions([]));
    return () => {
      live = false;
    };
  }, [dispatch._id, dispatch.status, dispatch.outstandingPaperwork?.length]);

  const run = async (action) => {
    if (action.needs.length) {
      setChosen(action);
      setValues({});
      return;
    }
    setBusy(true);
    setError(null);
    try {
      onDone(await dispatchApi.act({ id: dispatch._id, action: action.action }));
    } catch (actError) {
      /* The quality concern, which is answerable — everything else is an error to read. */
      if (actError.status === 409 && actError.details?.needs === 'qualityOverrideReason') {
        setOverride({ action: action.action, label: action.label, concern: actError.details.concern });
        setOverrideReason('');
      } else {
        setError(actError);
      }
    } finally {
      setBusy(false);
    }
  };

  const submit = async (event) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      onDone(await dispatchApi.act({ id: dispatch._id, action: chosen.action, ...values }));
      setChosen(null);
    } catch (actError) {
      /* The gate can bite here too — cancelling asks for a reason, dispatching from a form
         does not, but an action that grows a `needs` later must not lose the override. */
      if (actError.status === 409 && actError.details?.needs === 'qualityOverrideReason') {
        setOverride({ action: chosen.action, label: chosen.label, concern: actError.details.concern });
        setOverrideReason('');
        setChosen(null);
      } else {
        setError(actError);
      }
    } finally {
      setBusy(false);
    }
  };

  const sendOverride = async (event) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      onDone(
        await dispatchApi.act({
          id: dispatch._id,
          action: override.action,
          qualityOverrideReason: overrideReason,
        })
      );
      setOverride(null);
    } catch (actError) {
      setError(actError);
    } finally {
      setBusy(false);
    }
  };

  return {
    actions, busy, error, setError,
    run, chosen, setChosen, values, setValues, submit,
    override, setOverride, overrideReason, setOverrideReason, sendOverride,
  };
}

/**
 * The two dialogs every caller needs: what an action asks for, and quality's question.
 *
 * Rendered by whoever holds the hook's state, so a picker inside a table row and a panel on the
 * consignment page put up exactly the same forms.
 */
export function DispatchActionForms({ state }) {
  const {
    chosen, setChosen, values, setValues, submit,
    override, setOverride, overrideReason, setOverrideReason, sendOverride,
    busy, error,
  } = state;

  return (
    <>
      {/*
        The override. A separate dialog from the ordinary action form because it asks a different
        kind of question: not "what is the lorry number" but "you are overruling quality, on the
        record". The wording says where the answer ends up, because a person who knows their
        reason will be read writes a different sentence from one who thinks it vanishes.
      */}
      <Modal
        open={Boolean(override)}
        title="Quality has not cleared this"
        description={override?.concern}
        onClose={() => setOverride(null)}
      >
        <form onSubmit={sendOverride} className="space-y-4">
          <Notice tone="warn">
            <p>
              It can still go. The reason below is kept against this consignment with your name on
              it, and appears in the monthly list of consignments sent despite a quality warning.
            </p>
          </Notice>

          <Field label="Why is it going anyway?" hint="A sentence — enough for somebody reading it next month">
            <textarea
              rows={3}
              className="input"
              autoFocus
              placeholder="Buyer inspected at our gate and accepted the lot themselves"
              value={overrideReason}
              onChange={(event) => setOverrideReason(event.target.value)}
            />
          </Field>

          {error && <Notice tone="danger"><p>{error.message}</p></Notice>}

          <div className="flex justify-end gap-2 border-t border-line/[0.06] pt-4">
            <button type="button" className="btn-secondary" onClick={() => setOverride(null)}>
              Do not send it
            </button>
            <button type="submit" className="btn-primary" disabled={busy || overrideReason.trim().length < 10}>
              {busy ? 'Saving…' : `${override?.label} anyway`}
            </button>
          </div>
        </form>
      </Modal>

      <Modal
        open={Boolean(chosen)}
        title={chosen?.label}
        description={chosen?.hint}
        onClose={() => setChosen(null)}
      >
        <form onSubmit={submit} className="space-y-4">
          {/* Only what this action declares it cannot be done without. */}
          {chosen?.needs.map((need) => (
            <Field key={need} label={NEED_LABELS[need] || need}>
              {need === 'cancellationReason' ? (
                <textarea
                  rows={3}
                  className="input"
                  autoFocus
                  value={values[need] || ''}
                  onChange={(event) => setValues({ ...values, [need]: event.target.value })}
                />
              ) : (
                <input
                  className="input"
                  autoFocus
                  placeholder="TN39 BX 4412"
                  value={values[need] || ''}
                  onChange={(event) => setValues({ ...values, [need]: event.target.value })}
                />
              )}
            </Field>
          ))}

          {error && <Notice tone="danger"><p>{error.message}</p></Notice>}

          <div className="flex justify-end gap-2 border-t border-line/[0.06] pt-4">
            <button type="button" className="btn-secondary" onClick={() => setChosen(null)}>Cancel</button>
            <button
              type="submit"
              className={chosen?.action === 'cancel' ? 'btn-danger' : 'btn-primary'}
              disabled={busy || chosen?.needs.some((need) => !values[need]?.trim())}
            >
              {busy ? 'Saving…' : chosen?.label}
            </button>
          </div>
        </form>
      </Modal>
    </>
  );
}

/**
 * The full panel, on the consignment's own page.
 *
 * Kept as cards rather than a menu because this is the one screen with room to say what each
 * action *means* — "On the lorry. The load can no longer be changed" is worth reading once, and
 * the yard screens can be terse having read it here.
 *
 * **Only for somebody who can act.** The list loads on the dispatch read grant, which marketing,
 * order confirmation, production and accounts all hold so they can see where the goods are — but
 * every action behind it is on write. Offering them a "Dispatched" button that comes back
 * refused teaches them the buttons on this screen are unreliable.
 */
export function DispatchActionsPanel({ dispatch, onDone, mayWrite }) {
  const state = useDispatchActions(dispatch, onDone);
  const { actions, busy, error, run } = state;

  if (!mayWrite) return null;
  if (CLOSED_DISPATCH_STAGES.includes(dispatch.status)) return null;

  return (
    <Section title="What happens next">
      {!actions ? (
        <p className="text-sm text-steel-500">Loading…</p>
      ) : (
        <div className="grid gap-2.5 sm:grid-cols-2">
          {actions.map((action) => (
            <button
              key={action.action}
              type="button"
              disabled={busy || Boolean(action.blockedBy)}
              onClick={() => run(action)}
              className={`rounded-lg border p-3 text-left transition-colors ${
                action.blockedBy
                  ? 'cursor-not-allowed border-line/[0.06] opacity-60'
                  : 'border-line/[0.1] hover:border-accent/40 hover:bg-line/[0.03]'
              }`}
            >
              <p className="text-sm font-semibold text-steel-100">{action.label}</p>
              <p className="mt-0.5 text-xs text-steel-500">{action.hint}</p>
              {/* The gate, said out loud rather than hidden behind a missing button. */}
              {action.blockedBy && (
                <p className="mt-1.5 text-xs font-semibold text-warn-400">{action.blockedBy}</p>
              )}
              {!action.blockedBy && action.raises && (
                <p className="mt-1.5 text-xs font-semibold uppercase tracking-wide text-aqua-300">
                  → {action.raises}
                </p>
              )}
            </button>
          ))}
        </div>
      )}

      {error && <Notice tone="danger"><p>{error.message}</p></Notice>}

      <DispatchActionForms state={state} />
    </Section>
  );
}

/* ------------------- Moving a consignment from where it is read ------------------- */

/** Wide enough for the longest label and its gate on one line. */
const MENU_WIDTH = 320;

/**
 * The stage badge, as the control that moves it.
 *
 * The same fix as the plant's, for the same reason: the badge was the obvious thing to press
 * and did nothing, so moving a consignment meant opening it, finding the panel and coming back.
 * A clerk with twenty loads a day does that once and then updates the record at four o'clock
 * from memory — and §19's promise, that marketing sees the invoice and the LR the moment the
 * lorry leaves, quietly becomes a promise about four o'clock.
 *
 * What the menu offers is what the *server* says can be done from here — never a list of
 * statuses. A blocked action is listed with its reason rather than hidden, an action needing a
 * lorry number opens the small form, and quality's 409 opens its own question. All of which is
 * the hook's doing, so this and the panel cannot drift apart.
 */
export function DispatchStatusPicker({ dispatch, onDone, canAct = true }) {
  const trigger = useRef(null);
  const [open, setOpen] = useState(false);
  const [at, setAt] = useState(null);

  const state = useDispatchActions(dispatch, (next) => { setOpen(false); onDone?.(next); });
  const { actions, busy, error, run } = state;

  /*
   * Positioned against the viewport and portalled out. The register puts this badge inside a
   * horizontally scrolling table, where a menu positioned inside the row is clipped at the
   * column edge — and visible in exactly the cases where the table happens to be wide enough,
   * which is the worst way for it to fail.
   */
  useLayoutEffect(() => {
    if (!open || !trigger.current) return;
    const box = trigger.current.getBoundingClientRect();
    const width = Math.min(MENU_WIDTH, window.innerWidth - 16);
    const left = Math.min(Math.max(8, box.left), window.innerWidth - width - 8);
    const below = window.innerHeight - box.bottom > 300;
    setAt({
      left,
      width,
      top: below ? box.bottom + 6 : undefined,
      bottom: below ? undefined : window.innerHeight - box.top + 6,
    });
  }, [open]);

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (event) => { if (event.key === 'Escape') setOpen(false); };
    /* Closed on scroll rather than followed: a menu that drifts away from its own badge is
       worse than one that shuts, and the badge is still there to press again. */
    const onScroll = () => setOpen(false);
    window.addEventListener('keydown', onKey);
    window.addEventListener('scroll', onScroll, true);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('scroll', onScroll, true);
    };
  }, [open]);

  const badge = <Badge status={dispatch.status}>{dispatchStageLabel(dispatch.status)}</Badge>;

  /* Read-only for anybody without dispatch write, and for a consignment that is finished with:
     a closed or cancelled one has no actions, and a caret promising some would be a lie. */
  if (!canAct || CLOSED_DISPATCH_STAGES.includes(dispatch.status)) return badge;

  return (
    <>
      <button
        ref={trigger}
        type="button"
        onClick={(event) => { event.stopPropagation(); state.setError(null); setOpen((was) => !was); }}
        title="Move this consignment on"
        className="group inline-flex items-center gap-1 rounded-md transition-opacity hover:opacity-80"
        aria-haspopup="menu"
        aria-expanded={open}
      >
        {badge}
        {/* A caret, so the badge reads as something that opens rather than something that is. */}
        <span aria-hidden className="text-[0.6rem] leading-none text-steel-500 group-hover:text-steel-300">▾</span>
      </button>

      {open && at && createPortal(
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div
            role="menu"
            style={{ left: at.left, top: at.top, bottom: at.bottom, width: at.width }}
            className="fixed z-50 animate-scale-in rounded-xl border border-line/[0.08] bg-ink-800 p-1.5 shadow-modal"
          >
            {!actions && <p className="px-3 py-2 text-sm text-steel-500">Loading…</p>}
            {actions?.length === 0 && (
              <p className="px-3 py-2 text-sm text-steel-500">Nothing left to do on this one.</p>
            )}

            {actions?.map((action) => (
              <button
                key={action.action}
                type="button"
                disabled={busy || Boolean(action.blockedBy)}
                onClick={() => run(action)}
                className={`block w-full rounded-lg px-3 py-2 text-left transition-colors ${
                  action.blockedBy
                    ? 'cursor-not-allowed opacity-60'
                    : 'hover:bg-line/[0.06] disabled:opacity-50'
                }`}
              >
                <span className="block text-sm font-semibold text-steel-100">
                  {action.label}
                  {/* Said before it is pressed, so the form opening is a consequence, not a
                      surprise. The panel has room for the hint; here the shape is enough. */}
                  {!action.blockedBy && action.needs.length > 0 && (
                    <span className="font-normal text-steel-500">
                      {' · '}{action.needs.includes('vehicleNumber') ? 'needs the lorry' : 'needs a reason'}
                    </span>
                  )}
                </span>
                {/* §19's gate, said out loud rather than hidden behind a missing button. */}
                {action.blockedBy && (
                  <span className="mt-0.5 block text-xs font-semibold text-warn-400">
                    {action.blockedBy}
                  </span>
                )}
              </button>
            ))}

            {/* Kept open with the refusal on it. Closing would leave somebody looking at the
                unchanged stage with no idea why it had not moved. */}
            {error && (
              <p className="mt-1 border-t border-line/[0.06] px-3 py-2 text-xs text-danger-400">
                {error.message}
              </p>
            )}
          </div>
        </>,
        document.body
      )}

      <DispatchActionForms state={state} />
    </>
  );
}
