import { BrowserRouter, Navigate, Outlet, Route, Routes, useLocation } from 'react-router';
import { AuthProvider, useAuth } from './auth/AuthProvider';
import Dashboard from './Dashboard';
import { AuthLoadingPage, AuthUnavailablePage, LoginPage, RegisterPage } from './pages/AuthPages';
import { OnboardingPage } from './onboarding/OnboardingPage';

function ProtectedRoutes() {
  const { status, user, profile, logout, refresh } = useAuth();
  const location = useLocation();
  if (status === 'checking') return <AuthLoadingPage />;
  if (status === 'unavailable') return <AuthUnavailablePage />;
  if (status === 'unauthenticated' || !user) return <Navigate to="/login" replace state={{ from: location }} />;

  const onboardingComplete = profile?.onboardingStatus === 'completed';
  if (!onboardingComplete) {
    if (location.pathname !== '/onboarding') return <Navigate to="/onboarding" replace />;
    return <OnboardingPage user={user} onComplete={refresh} />;
  }
  if (location.pathname === '/onboarding') return <Navigate to="/" replace />;
  if (location.pathname !== '/') return <Navigate to="/" replace />;
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
    <Route path="/*" element={<ProtectedRoutes />} />
  </Routes>;
}

function App() {
  return <BrowserRouter><AuthProvider><AppRoutes /></AuthProvider></BrowserRouter>;
}

export default App;
