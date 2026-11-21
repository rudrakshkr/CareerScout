import { BrowserRouter, Navigate, Outlet, Route, Routes, useLocation } from 'react-router';
import { AuthProvider, useAuth } from './auth/AuthProvider';
import Dashboard from './Dashboard';
import { AuthLoadingPage, AuthUnavailablePage, LoginPage, RegisterPage } from './pages/AuthPages';

function ProtectedRoutes() {
  const { status, user, logout } = useAuth();
  const location = useLocation();
  if (status === 'checking') return <AuthLoadingPage />;
  if (status === 'unavailable') return <AuthUnavailablePage />;
  if (status === 'unauthenticated' || !user) return <Navigate to="/login" replace state={{ from: location }} />;
  return <Dashboard user={user} onLogout={logout} />;
}

function GuestRoutes() {
  const { status } = useAuth();
  if (status === 'checking') return <AuthLoadingPage />;
  if (status === 'unavailable') return <AuthUnavailablePage />;
  if (status === 'authenticated') return <Navigate to="/" replace />;
  return <Outlet />;
}

function AppRoutes() {
  return <Routes>
    <Route element={<GuestRoutes />}>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/register" element={<RegisterPage />} />
    </Route>
    <Route path="/" element={<ProtectedRoutes />} />
    <Route path="*" element={<Navigate to="/" replace />} />
  </Routes>;
}

function App() {
  return <BrowserRouter><AuthProvider><AppRoutes /></AuthProvider></BrowserRouter>;
}

export default App;
