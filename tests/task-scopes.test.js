/**
 * What a task row offers, in each of the three scopes [BLUEPRINT §29, §35].
 *
 * The list answers three different questions now — what I hold, what my department holds, and
 * (marketing only) what every department is holding on the buyers I own — and the controls on a
 * row are not the same in all three. The middle one is a shared queue: anybody in the
 * department may take an unclaimed job or finish a colleague's. The third is a *window*, and the
 * distinction matters because the server enforces it: marketing may read those tasks and may
 * not close them.
 *
 * So a row in the window that offered "I'll take it" was a button the server refuses — which is
 * the one failure this codebase keeps coming back to, a promise the software cannot keep. It was
 * there, and this is the test that would have caught it.
 *
 * Read as text because `node --test` here has no JSX loader.
 *
 *   node --test tests/task-scopes.test.js
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { DEPARTMENTS, departmentLabel } from '../src/utils/pipeline.js';

const read = (path) => readFileSync(new URL(`../src/${path}`, import.meta.url), 'utf8');

/* ------------------------------- The departments ------------------------------- */

test('all eight departments are offered, sampling included', () => {
  /*
   * There were two hand-written copies of this list in the app and *both* had lost `sampling` —
   * which is what happens to a list written out wherever it is needed. A handover dialog that
   * cannot name the bench cannot hand anything to the bench.
   */
  assert.deepEqual(
    DEPARTMENTS.map((entry) => entry.key).sort(),
    ['accounts', 'despatch', 'management', 'marketing', 'order_confirmation', 'production',
      'quality', 'sampling']
  );
});

test('a department reads as a person would say it', () => {
  assert.equal(departmentLabel('order_confirmation'), 'Order confirmation');
  assert.equal(departmentLabel('despatch'), 'Despatch');
  /* An unknown key still reads rather than rendering a snake_case token at somebody. */
  assert.equal(departmentLabel('something_new'), 'something new');
  assert.equal(departmentLabel(undefined), '');
});

/* --------------------------- What a row offers, and when --------------------------- */

const ROW = read('components/dock/TodoPanel.jsx');

