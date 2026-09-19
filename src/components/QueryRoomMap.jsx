import MindMap from './MindMap.jsx';
import { formatDate, plural } from '../utils/format.js';

/**
 * A query thread as a room: who is in it, and who let them in.
 *
 * The participant list answers "who is in this" perfectly well as rows. What it cannot show is
 * the thing the feature is actually built on — **that the room grew, and by whose hand.**
 * "Accounts department. Whole department. Added by Anita Despatch on 19 Sept" is one fact per
 * row, and four of them is a paragraph somebody has to reconstruct into a shape: marketing
 * asked despatch, despatch pulled in accounts, accounts named one person in quality.
 *
 * That shape is the audit. Being a participant grants sight of the buyer, so this list *is* an
 * access grant, and "who opened this door" is a question a manager should be able to answer by
 * looking rather than by reading dates off four rows and sorting them in their head.
 *
 * So the map is drawn by **who did the adding**, not by department: the asker is a branch, and
 * so is anybody who has since widened the room, with the people they brought in hanging off
 * them. A room nobody widened is one branch and reads as exactly that.
 */
export default function QueryRoomMap({ query, options = [] }) {
  const label = (key) => options.find((entry) => entry.key === key)?.label || key;
  const asker = query.raisedBy?.name || 'Whoever asked';
  const askerId = String(query.raisedBy?._id || query.raisedBy || 'asker');

  /*
   * Everybody who has pulled somebody in, and who they pulled. Grouped on the *adder* because
   * that is the relation the rows cannot show — a list sorted by department buries it, and this
   * is a picture of how the room grew rather than of what it currently contains.
   */
  const byAdder = new Map();
  for (const participant of query.participants || []) {
    const adderId = String(participant.addedBy?._id || participant.addedBy || askerId);
    const adderName = participant.addedBy?.name || asker;

    if (!byAdder.has(adderId)) byAdder.set(adderId, { name: adderName, brought: [] });
    byAdder.get(adderId).brought.push(participant);
  }

  const branches = [];

  /* The buyer, first and on its own: it is what the thread is about and the reason the grant
     matters at all, so it should not be one node among the departments. */
  if (query.customer) {
    branches.push({
      key: 'customer',
      label: 'About',
      sublabel: 'The buyer',
      tone: 'accent',
      leaves: [{
        key: `c-${query.customer._id}`,
        label: query.customer.name,
        sublabel: query.customer.code,
        tone: 'accent',
        to: `/customers/${query.customer._id}`,
      }],
    });
  }

  for (const [adderId, { name, brought }] of byAdder) {
    branches.push({
      key: `adder-${adderId}`,
      /*
       * The name on the node and what they did underneath it, rather than both on one line:
       * "Anita Despatch pulled in" is 24 characters and a node holds 22, so the first version
       * of this read "Anita Despatch pulled…" — which loses the only word that mattered.
       */
      label: name,
      sublabel: adderId === askerId
        ? `Asked · ${plural(brought.length, 'participant', 'participants')}`
        : `Pulled in ${plural(brought.length, 'participant', 'participants')}`,
      tone: adderId === askerId ? 'info' : 'progress',
      leaves: brought.map((participant) => ({
        key: participant._id,
        label: participant.user?.name || label(participant.department),
        /* "Whole department · 19 Sept 2026" is 31 characters into a 28-character line, so it
           read as "Whole department · 19 Sept…" — a date cut off mid-year on the one view
           whose whole point is when each door was opened. */
        sublabel: participant.user
          ? `In ${label(participant.department)}`
          : `Everyone · ${formatDate(participant.addedAt)}`,
        tone: participant.user ? 'success' : 'neutral',
      })),
    });
  }

  /*
   * What has been said, as a count rather than as nodes. A thread of forty messages would bury
   * the room it is drawn to show, and the messages are already on this screen in full, in order,
   * underneath — which is the one place they read properly.
   */
  const replies = (query.messages || []).filter((message) => message.kind === 'reply').length;
  const notes = (query.messages || []).length - replies;
  if (replies || notes) {
    branches.push({
      key: 'said',
      label: 'Said so far',
      sublabel: 'Below, in full',
      tone: replies ? 'success' : 'neutral',
      leaves: [
        replies && {
          key: 'replies',
          label: plural(replies, 'reply', 'replies'),
          sublabel: 'Answers the question',
          tone: 'success',
        },
        notes && {
          key: 'notes',
          label: plural(notes, 'note', 'notes'),
          sublabel: 'Does not answer it',
          tone: 'neutral',
        },
      ].filter(Boolean),
    });
  }

  return (
    <MindMap
      root={{ label: query.number, sublabel: query.subject, tone: 'accent' }}
      branches={branches}
      emptyLabel="Nobody is in this query yet."
    />
  );
}
