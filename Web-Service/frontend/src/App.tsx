import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { QueryClientProvider } from '@tanstack/react-query';
import { ReactQueryDevtools } from '@tanstack/react-query-devtools';
import { ConfigProvider } from 'antd';
import { queryClient } from './lib/queryClient';
import { useAppSelector } from './store/hooks';
import { antdTheme } from './theme/antd-theme';
import { isAdmin } from './utils/permissions';

// Layouts
import { MainLayout } from './layouts/MainLayout';

// Components
import { ProtectedRoute } from './components/ProtectedRoute';
import { RoleBasedRoute } from './components/RoleBasedRoute';
import { LoadingSpinner } from './components/LoadingSpinner';
import { ErrorBoundary } from './components/ErrorBoundary';

// Pages
import LoginPage from './pages/LoginPage';
import RegisterPage from './pages/RegisterPage';
import UserDashboard from './pages/UserDashboard';
import AdminDashboard from './pages/AdminDashboard';
import RecordingsList from './pages/recordings/RecordingsList';
import RecordingUpload from './pages/recordings/RecordingUpload';
import RecordingDetail from './pages/recordings/RecordingDetail';
import ProjectsList from './pages/projects/ProjectsList';
import CreateProject from './pages/projects/CreateProject';
import ProjectDetail from './pages/projects/ProjectDetail';
import ProtocolsList from './pages/protocols/ProtocolsList';
import ComparisonsList from './pages/comparisons/ComparisonsList';
import PatientDetailPage from './pages/PatientDetailPage';
import ProfilePage from './pages/ProfilePage';
import VerifyEmailPage from './pages/VerifyEmailPage';

// Dashboard router component that directs users based on their role
function DashboardRouter() {
  const { user, loading } = useAppSelector((state) => state.auth);

  // Don't use useEffect for navigation - just redirect directly
  if (loading) {
    return <LoadingSpinner fullScreen message="Loading..." />;
  }

  // Redirect based on role
  if (isAdmin(user)) {
    return <Navigate to="/dashboard" replace />;
  } else {
    return <Navigate to="/user-dashboard" replace />;
  }
}

function App() {
  return (
    <ErrorBoundary showDetails={import.meta.env.DEV}>
      <QueryClientProvider client={queryClient}>
        <ConfigProvider theme={antdTheme}>
          <BrowserRouter>
        <Routes>
          {/* Public Routes */}
          <Route path="/login" element={<LoginPage />} />
          <Route path="/register" element={<RegisterPage />} />
          <Route path="/verify-email" element={<VerifyEmailPage />} />

          {/* Protected Routes */}
          <Route
            element={
              <ProtectedRoute>
                <MainLayout />
              </ProtectedRoute>
            }
          >
            {/* Dashboard routes - role-based routing */}
            <Route path="/" element={<Navigate to="/home" replace />} />
            <Route
              path="/home"
              element={
                <DashboardRouter />
              }
            />
            <Route
              path="/dashboard"
              element={
                <RoleBasedRoute requiredRoles={['admin']}>
                  <AdminDashboard />
                </RoleBasedRoute>
              }
            />
            <Route
              path="/user-dashboard"
              element={
                <RoleBasedRoute requiredRoles={['admin', 'clinician', 'researcher']}>
                  <UserDashboard />
                </RoleBasedRoute>
              }
            />
            <Route path="/patients/:id" element={<PatientDetailPage />} />
            <Route path="/profile" element={<ProfilePage />} />

            {/* Projects */}
            <Route path="/projects" element={<ProjectsList />} />
            <Route path="/projects/create" element={<CreateProject />} />
            <Route path="/projects/:id" element={<ProjectDetail />} />

            {/* Protocols */}
            <Route path="/protocols" element={<ProtocolsList />} />

            {/* Recordings */}
            <Route path="/recordings" element={<RecordingsList />} />
            <Route path="/recordings/upload" element={<RecordingUpload />} />
            <Route path="/recordings/:id" element={<RecordingDetail />} />

            {/* Analysis - Placeholder routes */}
            <Route path="/analysis/:recordingId" element={<div className="p-6">Analysis page (to be implemented)</div>} />
            <Route path="/comparisons" element={<ComparisonsList />} />

            {/* Admin - Placeholder routes */}
            <Route path="/admin" element={<div className="p-6">Admin dashboard (to be implemented)</div>} />
            <Route path="/admin/users" element={<div className="p-6">User management (to be implemented)</div>} />
            <Route path="/admin/logs" element={<div className="p-6">Audit logs (to be implemented)</div>} />
          </Route>

          {/* Catch all - redirect to home */}
          <Route path="*" element={<Navigate to="/home" replace />} />
        </Routes>
        </BrowserRouter>

          {/* React Query DevTools */}
          <ReactQueryDevtools initialIsOpen={false} />
        </ConfigProvider>
      </QueryClientProvider>
    </ErrorBoundary>
  );
}

export default App;
