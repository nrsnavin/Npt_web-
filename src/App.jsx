import { Suspense, lazy } from 'react';
import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import Layout from './components/Layout.jsx';
import { WorkspaceProvider } from './components/dock/WorkspaceContext.jsx';
import { Spinner } from './components/ui.jsx';
import { useAuth } from './context/AuthContext.jsx';

/**
 * Screens are split per route.
 *
 * Nobody uses more than a few of these in a session — the bench lives on sampling, marketing
 * on the pipeline — but one bundle made everyone download all of them before the login screen
 * would paint. Login and the shell stay eager, since they are on the path to everything; the
 * rest arrive when the route is actually visited.
 */
import Login from './pages/Login.jsx';
import Home from './pages/Home.jsx';

const Profile = lazy(() => import('./pages/Profile.jsx'));
const Users = lazy(() => import('./pages/Users.jsx'));
const Integrations = lazy(() => import('./pages/Integrations.jsx'));
const Queries = lazy(() => import('./pages/Queries.jsx'));
const QueryDetail = lazy(() => import('./pages/QueryDetail.jsx'));
const Moulds = lazy(() => import('./pages/Moulds.jsx'));
const Materials = lazy(() => import('./pages/Materials.jsx'));
const PartsRegister = lazy(() => import('./pages/PartsRegister.jsx'));
const MouldDetail = lazy(() => import('./pages/MouldDetail.jsx'));
const MaterialDetail = lazy(() => import('./pages/MaterialDetail.jsx'));
const PartDetail = lazy(() => import('./pages/PartDetail.jsx'));
const Customers = lazy(() => import('./pages/Customers.jsx'));
const CustomerDetail = lazy(() => import('./pages/CustomerDetail.jsx'));
const Leads = lazy(() => import('./pages/Leads.jsx'));
const LeadAnalytics = lazy(() => import('./pages/LeadAnalytics.jsx'));
const Pricings = lazy(() => import('./pages/Pricings.jsx'));
const PricingDetail = lazy(() => import('./pages/PricingDetail.jsx'));
const Quotations = lazy(() => import('./pages/Quotations.jsx'));
const SentQuotations = lazy(() => import('./pages/SentQuotations.jsx'));
const QuotationDetail = lazy(() => import('./pages/QuotationDetail.jsx'));
const LeadDetail = lazy(() => import('./pages/LeadDetail.jsx'));
const Enquiries = lazy(() => import('./pages/Enquiries.jsx'));
const EnquiryDetail = lazy(() => import('./pages/EnquiryDetail.jsx'));
const Samples = lazy(() => import('./pages/Samples.jsx'));
const SampleDetail = lazy(() => import('./pages/SampleDetail.jsx'));
const SamplingDashboard = lazy(() => import('./pages/SamplingDashboard.jsx'));
const SampleAnalytics = lazy(() => import('./pages/SampleAnalytics.jsx'));
const MarketingDashboard = lazy(() => import('./pages/MarketingDashboard.jsx'));

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
 * bouncing between the two routes forever, which is a blank screen and a spinning tab. Without
 * the grant they get the day screen, which is what the front door used to be.
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
  const { isAuthenticated, loading } = useAuth();
  const location = useLocation();

  if (loading) return <Spinner label="Restoring your session" />;
  if (!isAuthenticated) return <Navigate to="/login" state={{ from: location.pathname }} replace />;

  return children;
}

export default function App() {
  return (
    // One fallback for every split route: the chunk is small and usually already cached.
    <Suspense fallback={<Spinner label="Loading" />}>
      <Routes>
        <Route path="/login" element={<Login />} />

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

            The day screens are not lost, they have moved down a level: `/dashboard` is still
            Home, still chosen by department [pages/Home.jsx], and still in the nav.
          */}
          <Route index element={<Landing />} />
          <Route path="dashboard" element={<Home />} />
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
