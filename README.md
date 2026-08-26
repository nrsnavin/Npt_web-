# NPT Web — Navin Hangers console

React front end for the Navin Hangers API: the pipeline from a lead to a customer to an
enquiry, the sampling bench that enquiry hands its work to, the product master, and the
account and access screens underneath them.

Vite + React + Tailwind, React Router for navigation.

> Screens arrive as their module does. Every route is gated on the caller's module grant, so
> what a person sees is decided by the API rather than by the client.

## Getting started

```bash
npm install
cp .env.example .env      # point VITE_API_URL at the API
npm run dev
```

Opens on `http://localhost:5173`. Without `VITE_API_URL` the dev server proxies `/api`
to `http://localhost:5000`, so running the API locally needs no configuration.

## Screens

**Login** — two ways in:

- **Password** — email and password.
- **One-time code** — enter an email address *or* a phone number; the API sends a code by
  email or SMS and the second step exchanges it for a session. Phone numbers can be typed
  in any common local format (`9876543210`, `098765 43210`, `+91 98765 43210`).

When the API runs in development without an SMTP or Twilio provider, the code comes back in
the response and the login screen shows it in an amber notice, so you can sign in without
setting up a provider account.

**Profile** — name, role, department, email, phone and last sign-in, plus the feature
access list. Name, phone and department are editable; email and role are set by an
administrator. Sign out is in the header and at the foot of the page.

**Leads** — the funnel doubles as the stage filter. A lead's own screen carries its activity
log, the qualify and disqualify actions, and **Convert to customer**, which creates the
customer, its first contact and optionally the first enquiry in one submission.

**Enquiries** — count and value per stage across the top, then Open / Due now / All. *Due
now* is the morning follow-up list: everything open whose date has arrived. An enquiry's own
screen shows its position in the funnel, the requirement, the full stage history, and the
move-stage dialog — which asks for a reason when closing or holding, and insists on the next
step otherwise.

**Customers** — the master list, and per customer the details, contacts and the enquiry
timeline. Business figures are placeholders until orders and payments land.

**Sampling** — the bench: how many requests sit at each stage and how many of those are
late, then Open / Overdue / Unassigned / Mine / All. A request's own screen splits the two
jobs it involves. The sample team moves it along and dispatches it, which asks for the
courier, AWB and quantity before it will let go. Marketing records what the customer said
through a separate action, because only the person who spoke to them knows — and a maker
marking their own work approved is how a sample register stops being worth reading. A
modification offers the next attempt, carrying the customer's words forward.

Handover tasks appear in the dock, linked to the record that raised them, so acting on one
is a click rather than a search.

The sample carries a **Log**: notes and photos of each shot, with comments on either. Anyone
who can see the sample can post and comment, marketing included — they hold read access only,
and they are exactly who has to look at a photo and say what the buyer thinks. Photos open
full size, and only their author can remove what they wrote. Above it sits the **buyer's own
reference** photo, which the bench uploads and replaces.

Photos are fetched through the API rather than linked to: the file route checks the caller
against the record before sending anything, so `AuthedImage` loads each one with the session's
token and shows it from an object URL, revoked when it goes away.

A **Courier** section takes the courier, tracking number, quantity and date whenever they are
known — before the sample leaves, so the ready update can tell the customer how it is coming,
and afterwards, since a tracking number typed wrong is otherwise stuck. Dispatching accepts
what is already there rather than asking again.

The customer is told automatically when a sample is ready and when it is dispatched, on
WhatsApp and email. The sample screen carries the log of everything ever sent — channel,
recipient, the text as it went, and whether a person or the automation sent it — plus a
**Tell the customer** dialog that previews the same draft for editing, warns if it has
already gone, and is how a failed send is retried. Both live on the `customer_comms` grant,
so the sample team sees neither: they update internal status, and the customer relationship
is marketing's. A customer's per-channel opt-out is on their own record.

**Product master** — every hanger model marketing can quote against, filterable by category
and material. A new development is promoted into it from the enquiry that produced it.

### Module access

The list comes from the API, not the client: sign-in returns the whole catalogue annotated
with `canRead` and `canWrite` for the caller, and the profile groups it as the server
declared it. Entries not yet built are marked *soon* — their access is already defined, so
the moment one ships the right people have it.

Access is a per-user grant on each module, at `read` or `write`. A department only proposes a
starting set of grants when an administrator creates the account; what is stored on the user
is always the explicit grant, so a department change never silently alters what somebody can
already do. Admins bypass grants entirely.

`useAuth().canRead('enquiries')` and `canWrite` answer the same question for a component, so
every screen gates itself on the source of truth the profile displays — `RequireModule` keeps
a route out of reach, and each page hides the actions the caller cannot use.

Marketing carries a second, record-level rule on top: a marketing person sees only their own
customers, leads and enquiries. That one is enforced server-side only, since it is about the
data rather than the screen.

## Layout

```
src/
  api/          axios client (JWT interceptor) and the endpoint map
  components/   Layout, the UI kit and the theme toggle
  context/      AuthContext (session, sign-in, role and feature checks), ThemeContext
  components/dock/  the bottom-right dock: tasks, notes, announcements
  hooks/        record and list loading, with a debounce for search boxes
  pages/        Login, Profile, Users, and the pipeline and sampling screens
  utils/        formatting, status badge tones, and the pipeline's enums and stage order
  theme.css     the dark and light palettes
```

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
One class therefore works in both themes.

Theme resolution, in order:

1. An explicit choice, stored in `localStorage` under `npt.theme`.
2. Otherwise the operating system's `prefers-color-scheme`, followed live.
3. Dark as the fallback.

A small inline script in `index.html` applies the stored choice before the first paint, so a
reload never flashes the wrong palette. The toggle sits in the app header and on the login
screen.

A few tokens are deliberately theme-specific rather than mirrored, because the same treatment
does not work in both: form fields need a stronger border on light (white-on-white is only a
border), the primary button lightens on hover in dark and deepens in light, semantic `400`
shades darken on light so badge text clears AA on a pale fill, and the modal scrim stays dark
in both.

| Token | Role |
| --- | --- |
| `flame-500` (`#F76800`) | The one hot accent — primary buttons, active nav, key figures |
| `aqua-500` (`#2C94A5`) | Secondary accent, informational states |
| `ink-950` → `ink-500` | Surface ramp: sunken, canvas, card, raised, dividers |
| `steel-50` → `steel-600` | Text ramp, strongest to faintest |
| `line` | Hairlines and hover washes, always with an opacity modifier |
| `success` / `warn` / `danger` | Semantic status |

Typeface is **Manrope** (the brand face), 400–800, with tight tracking on headings.

Principles the components follow:

- **One hot element per view.** The accent goes to the single action the user came to
  perform.
- **Elevation is a real step.** Dark builds depth with shadow on a near-black canvas; light
  lifts white cards off a cool off-white canvas with a soft tinted shadow.
- **Status has a fixed vocabulary.** Five tones in `utils/statusStyles.js` — neutral, info,
  progress, success, danger — so a badge means the same thing everywhere.
- **Numbers are tabular**, so digits line up in columns.
- **Motion is short and purposeful**, and collapses under `prefers-reduced-motion`.
- **Focus is always visible**, from one ring defined in the base layer.

## Build

```bash
npm run build     # outputs to dist/
npm run preview   # serve the production build
```
