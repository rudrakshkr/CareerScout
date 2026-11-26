import type { ReactNode } from 'react';
import { BrowserRouter, Navigate, Route, Routes, useLocation } from 'react-router';
import { AuthProvider, useAuth } from './auth/AuthProvider';
import { ThemeProvider } from './theme/ThemeProvider';
import Dashboard from './Dashboard';
import { OnboardingPage } from './onboarding/OnboardingPage';
import {
  AuthLoadingPage,
  AuthUnavailablePage,
  LoginPage,
  RegisterPage,
} from './pages/AuthPages';

function GuestOnly({ children }: { children: ReactNode }) {
  const { status, profile } = useAuth();
  if (status === 'checking') return <AuthLoadingPage />;
  if (status === 'unavailable') return <AuthUnavailablePage />;
  if (status === 'authenticated') {
    const destination = profile?.onboardingStatus === 'completed' ? '/overview' : '/onboarding';
    return <Navigate to={destination} replace />;
  }
  return <>{children}</>;
}

function ProtectedRoute({ children, allowIncomplete = false }: { children: ReactNode; allowIncomplete?: boolean }) {
  const { status, profile } = useAuth();
  const location = useLocation();
  if (status === 'checking') return <AuthLoadingPage />;
  if (status === 'unavailable') return <AuthUnavailablePage />;
  if (status === 'unauthenticated') {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }
  const completed = profile?.onboardingStatus === 'completed';
  if (!allowIncomplete && !completed) return <Navigate to="/onboarding" replace />;
  if (allowIncomplete && completed) return <Navigate to="/overview" replace />;
  return <>{children}</>;
}

function OnboardingRoute() {
  const { user, refresh } = useAuth();
  if (!user) return <AuthLoadingPage />;
  return <OnboardingPage user={user} onComplete={refresh} />;
}

export default function App() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <BrowserRouter>
          <Routes>
            <Route path="/login" element={<GuestOnly><LoginPage /></GuestOnly>} />
            <Route path="/register" element={<GuestOnly><RegisterPage /></GuestOnly>} />
            <Route path="/onboarding" element={<ProtectedRoute allowIncomplete><OnboardingRoute /></ProtectedRoute>} />
            <Route path="/onboarding/:step" element={<ProtectedRoute allowIncomplete><OnboardingRoute /></ProtectedRoute>} />
            <Route path="/overview" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
            <Route path="/discover" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
            <Route path="/companies" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
            <Route path="/contacts" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
            <Route path="/profile" element={<ProtectedRoute><Navigate to="/profile/personal" replace /></ProtectedRoute>} />
            <Route path="/profile/:step" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
            <Route path="/resumes" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
            <Route path="/applications" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
            <Route path="/outreach" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
            <Route path="/research" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
            <Route path="/settings" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
            <Route path="/" element={<Navigate to="/overview" replace />} />
            <Route path="*" element={<Navigate to="/overview" replace />} />
          </Routes>
        </BrowserRouter>
      </AuthProvider>
    </ThemeProvider>
  );
}
