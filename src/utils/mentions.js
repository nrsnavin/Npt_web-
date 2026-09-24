/**
 * Tagging people in a query thread with @.
 *
 * Plain text in, plain text out: the message keeps "@Arun K" as words, so it reads the same in
 * the thread, in a notification and in the model's summary. Who was tagged travels beside it as
 * ids, chosen from a list rather than parsed out of the words — two people can share a first
 * name, and a name typed by hand is a guess.
 */

/**
 * The @-word being typed at the caret, if any: where it starts and what has been typed after @.
 * Only at the start of the text or after a space, so an email address is not a tag.
 */
export function mentionAt(text, caret) {
  const before = String(text || '').slice(0, caret ?? String(text || '').length);
  const match = before.match(/(^|\s)@([^\s@]{0,30})$/);
  if (!match) return null;
  return { start: before.length - match[2].length - 1, typed: match[2] };
}

/** Everybody on the pickers, flattened, with their department's label; me left out. */
export function taggablePeople(departments = [], me) {
  return departments.flatMap((department) =>
    (department.people || [])
      .filter((person) => String(person._id) !== String(me))
      .map((person) => ({ _id: person._id, name: person.name, department: department.label }))
  );
}

/** Who matches what has been typed after @ — first names first, then anywhere in the name. */
export function matchPeople(people, typed, limit = 6) {
  const needle = String(typed || '').toLowerCase();
  const starts = people.filter((person) => person.name.toLowerCase().startsWith(needle));
  const inside = people.filter(
    (person) => !person.name.toLowerCase().startsWith(needle) && person.name.toLowerCase().includes(needle)
  );
  return [...starts, ...inside].slice(0, limit);
}

/** The text with the @-word at `at` replaced by the chosen name, and where the caret goes. */
export function insertMention(text, at, caret, person) {
  const inserted = `@${person.name} `;
  const next = `${text.slice(0, at.start)}${inserted}${text.slice(caret)}`;
  return { text: next, caret: at.start + inserted.length };
}

/**
 * The ids to send: people picked while typing whose "@Name" is still in the text. Somebody
 * picked and then deleted from the message is not tagged.
 */
export function mentionsIn(text, picked = []) {
  const body = String(text || '');
  const ids = picked.filter((person) => body.includes(`@${person.name}`)).map((person) => String(person._id));
  return [...new Set(ids)];
}

/**
 * A message split into plain pieces and tagged people, for drawing. Longest names first, so
 * "@Arun Kumar" is not read as "@Arun" followed by " Kumar".
 */
export function splitMentions(text, people = []) {
  const body = String(text || '');
  const named = [...people].filter((person) => person?.name).sort((a, b) => b.name.length - a.name.length);
  if (!named.length) return [{ text: body }];

  const pieces = [];
  let rest = body;
  while (rest) {
    let best = null;
    for (const person of named) {
      const at = rest.indexOf(`@${person.name}`);
      if (at !== -1 && (best === null || at < best.at)) best = { at, person };
    }
    if (!best) {
      pieces.push({ text: rest });
      break;
    }
    if (best.at > 0) pieces.push({ text: rest.slice(0, best.at) });
    pieces.push({ text: `@${best.person.name}`, person: best.person });
    rest = rest.slice(best.at + best.person.name.length + 1);
  }
  return pieces;
}
