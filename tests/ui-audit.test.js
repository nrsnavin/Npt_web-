/**
 * The UI audit's findings, kept fixed: contrast, text size, labelled search boxes, tap targets,
 * one heading per page, and the phone layouts that squeezed a list into an unreadable column.
 * Every rule here was measured in a browser across every screen, at desktop and phone width, in
 * the light and dark themes — and is checked in the source so it cannot quietly come back.
 *
 *   node --test tests/ui-audit.test.js
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const SRC = fileURLToPath(new URL('../src/', import.meta.url));
const read = (file) => readFileSync(path.join(SRC, file), 'utf8');
const sources = (dir = SRC) => readdirSync(dir).flatMap((entry) => {
  const full = path.join(dir, entry);
  if (statSync(full).isDirectory()) return sources(full);
  return /\.(jsx?|css)$/.test(entry) ? [full] : [];
});
const offenders = (pattern) => sources()
  .flatMap((file) => readFileSync(file, 'utf8').split('\n').map((line, index) => [file, index + 1, line]))
  .filter(([, , line]) => pattern.test(line))
  .map(([file, number]) => `${path.relative(SRC, file)}:${number}`);

test('the bright brand orange is never text — the theme’s accent is (2.6:1 against 4.5:1)', () => {
  assert.deepEqual(offenders(/(?<![\w:-])text-flame-500\b(?!\/)/), [], 'use text-accent');
  assert.deepEqual(offenders(/(?<![\w:-])text-flame-300\b/), [], 'flame-300 is 3.2:1 as text in the light theme');
});

test('a selected chip or tab is the theme’s primary fill, not white on bright orange (3:1)', () => {
  assert.deepEqual(offenders(/bg-flame-500 text-white|text-white bg-flame-500/), []);
  assert.match(read('index.css'), /\.fill-primary \{\s*background-color: var\(--primary-bg\);\s*color: var\(--primary-text\);/);
});

test('no text smaller than 12px', () => {
  assert.deepEqual(offenders(/text-\[(0\.6\d*rem|0\.7rem|10px|11px|10\.5px)\]/), []);
});

test('every search box has a name a screen reader can say — a placeholder is not one', () => {
  const missing = [];
  for (const file of sources().filter((name) => name.endsWith('.jsx'))) {
    const text = readFileSync(file, 'utf8');
    for (const match of text.matchAll(/<input\b[^>]*?type="search"[\s\S]*?\/>/g)) {
      if (!/aria-label|aria-labelledby|\bid=/.test(match[0])) missing.push(path.relative(SRC, file));
    }
  }
  assert.deepEqual(missing, []);
});

test('targets a finger can hit: sort headings and the party list’s open button', () => {
  assert.match(read('components/SortHeader.jsx'), /inline-flex min-h-6 items-center/);
  assert.match(read('pages/OverviewDashboard.jsx'), /grid h-9 w-9 shrink-0 place-items-center rounded-lg/);
});

test('Department Tasks has its page heading when it is the page', () => {
  assert.match(read('pages/DepartmentTasks.jsx'), /<DepartmentTasksBoard headingAs="h1"/);
  assert.match(read('components/DepartmentTasksBoard.jsx'), /headingAs === 'h1'\s*\?\s*<h1/);
});

test('phones: two stage tiles across, table text not squeezed to a word a line, the name not cut', () => {
  assert.match(read('components/StagePipeline.jsx'), /grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6/);
  assert.match(read('index.css'), /@media \(max-width: 639px\) \{\s*tbody td:not\(:has\(input\[type='checkbox'\]\)\):not\(\.col-actions\) \{ min-width: 10rem; \}/);
  assert.match(read('components/Layout.jsx'), /<span className="truncate sm:hidden">\{user\?\.name \|\| who\}<\/span>/);
});

test('the bar marks where you are with an underline, not a grey wash under the accent', () => {
  const layout = read('components/Layout.jsx');
  assert.match(layout, /lit \? 'text-accent shadow-\[inset_0_-2px_0_0_currentColor\]'/);
  assert.match(read('components/MarketingStatusSelect.jsx'), /compact \? 'min-w-\[13\.5rem\]'/);
});
