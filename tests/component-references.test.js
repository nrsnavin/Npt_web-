/**
 * Every component a file renders must be one it can actually reach.
 *
 * This exists because of a one-line change that took the whole application to a white screen:
 * an unused-looking import was removed from `Layout.jsx` while the component it named was still
 * rendered twice further down. Nothing caught it. `vite build` succeeds, because a bundler
 * treats an unknown capitalised identifier as a global it cannot see yet; the login page still
 * renders, because `Layout` is not mounted until you are signed in. The failure arrives exactly
 * once, at the worst moment — the first screen after login — as a blank page and a
 * `ReferenceError` in a console nobody has open.
 *
 * A linter would find it, and the repo has no runnable one: `npm run lint` calls ESLint 10,
 * which wants an `eslint.config.js` that does not exist. Until that is fixed this is the guard,
 * and it is a cheap one — it reads the source as text and asks a single question of each file.
 *
 *   node --test tests/component-references.test.js
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';

/** React's own, which are in scope without being imported by name in the JSX transform. */
const BUILTIN = new Set(['Fragment', 'Suspense', 'StrictMode', 'Profiler']);

const sourceFiles = (dir) => {
  const found = [];
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) found.push(...sourceFiles(full));
    else if (/\.jsx?$/.test(entry)) found.push(full);
  }
  return found;
};

/**
 * Every name this file could legally render: imported, declared, or destructured out of
 * something. Deliberately generous — the question being asked is "could this possibly resolve",
 * so a false negative is better than a test people learn to work around.
 */
function namesInScope(source) {
  const known = new Set(BUILTIN);

  /* `import X, { A as B, C } from '…'` — every binding it introduces. */
  for (const match of source.matchAll(/import\s+([^;]+?)\s+from\s+['"][^'"]+['"]/g)) {
    for (const part of match[1].replace(/[{}]/g, ',').split(',')) {
      const name = part.trim().split(/\s+as\s+/).pop().trim();
      if (name) known.add(name);
    }
  }

  /* Declared here. */
  for (const match of source.matchAll(/(?:function|const|let|class)\s+([A-Z][A-Za-z0-9_]*)/g)) {
    known.add(match[1]);
  }

  /* Pulled out of an object — `const { Provider } = context`, and the like. */
  for (const match of source.matchAll(/const\s*\{([^}]*)\}\s*=/g)) {
    for (const part of match[1].split(',')) {
      const name = part.trim().split(':').pop().trim();
      if (/^[A-Z]/.test(name)) known.add(name);
    }
  }

  return known;
}

test('every component rendered is imported or defined in the same file', () => {
  const unreachable = [];

  for (const file of sourceFiles('src')) {
    const source = readFileSync(file, 'utf8');
    const known = namesInScope(source);

    /* `<Foo.Bar>` is covered by `Foo`, which is what this captures. */
    for (const match of source.matchAll(/<([A-Z][A-Za-z0-9_]*)/g)) {
      if (!known.has(match[1])) unreachable.push(`${file}: <${match[1]}>`);
    }
  }

  assert.deepEqual(
    unreachable,
    [],
    `rendered but never imported or defined — this is a blank screen, not a warning:\n  ${unreachable.join('\n  ')}`
  );
});

test('the guard would have caught the import that blanked the app', () => {
  /*
   * A test whose own subject is the bug. Without this, a scan that quietly stopped matching
   * anything — a regex edited, the JSX syntax it reads changed — would keep passing forever and
   * report a clean repository right up until the next white screen.
   */
  const broken = `
    import WorkspaceRail from './dock/WorkspaceRail.jsx';
    export default function Layout() {
      return <div><WorkspaceRail /><SidebarNav sections={[]} /></div>;
    }
  `;

  const known = namesInScope(broken);
  assert.ok(known.has('WorkspaceRail'), 'an imported component must count as reachable');
  assert.ok(known.has('Layout'), 'a component declared in the file must count as reachable');
  assert.ok(!known.has('SidebarNav'), 'the missing import must not be found in scope');
});