test("taking a job is offered only where the server would allow it", () => {
  /*
   * The bug this file exists for. `readOnly` is marketing's window; the tasks in it belong to
   * production and despatch, and `mayWorkOn` on the server refuses a claim on somebody else's
   * queue. Offering the button anyway produced a row whose action ends in a 403.
   */
  const claim = ROW.match(/\{onClaim && [^\n]*\n[\s\S]{0,200}?I&rsquo;ll take it/);
  assert.ok(claim, 'the claim button is still in TodoRow');
  assert.match(claim[0], /!readOnly/, 'and it is gated on not being the read-only window');

  const putBack = ROW.match(/\{onClaim && [^\n]*\n[\s\S]{0,200}?Put it back/);
  assert.ok(putBack, 'handing a job back is still there');
  assert.match(putBack[0], /!readOnly/, 'gated the same way — you cannot release what is not yours');
});

test('the checkbox and the bin go with it', () => {
  /* Completing and deleting are the other two the server refuses across departments. Both are
     behind `readOnly` in the JSX rather than left to fail at the door. */
  assert.match(ROW, /\{readOnly \? \(\s*\n\s*\/\* A spacer/, 'the checkbox is replaced by a spacer');

  const bin = ROW.match(/\{!readOnly && \([\s\S]{0,320}?aria-label=\{`Delete /);
  assert.ok(bin, 'the bin is drawn only when the row is actionable');
});

test('handing a task on stays available in every scope', () => {
  /*
   * The one thing marketing *can* do from the window, and the thing they actually want: not to
   * do despatch's job, but to say it needs doing. Ungated on purpose — the server allows an
   * escalation from the customer view and refuses everything else.
   */
  const escalate = ROW.match(/\{onEscalate && \([\s\S]{0,260}?Hand it on/);
  assert.ok(escalate, 'the escalate button is there');
  assert.ok(!/readOnly/.test(escalate[0]), 'and it is NOT gated on readOnly');
});

test('the read-only window does not offer a box to type a new task into', () => {
  /* A task typed there would land on marketing's own queue rather than the buyer's work, which
     is not what a window on somebody else's list is for. */
  assert.match(ROW, /\{readOnly \? \([\s\S]{0,400}?Read-only/,
    'the capture form is replaced by a line saying what the list is');
});

/* ------------------------------- The three tabs ------------------------------- */

test('the customer tab is offered only to somebody who has one', () => {
  /*
   * From the server's `meta.mayReadCustomers`, not guessed from the department: the rule is
   * §29's and it lives on the server, and an admin holds the view without being in marketing.
   * A tab that 400s for everybody else is worse than no tab.
   */
  assert.match(ROW, /meta\?\.mayReadCustomers \? \[\{ key: 'customers'/);
});

test('the queue tab is named after the department, not "My department"', () => {
  /* "Despatch" is what a despatch clerk calls their own queue. The generic label is the
     fallback for an account with no department, which has no queue to show. */
  assert.match(ROW, /meta\?\.department \? departmentLabel\(meta\.department\) : 'My department'/);
});

test('mine is the default scope', () => {
  /*
   * The dock is the list somebody works from, and a queue shared with four colleagues is not
   * that. Defaulting to the queue would have buried each person's own work in their
   * department's on the one surface that is on every screen.
   */
  const context = read('components/dock/WorkspaceContext.jsx');
  assert.match(context, /useState\('mine'\)/);
});

/* ------------------------- And the list follows the action ------------------------- */

test('a task handed away leaves the queue it came from', () => {
  /*
   * Escalating moves it. On the department view the row goes; on `mine` it stays, marked with
   * where it went, because the person who escalated keeps watching whether anybody picked it
   * up. Without that the list would still show it as despatch's until a reload.
   */
  const context = read('components/dock/WorkspaceContext.jsx');
  const escalate = context.match(/async escalateTodo\([\s\S]{0,600}?\},/);
  assert.ok(escalate, 'the context handles escalation');
  assert.match(escalate[0], /scope === 'department'/, 'and treats the queue view differently');
  assert.match(escalate[0], /filter\(/, 'dropping the row there');
  assert.match(escalate[0], /map\(/, 'and updating it in place elsewhere');
});

test('the card empties as work is picked up, not as it is read', () => {
  /*
   * There is no "mark as seen", deliberately: that is a button people press to clear a badge.
   * Taking the job is the acknowledgement, so the card is what is *unanswered* rather than a
   * second copy of the queue.
   */
  const card = read('components/NeedsYouToday.jsx');
  assert.match(card, /claim: true/, 'taking it is the only action on the card');
  assert.ok(!/acknowledge/i.test(card.replace(/\/\*[\s\S]*?\*\//g, '')),
    'and nothing on the card merely acknowledges');
  /* Drawn as nothing when there is nothing — a card that says "none" every morning is a card
     people stop reading, and then miss on the morning it is not empty. */
  assert.match(card, /if \(!total\) return null;/);
});

test('the card is one block with two groups, not two cards', () => {
  /*
   * A dashboard that answers "what now" in four warning-coloured cards answers it in none.
   * Both groups are unanswered work on the same queue wanting the same response, so they sit
   * inside one bordered block with a heading each.
   */
  const card = read('components/NeedsYouToday.jsx');
  assert.equal(
    (card.match(/rounded-xl border border-warn-500\/30/g) || []).length,
    1,
    'one warning-toned container'
  );
  assert.match(card, /handed over/i, 'the handover group is labelled');
  assert.match(card, /urgent or late on your own queue/i, 'and so is the urgent one');
});

test('a suggested priority is never drawn as somebody\'s decision', () => {
  /*
   * The distinction the whole feature rests on. A model may flag a task urgent — that is what
   * was asked for — but a card headed "urgent" is only worth reading if a guess can be told
   * apart from a decision. "Suggested urgent" in the quieter colour is that difference; without
   * it, the second wrong flag costs the card its readers.
   */
  const card = read('components/NeedsYouToday.jsx');
  assert.match(card, /task\.prioritySuggested\?\.by/, 'the row reads where the priority came from');
  assert.match(card, /suggested \? 'Suggested urgent' : 'Urgent'/, 'and says which it was');
  assert.match(card, /suggested \? 'font-semibold text-steel-400' : 'text-warn-400'/,
    'in a quieter colour, so a suggestion does not shout as loudly as a decision');
});

/* ------------------------- The suggestion, and its limits ------------------------- */

const DIALOG = read('components/TaskEscalation.jsx');

test('the suggestion never blocks the form', () => {
  /*
   * The dropdown and the box are usable from the first frame; the answer fills in whatever has
   * not been typed when it arrives. A form that greys itself out while something thinks is
   * slower than the dropdown it was meant to replace — and on a domestic line in Tiruppur that
   * pause is sometimes ten seconds.
   */
  assert.ok(!/disabled=\{asking/.test(DIALOG), 'nothing is disabled while it is asking');
  assert.match(DIALOG, /setAsking\(true\)/, 'it only records that it is asking');
  assert.match(DIALOG, /Reading the task…/, 'and says so in the hint, where it costs nothing');
});

test('it only ever fills a blank', () => {
  /*
   * A late answer must not overwrite what somebody has started typing. `setX((current) =>
   * current || answer)` is the whole guard, and it is easy to lose in a refactor to a plain set.
   */
  assert.match(DIALOG, /setDepartment\(\(current\) => current \|\| answer\.department\)/);
  assert.match(DIALOG, /setReason\(\(current\) => current \|\| answer\.reason\)/);
});

test('a late answer cannot land in a different task\'s form', () => {
  /* Open the dialog, close it, open it on another task: the first answer is in flight and must
     not arrive in the second form. */
  assert.match(DIALOG, /let live = true;/);
  assert.match(DIALOG, /if \(!live\) return;/);
});

test('a failed suggestion is silent', () => {
  /*
   * The form works without it. An error box about something nobody asked for is worse than no
   * suggestion at all — and this runs on every dialog open.
   */
  assert.match(DIALOG, /\.catch\(\(\) => \{/, 'the failure is swallowed deliberately');
});

test('urgency is a tick somebody can clear, not an assumption', () => {
  /*
   * The model may pre-tick it; a person either agrees by leaving it or disagrees by clearing
   * it. Either way somebody has looked at it before the receiving department's card says
   * "urgent".
   */
  assert.match(DIALOG, /type="checkbox"/);
  assert.match(DIALOG, /Something is waiting on this/);
  assert.match(DIALOG, /onChange=\{\(event\) => setUrgent\(event\.target\.checked\)\}/);
});

test('the priority is credited to the model only while it is untouched', () => {
  /*
   * Editing the department or the reason makes the decision yours, and the record should stop
   * crediting a suggestion for it. Without `untouched` the row would keep saying "suggested"
   * after somebody had overruled the suggestion, which is the wrong way round.
   */
  assert.match(DIALOG, /const untouched =/);
  assert.match(DIALOG, /urgent && untouched && suggestion\?\.priority === 'high'/);
});

test('it shows its reasoning, not only its conclusion', () => {
  /* A suggestion somebody can check is one they can reasonably come to trust; one that shows
     only its answer has to be taken on faith, and is discarded the first time it is wrong. */
  assert.match(DIALOG, /suggestion\?\.reason && suggestion\.department/);
  assert.match(DIALOG, /'Read as' : 'Matched as'/, 'and says whether a model or the rules read it');
});

/* ------------------------- The review, and what it may say ------------------------- */

const REVIEW = read('components/WhatMattersNow.jsx');

test('the finding\'s own words are the headline, the review\'s are commentary', () => {
  /*
   * The division the whole feature rests on. `headline` and `detail` are written in the findings
   * service from real quantities and real names; `why` is the model's sentence about the
   * *ordering*. Drawn together with no distinction, a rephrased fact would reach the screen
   * looking exactly like a record — and a plausible wrong number is the one failure nobody
   * reading the sentence can catch.
   */
  assert.match(REVIEW, /\{finding\.headline\}/, 'the headline comes from the finding');
  assert.match(REVIEW, /\{finding\.detail\}/, 'and so does the detail');
  /* The model's sentence is set apart: quieter, italic, and behind a rule. */
  const commentary = REVIEW.match(/\{why && \([\s\S]{0,400}?\{why\}/);
  assert.ok(commentary, 'the review\'s sentence is drawn');
  assert.match(commentary[0], /italic/, 'in a different voice');
  assert.match(commentary[0], /border-l-2/, 'and visually separated from the facts');
});

test('the panel says who ranked it', () => {
  /*
   * Most days, with no API key configured, it is the plant's own arithmetic. A ranking nobody
   * can attribute is one nobody can argue with.
   */
  assert.match(REVIEW, /meta\.from === 'model' \? 'Ordered by the review' : 'Ordered by severity'/);
});

test('nothing is raised without a press', () => {
  /*
   * Six sweeps already write to real queues. A seventh writing on a model's judgement is how a
   * queue becomes something people stop reading — so every row offers the press and none of
   * them takes it.
   */
  assert.match(REVIEW, /Raise to \$\{departmentLabel\(finding\.department\)/);
  assert.match(REVIEW, /workspace\.review\.raise\(\{ kind: finding\.kind, department: finding\.department \}\)/,
    'and sends only which finding, never its text');
});

test('a raised finding is marked, not removed', () => {
  /* It has not gone away — it is now somebody's job. Taking the row off would read as "fixed". */
  assert.match(REVIEW, /setRaised\(\(current\) => \(\{ \.\.\.current, \[finding\.id\]: true \}\)\)/);
  /* JSX interpolation rather than a template literal, so match the rendered wording either
     side of the expression. */
  assert.match(REVIEW, /On the \{departmentLabel\(finding\.department\)\.toLowerCase\(\)\} queue/);
  assert.ok(!/setReview\([^)]*filter/.test(REVIEW), 'the row is not filtered out of the list');
});

test('what the review left out is still reachable', () => {
  /*
   * A ranking somebody cannot check is one they have to take on faith, and the second time it
   * buries something obvious they stop reading it. So the unranked findings are one press away.
   */
  assert.match(REVIEW, /Show the other \$\{plural\(rest\.length/);
  assert.match(REVIEW, /const rest = findings\.filter/);
});

test('an empty plant draws no panel at all', () => {
  /* A panel that says "nothing wrong" every morning is a panel people scroll past, and then
     miss on the morning it is not empty. */
  assert.match(REVIEW, /if \(!findings\.length\) return null;/);
});

test('a press that is refused says so on its row, not over the brief', () => {
  /*
   * The load error and a press failure used to share one `error` state, and the panel replaced
   * itself with "Could not work out what matters — …" for either. Wrong about both halves: the
   * brief had been worked out fine and was on screen, and the commonest reason a press fails is
   * the least alarming one — somebody filed the last POD while the panel was open, so that
   * problem is gone. Losing eleven problems to a message saying one of them no longer exists is
   * the worst trade available.
   */
  assert.match(REVIEW, /setRefused\(\(current\) => \(\{ \.\.\.current, \[finding\.id\]: failureMessage\(failure\) \}\)\)/);
  /* The server's own sentence, which is written to say what to do about it. */
  assert.match(REVIEW, /import \{ failureMessage \}/);
  /* And the panel-wide notice is now reachable only from the load. */
  const raising = REVIEW.match(/const raise = async[\s\S]*?\n  \};/);
  assert.ok(raising, 'the raise handler is there');
  assert.ok(!/setError/.test(raising[0]), 'raising never blanks the panel');
  assert.match(REVIEW, /refused=\{refused\[pick\.id\]\}/, 'the ranked rows carry it');
  assert.match(REVIEW, /refused=\{refused\[finding\.id\]\}/, 'and so do the rest');
});

test('a fresh press clears the last refusal on that row', () => {
  /* Otherwise "it cleared between the brief and this press" sits under a row that has since
     been raised successfully, which reads as though the raise failed. */
  const raising = REVIEW.match(/const raise = async[\s\S]*?\n  \};/)[0];
  const clears = raising.indexOf('[finding.id]: null');
  const sends = raising.indexOf('workspace.review.raise');
  assert.ok(clears > -1, 'it is cleared');
  assert.ok(clears < sends, 'before the call, not after it');
});
