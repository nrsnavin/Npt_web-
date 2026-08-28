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
import Dashboard from './pages/Dashboard.jsx';

const Profile = lazy(() => import('./pages/Profile.jsx'));
const Users = lazy(() => import('./pages/Users.jsx'));
const Products = lazy(() => import('./pages/Products.jsx'));
const Customers = lazy(() => import('./pages/Customers.jsx'));
const CustomerDetail = lazy(() => import('./pages/CustomerDetail.jsx'));
const Leads = lazy(() => import('./pages/Leads.jsx'));
const LeadAnalytics = lazy(() => import('./pages/LeadAnalytics.jsx'));
const Pricings = lazy(() => import('./pages/Pricings.jsx'));
const PricingDetail = lazy(() => import('./pages/PricingDetail.jsx'));
const Quotations = lazy(() => import('./pages/Quotations.jsx'));
const LeadDetail = lazy(() => import('./pages/LeadDetail.jsx'));
const Enquiries = lazy(() => import('./pages/Enquiries.jsx'));
const EnquiryDetail = lazy(() => import('./pages/EnquiryDetail.jsx'));
const Samples = lazy(() => import('./pages/Samples.jsx'));
const SampleDetail = lazy(() => import('./pages/SampleDetail.jsx'));
const SamplingDashboard = lazy(() => import('./pages/SamplingDashboard.jsx'));
const SampleAnalytics = lazy(() => import('./pages/SampleAnalytics.jsx'));
const MarketingDashboard = lazy(() => import('./pages/MarketingDashboard.jsx'));

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
          <Route index element={<Dashboard />} />
          <Route path="dashboard" element={<Dashboard />} />
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
              <RequireModule moduleKey="quotations">
                <Quotations />
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
          <Route
            path="products"
            element={
              <RequireModule moduleKey="products">
                <Products />
              </RequireModule>
            }
          />

          <Route
            path="users"
            element={
              <RequireModule moduleKey="users">
                <Users />
              </RequireModule>
            }
          />
        </Route>

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Suspense>
  );
}
