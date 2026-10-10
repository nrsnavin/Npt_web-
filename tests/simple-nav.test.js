/**
 * The simple menu and where the app opens [config/simpleNav.js, components/Layout.jsx, App.jsx,
 * pages/DepartmentDashboard.jsx].
 *
 *   node --test tests/simple-nav.test.js
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { SIMPLE_NAV, firstDashboardTab, homeFor, simpleNavFor } from '../src/config/simpleNav.js';

const read = (path) => readFileSync(new URL(`../src/${path}`, import.meta.url), 'utf8');

test('each department sees its dashboard, its own screen and the questions; Admin and Audit see everything', () => {
  assert.deepEqual(simpleNavFor(['sampling']), ['dashboard', 'samples', 'queries']);
  assert.deepEqual(simpleNavFor(['payment_collection']), ['dashboard', 'payments', 'queries']);
  assert.equal(simpleNavFor(['management']), null);
  assert.equal(simpleNavFor(['audit']), null);
  assert.equal(simpleNavFor(['marketing'], { isAdmin: true }), null);
  assert.deepEqual(simpleNavFor(['quality', 'despatch']), ['dashboard', 'quality', 'queries', 'dispatch'], 'two departments, both sets of tabs');
  for (const keys of Object.values(SIMPLE_NAV)) {
    assert.ok(keys.includes('queries'));
    assert.equal(keys[0], 'dashboard', 'the dashboard comes first');
    assert.ok(!keys.includes('desk') && !keys.includes('enquiries'), 'the desk and the enquiries are one tab now');
  }
});

test('everyone opens on their dashboard; its first tab follows the role', () => {
  for (const departments of [['management'], ['marketing'], ['sampling'], ['production']]) {
    assert.equal(homeFor(departments), '/departments/mine');
  }
  assert.equal(firstDashboardTab('management'), 'all', 'Admin: every enquiry');
  assert.equal(firstDashboardTab('quality', { isAdmin: true }), 'all');
  assert.equal(firstDashboardTab('marketing'), 'all', 'Marketing: their own enquiries');
  assert.equal(firstDashboardTab('sampling'), 'queue', 'Sampling: the sample enquiries');
  assert.equal(firstDashboardTab('production'), 'enquiries', 'the rest: the enquiries with them');
  assert.equal(firstDashboardTab('marketing', { seesEnquiries: false }), 'enquiries');
});

test('the desk and the enquiries are one dashboard; nothing is taken away', () => {
  const layout = read('components/Layout.jsx');
  assert.match(layout, /key: 'dashboard',\s*label: 'Dashboard'/);
  assert.doesNotMatch(layout, /key: 'desk'/);
  assert.doesNotMatch(layout, /key: 'enquiries'/);
  assert.match(layout, /to: '\/enquiries', label: 'All enquiries', end: true, module: 'enquiries'/);
  assert.match(layout, /\[\{ key: 'more', label: 'More', features: rest\.flatMap\(\(entry\) => entry\.features\)/);
  assert.match(layout, /<ModuleTabs modules=\{shown\} active=\{lit\} \/>/);

  const app = read('App.jsx');
  assert.match(app, /<Navigate to=\{homeFor\(departments, \{ isAdmin \}\)\} replace \/>/);
  assert.match(app, /<Route path="dashboard" element=\{<Navigate to="\/departments\/mine" replace \/>\} \/>/);

  const dashboard = read('pages/DepartmentDashboard.jsx');
  assert.match(dashboard, /\{tab === 'all' && <Enquiries embedded \/>\}/);
  assert.match(dashboard, /everyone \? 'All enquiries' : figures\.department === 'marketing' \? 'My enquiries'/);
  assert.match(read('pages/Enquiries.jsx'), /export default function Enquiries\(\{ embedded = false \}\)/);
});
