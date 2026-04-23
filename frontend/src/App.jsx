import { BrowserRouter, Route, Routes } from 'react-router-dom';

import ErrorBoundary from './components/ErrorBoundary';
import Layout from './components/Layout';
import ProtectedRoute from './components/ProtectedRoute';
import { AuthProvider } from './context/AuthContext';

import DashboardPage from './pages/DashboardPage';
import HistoryPage from './pages/HistoryPage';
import LandingPage from './pages/LandingPage';
import LoginPage from './pages/LoginPage';
import ReportPage from './pages/ReportPage';
import SessionPage from './pages/SessionPage';
import SettingsPage from './pages/SettingsPage';
import SignupPage from './pages/SignupPage';

const Protected = ({ children }) => (
  <ProtectedRoute>{children}</ProtectedRoute>
);

export default function App() {
  return (
    <ErrorBoundary>
      <BrowserRouter>
        <AuthProvider>
          <Routes>
            <Route element={<Layout />}>
              <Route path="/" element={<LandingPage />} />
              <Route path="/login" element={<LoginPage />} />
              <Route path="/signup" element={<SignupPage />} />
              <Route path="/session" element={<Protected><SessionPage /></Protected>} />
              <Route path="/session/:id/report" element={<Protected><ReportPage /></Protected>} />
              <Route path="/dashboard" element={<Protected><DashboardPage /></Protected>} />
              <Route path="/history" element={<Protected><HistoryPage /></Protected>} />
              <Route path="/settings" element={<Protected><SettingsPage /></Protected>} />
            </Route>
          </Routes>
        </AuthProvider>
      </BrowserRouter>
    </ErrorBoundary>
  );
}
