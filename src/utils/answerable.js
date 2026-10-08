/**
 * The refusals that are a question rather than an error [BLUEPRINT §15, §19].
 *
 * Three of the server's gates are deliberately soft. Dispatching a load quality has not cleared
 * comes back 409 asking for a reason; so does closing a consignment with no proof of delivery on
 * file, and dispatching one with no delivery address. None is a refusal — the server will do it,
 * on the record, once somebody says why.
 *
 * All three are the same mechanic, so they are one table rather than a branch each. The first
 * version named `qualityOverrideReason` in three separate places and a second case would have
 * made six; the third arrived and cost one entry, which is the argument.
 *
 * Plain data in a plain module, away from the component that draws it, for two reasons. The
 * wording is the part that has to be got right and it is easier to read all of it side by side
 * than threaded through JSX. And it can be tested: `node --test` here has no JSX loader, so a
 * table living inside a `.jsx` file can only be checked by reading the file as a string.
 *
 * The wording is per case and the difference matters. Somebody who knows their reason will be
 * read writes a different sentence from somebody who thinks it vanishes, and the two cases end
 * up in front of different people — quality's in a monthly list a manager reviews, the POD's in
 * front of accounts on the day a buyer disputes taking delivery.
 *
 * Each entry:
 *
 * | `title`       | The dialog's heading: what has not happened.                             |
 * | `subtitle`    | Shown when the refusal has nothing more specific to quote. `null` when   |
 * |               | it does — quality sends the concern it found, which beats any fixed text. |
 * | `consequence` | Where the answer ends up. The whole reason the sentence gets written.    |
 * | `ask`         | The question above the box, in the yard's words.                        |
 * | `placeholder` | A real example of an acceptable reason, not a format hint.               |
 * | `decline`     | The way out, named for what it leaves behind rather than "Cancel".       |
 * | `confirm`     | The button, given the action's own label.                                |
 */
export const ANSWERABLE = {
  qualityOverrideReason: {
    title: 'Quality has not cleared this',
    /* Quality sends the concern it found, which is more specific than anything written here. */
    subtitle: null,
    consequence:
      'It can still go. The reason below is kept against this consignment with your name on it, ' +
      'and appears in the monthly list of consignments sent despite a quality warning.',
    ask: 'Why is it going anyway?',
    placeholder: 'Buyer inspected at our gate and accepted the lot themselves',
    decline: 'Do not send it',
    confirm: (label) => `${label} anyway`,
  },
  noPodReason: {
    title: 'No proof of delivery on file',
    subtitle: 'Nobody has attached a signed LR copy or a photograph of the delivery.',
    consequence:
      'It can still be closed. The reason below is kept against this consignment with your name ' +
      'on it, so "closed with no proof" stays answerable — which is what accounts needs when a ' +
      'buyer disputes receiving a load. Otherwise leave it waiting on the POD, where the chase ' +
      'keeps it in front of somebody.',
    ask: 'Why is it being closed without one?',
    placeholder: 'Own vehicle drop — buyer confirmed receipt by phone, no signed copy issued',
    decline: 'Leave it waiting',
    confirm: () => 'Close it anyway',
  },
  addressOverrideReason: {
    title: 'No delivery address on this consignment',
    /*
     * Said here rather than left to the server's sentence, because this is the one of the three
     * with an ordinary alternative: there is usually an address, and typing it is the right
     * answer. The dialog points at it first and offers the reason second — the reverse order
     * teaches people that the reason box is the way past the gate.
     */
    subtitle:
      'Nothing on the delivery note says where it went. If there is an address, close this and ' +
      'put it on the consignment instead — the panel is on this page.',
    consequence:
      'It can still go. The reason below is kept against this consignment with your name on it, ' +
      'and it is what marketing reads when the buyer rings to ask where the load is — so write ' +
      'where it actually went and who took it, not that there was no address.',
    ask: 'Where is it going, and who is taking it?',
    placeholder: "Buyer's own lorry collected at our gate — driver Selvam, 98400 11223",
    decline: 'Do not send it yet',
    confirm: (label) => `${label} without an address`,
  },
};

/**
 * The `needs` field a refusal is asking for, when it is one of the answerable ones.
 *
 * Everything else is an error to read, so this returning `null` is what sends a failure to the
 * red notice instead of a dialog. The `409` is part of the test on purpose: `needs` also appears
 * on a 400 from the ordinary action form, and treating that as answerable would put up an
 * override dialog over a missing lorry number.
 */
export const answerableField = (failure) =>
  failure?.status === 409 && ANSWERABLE[failure.details?.needs] ? failure.details.needs : null;

/** The shortest reason the server will accept, matched here so the button can refuse first. */
export const MIN_REASON = 10;
