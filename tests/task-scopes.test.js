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

test('the escalated card empties as work is picked up, not as it is read', () => {
  /*
   * There is no "mark as seen", deliberately: that is a button people press to clear a badge.
   * Taking the job is the acknowledgement, so the card is what is *unanswered* rather than a
   * second copy of the queue.
   */
  const card = read('components/EscalatedTasks.jsx');
  assert.match(card, /claim: true/, 'taking it is the only action on the card');
  assert.ok(!/acknowledge/i.test(card.replace(/\/\*[\s\S]*?\*\//g, '')),
    'and nothing on the card merely acknowledges');
  /* Drawn as nothing when nothing has been handed over — a card that says "none" every morning
     is a card people stop reading. */
  assert.match(card, /if \(!rows\?\.length\) return null;/);
});
