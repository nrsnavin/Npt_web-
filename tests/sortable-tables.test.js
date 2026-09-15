/**
 * The sortable tables, and the two ways they go wrong silently.
 *
 * **A heading with no cell under it.** Adding a sortable column means adding a `<th>` *and* a
 * `<td>`, and forgetting the second shifts every column to its right by one — so the table
 * still renders, still sorts, and quietly prints the stage under "Valid until" and the date
 * under "Stage". Nothing throws. `vite build` is happy. It is only visible to somebody who
 * reads the screen carefully, and by then it has been wrong for a week. This happened four
 * times while the sort arrows were being added, which is what this file is for.
 *
 * **Sorting while standing on page seven.** Re-ordering a long register without going back to
 * the first page lands the reader in the middle of an ordering whose top they have not seen —
 * they asked for "biggest first" and are looking at rows 150 to 175 of it. Every screen has to
 * remember `setPage(1)`, and the one that forgets looks like it simply did not sort.
 *
 * Both are read off the source as text, like `component-references.test.js` next door, because
 * the alternative is mounting twelve pages against a fake API to count table cells.
 *
 *   node --test tests/sortable-tables.test.js
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';

const PAGES = path.join(process.cwd(), 'src/pages');
const SORT_HEADER = readFileSync(path.join(process.cwd(), 'src/components/SortHeader.jsx'), 'utf8');

const sourceFiles = () =>
  readdirSync(PAGES)
    .filter((entry) => entry.endsWith('.jsx'))
    .map((entry) => [entry, readFileSync(path.join(PAGES, entry), 'utf8')]);

const usesSorting = (source) => source.includes('<SortHeader');

/* --------------------------- The hook's own behaviour --------------------------- */

/**
 * The three-click cycle, checked without React: the reducer is a pure function of the previous
 * value, so it can be driven directly.
 *
 * Descending first is deliberate — every column somebody bothers to sort is one whose
 * interesting end is the top — and the third click returning to `null` matters as much,
 * because a register's own order is usually the right one and there is otherwise no way back
 * to it short of reloading the page.
 */
test('the sort cycle is descending, then ascending, then back to the list\'s own order', () => {
  /*
   * The rule, restated here so it can be driven without React — and then pinned to the real
   * reducer below, because a test that only exercises its own copy of a rule passes happily
   * while the shipped one says something else. The test runner has no JSX loader, so reading
   * the source is how this file reaches into a `.jsx`.
   */
  const next = (current, field) => {
    if (current === `-${field}`) return field;
    if (current === field) return null;
    return `-${field}`;
  };

  for (const line of [
    'if (current === `-${field}`) return field;',
    'if (current === field) return null;',
    'return `-${field}`;',
  ]) {
    assert.ok(
      SORT_HEADER.includes(line),
      `useSort no longer contains "${line}" — the cycle changed and this test did not`
    );
  }

  let sort = null;
  sort = next(sort, 'number');
  assert.equal(sort, '-number', 'first click: highest first');
  sort = next(sort, 'number');
  assert.equal(sort, 'number', 'second: lowest first');
  sort = next(sort, 'number');
  assert.equal(sort, null, 'third: back to the default, not a fourth state');

  /* Switching columns starts that column's cycle rather than continuing the last one's. */
  assert.equal(next('orderDate', 'number'), '-number');
  assert.equal(next('-orderDate', 'number'), '-number');
});

/** `null`, not the default field's name: a register's own order is sometimes a grouping no
    single field expresses, and sending a field would silently drop it. */
test('the hook starts on the list\'s own order rather than naming a field', () => {
  assert.match(SORT_HEADER, /export function useSort\(\)/);
  assert.match(SORT_HEADER, /useState\(null\)/);
});

/* --------------------------- Headings against cells --------------------------- */

/**
 * Count the columns a table declares against the cells one row draws.
 *
 * Conditional columns are counted by their condition rather than ignored, because the common
 * shape is a pair — `{mayWrite && <th />}` in the head and `{mayWrite && <td>…</td>}` in the
 * row — and a pair that has lost one half is exactly the bug being looked for. Anything inside
 * a `{cond && …}` is attributed to `cond`; everything else is unconditional.
 */
