# NPT Web — CRM + ERP client

React front end for the NPT Hangers CRM and ERP API: leads and customers, quotations and
sales orders, production, inventory, purchasing and the management dashboard.

Vite + React + Tailwind, TanStack Query for server state, React Router for navigation.

## Getting started

```bash
npm install
cp .env.example .env      # point VITE_API_URL at the API
npm run dev
```

Opens on `http://localhost:5173`. Without `VITE_API_URL` the dev server proxies `/api`
to `http://localhost:5000`, so running the API locally needs no configuration.

## Signing in

Two options on the login screen:

- **Password** — email and password.
- **One-time code** — enter an email address *or* a phone number; the API sends a code by
  email or SMS and the second step exchanges it for a session. Phone numbers can be typed
  in any common local format (`9876543210`, `098765 43210`, `+91 98765 43210`).

When the API runs in development without an SMTP or Twilio provider, the code comes back in
the response and the login screen shows it in an amber notice, so you can sign in without
setting up a provider account.

The session token lives in `localStorage`; a 401 from any request clears it and returns you
to the login screen.

## Design system

Built on the Navin Hangers brand pulled from navinplastic.com, in a dark and a light theme.

### Theming

Every colour is a CSS custom property on the root element, so the whole system re-themes by
swapping variables — no component knows which theme is active. The palettes live in
`src/theme.css`; `tailwind.config.js` maps the utility names onto them.

The scale *numbers* name a role, not a brightness: `ink-900` is always the page canvas and
`steel-50` is always the strongest text, whether that reads light-on-dark or dark-on-light.
One class therefore works in both themes, and dark is unchanged from the original design.

Theme resolution, in order:

1. An explicit choice, stored in `localStorage` under `npt.theme`.
2. Otherwise the operating system's `prefers-color-scheme`, followed live.
3. Dark as the fallback.

A small inline script in `index.html` applies the stored choice before the first paint, so a
reload never flashes the wrong palette. The toggle sits in the app header and on the login
screen; `useTheme()` exposes it, and `useChartTheme()` supplies matching values to Recharts,
which takes colours rather than classes.

A few tokens are deliberately theme-specific rather than mirrored, because the same treatment
does not work in both: form fields need a stronger border on light (white-on-white is only a
border), the primary button lightens on hover in dark and deepens in light, semantic `400`
shades darken on light so badge text clears AA on a pale fill, and the modal scrim stays dark
in both.

| Token | Value | Used for |
| --- | --- | --- |
| `flame-500` | `#F76800` | The one hot accent — primary buttons, active nav, key figures |
| `flame-400` / `flame-600` | `#FF8124` / `#D95A00` | Hover and pressed states |
| `aqua-500` | `#2C94A5` | Secondary accent, informational states |
| `ink-950` → `ink-500` | Sunken, canvas, card, raised, dividers | Surface ramp by role |
| `steel-50` → `steel-600` | Strongest → faintest | Text ramp by role |
| `line` | White in dark, near-black in light | Hairlines and hover washes, always with an opacity modifier |
| `success` / `warn` / `danger` | `#22C07A` / `#E8991F` / `#F0455B` | Semantic status |

Typeface is **Manrope** (the brand face), 400–800, with tight tracking on headings.

Principles the components follow:

- **One hot element per view.** The accent goes to the single action the user came to
  perform. Table row actions stay neutral and only warm on hover, so a row of them never
  competes with the page's primary button.
- **Elevation is a real step, not a hairline.** Dark builds depth with shadow on a near-black
  canvas; light lifts white cards off a cool off-white canvas with a soft tinted shadow.
- **Status has a fixed vocabulary.** Every document state maps to one of five tones in
  `utils/statusStyles.js` — neutral, info, progress, success, danger — so a badge means
  the same thing on every screen.
- **Numbers are tabular.** Money and quantity columns use tabular figures so digits line up.
- **Motion is short and purposeful.** 150–240ms ease-out on hover, entry and dialogs, and
  everything collapses under `prefers-reduced-motion`.
- **Focus is always visible.** A single flame focus ring is defined once in the base layer
  and applies to every interactive element.

## Layout

```
src/
  api/          axios client (JWT interceptor) and the endpoint map
  components/   Layout, DataTable, CrudPage, LineItemsEditor and the UI kit
  context/      AuthContext — session, sign-in methods and role checks
  hooks/        useResource / useListParams / useOptions over TanStack Query
  pages/        one file per screen
  utils/        currency, date and status formatting
```

`CrudPage` renders a whole master-data screen from a column and field spec — Customers,
Suppliers, Products and Materials are each about 80 lines because of it. Transactional
screens (quotations, orders, production, purchasing) are hand-built since each has its own
document actions.

Role checks come from `useAuth().can(...roles)`, mirroring the API's own authorisation, so
buttons only appear for people allowed to use them. Admin passes every check.

## Build

```bash
npm run build     # outputs to dist/
npm run preview   # serve the production build
```

## Not built yet

Invoices, Inventory and BOM screens. Their API endpoints exist and are documented in the
server repo; the nav will grow when the pages land.
