import { Suspense } from 'react';
import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import Layout from './components/Layout.jsx';
import { WorkspaceProvider } from './components/dock/WorkspaceContext.jsx';
import { Spinner } from './components/ui.jsx';
import { useAuth } from './context/AuthContext.jsx';
import lazyPage from './utils/lazyPage.js';

/**
 * Screens are split per route.
 *
 * Nobody uses more than a few of these in a session — the bench lives on sampling, marketing
 * on the pipeline — but one bundle made everyone download all of them before the login screen
 * would paint. Login and the shell stay eager, since they are on the path to everything; the
 * rest arrive when the route is actually visited.
 *
 * `lazyPage` rather than React's `lazy`, because fetching a screen later means fetching it
 * across a deploy: the file a tab was told about is renamed by the next release and the click
 * 404s. See `utils/lazyPage.js` — a new screen added with the bare `lazy` loses that, so a test
 * refuses it.
 */
import Login from './pages/Login.jsx';
import Home from './pages/Home.jsx';

const Profile = lazyPage(() => import('./pages/Profile.jsx'));
const ForgotPassword = lazyPage(() => import('./pages/ForgotPassword.jsx'));
const ResetPassword = lazyPage(() => import('./pages/ResetPassword.jsx'));
const Users = lazyPage(() => import('./pages/Users.jsx'));
const Integrations = lazyPage(() => import('./pages/Integrations.jsx'));
const Queries = lazyPage(() => import('./pages/Queries.jsx'));
const QueryDetail = lazyPage(() => import('./pages/QueryDetail.jsx'));
const Moulds = lazyPage(() => import('./pages/Moulds.jsx'));
const Materials = lazyPage(() => import('./pages/Materials.jsx'));
const PartsRegister = lazyPage(() => import('./pages/PartsRegister.jsx'));
const MouldDetail = lazyPage(() => import('./pages/MouldDetail.jsx'));
const MaterialDetail = lazyPage(() => import('./pages/MaterialDetail.jsx'));
const PartDetail = lazyPage(() => import('./pages/PartDetail.jsx'));
const Customers = lazyPage(() => import('./pages/Customers.jsx'));
const CustomerDetail = lazyPage(() => import('./pages/CustomerDetail.jsx'));
const Leads = lazyPage(() => import('./pages/Leads.jsx'));
const LeadAnalytics = lazyPage(() => import('./pages/LeadAnalytics.jsx'));
const Pricings = lazyPage(() => import('./pages/Pricings.jsx'));
const PricingDetail = lazyPage(() => import('./pages/PricingDetail.jsx'));
const Quotations = lazyPage(() => import('./pages/Quotations.jsx'));
const SentQuotations = lazyPage(() => import('./pages/SentQuotations.jsx'));
const QuotationDetail = lazyPage(() => import('./pages/QuotationDetail.jsx'));
const LeadDetail = lazyPage(() => import('./pages/LeadDetail.jsx'));
const Enquiries = lazyPage(() => import('./pages/Enquiries.jsx'));
const EnquiryDetail = lazyPage(() => import('./pages/EnquiryDetail.jsx'));
const Samples = lazyPage(() => import('./pages/Samples.jsx'));
const SampleDetail = lazyPage(() => import('./pages/SampleDetail.jsx'));
const SamplingDashboard = lazyPage(() => import('./pages/SamplingDashboard.jsx'));
const SampleAnalytics = lazyPage(() => import('./pages/SampleAnalytics.jsx'));
const MarketingDashboard = lazyPage(() => import('./pages/MarketingDashboard.jsx'));

/**
 * Blocks a route unless the reader is an administrator.
 *
 * Separate from `RequireModule` because this is not a module: the integrations screen carries
 * a third party's credentials-adjacent state and spends API calls the whole plant shares, so
 * it is gated on the role the server gates it on rather than on a grant nobody would think to
 * withhold.
 */
function RequireAdmin({ children }) {
  const { isAdmin } = useAuth();
  if (!isAdmin) return <Navigate to="/" replace />;
  return children;
}

/**
 * Where `/` goes: the queries list, for anybody who may open it.
 *
 * Guarded on the grant rather than redirecting unconditionally, because `/queries` is itself
 * gated — an administrator who has taken the module off somebody would otherwise send them
 * bouncing between the two routes forever, which is a blank screen and a spinning tab.
 *
 * Without the grant they get the day screen, which is what the front door used to be. That is
 * now the only way to reach it: it has no route and no tab, and it is kept here because a reader
 * with no queries has to land on *something*, and a screen that was the front door for months is
 * a better answer than an apology.
 */
