/**
 * The department workspaces file [src/config/departments.js] — the one meant to be edited by
 * hand. These checks catch an edit that would quietly break a dashboard: a department left
 * out, a link to a screen that does not exist, a module name misspelt so the page never shows,
 * or a `?stage=` the server would ignore.
 *
 *   node --test tests/department-workspaces.test.js
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { DEPARTMENT_WORKSPACES } from '../src/config/departments.js';
import { DEPARTMENTS } from '../src/utils/pipeline.js';

const read = (path) => readFileSync(new URL(`../src/${path}`, import.meta.url), 'utf8');

/* The screens the app routes to, read off App.jsx (no JSX loader here). */
const app = read('App.jsx');
const routes = new Set(['/', ...[...app.matchAll(/path="([^"]+)"/g)].map((match) => `/${match[1].replace(/^\//, '')}`)]);
/* The master registers are routed in a loop — `${kind}s` for hook, clip and print. */
for (const kind of ['hook', 'clip', 'print']) routes.add(`/${kind}s`);

/* The modules the server grants, and the twelve stages, as the nav and stage tiles name them. */
const MODULES = [
  'enquiries', 'samples', 'pricing', 'orders', 'production', 'quality', 'dispatch', 'payments',
  'customers', 'materials', 'moulds', 'whatsapp', 'customer_comms', 'announcements', 'queries',
  'tasks', 'reports', 'users',
];
const STAGES = [
  'enquiry', 'sample', 'pricing_quote', 'po_so', 'production_edd', 'assembling', 'mould', 'team_payment_followup',
  'invoice_dispatch', 'lr_copy', 'quality', 'ac_clarify', 'my_payment_followup', 'closed',
];

test('every one of the ten departments has a workspace, and nothing else does', () => {
  assert.deepEqual(Object.keys(DEPARTMENT_WORKSPACES).sort(), DEPARTMENTS.map((d) => d.key).sort());
});

test('each workspace says what the department is for, and has screens and jobs', () => {
  for (const [key, workspace] of Object.entries(DEPARTMENT_WORKSPACES)) {
    assert.ok(workspace.purpose, `${key}: purpose`);
    assert.ok(workspace.pages.length > 0, `${key}: pages`);
    assert.ok(workspace.jobs.length > 0, `${key}: jobs`);
    assert.ok(Array.isArray(workspace.toConfirm), `${key}: toConfirm is a list`);
  }
});

test('every page links to a screen the app has, under a module the server knows', () => {
  for (const [key, workspace] of Object.entries(DEPARTMENT_WORKSPACES)) {
    for (const page of workspace.pages) {
      const [path, query = ''] = page.to.split('?');
      assert.ok(routes.has(path), `${key}: "${page.label}" goes to ${path}, which is not a route`);
      if (page.module) assert.ok(MODULES.includes(page.module), `${key}: "${page.label}" names module ${page.module}`);

      const stage = new URLSearchParams(query).get('stage');
      if (stage) {
        for (const one of stage.split(',')) assert.ok(STAGES.includes(one), `${key}: unknown stage ${one}`);
      }
    }
  }
});

test('the dashboard draws the workspace, and the enquiry list honours ?stage=', () => {
  const dashboard = read('pages/DepartmentDashboard.jsx');
  assert.match(dashboard, /<WorkspaceLinks /);
  assert.match(dashboard, /<WorkspaceBrief /);
  const enquiries = read('pages/Enquiries.jsx');
  assert.match(enquiries, /searchParams\.get\('stage'\)/);
  assert.match(enquiries, /stage: plantStage/);
});
