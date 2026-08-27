import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { useDebounced } from '../hooks/useRecords.js';

/**
 * A select over a list too long to be a `<select>`.
 *
 * The plain selects this replaces loaded the first two hundred records and rendered them as
 * options. That is fine until the plant has more than two hundred customers, at which point
 * the two hundred and first cannot be chosen at all — not slowly, not awkwardly: the option
 * is simply not in the document, with nothing on screen to say so. A limit that silently
 * removes valid answers is a correctness bug wearing performance clothing.
 *
 * So the list is never held in full. Typing queries the server, which already knows how to
 * search and page every one of these collections, and only the matches come back.
 *
 * Two details that decide whether it is usable:
 *
 * **The chosen record is resolved by id, separately.** Reopening a form whose customer is
 * not in the first page of an empty search must still show that customer's name, not a blank
 * box. `loadOne` exists for exactly that, and runs only when the label is not already known.
 *
 * **Truncation is on screen.** When more match than are shown, the list says so and says how
 * many, because "keep typing" is only obvious advice when the reader knows the list is short
 * of the answer.
 */
export default function Combobox({
  value,
  onChange,
  loadOptions,
  loadOne,
  toOption,
  placeholder = 'Search…',
  emptyLabel = 'None',
  disabled = false,
  noMatchLabel = 'Nothing matches',
  /**
   * Called with whatever has been typed, to create the record that is not there yet.
   *
   * Searching a master and finding nothing is the moment the record is needed — being sent
   * to another screen to add it, and back again, is where a half-filled form gets abandoned
   * and the buyer ends up typed into a remarks box instead.
   */
  onCreate,
  createLabel = 'Add',
  'aria-label': ariaLabel,
}) {
  const [open, setOpen] = useState(false);
  const [term, setTerm] = useState('');
  const [options, setOptions] = useState([]);
  const [pagination, setPagination] = useState(null);
  const [loading, setLoading] = useState(false);
  const [active, setActive] = useState(0);
  /** The label for `value`, kept so the closed box shows a name rather than an id. */
  const [chosen, setChosen] = useState(null);

  const wrapper = useRef(null);
  const input = useRef(null);
  const requestId = useRef(0);
  const listId = useId();

  const search = useDebounced(term, 250);

  /* Resolve whatever is selected, so the box can show its name. */
  useEffect(() => {
    let cancelled = false;
    if (!value) {
      setChosen(null);
      return undefined;
    }
    if (chosen?.value === value) return undefined;

    // Usually already on screen — only ask the server when it is genuinely not.
    const known = options.find((option) => option.value === value);
    if (known) {
      setChosen(known);
      return undefined;
    }

    loadOne?.(value)
      .then((record) => {
        if (cancelled || !record) return;
        const option = toOption(record);
        // A label-less option would render as an empty box with no placeholder either —
        // indistinguishable from having chosen nothing. Better to leave the prompt showing.
        if (option?.label) setChosen(option);
      })
      .catch(() => {});

    return () => {
      cancelled = true;
    };
  }, [value, chosen, options, loadOne, toOption]);

  /* Query while open. Closed, it costs nothing. */
  useEffect(() => {
    if (!open) return undefined;

    const current = ++requestId.current;
    setLoading(true);

    let cancelled = false;
    loadOptions(search)
      .then((response) => {
        if (cancelled || current !== requestId.current) return;
        setOptions((response.data || []).map(toOption));
        setPagination(response.pagination || null);
        setActive(0);
      })
      .catch(() => {
        if (!cancelled && current === requestId.current) setOptions([]);
      })
      .finally(() => {
        if (!cancelled && current === requestId.current) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [open, search, loadOptions, toOption]);

  /* A click anywhere else closes it, the way a native select does. */
  useEffect(() => {
    if (!open) return undefined;

    const onPointerDown = (event) => {
      if (!wrapper.current?.contains(event.target)) setOpen(false);
    };
    document.addEventListener('mousedown', onPointerDown);
    return () => document.removeEventListener('mousedown', onPointerDown);
  }, [open]);

  const rows = emptyLabel ? [{ value: '', label: emptyLabel }, ...options] : options;

  const choose = useCallback(
    (option) => {
      onChange(option.value || undefined);
      setChosen(option.value ? option : null);
      setOpen(false);
      setTerm('');
    },
    [onChange]
  );

  const onKeyDown = (event) => {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      if (!open) return setOpen(true);
      const step = event.key === 'ArrowDown' ? 1 : -1;
      return setActive((index) => Math.min(Math.max(index + step, 0), rows.length - 1));
    }
    if (event.key === 'Enter' && open) {
      event.preventDefault();
      if (rows[active]) choose(rows[active]);
      return undefined;
    }
    if (event.key === 'Escape' && open) {
      // Only the list closes. Letting this reach the dialog behind it would throw away a
      // half-filled form for the sake of dismissing a dropdown.
      event.stopPropagation();
      setOpen(false);
      setTerm('');
    }
    return undefined;
  };

  const hidden = pagination ? pagination.total - options.length : 0;

  return (
    <div ref={wrapper} className="relative">
      <input
        ref={input}
        type="text"
        className="input"
        role="combobox"
        aria-expanded={open}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-label={ariaLabel}
        disabled={disabled}
        placeholder={chosen ? chosen.label : placeholder}
        value={open ? term : chosen?.label || ''}
        onChange={(event) => {
          setTerm(event.target.value);
          if (!open) setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={onKeyDown}
      />

      {open && (
        <ul
          id={listId}
          role="listbox"
          className="absolute z-30 mt-1 max-h-64 w-full overflow-y-auto rounded-lg border border-line/[0.08] bg-ink-800 py-1 shadow-raised"
        >
          {loading && !options.length && (
            <li className="px-3 py-2 text-xs text-steel-500">Searching…</li>
          )}

          {!loading && !options.length && (
            <li className="px-3 py-2 text-xs text-steel-500">{noMatchLabel}</li>
          )}

          {rows.map((option, index) => (
            <li key={option.value || '__none'}>
              <button
                type="button"
                role="option"
                aria-selected={option.value === (value || '')}
                className={`flex w-full items-baseline gap-2 px-3 py-2 text-left text-[0.8125rem] ${
                  index === active ? 'bg-line/[0.06] text-steel-50' : 'text-steel-200'
                }`}
                onMouseEnter={() => setActive(index)}
                /*
                 * Keeps focus in the input through the click. Without this the button takes
                 * focus, the input's `onFocus` fires again as focus returns, and the list
                 * reopens the instant it is closed — leaving the chosen name showing as a
                 * placeholder over an empty box, which reads as having chosen nothing.
                 */
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => choose(option)}
              >
                <span className="truncate font-medium">{option.label}</span>
                {option.hint && (
                  <span className="ml-auto shrink-0 text-xs text-steel-500">{option.hint}</span>
                )}
              </button>
            </li>
          ))}

          {/* Said out loud rather than left to be discovered by an answer going missing. */}
          {hidden > 0 && (
            <li className="border-t border-line/[0.06] px-3 py-2 text-[0.6875rem] text-steel-500">
              {hidden} more match. Type to narrow the list.
            </li>
          )}

          {onCreate && (
            <li className="border-t border-line/[0.06]">
              <button
                type="button"
                className="flex w-full items-baseline gap-1.5 px-3 py-2 text-left text-[0.8125rem] font-semibold text-flame-500 hover:bg-line/[0.06]"
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => {
                  setOpen(false);
                  // The typed text is the answer to "what is it called", so it goes with it.
                  onCreate(term.trim());
                }}
              >
                <span aria-hidden="true">+</span>
                <span className="truncate">
                  {term.trim() ? `${createLabel} “${term.trim()}”` : createLabel}
                </span>
              </button>
            </li>
          )}
        </ul>
      )}
    </div>
  );
}
