/**
 * The page can be served under a Content-Security-Policy that allows no inline script
 * [server repo: docs/DEPLOY-AWS.md, nginx]: index.html carries no inline <script>, and the theme
 * script that must run before first paint is its own file.
 *
 *   node --test tests/csp-ready.test.js
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const root = new URL('../', import.meta.url);
const read = (path) => readFileSync(new URL(path, root), 'utf8');

test('index.html has no inline script; the theme script is a file', () => {
  const html = read('index.html');
  const scripts = [...html.matchAll(/<script\b[^>]*>/g)].map((m) => m[0]);
  assert.ok(scripts.length >= 2, 'the theme script and the app entry');
  for (const tag of scripts) assert.match(tag, /\ssrc=/, `inline script: ${tag}`);
  assert.doesNotMatch(html, /on[a-z]+=/, 'no inline event handlers');
  assert.match(html, /<script src="\/theme\.js"><\/script>/);
  const theme = read('public/theme.js');
  assert.match(theme, /localStorage\.getItem\('npt\.theme'\)/);
  assert.match(theme, /setAttribute\('data-theme', saved\)/);
});
