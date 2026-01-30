import { Navigate } from 'react-router-dom';
import { useCurrentUser } from '../hooks/useAuth';
import { LoadingSpinner } from './LoadingSpinner';
import { authService } from '../services/authService';
import { isAdmin } from '../utils/permissions';

interface RoleBasedRouteProps {
  children: React.ReactNode;
  requiredRoles: string[];
}

// Helper to get user role from either userType or legacy role
function getUserRole(user: { userType?: string; role?: string } | null | undefined): string {
  return user?.userType || user?.role || '';
}

export const RoleBasedRoute = ({ children, requiredRoles }: RoleBasedRouteProps) => {
  const { data: user, isLoading } = useCurrentUser();

  // Check if user has token
  if (!authService.isAuthenticated()) {
    return <Navigate to="/login" replace />;
  }

  // Show loading while fetching user data
  if (isLoading) {
    return <LoadingSpinner fullScreen message="Loading..." />;
  }

  // If no user data, show loading (shouldn't happen if ProtectedRoute is parent)
  if (!user) {
    return <LoadingSpinner fullScreen message="Loading user data..." />;
  }

  // Check if user has required role (check both exact match and case-insensitive)
  const userRole = getUserRole(user);
  const hasRole = requiredRoles.some(role =>
    userRole.toLowerCase() === role.toLowerCase()
  );

  if (!hasRole) {
    // Redirect based on user's actual role to prevent loops
    const redirectPath = isAdmin(user) ? '/dashboard' : '/user-dashboard';
    return <Navigate to={redirectPath} replace />;
  }

  return <>{children}</>;
};
