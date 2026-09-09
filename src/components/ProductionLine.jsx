import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { production as productionApi } from '../api/endpoints.js';
import { Badge, Field, Modal, Notice } from './ui.jsx';
import { formatNumber } from '../utils/format.js';
import {
  HELD_PRODUCTION_STAGES, PRODUCTION_STAGES, numeric, productionStageLabel, text,
} from '../utils/pipeline.js';

/**
 * Recording what the plant did to one line [§14–17].
 *
 * **Two numbers are typed and the rest fall out.** Made and packed; still-to-make, percent done
 * and whether the line is late are all derived, because a figure somebody types twice is a
 * figure that ends up disagreeing with itself. The form shows what will fall out as it is
 * typed, so the person entering a count sees the consequence before saving rather than after.
 *
 * **A hold has to say why**, and the form asks for it the moment a held status is chosen rather
 * than letting the save fail. A hold with no reason is a hold nobody can clear without going and
 * asking, which is the phone call this module exists to remove.
 *
 * The one thing this form will not let you do is call a line complete while pieces are owed —
 * the server refuses it, and the button says why before you press it.
 */
export default function ProductionLineForm({ order, line, onClose, onSaved, initialStatus }) {
  const current = line.production || {};

  const [values, setValues] = useState({
    /* `initialStatus` is the stage somebody already chose from the badge, arriving here only
       because it needs something typed alongside it. Opening on the old stage would make them
       choose it twice and would put the reason box behind a dropdown they had already used. */
    status: initialStatus || current.status || 'awaiting_planning',
    plannedQty: current.plannedQty ?? '',
    producedQty: current.producedQty ?? '',
    readyQty: current.readyQty ?? '',
    expectedCompletion: current.expectedCompletion ? current.expectedCompletion.slice(0, 10) : '',
    holdReason: current.holdReason ?? '',
    remarks: current.remarks ?? '',
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const set = (key) => (event) => setValues({ ...values, [key]: event.target.value });

  const made = Number(values.producedQty) || 0;
  const packed = Number(values.readyQty) || 0;
  const toMake = Math.max(0, line.quantity - made);
  const held = HELD_PRODUCTION_STAGES.includes(values.status);

  /*
   * The two refusals the server will make, said here first. A form that lets somebody press a
   * button it knows will fail is a form that wastes their time to be technically correct.
   */
  const packedTooHigh = packed > made;
  const completingEarly = values.status === 'completed' && toMake > 0;

  const submit = async (event) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      onSaved(
        await productionApi.record({
          orderId: order._id,
          lineId: line._id,
          /* The order's version, echoed back. Without it the server's guard is opt-in and
             opted out of, and two supervisors recording the same line silently overwrite each
             other's count — see `expectVersion` on the server. */
          expectedUpdatedAt: order.updatedAt,
          status: values.status,
          plannedQty: numeric(values.plannedQty),
          producedQty: numeric(values.producedQty),
          readyQty: numeric(values.readyQty),
          expectedCompletion: text(values.expectedCompletion),
          holdReason: held ? values.holdReason : undefined,
          remarks: text(values.remarks),
        })
      );
      onClose();
    } catch (saveError) {
      setError(saveError);
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="space-y-5">
      <Notice tone="info">
        {line.modelNumber || line.mould?.mouldCode} &middot; {formatNumber(line.quantity)} pieces
        ordered{line.colour ? ` in ${line.colour}` : ''}.
      </Notice>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Where it is">
          <select className="input" value={values.status} onChange={set('status')}>
            {PRODUCTION_STAGES.map((stage) => (
              <option key={stage.value} value={stage.value}>{stage.label}</option>
            ))}
          </select>
        </Field>
        <Field label="Expected completion" hint="The date the plant is agreeing to">
          <input
            type="date"
            className="input"
            value={values.expectedCompletion}
            onChange={set('expectedCompletion')}
          />
        </Field>
      </div>

      {/*
        Asked the moment a held status is chosen, rather than after the save is refused. The
        next person to look at a stopped job should not have to go and ask why.
      */}
      {held && (
        <Field label="Why is it held?" hint="The next person to look will read this instead of ringing you">
          <input
            className="input"
            autoFocus
            placeholder="HIPS white not landed — supplier says Thursday"
            value={values.holdReason}
            onChange={set('holdReason')}
          />
        </Field>
      )}

      <div>
        <p className="eyebrow mb-2">The count</p>
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Planned" hint="What is committed to a press">
            <input type="number" min="0" className="input" value={values.plannedQty} onChange={set('plannedQty')} />
          </Field>
          <Field label="Made" hint="Off the press, packed or not">
            <input type="number" min="0" className="input" value={values.producedQty} onChange={set('producedQty')} />
          </Field>
          <Field label="Packed" hint="Ready to go" error={packedTooHigh ? 'More than has been made' : undefined}>
            <input type="number" min="0" className="input" value={values.readyQty} onChange={set('readyQty')} />
          </Field>
        </div>

        {/*
          What falls out, shown while it is typed. The person entering a count sees the
          consequence before saving rather than discovering it on the order screen after.
        */}
        <div className="mt-3 flex flex-wrap gap-x-6 gap-y-1 border-t border-line/[0.06] pt-3 text-xs">
          <span className="text-steel-400">
            Still to make{' '}
            <span className="tabular-nums font-semibold text-steel-100">{formatNumber(toMake)}</span>
          </span>
          {made > line.quantity && (
            <span className="text-steel-500">
              {formatNumber(made - line.quantity)} over &mdash; within tolerance, and nothing is owed
            </span>
          )}
        </div>
      </div>

      <Field label="Remarks">
        <input className="input" value={values.remarks} onChange={set('remarks')} />
      </Field>

      {completingEarly && (
        <Notice tone="warn">
          {formatNumber(toMake)} pieces are still to make. Record them before calling this line
          complete.
        </Notice>
      )}

      {error && (
        <Notice tone="danger">
          <p>{error.message}</p>
          {error.details?.map((detail) => (
            <p key={detail.field} className="text-xs">{detail.field}: {detail.message}</p>
          ))}
        </Notice>
      )}

      <div className="flex justify-end gap-2 border-t border-line/[0.06] pt-4">
        <button type="button" className="btn-secondary" onClick={onClose}>Cancel</button>
        <button
          type="submit"
          className="btn-primary"
          disabled={busy || packedTooHigh || completingEarly || (held && !values.holdReason.trim())}
        >
          {busy ? 'Saving…' : 'Record it'}
        </button>
      </div>
    </form>
  );
}

/** The dialog around the form, so a screen need only hold which line is open. */
export function ProductionLineDialog({ order, line, onClose, onSaved, initialStatus }) {
  return (
    <Modal
      open={Boolean(line)}
      title="What the plant has done"
      description={order ? `${order.number} · ${line?.modelNumber || ''}` : undefined}
      onClose={onClose}
    >
      {line && (
        <ProductionLineForm
          order={order}
          line={line}
          onClose={onClose}
          onSaved={onSaved}
          initialStatus={initialStatus}
        />
      )}
    </Modal>
  );
}

/* ------------------------- Moving a line in one tap ------------------------- */

/**
 * What a stage needs typed alongside it, or null if the word is the whole answer.
 *
 * Three of the eleven stages are a claim about a number or a reason as well as a position, and
 * the server refuses all three — see `assertStatusFits` and the hold check in the controller.
 * Naming them here means the menu can *say so before it is pressed* and open the form on that
 * stage, rather than firing a save it knows will come back with an error.
 */
export function stageNeeds(line, status) {
  if (HELD_PRODUCTION_STAGES.includes(status)) return 'needs a reason';

  const made = line?.production?.producedQty || 0;
  if (status === 'completed' && Math.max(0, (line?.quantity || 0) - made) > 0) {
    return 'needs the full count';
  }
  if (status === 'part_quantity_ready' && !(line?.production?.readyQty > 0)) {
    return 'needs a packed count';
  }
  return null;
}

/**
 * Where the menu goes: measured off the trigger, so a table's overflow cannot clip it.
 *
 * Wide enough that the longest stage and its hint sit on one line together. At a narrower width
 * "Printing stock pending · needs a reason" wrapped into four lines, which made the stopped half
 * of the menu twice the height of the moving half and read as the more important one.
 */
const MENU_WIDTH = 300;

/**
 * The stage badge, as the control that moves it.
 *
 * **The badge was the obvious thing to press and did nothing.** Moving a line meant finding a
 * Record button, opening a form of seven fields and saving one of them — which is fine for the
 * end of a shift and far too much for the twenty times a day somebody walks past a press and
 * knows one thing has changed. A supervisor who has to fill a form to say "it is running now"
 * updates the app on Friday, and then every screen downstream is four days stale.
 *
 * So the word itself opens a list of the other words, and picking one saves it. One tap for the
 * eight stages that are only a position; the three that also claim a number or a reason open
 * the full form *on that stage*, with the box they need, because the alternative is a save the
 * server was always going to refuse.
 *
 * The form is not replaced by this and should not be — the counts are the other half of §14,
 * and a screen that only let somebody move the word would collect stages nobody had put a
 * number behind. This is the quick half, sitting next to it.
 */
export function ProductionStatusPicker({ order, line, onSaved, canRecord = true }) {
  const current = line?.production?.status || 'awaiting_planning';

  const trigger = useRef(null);
  const [open, setOpen] = useState(false);
  const [at, setAt] = useState(null);
  const [busy, setBusy] = useState(null);
  const [error, setError] = useState(null);
  /** The stage chosen from the menu that needs the form, or null. */
  const [asking, setAsking] = useState(null);

  /*
   * Positioned against the viewport rather than the badge's own box. Both screens that use this
   * put the badge inside a horizontally scrolling table, and a menu positioned inside that is a
   * menu clipped at the edge of the column — visible in the half of cases where the table
   * happens to be wide enough, which is the worst way for it to fail.
   */
  useLayoutEffect(() => {
    if (!open || !trigger.current) return;
    const box = trigger.current.getBoundingClientRect();
    /* Never wider than the window, and never off either edge of a phone held in a plant. */
    const width = Math.min(MENU_WIDTH, window.innerWidth - 16);
    const left = Math.min(Math.max(8, box.left), window.innerWidth - width - 8);
    /* Above the badge when there is no room below, so the last row of a table still works. */
    const below = window.innerHeight - box.bottom > 320;
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

  const choose = async (status) => {
    if (status === current) return setOpen(false);

    const needed = stageNeeds(line, status);
    if (needed) {
      setOpen(false);
      return setAsking(status);
    }

    setBusy(status);
    setError(null);
    try {
      const saved = await productionApi.record({
        orderId: order._id,
        lineId: line._id,
        expectedUpdatedAt: order.updatedAt,
        status,
      });
      setOpen(false);
      onSaved?.(saved);
    } catch (saveError) {
      /* Kept open with the refusal on it. Closing would leave somebody looking at the old stage
         with no idea why it had not moved. A stale-version conflict says what to do about it —
         the server's wording is about editing a form, and this was one tap. */
      setError(
        saveError.status === 409
          ? 'Somebody else moved this line while you were looking at it. Refresh to see where it is now.'
          : saveError.message || 'That did not save'
      );
    } finally {
      setBusy(null);
    }
  };

  /* Read-only for anybody without production write: still a badge, and it says the stage. */
  if (!canRecord) {
    return <Badge status={current}>{productionStageLabel(current)}</Badge>;
  }

  const moving = PRODUCTION_STAGES.filter((stage) => !HELD_PRODUCTION_STAGES.includes(stage.value));
  const stopped = PRODUCTION_STAGES.filter((stage) => HELD_PRODUCTION_STAGES.includes(stage.value));

  const item = (stage) => {
    const needed = stageNeeds(line, stage.value);
    const isCurrent = stage.value === current;

    return (
      <button
        key={stage.value}
        type="button"
        disabled={Boolean(busy)}
        onClick={() => choose(stage.value)}
        className={`flex w-full items-baseline justify-between gap-3 rounded-lg px-3 py-2 text-left text-sm
          transition-colors disabled:opacity-50 ${
            isCurrent
              ? 'bg-line/[0.06] font-bold text-steel-50'
              : 'font-semibold text-steel-200 hover:bg-line/[0.06] hover:text-steel-50'
          }`}
      >
        <span className="whitespace-nowrap">{stage.label}{isCurrent ? ' · now' : ''}</span>
        {/* Said before it is pressed, so the form opening is a consequence and not a surprise. */}
        {needed && !isCurrent && (
          <span className="whitespace-nowrap text-xs text-steel-500">{needed}</span>
        )}
        {busy === stage.value && <span className="text-xs text-steel-400">Saving…</span>}
      </button>
    );
  };

  return (
    <>
      <button
        ref={trigger}
        type="button"
        onClick={() => { setError(null); setOpen((was) => !was); }}
        title="Move this line on"
        className="group inline-flex items-center gap-1 rounded-md transition-opacity hover:opacity-80"
        aria-haspopup="menu"
        aria-expanded={open}
      >
        <Badge status={current}>{productionStageLabel(current)}</Badge>
        {/* A caret, so the badge reads as something that opens rather than something that is. */}
        <span aria-hidden className="text-[0.6rem] leading-none text-steel-500 group-hover:text-steel-300">▾</span>
      </button>

      {open && at && createPortal(
        <>
          {/* The click-anywhere-else target. Transparent and behind the menu. */}
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div
            role="menu"
            style={{ left: at.left, top: at.top, bottom: at.bottom, width: at.width }}
            className="fixed z-50 animate-scale-in rounded-xl border border-line/[0.08] bg-ink-800 p-1.5 shadow-modal"
          >
            <p className="px-3 pb-1 pt-1.5 text-[0.68rem] font-bold uppercase tracking-wide text-steel-500">
              Moving
            </p>
            {moving.map(item)}

            <p className="mt-1 border-t border-line/[0.06] px-3 pb-1 pt-2 text-[0.68rem] font-bold uppercase tracking-wide text-steel-500">
              Stopped
            </p>
            {stopped.map(item)}

            {error && (
              <p className="mt-1 border-t border-line/[0.06] px-3 py-2 text-xs text-danger-400">{error}</p>
            )}
          </div>
        </>,
        document.body
      )}

      {/* Only ever open for a stage that needs something typed — see `stageNeeds`. */}
      <ProductionLineDialog
        order={asking ? order : null}
        line={asking ? line : null}
        initialStatus={asking || undefined}
        onClose={() => setAsking(null)}
        onSaved={(saved) => { setAsking(null); onSaved?.(saved); }}
      />
    </>
  );
}
