/**
 * Email to staff switched off [server: STAFF_EMAIL]: the sign-in code is shown on the sign-in
 * screen, the administrator is handed the set-password link to pass on, and "Forgot password"
 * points at the one-time code instead.
 *
 *   node --test tests/staff-email-off.test.js
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (path) => readFileSync(new URL(`../src/${path}`, import.meta.url), 'utf8');

test('the sign-in screen shows the code itself when the server says it was not sent', () => {
  const login = read('pages/Login.jsx');
  assert.match(login, /\{sent\?\.onScreen \? \(/);
  assert.match(login, /Email is switched off for now, so your sign-in code is shown here instead of sent\./);
  assert.match(login, /aria-label="Your sign-in code">\{sent\.code\}/);
  assert.match(login, /\{sent\?\.devCode && !sent\?\.onScreen && \(/, 'the development leak stays separate');
});

test('a new account hands the administrator the link; the admin-delete code is shown on screen', () => {
  const users = read('pages/Users.jsx');
  assert.match(users, /invited\?\.invitation\?\.emailOff \? 'Pass on the sign-in link'/);
  assert.match(users, /Email to staff is switched off for now, so nothing was sent — give them this link on WhatsApp or in person/);
  assert.match(users, /Email is switched off for now, so the code is shown here: <span[^>]*>\{sent\.code\}<\/span>/);
});

test('"Forgot password" says what to do instead and offers the one-time code sign-in', () => {
  const page = read('pages/ForgotPassword.jsx');
  assert.match(page, /emailOff: Boolean\(response\.data\?\.emailOff\)/);
  assert.match(page, /\{sent\.emailOff && <Link to="\/login" className="btn-primary block w-full text-center">Sign in with a one-time code<\/Link>\}/);
});
