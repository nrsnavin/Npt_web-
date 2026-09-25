import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { queries as queriesApi } from '../api/endpoints.js';
import { useToast } from '../context/ToastContext.jsx';
import { LABEL_MAX_LENGTH, labelHue, labelProblem, normaliseLabel } from '../utils/labels.js';

/**
 * Filing queries from the list itself — drag a row onto a label, tick a few and file them
 * together, or press # on a row. Three doors to one server call (`POST /queries/labels`), which
 * adds or removes one label and never replaces a set built from a row loaded minutes ago.
 */

/** What a dragged row carries. Its own type, so dropping a link or a file here does nothing. */
export const DRAG_TYPE = 'application/x-npt-queries';

/** A label's colour: the same hue every time for the same word, so a group is recognised by sight. */
export function LabelDot({ label, className = '' }) {
  return (
    <span
      aria-hidden
      className={`inline-block h-2 w-2 shrink-0 rounded-full ${className}`}
      style={{ backgroundColor: `hsl(${labelHue(label)} 70% 52%)` }}
    />
  );
}

/**
 * Filing with an undo.
 *
 * Says what happened — "Filed 3 under #quality" — and offers to take it back, because a drop is
 * one careless flick of the wrist and the fix should be one press, not three. A thread that could
 * not take the label (already at five) is named in the same toast rather than failing quietly.
 */
export function useLabelling(onChanged) {
  const { undoable, warn } = useToast();

  const file = useCallback(
    async ({ ids, add, remove }) => {
      if (!ids?.length) return null;
      try {
        const result = await queriesApi.bulkLabel({ ids, add, remove });
        onChanged?.();
        const count = result.updated.length;
        const full = result.skipped.filter((row) => row.reason !== 'Not found');
        const skipped = full.length
          ? `${full.map((row) => row.number || 'One').join(', ')} already ${full.length === 1 ? 'has' : 'have'} five labels.`
          : undefined;

        if (!count) {
          if (skipped) warn(`Nothing filed under #${result.label}`, skipped);
          return result;
        }
        const noun = count === 1 ? 'query' : `${count} queries`;
        undoable(add ? `Filed ${noun} under #${result.label}` : `Took #${result.label} off ${noun}`, {
          detail: skipped,
          onAction: async () => {
            await queriesApi.bulkLabel(add ? { ids: result.updated, remove: result.label } : { ids: result.updated, add: result.label });
            onChanged?.();
          },
        });
        return result;
      } catch (error) {
        warn('Could not change the label', error.message);
        return null;
      }
    },
    [onChanged, undoable, warn]
  );

  return file;
}

/** The ids a drop carries, or none — anything that is not a row from this list is ignored. */
export function droppedIds(event) {
  try {
    const ids = JSON.parse(event.dataTransfer.getData(DRAG_TYPE) || '[]');
    return Array.isArray(ids) ? ids : [];
  } catch {
    return [];
  }
}

/** Starts dragging one row, or every ticked row when the grabbed one is among them. */
export function startRowDrag(event, ids) {
  event.dataTransfer.setData(DRAG_TYPE, JSON.stringify(ids));
  event.dataTransfer.effectAllowed = 'copy';

  /* A small pill under the pointer — "3 queries" — rather than a ghost of the whole row, which
     covers the very labels it is being dragged to. */
  const pill = document.createElement('div');
  pill.textContent = ids.length === 1 ? '1 query' : `${ids.length} queries`;
  pill.style.cssText =
    'position:absolute;top:-1000px;padding:6px 12px;border-radius:999px;font:600 13px system-ui;' +
    'background:#f97316;color:#fff;box-shadow:0 6px 20px rgba(0,0,0,.25)';
  document.body.appendChild(pill);
  event.dataTransfer.setDragImage(pill, 12, 12);
  setTimeout(() => pill.remove(), 0);
}

