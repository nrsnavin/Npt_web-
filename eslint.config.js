/**
 * The linter this repo has been missing.
 *
 * `npm run lint` has called `eslint src` since the beginning and has never once run: ESLint 10
 * wants a flat `eslint.config.js` and there was no config of any kind, so the script failed
 * immediately and everybody stopped typing it.
 *
 * That gap has a cost, and it is not theoretical. Four separate breakages in one working
 * session came from the same thing — an identifier used without being imported:
 *
 *   `SidebarNav`     a component, removed from an import and still rendered → every screen
 *                    after login went blank
 *   `useMemo`        a React hook, left behind when a form was extracted → the form threw
 *   `formatCurrency` a shared helper, same extraction → the same form threw again
 *   `rupees`         a page-local helper, same again → the order form would not open
 *
 * None of them failed the build. A bundler treats an unknown identifier as a global it cannot
 * see yet, so `vite build` is clean, the page compiles, and the failure waits for whoever opens
 * it. `no-undef` is the rule that catches all four, and it is why this file exists.
 *
 * Deliberately small. This is not a style regime — the repo has a voice and a linter is not the
 * thing to enforce it with — it is the correctness rules that a bundler cannot give us.
 */

/** The browser and timer globals this app legitimately uses. */
const browser = {
  window: 'readonly',
  document: 'readonly',
  navigator: 'readonly',
  localStorage: 'readonly',
  sessionStorage: 'readonly',
  history: 'readonly',
  location: 'readonly',
  console: 'readonly',
  fetch: 'readonly',
  FormData: 'readonly',
  Blob: 'readonly',
  File: 'readonly',
  URL: 'readonly',
  URLSearchParams: 'readonly',
  Image: 'readonly',
  Event: 'readonly',
  CustomEvent: 'readonly',
  AbortController: 'readonly',
  IntersectionObserver: 'readonly',
  ResizeObserver: 'readonly',
  MutationObserver: 'readonly',
  requestAnimationFrame: 'readonly',
  cancelAnimationFrame: 'readonly',
  setTimeout: 'readonly',
  clearTimeout: 'readonly',
  setInterval: 'readonly',
  clearInterval: 'readonly',
  queueMicrotask: 'readonly',
  structuredClone: 'readonly',
  getComputedStyle: 'readonly',
  alert: 'readonly',
  confirm: 'readonly',
  HTMLElement: 'readonly',
  Node: 'readonly',
  crypto: 'readonly',
};

/**
 * A stand-in for the React hooks plugin, which is not installed.
 *
 * Five places carry `// eslint-disable-next-line react-hooks/exhaustive-deps`, written when
 * somebody ran a linter that had the plugin. ESLint errors on a disable comment naming a rule
 * it cannot find, so without this the comments themselves break the lint — and deleting them
 * would throw away a deliberate note about a dependency array somebody thought about.
 *
 * Declaring the rule and leaving it off keeps the comments meaningful and the lint runnable. If
 * the plugin is ever added, these definitions come out and the real rules take over.
 */
const reactHooks = {
  rules: {
    'exhaustive-deps': { meta: { schema: [] }, create: () => ({}) },
    'rules-of-hooks': { meta: { schema: [] }, create: () => ({}) },
  },
};

export default [
  {
    files: ['src/**/*.{js,jsx}'],
    plugins: { 'react-hooks': reactHooks },
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      parserOptions: {
        /* The automatic JSX runtime, so `React` itself is never in scope and must not be
           expected — the whole codebase relies on it. */
        ecmaFeatures: { jsx: true },
      },
      globals: browser,
    },
    rules: {
      /* The rule this file exists for. */
      'no-undef': 'error',

      /*
       * And its mirror: an import left behind after the thing using it moved out. Harmless at
       * runtime, but it is the trail a half-finished extraction leaves, and the next person
       * reading the imports is being told the file does something it no longer does.
       *
       * Warn rather than error — an unused argument before a used one is ordinary and worth
       * nobody's time, and a lint that fails on it is a lint people run with `|| true`.
       */
      'no-unused-vars': [
        'warn',
        { args: 'after-used', varsIgnorePattern: '^_', argsIgnorePattern: '^_' },
      ],

      /* Two more a bundler cannot see, and both are silent in production. */
      'no-dupe-keys': 'error',
      'no-unreachable': 'error',
    },
  },
];
