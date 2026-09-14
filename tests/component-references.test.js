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

  /*
   * Declared here — at any case, and at any depth.
   *
   * Lowercase matters as much as capitalised: a page that defines its own `numeric` inside a
   * submit handler is not missing an import, and a guard that says it is gets switched off.
   */
  for (const match of source.matchAll(/(?:function|const|let|class)\s+([A-Za-z_$][\w$]*)/g)) {
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

/**
 * React's hooks, by the same rule and for the same reason.
 *
 * A component is not the only thing a dropped import takes with it. Extracting a form out of a
 * page left `useMemo` behind, the build passed — a bundler treats an unknown identifier as a
 * global it cannot see yet, exactly as it does for a component — and the form threw the moment
 * anybody opened it. Same failure, same silence, so the same guard covers it.
 *
 * Only React's own, deliberately. A project hook is caught by the import check either way, and
 * a blanket rule over every `useThing()` would flag the many that are defined locally.
 */
const REACT_HOOKS = [
  'useState', 'useEffect', 'useMemo', 'useCallback', 'useRef', 'useContext',
  'useReducer', 'useId', 'useLayoutEffect', 'useTransition', 'useDeferredValue',
];

test('every React hook called is imported', () => {
  const unreachable = [];

  for (const file of sourceFiles('src')) {
    const source = readFileSync(file, 'utf8');
    const known = namesInScope(source);

    for (const hook of REACT_HOOKS) {
      /* Called, rather than merely mentioned in a comment or a longer name. */
      if (new RegExp(`(^|[^.\\w])${hook}\\s*\\(`).test(source) && !known.has(hook)) {
        unreachable.push(`${file}: ${hook}()`);
      }
    }
  }

  assert.deepEqual(
    unreachable,
    [],
    `called but never imported — the build passes and the screen throws:\n  ${unreachable.join('\n  ')}`
  );
});

/**
 * And the project's own shared helpers, by the same rule again.
 *
 * The third time this bit: extracting a form out of a page left `formatCurrency` and
 * `formatNumber` behind as well as `useMemo`. A component, a hook and a helper are the same
 * failure wearing three hats — the bundler sees an unknown identifier, assumes a global, builds
 * clean, and the screen throws when somebody opens it.
 *
 * The list is read from what the utils modules actually export rather than typed out here, so a
 * helper added tomorrow is covered without anybody remembering to add it.
 */
const sharedHelpers = () => {
  const names = new Set();
  for (const module of ['src/utils/format.js', 'src/utils/pipeline.js']) {
    const source = readFileSync(module, 'utf8');
    for (const match of source.matchAll(/export\s+(?:const|function)\s+([a-z][A-Za-z0-9_]*)/g)) {
      names.add(match[1]);
    }
  }
  return [...names];
};

test('every shared helper called is imported', () => {
  const helpers = sharedHelpers();
  assert.ok(helpers.length > 3, 'the helper list must actually have been read');

  const unreachable = [];

  for (const file of sourceFiles('src')) {
    /* The modules that define them are not asked to import themselves. */
    if (file.startsWith('src/utils/')) continue;

    const source = readFileSync(file, 'utf8');
    const known = namesInScope(source);

    for (const helper of helpers) {
      if (new RegExp(`(^|[^.\\w])${helper}\\s*\\(`).test(source) && !known.has(helper)) {
        unreachable.push(`${file}: ${helper}()`);
      }
    }
  }

  assert.deepEqual(
    unreachable,
    [],
    `called but never imported — the build passes and the screen throws:\n  ${unreachable.join('\n  ')}`
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
