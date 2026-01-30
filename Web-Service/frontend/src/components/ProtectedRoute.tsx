import { Navigate } from 'react-router-dom';
import { useCurrentUser } from '../hooks/useAuth';
import { LoadingSpinner } from './LoadingSpinner';
import { authService } from '../services/authService';

interface ProtectedRouteProps {
  children: React.ReactNode;
}

export const ProtectedRoute = ({ children }: ProtectedRouteProps) => {
  const { data: user, isLoading, error } = useCurrentUser();

  // Check if user has token
  if (!authService.isAuthenticated()) {
    return <Navigate to="/login" replace />;
  }

  // Show loading while fetching user data
  if (isLoading) {
    return <LoadingSpinner fullScreen message="Loading..." />;
  }

  // If error or no user, redirect to login
  if (error || !user) {
    authService.logout();
    return <Navigate to="/login" replace />;
  }

  // User is authenticated, render children
  return <>{children}</>;
};
