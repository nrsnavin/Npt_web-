/**
 * The simple menu and where the app opens [config/simpleNav.js, components/Layout.jsx, App.jsx].
 *
 *   node --test tests/simple-nav.test.js
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { SIMPLE_NAV, homeFor, simpleNavFor } from '../src/config/simpleNav.js';

const read = (path) => readFileSync(new URL(`../src/${path}`, import.meta.url), 'utf8');

test('each department sees its desk, its own screen and the questions; Admin and Audit see everything', () => {
  assert.deepEqual(simpleNavFor(['sampling']), ['desk', 'samples', 'enquiries', 'queries']);
  assert.deepEqual(simpleNavFor(['payment_collection']), ['desk', 'payments', 'queries']);
  assert.equal(simpleNavFor(['management']), null);
  assert.equal(simpleNavFor(['audit']), null);
  assert.equal(simpleNavFor(['marketing'], { isAdmin: true }), null);
  assert.deepEqual(simpleNavFor(['quality', 'despatch']), ['desk', 'quality', 'queries', 'dispatch'], 'two departments, both sets of tabs');
  for (const keys of Object.values(SIMPLE_NAV)) assert.ok(keys.includes('queries'));
});

test('Admin and Marketing open on the enquiries; every other department on its desk', () => {
  assert.equal(homeFor(['management']), '/enquiries');
  assert.equal(homeFor(['marketing']), '/enquiries');
  assert.equal(homeFor(['sampling']), '/departments/mine');
  assert.equal(homeFor(['production']), '/departments/mine');
  assert.equal(homeFor(['quality'], { isAdmin: true }), '/enquiries');
});

test('nothing is taken away: what is not on the strip is under More', () => {
  const layout = read('components/Layout.jsx');
  assert.match(layout, /key: 'desk',\s*label: 'My desk'/);
  assert.match(layout, /\[\{ key: 'more', label: 'More', features: rest\.flatMap\(\(entry\) => entry\.features\)/);
  assert.match(layout, /<ModuleTabs modules=\{shown\} active=\{lit\} \/>/);
  assert.match(read('App.jsx'), /const home = homeFor\(departments, \{ isAdmin \}\);/);
});
