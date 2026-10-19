/**
 * A task rings the team the moment it is raised [components/LiveAlerts.jsx, public/sw.js;
 * server: services/taskAlert.service.js, workspace.controller `freshTodos`].
 *
 *   node --test tests/live-alerts.test.js
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

test('the service worker shows the push and hands it to the open app the same moment', () => {
  const sw = read('public/sw.js');
  assert.match(sw, /self\.registration\.showNotification\(message\.title/);
  assert.match(sw, /client\.postMessage\(\{ type: 'push', message \}\)/);
  /* Each push its own banner: tagged by the task, a second move replaced the first silently. */
  assert.doesNotMatch(sw, /message\.taskId \|\| message\.link/);
  assert.match(sw, /message\.tag \? \{ tag: message\.tag, renotify: true \}/);
});

test('the app listens for the push, polls for new tasks every twenty seconds, and offers to turn notifications on once', () => {
  const alerts = read('src/components/LiveAlerts.jsx');
  assert.match(alerts, /navigator\.serviceWorker\.addEventListener\('message', onMessage\)/);
  assert.match(alerts, /const POLL_MS = 20 \* 1000;/);
  assert.match(alerts, /workspaceApi\.todos\.fresh\(since\.current\)/);
  assert.match(alerts, /if \(document\.visibilityState !== 'visible'\) return;/, 'no polling from a hidden tab');
  assert.match(alerts, /label: 'Open', onAction: \(\) => navigate\(link \|\| '\/departments\/mine'\)/);
  assert.match(alerts, /announceInboxChanged\(\)/, 'the bell looks again');
  assert.match(alerts, /setOffer\(state === 'off'\)/, 'offered only where push could be turned on');
  assert.match(alerts, /localStorage\.setItem\(OFFER_KEY, 'no'\)/, 'declined once, not asked again');
  assert.match(read('src/api/endpoints.js'), /fresh: \(since\) => api\.get\('\/workspace\/todos\/fresh', \{ params: \{ since \} \}\)/);
  assert.match(read('src/components/Layout.jsx'), /<LiveAlerts \/>/);
});

test('the profile says what the device is told about', () => {
  const profile = read('src/pages/Profile.jsx');
  assert.match(profile, /the moment a task is raised for your team/);
});
