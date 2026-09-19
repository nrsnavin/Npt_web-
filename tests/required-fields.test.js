/**
 * Which fields are marked compulsory, and whether the mark is telling the truth.
 *
 * `Field` takes a `required` prop that draws a star and sets `aria-required`. One prop rather
 * than a convention each form spells out for itself: the alternative is a hand-written
 * "(required)" here and a red label there, which is how a form ends up marking four of its six
 * compulsory fields and teaching people the marking means nothing.
 *
 * The property worth defending is not "every field is marked" — most fields in an ERP are
 * genuinely optional, and a form with a star on everything says nothing. It is that **a star
 * never appears on a field the form is perfectly happy to save without**. That is the version of
 * the mistake that actually costs somebody their afternoon: they fill in the starred boxes, press
 * save, and the server refuses for a field that carried no star — or they hunt for a starred box
 * that turns out not to have mattered.
 *
 * So this walks every `<Field required>` in the app and insists something behind it refuses: a
 * `register` rule, a `required` attribute, or a guard on the submit button naming that value.
 *
 * Read as text because `node --test` here has no JSX loader.
 *
 *   node --test tests/required-fields.test.js
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const root = new URL('../src/', import.meta.url).pathname;

const sources = [];
(function walk(dir) {
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) walk(path);
    else if (entry.endsWith('.jsx')) sources.push([path.slice(root.length), readFileSync(path, 'utf8')]);
  }
})(root);

/**
 * Every `<Field>` in a file, as `{ opening, body }`.
 *
 * Brace-counted rather than regex-matched to the first `>`, because half these openings carry a
 * `hint={...}` with a ternary in it and a naive match stops in the middle of one.
 */
function fields(src) {
  const found = [];
  const tag = /<Field\b/g;
  let match;
  while ((match = tag.exec(src))) {
    let i = match.index + match[0].length;
    let depth = 0;
    while (i < src.length) {
      const char = src[i];
      if (char === '{') depth += 1;
      else if (char === '}') depth -= 1;
      else if (char === '>' && depth === 0) break;
      i += 1;
    }
    const opening = src.slice(match.index, i + 1);
    const close = src.indexOf('</Field>', i);
    found.push({ opening, body: opening.trimEnd().endsWith('/>') ? '' : src.slice(i + 1, close < 0 ? i + 1 : close) });
  }
  return found;
}

const isMarked = (opening) => /\brequired\b/.test(opening);
const labelOf = (opening) => (opening.match(/label="([^"]*)"/) || [, '(unlabelled)'])[1];

test('the marker is one prop on the shared control, not a per-form convention', () => {
  const ui = sources.find(([path]) => path === 'components/ui.jsx')[1];
  assert.match(ui, /export function Field\(\{ label, error, hint, required = false/);
  /* Hidden from screen readers — they would read "star" in the middle of the label — and said
     again in the way assistive technology expects to hear it. */
  assert.match(ui, /aria-hidden="true"[\s\S]{0,80}\*/);
  assert.match(ui, /'aria-required': required \|\| undefined/);
});

test('every marked field has something behind it that refuses', () => {
  /*
   * A star on a field that saves fine without it is noise. A field with no star that bounces the
   * save is worse, because the person filled the form in the order the screen implied.
   */
  const unbacked = [];

  for (const [path, src] of sources) {
    for (const { opening, body } of fields(src)) {
      if (!isMarked(opening)) continue;

      /* A rule on the control itself. */
      if (/required:\s*['"]/.test(body) || /\brequired\b(?=[\s/>])/.test(body)) continue;

      /*
       * Or a guard on the form: the submit button is disabled, or the submit handler bails,
       * while this field is empty. Matched on the value's own name, which is how these forms
       * spell it — `!customer`, `reason.trim().length < 10`, `!values.note`.
       */
      const name = (body.match(/register\('([^']+)'|value=\{(?:values|form)\.(\w+)\}|onChange=\{set\('(\w+)'\)\}|value=\{(\w+)\}/) || [])
        .slice(1)
        .find(Boolean);
      const guarded =
        name &&
        new RegExp(
          `disabled=\\{[^}]*\\b${name}\\b|if \\(!${name}\\)|!${name}\\b|\\b${name}\\.trim\\(\\)`
        ).test(src);
      if (guarded) continue;

      unbacked.push(`${path} · "${labelOf(opening)}"`);
    }
  }

  assert.deepEqual(unbacked, [], `marked compulsory but nothing refuses:\n  ${unbacked.join('\n  ')}`);
});

test('the fields the server insists on are marked', () => {
  /*
   * A spot-check against the validators rather than an exhaustive mirror: these are the ones a
   * person meets on the way through the plant, and the ones whose absence sends them back round
   * the form. Named individually so a future edit that drops a marker fails here rather than in
   * somebody's afternoon.
   */
  const expected = {
    'pages/Customers.jsx': ['Company name'],
    'components/LeadForm.jsx': ['Company'],
    'components/OwnerPicker.jsx': [],           // its label is passed in; checked below
    'components/EnquiryForm.jsx': ['Customer'],
    'components/TaskEscalation.jsx': ['Who has to do it', 'Why it is going to them'],
    'components/MaterialForm.jsx': ['Name'],
  };

  for (const [path, labels] of Object.entries(expected)) {
    const entry = sources.find(([file]) => file === path);
    assert.ok(entry, `${path} is still there`);
    const marked = fields(entry[1]).filter((field) => isMarked(field.opening)).map((f) => labelOf(f.opening));
    for (const label of labels) {
      assert.ok(marked.includes(label), `${path}: "${label}" should be marked compulsory (has: ${marked.join(', ')})`);
    }
  }

  /* The owner picker carries its own required rule, whatever label the caller gives it. */
  const picker = sources.find(([path]) => path === 'components/OwnerPicker.jsx')[1];
  assert.match(picker, /<Field label=\{label\} error=\{error\}[^>]*required|required[^>]*>/);
  assert.match(picker, /required: 'Choose who will own this'/);
});

test('optional fields are left alone', () => {
  /* The other half of meaning something. A star on every box says nothing at all. */
  const marked = sources.flatMap(([, src]) => fields(src).filter((f) => isMarked(f.opening)));
  const all = sources.flatMap(([, src]) => fields(src));
  assert.ok(marked.length > 40, `too few marked to be a real pass: ${marked.length}`);
  assert.ok(
    marked.length < all.length / 2,
    `${marked.length} of ${all.length} marked — a form that stars everything is a form nobody reads`
  );
});
