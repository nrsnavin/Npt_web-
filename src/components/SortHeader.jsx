import { useState } from 'react';

/**
 * Sortable column headings, for the registers that are long enough to need them.
 *
 * Sorting happens on the **server**, and that is the only decision in this file worth arguing
 * about. Re-ordering the rows in the browser would sort the twenty-five on screen and leave the
 * other four hundred where they were — a table that says "highest value first" and shows the
 * highest of page one. The most valuable enquiry in the book would sit on page seven, sorted.
 *
 * So the click changes a query parameter and the list is fetched again. That also means the
 * server decides what may be ordered by: a costing register offers its cost columns to somebody
 * holding the costing grant and refuses them to marketing, because an ordering is information
 * about the field it orders by [§8].
 *
 * One click sorts descending, the second ascending, the third returns to the list's own default.
 * Descending first because every column somebody bothers to sort is one where the interesting
 * end is the top — the biggest order, the latest enquiry, the one most overdue — and making
 * people click twice for the answer they wanted is the sort of small rudeness that adds up.
 * Returning to the default matters as much: a register's own order is usually the right one
 * (samples are late-first, enquiries newest-first) and without a third click there is no way
 * back to it short of reloading the page.
 */

/**
 * The sort state a list screen holds, expressed the way the API wants it.
 *
 * `null` means "the list's own order" and is deliberately not the same as naming the default
 * field: the sample register groups late requests first and then sorts inside that, which no
 * single field can express, and sending a field would silently drop the grouping.
 */
export function useSort() {
  const [sort, setSort] = useState(null);

  const toggle = (field) => {
    setSort((current) => {
      if (current === `-${field}`) return field;
      if (current === field) return null;
      return `-${field}`;
    });
  };

  return { sort, toggle, setSort };
}

/** ▲ / ▼ / nothing. Drawn always on the sorted column so the heading does not shift when it is. */
function Arrow({ state }) {
  if (!state) return <span aria-hidden="true" className="ml-1 text-steel-600 opacity-0 group-hover:opacity-100">▾</span>;
  return (
    <span aria-hidden="true" className="ml-1 text-flame-500">
      {state === 'desc' ? '▾' : '▴'}
    </span>
  );
}

/**
 * One sortable heading.
 *
 * A `<button>` inside the `<th>` rather than a click handler on the cell: a heading somebody is
 * meant to press is a control, and a `<th onClick>` cannot be reached by keyboard, says nothing
 * to a screen reader, and gives no focus ring. `aria-sort` on the cell is what actually tells
 * assistive software which column the table is ordered by — the arrow is for everybody else.
 */
export function SortHeader({ field, label, sort, onToggle, align = 'left', className = '' }) {
  const state = sort === `-${field}` ? 'desc' : sort === field ? 'asc' : null;

  return (
    <th
      className={`px-3 py-3 ${align === 'right' ? 'text-right' : ''} ${className}`}
      aria-sort={state === 'desc' ? 'descending' : state === 'asc' ? 'ascending' : 'none'}
    >
      <button
        type="button"
        onClick={() => onToggle(field)}
        className={`group inline-flex items-center whitespace-nowrap font-semibold transition-colors ${
          state ? 'text-flame-500' : 'hover:text-steel-100'
        }`}
        title={
          state === 'desc'
            ? `Sorted by ${label}, highest first — click for lowest first`
            : state === 'asc'
              ? `Sorted by ${label}, lowest first — click to clear`
              : `Sort by ${label}`
        }
      >
        {label}
        <Arrow state={state} />
      </button>
    </th>
  );
}