function Landing() {
  const { canRead } = useAuth();
  return canRead('queries') ? <Navigate to="/queries" replace /> : <Home />;
}

/** Blocks a route unless the user may read the module behind it. */
function RequireModule({ moduleKey, children }) {
  const { canRead } = useAuth();
  if (!canRead(moduleKey)) return <Navigate to="/" replace />;
  return children;
}

/** Sends anyone without a session to the login screen, remembering where they were headed. */
function RequireAuth({ children }) {
  const { isAuthenticated, loading, unreachable, retrySession } = useAuth();
  const location = useLocation();

  if (loading) return <Spinner label="Restoring your session" />;
  /*
   * The server could not be asked, which is not the same as being told no. The session is kept
   * and the person is offered a retry — sending them to the login page for a network blip is
   * how a flaky connection turns into "the app keeps logging me out".
   */
  if (!isAuthenticated && unreachable) {
    return (
      <div className="mx-auto mt-24 max-w-md px-4 text-center">
        <p className="text-base font-bold text-steel-50">Could not reach the server</p>
        <p className="mt-2 text-sm text-steel-400">
          You are still signed in. Check the connection, then try again.
        </p>
        <button type="button" className="btn-primary mt-5" onClick={retrySession}>
          Try again
        </button>
      </div>
    );
  }
  if (!isAuthenticated) return <Navigate to="/login" state={{ from: location.pathname }} replace />;

  return children;
}

