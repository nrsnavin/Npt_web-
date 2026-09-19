import MindMap from './MindMap.jsx';
import { humanise, plural } from '../utils/format.js';
import { statusTone } from '../utils/statusStyles.js';

/**
 * Who is carrying which questions.
 *
 * The list answers "what is open" one row at a time, ordered by when it last moved. What it
 * cannot show is the distribution — that Kavitha has six threads and everybody else has one, or
 * that four of the seven are addressed to a department rather than a person and so are nobody's
 * in particular. That is a shape, and a shape is what a picture is for.
 *
 * **A person "has" a query when they were asked it**, not when they raised it. The asker is
 * waiting; the people named on the participant list are the ones who owe an answer, and the
 * question this map exists to answer is who the work is sitting with. A thread somebody raised
 * and nobody has answered is still drawn — under the department it was put to, which is exactly
 * where the answer is owed from.
 *
 * **A department-wide row is its own branch**, not shared out among the people in it. That is
 * the honest reading of what the thread actually says: "ask despatch" reaches whoever is in
 * despatch that day and belongs to none of them individually. Splitting it across four names
 * would invent four assignments nobody made, and a map that invents is worse than a list.
 *
 * Built from the rows already on screen rather than from a new endpoint, so the map shows
 * exactly what the filters above it selected — switch to it after narrowing to "nobody has
 * answered" and it is a picture of the backlog, not of everything.
 */

/** Longest first, so the person carrying the most is the first branch a reader's eye lands on. */
const byLoad = (a, b) => b.leaves.length - a.leaves.length || a.label.localeCompare(b.label);

export default function PeopleQueryMap({ queries = [], options = [], scope = 'Queries' }) {
  const departmentLabel = (key) => options.find((entry) => entry.key === key)?.label || key;

  /*
   * One bucket per person and per department-wide row. Keyed on the participant rather than on
   * the query, because a thread with three participants belongs in three buckets — the same
   * question is owed by all three, and showing it once under whichever happened to be first
   * would under-count every queue but one.
   */
  const buckets = new Map();
  const add = (key, label, sublabel, query) => {
    if (!buckets.has(key)) buckets.set(key, { key, label, sublabel, leaves: [] });
    /* One thread cannot appear twice in one bucket — somebody named individually inside a
       department that is also in the thread is still one person owing one answer. */
    const bucket = buckets.get(key);
    if (bucket.leaves.some((leaf) => leaf.key === query._id)) return;

    bucket.leaves.push({
      key: query._id,
      label: query.subject,
      sublabel: query.customer?.name || humanise(query.status),
      tone: statusTone(query.status),
      to: `/queries/${query._id}`,
    });
  };

  for (const query of queries) {
    for (const participant of query.participants || []) {
      if (participant.user) {
        add(
          `user-${participant.user._id}`,
          participant.user.name,
          departmentLabel(participant.user.department || participant.department),
          query
        );
      } else {
        /* "Everyone", not "Whole department": with the count appended the longer word ran to
           30 characters into a 28-character line and printed as "Whole department · 2…". */
        add(`dept-${participant.department}`, departmentLabel(participant.department), 'Everyone', query);
      }
    }
  }

  const branches = [...buckets.values()]
    .sort(byLoad)
    .map((bucket) => ({
      ...bucket,
      sublabel: `${bucket.sublabel} · ${plural(bucket.leaves.length, 'question', 'questions')}`,
      /* Amber once somebody is carrying more than a couple: the point of drawing this is to see
         a queue building on one person before they mention it. */
      tone: bucket.leaves.length >= 3 ? 'progress' : 'info',
    }));

  const carried = branches.reduce((sum, branch) => sum + branch.leaves.length, 0);

  return (
    <MindMap
      root={{
        label: scope,
        sublabel: branches.length
          ? `${plural(queries.length, 'thread', 'threads')} · ${carried} to answer`
          : 'Nothing to answer',
        tone: 'accent',
      }}
      branches={branches}
      emptyLabel="No question here is waiting on anybody — nothing to draw."
    />
  );
}