function columnsOf(block) {
  const counts = new Map();
  const add = (key) => counts.set(key, (counts.get(key) || 0) + 1);

  /*
   * Walk the block line by line and track which `{cond && …}` we are inside. Crude next to a
   * parser, and enough: these are hand-written tables with one condition per column, and a
   * shape this cannot read is one a person cannot read either.
   */
  let guard = null;
  let depth = 0;
  for (const line of block.split('\n')) {
    const opened = line.match(/\{\s*([A-Za-z0-9_.?[\]']+)\s*&&/);
    if (opened && !guard) {
      guard = opened[1];
      depth = 0;
    }

    if (/<(th|SortHeader)\b/.test(line)) add(guard || '*');
    /*
     * A `colSpan` cell is explicitly not one-per-heading — it is the detail row a table opens
     * underneath a record, like the costing breakdown on the sent-quotations board. Counting it
     * would report every expandable table as misaligned, which is how a guard gets switched off.
     */
    if (/<td\b/.test(line) && !/colSpan/.test(line)) add(guard || '*');

    if (guard) {
      depth += (line.match(/\{/g) || []).length - (line.match(/\}/g) || []).length;
      if (depth <= 0) guard = null;
    }
  }
  return counts;
}

/** The `<thead>` and the first `<tbody>` of every table in a file, paired up. */
function tablesIn(source) {
  const found = [];
  const heads = [...source.matchAll(/<thead[\s\S]*?<\/thead>/g)];
  const bodies = [...source.matchAll(/<tbody[\s\S]*?<\/tbody>/g)];

  for (let i = 0; i < Math.min(heads.length, bodies.length); i += 1) {
    /* Only tables whose head and body are in that order — a body before its head means the
       regexes have paired across two different tables and the answer would be nonsense. */
    if (bodies[i].index > heads[i].index) found.push([heads[i][0], bodies[i][0]]);
  }
  return found;
}

test('every sortable table draws one cell for every heading it declares', () => {
  const complaints = [];

  for (const [name, source] of sourceFiles()) {
    if (!usesSorting(source)) continue;

    for (const [head, body] of tablesIn(source)) {
      if (!/<SortHeader/.test(head)) continue;

      const headings = columnsOf(head);
      const cells = columnsOf(body);

      for (const [key, count] of headings) {
        const drawn = cells.get(key) || 0;
        if (drawn !== count) {
          complaints.push(
            `${name}: ${count} ${key === '*' ? 'plain' : `"${key}"`} heading(s) ` +
              `but ${drawn} matching cell(s) — every column right of the gap draws the wrong data`
          );
        }
      }
      for (const [key, count] of cells) {
        if (!headings.has(key)) {
          complaints.push(`${name}: ${count} ${key === '*' ? 'plain' : `"${key}"`} cell(s) under no heading`);
        }
      }
    }
  }

  assert.deepEqual(complaints, [], `\n${complaints.join('\n')}\n`);
});

/* --------------------------- Sorting and the page number --------------------------- */

/**
 * Every screen that sorts and pages must go back to page one when the ordering changes.
 *
 * The screens that hold no page number at all are exempt, and there is exactly one — the people
 * list fetches a hundred rows in a single request. Exempting it by *looking for `useState` on a
 * page* rather than by naming the file means the exemption disappears on its own the day that
 * list grows pagination.
 */
test('a screen that sorts and pages returns to the first page when the ordering changes', () => {
  const complaints = [];

  for (const [name, source] of sourceFiles()) {
    if (!usesSorting(source)) continue;
    if (!/setPage\b/.test(source)) continue;

    /* Either the shared `sortBy` wrapper, or an inline handler that resets the page itself. */
    const wrapper = /const sortBy\s*=\s*\([\s\S]{0,200}?setPage\(1\)/.test(source);
    const inline = /onToggle=\{\([\s\S]{0,160}?setPage\(1\)/.test(source);

    if (!wrapper && !inline) {
      complaints.push(
        `${name}: sorts and pages, but nothing resets the page — re-ordering leaves the ` +
          'reader in the middle of an ordering whose top they have not seen'
      );
    }
  }

  assert.deepEqual(complaints, [], `\n${complaints.join('\n')}\n`);
});

/**
 * And the ordering has to actually leave the browser.
 *
 * `useSort` holding a value that is never put in the request is the most convincing way for
 * this feature to fail: the arrow moves, the heading lights up, `aria-sort` changes, and the
 * rows underneath do not. Sorting happens on the server — see the note in `SortHeader.jsx` —
 * so a screen that draws the control and does not send the parameter is drawing a lie.
 */
test('every screen that offers a sort actually sends it to the server', () => {
  const complaints = [];

  for (const [name, source] of sourceFiles()) {
    if (!usesSorting(source)) continue;
    if (!/sort:\s*(sort|order)\s*\|\|\s*undefined/.test(source)) {
      complaints.push(`${name}: draws sort headings but never puts \`sort\` in the request`);
    }
  }

  assert.deepEqual(complaints, [], `\n${complaints.join('\n')}\n`);
});