export default function App() {
  return (
    // One fallback for every split route: the chunk is small and usually already cached.
    <Suspense fallback={<Spinner label="Loading" />}>
      <Routes>
        <Route path="/login" element={<Login />} />
        {/* Public: reached from an email, before anybody is signed in. */}
        <Route path="/forgot-password" element={<ForgotPassword />} />
        <Route path="/reset-password" element={<ResetPassword />} />

        <Route
          element={
            <RequireAuth>
              <WorkspaceProvider>
                <Layout />
              </WorkspaceProvider>
            </RequireAuth>
          }
        >
          {/*
            Queries is the front door.

            Opening the app puts you in the questions people are waiting on, because that is now
            what this application is for — a CRM with a conversation running through it, rather
            than a plant system with a message board attached. A redirect rather than drawing
            the list at `/`, so that screen has one address: two routes rendering the same thing
            means a link somebody sends and a link somebody bookmarks are different strings, and
            the nav can only light one of them.

            **And the day screen is gone with it.** `/dashboard` sat under a Home tab answering
            "what needs me today" beside a queries list answering the same thing, so the strip
            offered the same morning twice. The route is removed rather than left unlinked: an
            address nobody can reach from the application still turns up in somebody's bookmarks
            and renders a screen the nav says does not exist. It falls through to `*` below, so
            an old bookmark lands on the front door.

            `Home` stays for one case only — see `Landing`, where somebody without the queries
            grant needs something at `/`.
          */}
          <Route index element={<Landing />} />
          <Route path="profile" element={<Profile />} />

          {/* Phase 1: the pipeline that runs from a lead to a customer to an enquiry. */}
          <Route
            path="dashboard/marketing"
            element={
              <RequireModule moduleKey="enquiries">
                <MarketingDashboard />
              </RequireModule>
            }
          />
          {/* Above `leads`, so the literal segment wins over nothing — and above `leads/:id`,
              which would otherwise swallow it as a lead called "analytics". */}
          <Route
            path="leads/analytics"
            element={
              <RequireModule moduleKey="enquiries">
                <LeadAnalytics />
              </RequireModule>
            }
          />
          <Route
            path="leads"
            element={
              <RequireModule moduleKey="enquiries">
                <Leads />
              </RequireModule>
            }
          />
          <Route
            path="leads/:id"
            element={
              <RequireModule moduleKey="enquiries">
                <LeadDetail />
              </RequireModule>
            }
          />
          <Route
            path="enquiries"
            element={
              <RequireModule moduleKey="enquiries">
                <Enquiries />
              </RequireModule>
            }
          />
          <Route
            path="enquiries/:id"
            element={
              <RequireModule moduleKey="enquiries">
                <EnquiryDetail />
              </RequireModule>
            }
          />
          {/* Phase 3 [§39]. Costings sit on the pricing grant, which marketing holds as read
              — §8's field split decides what actually comes back. */}
          <Route
            path="pricings"
            element={
              <RequireModule moduleKey="pricing">
                <Pricings />
              </RequireModule>
            }
          />
          <Route
            path="pricings/:id"
            element={
              <RequireModule moduleKey="pricing">
                <PricingDetail />
              </RequireModule>
            }
          />
          <Route
            path="quotations"
            element={
              <RequireModule moduleKey="pricing">
                <Quotations />
              </RequireModule>
            }
          />
          {/* Before the `:id` route so the word is read as the board it names. React Router
              ranks a static segment above a dynamic one either way, but a reader should not
              have to know that to be sure. */}
          <Route
            path="quotations/sent"
            element={
              <RequireModule moduleKey="pricing">
                <SentQuotations />
              </RequireModule>
            }
          />
          <Route
            path="quotations/:id"
            element={
              <RequireModule moduleKey="pricing">
                <QuotationDetail />
              </RequireModule>
            }
          />
          <Route
            path="samples/dashboard"
            element={
              <RequireModule moduleKey="samples">
                <SamplingDashboard />
              </RequireModule>
            }
          />
          <Route
            path="samples/analytics"
            element={
              <RequireModule moduleKey="samples">
                <SampleAnalytics />
              </RequireModule>
            }
          />
          <Route
            path="samples"
            element={
              <RequireModule moduleKey="samples">
                <Samples />
              </RequireModule>
            }
          />
          <Route
            path="samples/:id"
            element={
              <RequireModule moduleKey="samples">
                <SampleDetail />
              </RequireModule>
            }
          />
          <Route
            path="customers"
            element={
              <RequireModule moduleKey="customers">
                <Customers />
              </RequireModule>
            }
          />
          <Route
            path="customers/:id"
            element={
              <RequireModule moduleKey="customers">
                <CustomerDetail />
              </RequireModule>
            }
          />
          {/*
            Queries [queries]. Read is the only grant either screen asks for, and that is
            deliberate: a query is a conversation rather than a record anybody owns — the whole
            point is that despatch, accounts and marketing are in the same thread — so gating
            replies on write would mean the departments a question is *for* could not answer it.
            What protects a thread is membership, which the server enforces on every read: not
            being in the room is a 404, not a hidden button.
          */}
          <Route
            path="queries"
            element={
              <RequireModule moduleKey="queries">
                <Queries />
              </RequireModule>
            }
          />
          <Route
            path="queries/:id"
            element={
              <RequireModule moduleKey="queries">
                <QueryDetail />
              </RequireModule>
            }
          />
          <Route
            path="moulds"
            element={
              <RequireModule moduleKey="moulds">
                <Moulds />
              </RequireModule>
            }
          />
          {/* Below the list, so the literal segment is not swallowed by `:id`. */}
          <Route
            path="moulds/:id"
            element={
              <RequireModule moduleKey="moulds">
                <MouldDetail />
              </RequireModule>
            }
          />
          <Route
            path="materials"
            element={
              <RequireModule moduleKey="materials">
                <Materials />
              </RequireModule>
            }
          />
          <Route
            path="materials/:id"
            element={
              <RequireModule moduleKey="materials">
                <MaterialDetail />
              </RequireModule>
            }
          />
          {/*
            Three routes, one component. They are three registers to the plant and one shape to
            the code, and the `kind` prop is the whole of the difference.
          */}
          {['hook', 'clip', 'print'].map((kind) => (
            <Route
              key={kind}
              path={`${kind}s`}
              element={
                <RequireModule moduleKey="materials">
                  <PartsRegister kind={kind} />
                </RequireModule>
              }
            />
          ))}
          {['hook', 'clip', 'print'].map((kind) => (
            <Route
              key={`${kind}-detail`}
              path={`${kind}s/:id`}
              element={
                <RequireModule moduleKey="materials">
                  <PartDetail kind={kind} />
                </RequireModule>
              }
            />
          ))}

          <Route
            path="users"
            element={
              <RequireModule moduleKey="users">
                <Users />
              </RequireModule>
            }
          />
          <Route
            path="integrations"
            element={
              <RequireAdmin>
                <Integrations />
              </RequireAdmin>
            }
          />
        </Route>

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Suspense>
  );
}
