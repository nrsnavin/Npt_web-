import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import Layout from './components/Layout.jsx';
import { Spinner } from './components/ui.jsx';
import { useAuth } from './context/AuthContext.jsx';

import Login from './pages/Login.jsx';
import Profile from './pages/Profile.jsx';
import Users from './pages/Users.jsx';

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
            <Layout />
          </RequireAuth>
        }
      >
        <Route index element={<Profile />} />
        <Route path="profile" element={<Profile />} />
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
