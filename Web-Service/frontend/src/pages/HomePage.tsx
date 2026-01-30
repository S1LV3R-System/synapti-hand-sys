import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAppDispatch, useAppSelector } from '../store/hooks';
import { getCurrentUser, logout } from '../store/authSlice';
import { isAdmin, getUserDisplayRole } from '../utils/permissions';

export default function HomePage() {
  const dispatch = useAppDispatch();
  const navigate = useNavigate();
  const { user, isAuthenticated } = useAppSelector((state) => state.auth);

  useEffect(() => {
    if (!isAuthenticated) {
      navigate('/login');
    } else if (!user) {
      dispatch(getCurrentUser());
    }
  }, [isAuthenticated, user, navigate, dispatch]);

  const handleLogout = async () => {
    await dispatch(logout());
    navigate('/login');
  };

  if (!user) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-lg">Loading...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <nav className="bg-white shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between h-16">
            <div className="flex items-center">
              <h1 className="text-xl font-semibold">SynaptiHand</h1>
            </div>
            <div className="flex items-center space-x-4">
              <span className="text-gray-700">
                {user.firstName} {user.lastName}
              </span>
              {isAdmin(user) && (
                <button
                  onClick={() => navigate('/admin')}
                  className="text-blue-600 hover:text-blue-800"
                >
                  Admin Panel
                </button>
              )}
              <button
                onClick={handleLogout}
                className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700"
              >
                Logout
              </button>
            </div>
          </div>
        </div>
      </nav>

      <main className="max-w-7xl mx-auto py-6 sm:px-6 lg:px-8">
        <div className="px-4 py-6 sm:px-0">
          <div className="bg-white shadow rounded-lg p-6">
            <h2 className="text-2xl font-bold mb-4">
              Welcome, {user.firstName}!
            </h2>
            <p className="text-gray-600 mb-6">
              You are logged in as <span className="font-semibold">{getUserDisplayRole(user)}</span>
            </p>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="border rounded-lg p-4">
                <h3 className="font-semibold text-lg mb-2">Account Info</h3>
                <p className="text-sm text-gray-600">Email: {user.email}</p>
                <p className="text-sm text-gray-600">Role: {getUserDisplayRole(user)}</p>
              </div>

              <div className="border rounded-lg p-4">
                <h3 className="font-semibold text-lg mb-2">Quick Actions</h3>
                <button className="text-blue-600 hover:text-blue-800 text-sm block">
                  View Profile
                </button>
                <button className="text-blue-600 hover:text-blue-800 text-sm block">
                  Settings
                </button>
              </div>

              <div className="border rounded-lg p-4">
                <h3 className="font-semibold text-lg mb-2">System Status</h3>
                <p className="text-sm text-green-600">All systems operational</p>
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
