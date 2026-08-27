import { useEffect, useId, useRef, useState } from 'react';
import { places } from '../api/endpoints.js';
import { useDebounced } from '../hooks/useRecords.js';

/**
 * A text box that suggests, and never insists.
 *
 * The problem is one spelling per place. Left as free text, the database fills with Tiruppur,
 * Tirupur and TIRUPPUR — one town to everybody in the plant, three to every report that
 * groups by city. The person who then reads "Tiruppur: 3" against eleven real customers does
 * not conclude the spelling is wrong; they conclude the CRM is.
 *
 * So this is a plain `<input>` with a list under it, not a `<select>`. The distinction is the
 * whole design:
 *
 * **Whatever is typed is the value.** A buyer in a village the list has never seen is still a
 * buyer, and a form that refuses them is a worse problem than an inconsistent spelling. The
 * suggestions make the consistent answer the easy one; they never make it the only one.
 *
 * **Choosing a town fills in the state.** That is the payoff for pairing them, and it is the
 * reason somebody uses the list rather than typing past it.
 *
 * **The list is the server's.** Which towns exist, which spelling is canonical, and how a
 * state narrows them are rules with enough in them to be worth having in exactly one place.
 */
export default function PlaceInput({
  kind, // 'state' | 'city'
  value,
  onChange,
  /** For a city: the chosen state, which narrows the list. */
  state,
  /** For a city: called with the state the chosen town sits in. */
  onResolveState,
  placeholder,
  disabled = false,
  'aria-label': ariaLabel,
}) {
  const [open, setOpen] = useState(false);
  const [options, setOptions] = useState([]);
  const [active, setActive] = useState(0);

  const wrapper = useRef(null);
  const requestId = useRef(0);
  const listId = useId();

  const term = useDebounced(value || '', 200);

  useEffect(() => {
    if (!open) return undefined;

    let cancelled = false;
    const current = ++requestId.current;

    const load = kind === 'state' ? places.states({ q: term }) : places.cities({ q: term, state });

    load
      .then((rows) => {
        // A slower earlier response must not land on top of a newer one — the list would
        // then show matches for letters the person has already typed past.
        if (cancelled || current !== requestId.current) return;
        setOptions(rows);
        setActive(0);
      })
      .catch(() => {
        // A suggestion list that cannot load is a quiet loss of help, not an error worth
        // interrupting a form for. What was typed is still the value.
        if (!cancelled) setOptions([]);
      });

    return () => {
      cancelled = true;
    };
  }, [open, kind, term, state]);

  // Clicking away closes it. A dropdown that has to be dismissed is one people fight.
  useEffect(() => {
    if (!open) return undefined;
    const onPointerDown = (event) => {
      if (wrapper.current && !wrapper.current.contains(event.target)) setOpen(false);
    };
    document.addEventListener('pointerdown', onPointerDown);
    return () => document.removeEventListener('pointerdown', onPointerDown);
  }, [open]);

  const choose = (option) => {
    onChange(option.name);
    if (kind === 'city' && option.state) onResolveState?.(option.state);
    setOpen(false);
  };

  const onKeyDown = (event) => {
    /*
     * Escape first, and independently of whether anything matched.
     *
     * Guarding it behind `options.length` meant that typing a town the list has never seen —
     * which is exactly when somebody reaches for Escape to dismiss an unhelpful dropdown —
     * let the key through to the dialog, closing the whole form and losing everything already
     * filled in. Escape belongs to whatever is open, and while this box is open that is this
     * box.
     */
    if (event.key === 'Escape') {
      if (!open) return;
      event.stopPropagation();
      setOpen(false);
      return;
    }

    if (!open || !options.length) return;

    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setActive((index) => (index + 1) % options.length);
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setActive((index) => (index - 1 + options.length) % options.length);
    } else if (event.key === 'Enter') {
      // Only when a suggestion is highlighted: Enter on a town that is not in the list has
      // to submit what was typed, which is the whole point of the control.
      event.preventDefault();
      choose(options[active]);
    }
  };

  return (
    <div ref={wrapper} className="relative">
      <input
        className="input"
        value={value || ''}
        placeholder={placeholder}
        disabled={disabled}
        autoComplete="off"
        role="combobox"
        aria-expanded={open}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-label={ariaLabel}
        onChange={(event) => {
          onChange(event.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={onKeyDown}
      />

      {open && options.length > 0 && (
        <ul
          id={listId}
          role="listbox"
          className="card absolute z-30 mt-1 max-h-56 w-full overflow-y-auto p-1 !bg-ink-850 shadow-modal"
        >
          {options.map((option, index) => (
            <li key={option.name} role="option" aria-selected={index === active}>
              <button
                type="button"
                // `mouseDown` rather than `click`: the input blurs first otherwise, and the
                // list closes out from under the pointer before the choice registers.
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => choose(option)}
                onMouseEnter={() => setActive(index)}
                className={`flex w-full items-baseline justify-between gap-3 rounded px-2.5 py-1.5 text-left text-[0.8125rem] ${
                  index === active ? 'bg-line/[0.08] text-steel-50' : 'text-steel-200'
                }`}
              >
                <span className="truncate">{option.name}</span>
                {/* The state, so the reader can tell two same-named towns apart before
                    choosing rather than after. */}
                {kind === 'city' && option.state && !state && (
                  <span className="shrink-0 text-[0.6875rem] text-steel-500">{option.state}</span>
                )}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
