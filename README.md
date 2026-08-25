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