/** A target a row can be dropped on. Lights up while something is held over it. */
function DropTarget({ onDropIds, children, className = '', activeClass = '', dragging, ...rest }) {
  const [over, setOver] = useState(false);
  return (
    <div
      {...rest}
      onDragOver={(event) => {
        if (!event.dataTransfer.types.includes(DRAG_TYPE)) return;
        event.preventDefault();
        event.dataTransfer.dropEffect = 'copy';
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(event) => {
        event.preventDefault();
        setOver(false);
        const ids = droppedIds(event);
        if (ids.length) onDropIds(ids);
      }}
      className={`${className} ${dragging ? 'ring-1 ring-dashed ring-line/25' : ''} ${over ? activeClass : ''}`}
    >
      {children}
    </div>
  );
}

/**
 * The labels, down the side of the list: each one a filter to press and a place to drop a query.
 *
 * Counted over everything the reader can see, so the rail holds still while somebody works
 * through it. "New label" is a drop target too — drop, name it, done — which is how a group is
 * started without leaving the list.
 */
export function LabelRail({ labels = [], active, onChoose, onFile, dragging, total }) {
  const [naming, setNaming] = useState(null);

  return (
    <nav aria-label="Labels" className="space-y-1">
      <p className="px-3 pb-1 text-xs font-bold uppercase tracking-[0.08em] text-steel-500">Labels</p>

      <button
        type="button"
        onClick={() => onChoose('')}
        aria-pressed={!active}
        className={`flex w-full items-center justify-between rounded-lg px-3 py-2 text-sm font-semibold transition-colors ${
          !active ? 'bg-line/[0.07] text-steel-50' : 'text-steel-300 hover:bg-line/[0.04]'
        }`}
      >
        <span>All queries</span>
        {total !== undefined && <span className="text-xs tabular-nums text-steel-500">{total}</span>}
      </button>

      {labels.map((entry) => (
        <DropTarget
          key={entry.label}
          dragging={dragging}
          onDropIds={(ids) => onFile({ ids, add: entry.label })}
          className="rounded-lg transition-colors"
          activeClass="bg-flame-500/15 ring-2 ring-flame-500/60"
        >
          <button
            type="button"
            onClick={() => onChoose(active === entry.label ? '' : entry.label)}
            aria-pressed={active === entry.label}
            className={`flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm transition-colors ${
              active === entry.label
                ? 'bg-flame-500/10 font-bold text-flame-400'
                : 'font-medium text-steel-200 hover:bg-line/[0.04]'
            }`}
          >
            <LabelDot label={entry.label} />
            <span className="min-w-0 flex-1 truncate">{entry.label}</span>
            <span className="text-xs tabular-nums text-steel-500">{entry.count}</span>
          </button>
        </DropTarget>
      ))}

      {naming ? (
        <NameLabel
          ids={naming}
          onDone={(label) => {
            if (label) onFile({ ids: naming, add: label });
            setNaming(null);
          }}
        />
      ) : (
        <DropTarget
          dragging={dragging}
          onDropIds={(ids) => setNaming(ids)}
          className="rounded-lg transition-colors"
          activeClass="bg-aqua-500/10 ring-2 ring-aqua-500/60"
        >
          <p className="rounded-lg border border-dashed border-line/15 px-3 py-2.5 text-xs leading-relaxed text-steel-500">
            {dragging ? (
              <span className="font-semibold text-aqua-300">Drop here to start a new label</span>
            ) : labels.length ? (
              'Drag a query onto a label to file it. Drop it here to start a new one.'
            ) : (
              'No labels yet. Drag a query here to start one.'
            )}
          </p>
        </DropTarget>
      )}
    </nav>
  );
}

/** Naming a label for the queries just dropped on "new". Enter saves, Escape lets go. */
function NameLabel({ ids, onDone }) {
  const [draft, setDraft] = useState('');
  const [problem, setProblem] = useState(null);

  const save = (event) => {
    event.preventDefault();
    const label = normaliseLabel(draft);
    const why = labelProblem(label);
    if (why) {
      setProblem(why);
      return;
    }
    onDone(label);
  };

  return (
    <form onSubmit={save} className="space-y-1.5 rounded-lg bg-aqua-500/[0.06] p-2 ring-1 ring-aqua-500/30">
      <p className="px-1 text-xs font-semibold text-aqua-300">
        Name a label for {ids.length === 1 ? 'this query' : `these ${ids.length}`}
      </p>
      <input
        autoFocus
        className="input h-8 py-1 text-sm"
        aria-label="New label name"
        placeholder="e.g. quality"
        maxLength={LABEL_MAX_LENGTH}
        value={draft}
        onChange={(event) => {
          setDraft(event.target.value);
          setProblem(null);
        }}
        onKeyDown={(event) => event.key === 'Escape' && onDone(null)}
      />
      {problem && <p role="alert" className="px-1 text-xs text-danger-400">{problem}</p>}
      <div className="flex justify-end gap-1.5">
        <button type="button" className="btn-ghost h-7 px-2 py-0 text-xs" onClick={() => onDone(null)}>Cancel</button>
        <button type="submit" className="btn-primary h-7 px-3 py-0 text-xs">File</button>
      </div>
    </form>
  );
}

/**
 * The # menu: every label as a switch, and a box that starts a new one.
 *
 * For one row it shows which labels the row already carries and toggles them. For a selection it
 * only adds or removes across all of them — a tick box can't honestly say "some of these".
 */
export function LabelPicker({ known = [], current = null, onToggle, onClose, align = 'right', up: forceUp = false }) {
  const [search, setSearch] = useState('');
  const [up, setUp] = useState(forceUp);
  const box = useRef(null);

  /* Opens upward when there is no room below — the last row on a phone, where the floating
     Workspace button owns the bottom corner. Measured before paint, so it never flickers. */
  useLayoutEffect(() => {
    if (forceUp || !box.current) return;
    const { bottom, height } = box.current.getBoundingClientRect();
    if (bottom > window.innerHeight - 88 && box.current.parentElement.getBoundingClientRect().top > height + 16) setUp(true);
  }, [forceUp]);

  useEffect(() => {
    const away = (event) => box.current && !box.current.contains(event.target) && onClose();
    const escape = (event) => event.key === 'Escape' && onClose();
    document.addEventListener('mousedown', away);
    document.addEventListener('keydown', escape);
    return () => {
      document.removeEventListener('mousedown', away);
      document.removeEventListener('keydown', escape);
    };
  }, [onClose]);

  const wanted = normaliseLabel(search);
  const shown = known.filter((label) => label.includes(wanted));
  const isNew = wanted && !known.includes(wanted);
  const problem = isNew ? labelProblem(wanted) : null;

  return (
    <div
      ref={box}
      role="dialog"
      aria-label="Labels"
      onClick={(event) => {
        /* Inside a row that is a link: a press in here must not open the thread. */
        event.preventDefault();
        event.stopPropagation();
      }}
      className={`absolute z-40 w-64 animate-scale-in rounded-xl border border-line/[0.1] bg-ink-800 p-2 shadow-modal ${
        align === 'right' ? 'right-0' : 'left-0'
      } ${up ? 'bottom-full mb-1' : 'mt-1'}`}
    >
      <input
        autoFocus
        className="input h-8 py-1 text-sm"
        aria-label="Find or create a label"
        placeholder="Find or create a label…"
        maxLength={LABEL_MAX_LENGTH}
        value={search}
        onChange={(event) => setSearch(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Enter' && isNew && !problem) {
            event.preventDefault();
            onToggle(wanted, true);
            setSearch('');
          }
        }}
      />
      <ul className="mt-1.5 max-h-60 overflow-y-auto">
        {shown.map((label) => {
          const on = current?.includes(label);
          return (
            <li key={label}>
              <button
                type="button"
                role="menuitemcheckbox"
                aria-checked={Boolean(on)}
                onClick={() => onToggle(label, !on)}
                className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-left text-sm text-steel-200 hover:bg-line/[0.06]"
              >
                <LabelDot label={label} />
                <span className="min-w-0 flex-1 truncate">{label}</span>
                {current ? (
                  <span className={`text-xs font-bold ${on ? 'text-flame-400' : 'text-transparent'}`}>✓</span>
                ) : (
                  <span className="text-xs text-steel-500">Add</span>
                )}
              </button>
            </li>
          );
        })}
        {isNew && (
          <li>
            <button
              type="button"
              disabled={Boolean(problem)}
              onClick={() => {
                onToggle(wanted, true);
                setSearch('');
              }}
              className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-sm text-aqua-300 hover:bg-aqua-500/10 disabled:text-steel-500"
            >
              {problem || <>Create <span className="font-semibold">#{wanted}</span></>}
            </button>
          </li>
        )}
        {!shown.length && !isNew && (
          <li className="px-2.5 py-2 text-xs text-steel-500">Type a word to start the first label.</li>
        )}
      </ul>
      {current === null && known.length > 0 && (
        <p className="border-t border-line/[0.06] px-2.5 pt-1.5 text-[0.7rem] text-steel-500">
          Adds to every selected query. Remove a label from a row with its ×.
        </p>
      )}
    </div>
  );
}

/**
 * What the page can do with the ticked rows. Sits on top of the list and stays there while it
 * scrolls — at the foot it fought the confirmations for the same corner of the screen.
 */
export function SelectionBar({ count, known, onFile, onClear, ids }) {
  const [picking, setPicking] = useState(false);
  if (!count) return null;
  return (
    <div className="sticky top-16 z-30 mb-3">
      <div className="relative flex items-center gap-2 rounded-xl border border-flame-500/30 bg-ink-800 py-1.5 pl-4 pr-1.5 shadow-modal">
        <span className="text-sm font-semibold text-steel-100">{count} selected</span>
        <span className="hidden flex-1 text-xs text-steel-500 sm:inline">Drag them onto a label, or</span>
        <div className="relative">
          <button
            type="button"
            className="btn-primary h-8 rounded-full px-3.5 py-0 text-sm"
            onMouseDown={(event) => event.stopPropagation()}
            onClick={() => setPicking((open) => !open)}
          >
            # Label
          </button>
          {picking && (
            <div className="absolute right-0 top-full">
              <LabelPicker
                known={known}
                onClose={() => setPicking(false)}
                onToggle={(label) => {
                  setPicking(false);
                  onFile({ ids, add: label });
                }}
              />
            </div>
          )}
        </div>
        <button type="button" className="btn-ghost h-8 rounded-full px-3 py-0 text-sm" onClick={onClear}>
          Clear
        </button>
      </div>
    </div>
  );
}
