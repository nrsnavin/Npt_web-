/**
 * Customer names in the fluorescent tone, wherever they are read [components/CustomerName.jsx;
 * theme.css `--customer-name`]: every customer name rendered as text goes through the one
 * component, so the colour is set in one place and the fallback words stay in the ordinary tone.
 *
 *   node --test tests/customer-name.test.js
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const read = (path) => readFileSync(new URL(`../src/${path}`, import.meta.url), 'utf8');
const walk = (dir) => readdirSync(dir).flatMap((name) => { const full = join(dir, name); return statSync(full).isDirectory() ? walk(full) : full.endsWith('.jsx') ? [full] : []; });

test('one component, one colour: neon green with a glow on the dark canvas, a readable green on white; the fallback is not a name', () => {
  const component = read('components/CustomerName.jsx');
  assert.match(component, /if \(!name\) return fallback \?\? null;/);
  assert.match(component, /<span className=\{`customer-name \$\{className\}`\.trim\(\)\}>\{name\}<\/span>/);
  assert.match(read('index.css'), /\.customer-name \{\s*color: var\(--customer-name\);\s*text-shadow: var\(--customer-glow\);/);
  const theme = read('theme.css');
  assert.match(theme, /--customer-name: #3dff6a;\s*--customer-glow: 0 0 6px rgba\(61, 255, 106, 0\.45\);/, 'fluorescent on dark');
  assert.equal((theme.match(/--customer-name: #0b9e3c;\s*--customer-glow: none;/g) || []).length, 2, 'readable on white, in both light blocks');
});

test('every customer name rendered as text goes through it — none is left as a bare expression', () => {
  const bare = [];
  for (const file of walk(new URL('../src', import.meta.url).pathname)) {
    if (file.endsWith('CustomerName.jsx')) continue;
    const source = readFileSync(file, 'utf8');
    for (const match of source.matchAll(/(.)\{((?:[\w$]+\??\.)*customer\??\.name(?:\s*\|\|\s*(?:'[^']*'|"[^"]*"))?)\}/g)) {
      if (['$', '='].includes(match[1])) continue; /* a template piece or an attribute value is not read as text */
      bare.push(`${file.split('/src/')[1]}: {${match[2]}}`);
    }
  }
  assert.deepEqual(bare, []);
  assert.ok(walk(new URL('../src', import.meta.url).pathname).filter((file) => readFileSync(file, 'utf8').includes('<CustomerName ')).length >= 50, 'and it is used across the app');
});
