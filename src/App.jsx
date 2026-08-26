import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import Layout from './components/Layout.jsx';
import { WorkspaceProvider } from './components/dock/WorkspaceContext.jsx';
import { Spinner } from './components/ui.jsx';
import { useAuth } from './context/AuthContext.jsx';

import Login from './pages/Login.jsx';
import Dashboard from './pages/Dashboard.jsx';
import Profile from './pages/Profile.jsx';
import Users from './pages/Users.jsx';
import Products from './pages/Products.jsx';
import Customers from './pages/Customers.jsx';
import CustomerDetail from './pages/CustomerDetail.jsx';
import Leads from './pages/Leads.jsx';
import LeadDetail from './pages/LeadDetail.jsx';
import Enquiries from './pages/Enquiries.jsx';
import EnquiryDetail from './pages/EnquiryDetail.jsx';
import Samples from './pages/Samples.jsx';
import SampleDetail from './pages/SampleDetail.jsx';

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
  );
}
