import { useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { ErrorState, Field, Modal, Notice, Spinner } from './ui.jsx';
import {
  columnsOf, columnTone, dropAllowed, dropRefusal, MOVE_FIELDS, noteFieldFor, requirementsFor,
} from '../utils/boards.js';
import { formatCompactCurrency, formatNumber } from '../utils/format.js';

/**
 * One kanban board, drawn for whichever of the three it is handed.
 *
 * The three boards — leads, enquiries, sample follow-ups — are the same shape: a record with a
 * status, an owner, a promise about when it is next touched, and a number behind it. Three
 * implementations would be three places to fix a drag bug once and miss it twice, so this is
 * one component and the differences live in `utils/boards.js` as data.
 *
 * Four decisions are worth stating, because each is the opposite of the obvious one.
 *
 * **Drag is the accelerator; the menu is the interface.** Every card carries a Move control that
 * opens the same dialog a drop opens, and it is not a fallback — it is the path that works with
 * a keyboard, works on a phone, and works for anybody who would rather read the list of
 * destinations than aim at one. Building drag first and bolting a menu on afterwards produces a
 * board most of a plant cannot use.
 *
 * **The columns a card cannot reach are dimmed while it is being dragged, not after it lands.**
 * §3 refuses to let an enquiry slide back down the funnel and the sample bench may not record
 * the customer's verdict; a board that accepts the drop and then shows an error has taught the
 * reader that the screen is guessing. The rule is read from the same helpers the detail screens'
 * move dialogs already use, so there is one statement of it on this side of the wire.
 *
 * **A move that needs more is asked before it is made.** Losing needs a reason, parking needs to
 * say what it is waiting on, winning needs the figure, dispatching needs a courier and an AWB.
 * These are the server's requirements; asking for them at the drop is the difference between a
 * board that finishes the job and one that hands you a 400 and a card back where it started.
 *
 * **The ladder is a ladder; the trays are trays.** Won, lost, hold, cancelled — the columns work
 * *leaves* through rather than climbs — sit narrower and quieter at the end. Given equal width
 * in the row they flatten the funnel into twelve identical boxes and destroy the one picture the
 * board draws.
 */

/* Column head tones by what the column means, never by which board it is on. */
const HEAD_TONE = {
  good: 'text-success-400',
  bad: 'text-steel-400',
  parked: 'text-warn-400',
  working: 'text-steel-200',
};

const BAR_TONE = {
  good: 'bg-success-500',
  bad: 'bg-steel-500',
  parked: 'bg-warn-500',
  working: 'bg-aqua-500',
};

/**
 * The dialog a drop opens when the move needs telling something first.
 *
 * Fields are keyed by the name the server expects and posted straight through, so a label
 * cannot drift away from the payload it is describing.
 */
function MoveDialog({ open, card, to, label, needs, noteField, onClose, onConfirm, describe }) {
  const [values, setValues] = useState({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const set = (name) => (event) => setValues((current) => ({ ...current, [name]: event.target.value }));

  /* `note` in `needs` means the server will refuse without it — a reopen. Then it is asked for
   * as a required field rather than offered a second time as an optional one below. */
  const noteRequired = needs.includes('note');

  const submit = async (event) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    const result = await onConfirm(values);
    setBusy(false);
    if (result?.ok) {
      setValues({});
      onClose();
    } else {
      setError(result?.error);
    }
  };

  return (
    <Modal
      open={open}
      title={`Move to ${label}`}
      description={card ? describe?.(card) : undefined}
      onClose={busy ? undefined : onClose}
    >
      <form onSubmit={submit} className="space-y-5">
        {needs.map((name) => {
          const field = MOVE_FIELDS[name];
          if (!field) return null;
          /* A required note posts under whatever key this record keeps its notes in. */
          const key = name === 'note' ? noteField || 'note' : name;
          return (
            <Field key={name} label={field.label} hint={field.hint}>
              {field.type === 'select' && (
                <select className="input" value={values[key] || ''} onChange={set(key)} required>
                  <option value="">Choose one…</option>
                  {field.options.map((option) => (
                    <option key={option.value} value={option.value}>{option.label}</option>
                  ))}
                </select>
              )}
              {field.type === 'textarea' && (
                <textarea rows={2} className="input" value={values[key] || ''} onChange={set(key)} required />
              )}
              {field.type !== 'select' && field.type !== 'textarea' && (
                <input
                  className="input"
                  type={field.type}
                  placeholder={field.placeholder}
                  value={values[key] || ''}
                  onChange={set(key)}
                  required
                />
              )}
            </Field>
          );
        })}

        {/*
          * An optional note, where the record has somewhere to keep one. It lands in the status
          * history beside the move, which is the only place the reason a card jumped two columns
          * on a Tuesday survives long enough to answer a question a month later.
          *
          * Drawn only when there is a field for it: a lead has nowhere to put a general note, so
          * offering the box would collect something the next request quietly drops.
          */}
        {noteField && !noteRequired && (
          <Field label="Note" hint="Goes into the history with the move">
            <textarea
              rows={2}
              className="input"
              value={values[noteField] || ''}
              onChange={set(noteField)}
            />
          </Field>
        )}

        {error && (
          <Notice tone="danger">
            <p>{error.message}</p>
          </Notice>
        )}

        <div className="flex justify-end gap-2 border-t border-line/[0.06] pt-4">
          <button type="button" className="btn-secondary" onClick={onClose} disabled={busy}>Cancel</button>
          <button type="submit" className="btn-primary" disabled={busy}>
            {busy ? 'Moving…' : `Move to ${label}`}
          </button>
        </div>
      </form>
    </Modal>
  );
}

/** The Move control on a card: every destination it may reach, and nothing it may not. */
function MoveMenu({ board, targets, onPick }) {
  const [open, setOpen] = useState(false);

  if (!targets.length) return null;

  return (
    <div className="relative">
      <button
        type="button"
        className="row-action text-xs"
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={(event) => {
          event.preventDefault();
          event.stopPropagation();
          setOpen((current) => !current);
        }}
      >
        Move ▾
      </button>
      {open && (
        <>
          {/* Click-away, drawn behind the menu so the first click outside only closes it. */}
          <button
            type="button"
            aria-hidden
            tabIndex={-1}
            className="fixed inset-0 z-20 cursor-default"
            onClick={(event) => {
              event.preventDefault();
              setOpen(false);
            }}
          />
          <ul
            role="listbox"
            className="card absolute right-0 z-30 mt-1 max-h-64 w-56 overflow-y-auto py-1 text-left"
          >
            {targets.map((status) => (
              <li key={status}>
                <button
                  type="button"
                  role="option"
                  aria-selected={false}
                  className="w-full px-3 py-1.5 text-left text-xs text-steel-200 hover:bg-line/[0.06]"
                  onClick={(event) => {
                    event.preventDefault();
                    setOpen(false);
                    onPick(status);
                  }}
                >
                  {board.labels[status]}
                </button>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}

export default function Board({
  board,
  columns,
  loading,
  error,
  onRetry,
  /** Which columns this card may be dropped on, from the rules the detail screens already use. */
  targetsFor,
  /** Does the move. Given `{ card, from, to, extra }`, returns `{ ok }` or `{ ok: false, error }`. */
  onMove,
  moveError,
  onDismissMoveError,
  canMove = false,
  renderCard,
  hrefFor,
  /** A one-line description of a card, shown at the top of the move dialog. */
  describeCard,
  /** What a column's money line means. `null` leaves the line off entirely. */
  valueLabel = null,
  /**
   * Columns to leave out entirely.
   *
   * This is how an "Open" filter keeps its meaning on a board. Filtering the *rows* to the open
   * ones would leave the closed columns drawn and empty, and switching between Open and All
   * would visibly do nothing — so the filter becomes a column choice instead, which is what it
   * always meant. The counts are unaffected: a hidden column is not being under-reported, it is
   * not being asked about.
   */
  hidden = [],
  onShowMore,
}) {
  const [dragging, setDragging] = useState(null);
  const [asked, setAsked] = useState(null);
  const [loadingMore, setLoadingMore] = useState(null);
  /*
   * Drag-enter and drag-leave both fire as the pointer crosses a child of the column, so a
   * naive boolean flickers the whole time the card is over a card. Counting entries against
   * leaves is the standard fix and the only one that does not need pointer geometry.
   */
  const depth = useRef({});
  const [over, setOver] = useState(null);

  const order = useMemo(
    () => columnsOf(board).filter((status) => !hidden.includes(status)),
    [board, hidden]
  );
  const byStatus = useMemo(
    () => Object.fromEntries((columns || []).map((column) => [column.status, column])),
    [columns]
  );

  /* Every bar in the row is drawn against the fullest column, so the row reads as one shape. */
  const busiest = Math.max(1, ...order.map((status) => byStatus[status]?.total || 0));

  const allowed = useMemo(() => {
    if (!dragging) return null;
    return new Set(targetsFor(dragging.card));
  }, [dragging, targetsFor]);

  const begin = ({ card, from }) => {
    if (!canMove) return;
    setDragging({ card, from });
  };

  const finish = () => {
    setDragging(null);
    setOver(null);
    depth.current = {};
  };

  /** A drop, or a pick from the Move menu — the same path from here on. */
  const start = ({ card, from, to }) => {
    if (from === to) return;
    const needs = requirementsFor(board, to, card);
    if (needs.length) {
      setAsked({ card, from, to, needs });
      return;
    }
    onMove({ card, from, to, extra: {} });
  };

  const showMore = async (status) => {
    setLoadingMore(status);
    try {
      await onShowMore(status);
    } finally {
      setLoadingMore(null);
    }
  };

  if (error) return <ErrorState error={error} onRetry={onRetry} />;

  return (
    <div className="space-y-3">
      {/*
        * A refused move, said once above the board rather than on the card that bounced. The
        * card is already back where it started, which is the answer to "what happened"; this is
        * the answer to "why", and the server writes those sentences for people to read.
        */}
      {moveError && (
        <Notice tone="danger">
          <div className="flex items-start justify-between gap-3">
            <p>{moveError.message}</p>
            <button type="button" className="row-action shrink-0 text-xs" onClick={onDismissMoveError}>
              Dismiss
            </button>
          </div>
        </Notice>
      )}

      <div className="-mx-1 flex gap-3 overflow-x-auto px-1 pb-3">
        {order.map((status) => {
          const column = byStatus[status] || { status, total: 0, value: 0, cards: [] };
          const tray = board.tray.includes(status);
          const tone = columnTone(status);
          const refusal = dropRefusal(board, status);
          const accepts = Boolean(dragging) && allowed?.has(status) && dropAllowed(board, status);
          const rejects = Boolean(dragging) && !accepts && dragging.from !== status;

          /*
           * An empty column folds down to a spine, and opens again the moment a card is picked
           * up.
           *
           * Twelve full-width columns do not fit on any screen anybody has, so eight of them —
           * always the empty ones, since a sparse funnel is the normal state — sit off the right
           * edge where nothing about the shape of the book can be read. Folding the empty ones
           * is what gets the whole ladder onto one screen, which is the only reason to draw a
           * board rather than a table.
           *
           * It opens on drag because a column you cannot drop on is not a column. This is why
           * the fold is keyed on `dragging` rather than on a click: the one moment an empty
           * stage needs its full width is the moment somebody is holding something for it.
           */
          const folded = !dragging && column.total === 0;

          return (
            <section
              key={status}
              /* The tray columns are narrower on purpose — see the note at the top. */
              className={`flex shrink-0 flex-col rounded-xl border transition-all duration-200 ${
                folded ? 'w-11 bg-ink-900/30' : tray ? 'w-52 bg-ink-900/40' : 'w-64 bg-ink-850/60'
              } ${
                over === status && accepts
                  ? 'border-flame-500/60 bg-flame-500/[0.04]'
                  : 'border-line/[0.06]'
              } ${rejects ? 'opacity-40' : ''}`}
              aria-label={board.labels[status]}
              onDragOver={(event) => {
                if (!accepts) return;
                // Only preventDefault on a column that will actually take it: the browser's
                // "no entry" cursor over the others is the honest signal, and free.
                event.preventDefault();
              }}
              onDragEnter={() => {
                depth.current[status] = (depth.current[status] || 0) + 1;
                if (accepts) setOver(status);
              }}
              onDragLeave={() => {
                depth.current[status] = Math.max((depth.current[status] || 0) - 1, 0);
                if (!depth.current[status]) setOver((current) => (current === status ? null : current));
              }}
              onDrop={(event) => {
                event.preventDefault();
                const held = dragging;
                finish();
                if (held && accepts) start({ ...held, to: status });
              }}
            >
              {folded ? (
                /* The spine: the stage still exists and is still nameable, in a twelfth of the room. */
                <div className="flex flex-1 flex-col items-center gap-2 py-3">
                  <span className="text-[11px] font-semibold tabular-nums text-steel-500">0</span>
                  <span
                    className="whitespace-nowrap text-[11px] font-semibold uppercase tracking-wide text-steel-500"
                    style={{ writingMode: 'vertical-rl' }}
                  >
                    {board.labels[status]}
                  </span>
                </div>
              ) : (
              <>
              <header className="border-b border-line/[0.06] px-3 py-2.5">
                <div className="flex items-baseline justify-between gap-2">
                  <h3 className={`text-xs font-semibold uppercase tracking-wide ${HEAD_TONE[tone]}`}>
                    {board.labels[status]}
                  </h3>
                  <span className="tabular-nums text-xs font-semibold text-steel-100">
                    {formatNumber(column.total)}
                  </span>
                </div>

                {/* Scaled across the row, so the shape of the book is readable at a glance. */}
                <div className="mt-2 h-1 overflow-hidden rounded-full bg-line/[0.06]">
                  <div
                    className={`h-full rounded-full ${BAR_TONE[tone]}`}
                    style={{ width: `${Math.round(((column.total || 0) / busiest) * 100)}%` }}
                  />
                </div>

                {/*
                  * Drawn only when there is something behind it. An empty column reading
                  * "₹0.00" is a figure where there is no figure, and on a board of twelve
                  * columns it is eleven lines of noise around the one that matters.
                  */}
                {valueLabel && column.value > 0 && (
                  <p className="mt-1.5 text-[11px] tabular-nums text-steel-400">
                    {valueLabel === 'pieces'
                      ? `${formatNumber(column.value)} pcs`
                      : formatCompactCurrency(column.value)}
                  </p>
                )}

                {/* Why this column will not take a card, said on the column rather than after the drop. */}
                {refusal && (
                  <p className="mt-1.5 text-[11px] leading-snug text-steel-500">{refusal}</p>
                )}
              </header>

              <div className="flex-1 space-y-2 overflow-y-auto p-2" style={{ maxHeight: '60vh' }}>
                {loading && !column.cards.length && (
                  <div className="py-6"><Spinner label={`Loading ${board.labels[status]}`} /></div>
                )}

                {!loading && !column.cards.length && (
                  <p className="px-1 py-6 text-center text-xs text-steel-500">Nothing here</p>
                )}

                {column.cards.map((card) => (
                  <article
                    key={card._id}
                    draggable={canMove}
                    onDragStart={(event) => {
                      // Firefox refuses to start a drag without payload on the transfer.
                      event.dataTransfer.setData('text/plain', card._id);
                      event.dataTransfer.effectAllowed = 'move';
                      begin({ card, from: status });
                    }}
                    onDragEnd={finish}
                    className={`card p-2.5 transition-shadow ${canMove ? 'cursor-grab active:cursor-grabbing' : ''} ${
                      dragging?.card._id === card._id ? 'opacity-50' : ''
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <Link to={hrefFor(card)} className="min-w-0 flex-1">
                        {renderCard(card)}
                      </Link>
                      {canMove && (
                        <MoveMenu
                          board={board}
                          targets={targetsFor(card).filter(
                            (target) => target !== status && dropAllowed(board, target)
                          )}
                          onPick={(to) => start({ card, from: status, to })}
                        />
                      )}
                    </div>
                  </article>
                ))}

                {/*
                  * The head of a column, and the door to the rest of it. The count in the header
                  * is of the whole column, so this says how many are not on screen rather than
                  * offering a "more" that might turn out to be nothing.
                  */}
                {column.total > column.cards.length && (
                  <button
                    type="button"
                    className="w-full rounded-lg border border-dashed border-line/10 py-2 text-xs text-steel-400 hover:border-line/20 hover:text-steel-200"
                    onClick={() => showMore(status)}
                    disabled={loadingMore === status}
                  >
                    {loadingMore === status
                      ? 'Loading…'
                      : `Show ${formatNumber(column.total - column.cards.length)} more`}
                  </button>
                )}
              </div>
              </>
              )}
            </section>
          );
        })}
      </div>

      <MoveDialog
        open={Boolean(asked)}
        card={asked?.card}
        to={asked?.to}
        label={asked ? board.labels[asked.to] : ''}
        needs={asked?.needs || []}
        noteField={asked ? noteFieldFor(board, asked.to) : null}
        describe={describeCard}
        onClose={() => setAsked(null)}
        onConfirm={(extra) => onMove({ ...asked, extra })}
      />
    </div>
  );
}
