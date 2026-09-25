/**
 * What the command bar can do, from what was typed.
 *
 * Pure — text and the person's access in, suggestions out — so the whole grammar is tested
 * without a browser. Doing the thing is the palette's job; every action goes through the same
 * API route the screen uses, and the server holds the rules either way.
 *
 * Three kinds:
 *   go   — a page: "queries", "go samples", "costing"
 *   new  — a form: "new sample", "new query"
 *   act  — something done to one query: "label QRY-6 quality", "close QRY-2026-0006",
 *          "reopen 6", "urgent 6"
 */
import { normaliseLabel, labelProblem } from './labels.js';

/** The pages a person can jump to, and the module that has to be readable for each. */
export const PAGES = [
  { key: 'home', label: 'Home', path: '/', words: ['home', 'dashboard', 'today'] },
  { key: 'queries', label: 'Queries', path: '/queries', module: 'queries', words: ['queries', 'questions', 'inbox'] },
  { key: 'leads', label: 'Leads', path: '/leads', module: 'enquiries', words: ['leads', 'prospects'] },
  { key: 'enquiries', label: 'Enquiries', path: '/enquiries', module: 'enquiries', words: ['enquiries', 'enquiry', 'pipeline'] },
  { key: 'samples', label: 'Sample queue', path: '/samples', module: 'samples', words: ['samples', 'sampling', 'bench'] },
  { key: 'pricings', label: 'Costing sheets', path: '/pricings', module: 'pricing', words: ['costing', 'pricing', 'costings'] },
  { key: 'quotations', label: 'Quotations', path: '/quotations', module: 'pricing', words: ['quotations', 'quotes'] },
  { key: 'customers', label: 'Customers', path: '/customers', module: 'customers', words: ['customers', 'buyers'] },
  { key: 'moulds', label: 'Models (moulds)', path: '/moulds', module: 'moulds', words: ['moulds', 'models', 'tools'] },
  { key: 'materials', label: 'Materials', path: '/materials', module: 'materials', words: ['materials', 'resin'] },
  { key: 'users', label: 'Users', path: '/users', module: 'users', words: ['users', 'people', 'staff'] },
  { key: 'profile', label: 'My profile', path: '/profile', words: ['profile', 'password', 'me'] },
];

/** The forms "new …" opens, each on its own page with `?new=1`. Writing is what they need. */
export const CREATES = [
  { key: 'query', label: 'New query', path: '/queries?new=1', module: 'queries', read: true, words: ['query', 'question'] },
  { key: 'sample', label: 'New sample request', path: '/samples?new=1', module: 'samples', words: ['sample'] },
  { key: 'enquiry', label: 'New enquiry', path: '/enquiries?new=1', module: 'enquiries', words: ['enquiry'] },
  { key: 'lead', label: 'New lead', path: '/leads?new=1', module: 'enquiries', words: ['lead'] },
  { key: 'customer', label: 'New customer', path: '/customers?new=1', module: 'customers', words: ['customer', 'buyer'] },
  { key: 'costing', label: 'New costing', path: '/pricings?new=1', module: 'pricing', words: ['costing', 'pricing'] },
];

const VERBS = ['label', 'close', 'reopen', 'urgent'];

/**
 * A query named the way people say it: "QRY-2026-0006", "QRY-6", "#6" or "6". Returns the text
 * to search for — the full number, or the zero-padded tail that every year's number ends in.
 */
export function queryRef(word) {
  const text = String(word || '').trim().toUpperCase();
  const full = text.match(/^QRY-\d{4}-\d{1,6}$/);
  if (full) return { exact: text };
  const short = text.match(/^(?:QRY-?|#)?(\d{1,6})$/);
  if (short) return { tail: short[1].padStart(4, '0') };
  return null;
}

/** "label QRY-6 quality" → { verb, ref, rest }. Anything else → null. */
export function parseAction(text) {
  const words = String(text || '').trim().split(/\s+/);
  const verb = words[0]?.toLowerCase();
  if (!VERBS.includes(verb) || words.length < 2) return null;
  const ref = queryRef(words[1]);
  if (!ref) return null;
  return { verb, ref, rest: words.slice(2).join(' ') };
}

const matches = (entry, needle) =>
  !needle || entry.label.toLowerCase().includes(needle) || entry.words.some((word) => word.startsWith(needle));

/**
 * The suggestions for what was typed, best first. Empty text offers the everyday ones, so the
 * bar teaches what it can do the first time it is opened.
 */
export function suggestCommands(text, { canRead = () => true, canWrite = () => true, isAdmin = false } = {}) {
  const raw = String(text || '').trim();
  const lower = raw.toLowerCase();
  const out = [];

  const action = parseAction(raw);
  if (action && canRead('queries')) {
    const { verb, ref, rest } = action;
    const name = ref.exact || `QRY-…${ref.tail}`;
    if (verb === 'label') {
      const label = normaliseLabel(rest);
      const problem = label ? labelProblem(label) : 'Say which label, e.g. "label QRY-6 quality"';
      out.push({
        id: `act-label-${name}-${label}`, kind: 'act', title: label ? `Label ${name} #${label}` : `Label ${name}…`,
        hint: problem || 'Files the query under this label', disabled: Boolean(problem),
        run: { type: 'label', ref, label },
      });
    } else if (verb === 'urgent') {
      if (isAdmin) out.push({ id: `act-urgent-${name}`, kind: 'act', title: `Mark ${name} urgent`, hint: 'Puts it above everything on every list', run: { type: 'urgent', ref } });
    } else {
      out.push({
        id: `act-${verb}-${name}`, kind: 'act',
        title: `${verb === 'close' ? 'Close' : 'Re-open'} ${name}`,
        hint: verb === 'close' ? 'Only the person who asked, or an administrator' : 'Brings a closed query back',
        run: { type: verb, ref },
      });
    }
    return out;
  }

  /* "new sample", "new" → the forms; "sample" alone also offers its form after its page. */
  const creating = lower.startsWith('new') ? lower.slice(3).trim() : null;
  const pageNeedle = creating === null ? lower.replace(/^(go|open|goto)\s+/, '') : null;

  if (pageNeedle !== null) {
    for (const page of PAGES) {
      if (page.module && !canRead(page.module)) continue;
      if (matches(page, pageNeedle)) out.push({ id: `go-${page.key}`, kind: 'go', title: page.label, hint: 'Go to', run: { type: 'go', path: page.path } });
    }
  }
  for (const form of CREATES) {
    const allowed = form.read ? canRead(form.module) : canWrite(form.module);
    if (!allowed) continue;
    const needle = creating ?? pageNeedle;
    if (creating !== null ? matches(form, creating) : !needle || form.words.some((word) => word.startsWith(needle))) {
      out.push({ id: `new-${form.key}`, kind: 'new', title: form.label, hint: 'Opens the form', run: { type: 'go', path: form.path } });
    }
  }

  if (!raw) {
    /* A short, useful starting set rather than every page. */
    return out.filter((entry) => ['new-query', 'new-sample', 'go-queries', 'go-samples', 'go-pricings'].includes(entry.id)).slice(0, 5);
  }
  return out.slice(0, 8);
}
