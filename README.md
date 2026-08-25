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

Dark-first, built on the Navin Hangers brand pulled from navinplastic.com.

| Token | Value | Used for |
| --- | --- | --- |
| `flame-500` | `#F76800` | The one hot accent — primary buttons, active nav, key figures |
| `flame-400` / `flame-600` | `#FF8124` / `#D95A00` | Hover and pressed states |
| `aqua-500` | `#2C94A5` | Secondary accent, informational states |
| `ink-900` → `ink-750` | `#0C141A` → `#1B2E39` | Surface elevation ramp, back to front |
| `steel-50` → `steel-500` | `#F7FAFB` → `#5C6970` | Text ramp, primary to muted |
| `success` / `warn` / `danger` | `#22C07A` / `#E8991F` / `#F0455B` | Semantic status |

Typeface is **Manrope** (the brand face), 400–800, with tight tracking on headings.

Principles the components follow:

- **One hot element per view.** The accent goes to the single action the user came to
  perform. Table row actions stay neutral and only warm on hover, so a row of them never
  competes with the page's primary button.
- **Elevation by shadow, not by lighter fills.** Cards sit on the canvas with real depth;
  hairlines are translucent white rather than solid greys.
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
