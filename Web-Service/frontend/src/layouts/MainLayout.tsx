import { Outlet, Link, useNavigate, useLocation } from 'react-router-dom';
import {
  LayoutDashboard,
  FileText,
  Video,
  Activity,
  Users,
  LogOut,
  Menu,
  X,
  User,
} from 'lucide-react';
import { useState } from 'react';
import { useCurrentUser, useLogout } from '../hooks/useAuth';
import { Button } from '../components/Button';
import { isAdmin, isResearcherOrAdmin } from '../utils/permissions';
import { formatUserName } from '../utils/formatters';

export const MainLayout = () => {
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const { data: user } = useCurrentUser();
  const { mutate: logout, isPending: isLoggingOut } = useLogout();
  const navigate = useNavigate();
  const location = useLocation();

  const handleLogout = () => {
    logout(undefined, {
      onSuccess: () => {
        navigate('/login');
      },
    });
  };

  const navItems = [
    { label: 'Dashboard', icon: LayoutDashboard, path: '/home', show: true },
    { label: 'Protocols', icon: FileText, path: '/protocols', show: isResearcherOrAdmin(user) },
    { label: 'Recordings', icon: Video, path: '/recordings', show: true },
    { label: 'Comparisons', icon: Activity, path: '/comparisons', show: true },
    { label: 'User Management', icon: Users, path: '/dashboard', show: isAdmin(user) },
  ];

  const isActivePath = (path: string) => {
    return location.pathname.startsWith(path);
  };

  return (
    <div className="flex h-screen bg-secondary-50">
      {/* Sidebar */}
      <aside
        className={`${
          sidebarOpen ? 'w-64' : 'w-20'
        } bg-white border-r border-secondary-200 transition-all duration-300 flex flex-col`}
      >
        <div className="flex items-center justify-between h-16 px-4 border-b border-secondary-200">
          {sidebarOpen && (
            <h1 className="text-xl font-bold text-primary-600">SynaptiHand</h1>
          )}
          <button
            onClick={() => setSidebarOpen(!sidebarOpen)}
            className="p-2 rounded-lg hover:bg-secondary-100 transition-colors"
            aria-label={sidebarOpen ? 'Collapse sidebar' : 'Expand sidebar'}
          >
            {sidebarOpen ? <X size={20} /> : <Menu size={20} />}
          </button>
        </div>

        <nav className="flex-1 p-4 space-y-2">
          {navItems
            .filter((item) => item.show)
            .map((item) => {
              const Icon = item.icon;
              const isActive = isActivePath(item.path);

              return (
                <Link
                  key={item.path}
                  to={item.path}
                  className={`flex items-center gap-3 px-3 py-2 rounded-lg transition-colors ${
                    isActive
                      ? 'bg-primary-100 text-primary-700 font-medium'
                      : 'text-secondary-700 hover:bg-secondary-100'
                  }`}
                >
                  <Icon size={20} />
                  {sidebarOpen && <span>{item.label}</span>}
                </Link>
              );
            })}
        </nav>
      </aside>

      {/* Main Content */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Top Nav */}
        <header className="h-16 bg-white border-b border-secondary-200 px-6 flex items-center justify-between">
          <div className="flex-1" />
          <div className="flex items-center gap-4">
            <Link
              to="/profile"
              className="flex items-center gap-2 text-secondary-700 hover:text-primary-600 transition-colors"
            >
              <div className="text-right">
                <p className="text-sm font-medium text-secondary-900">
                  {formatUserName(user)}
                </p>
                <p className="text-xs text-secondary-600">{user?.role}</p>
              </div>
              <div className="w-8 h-8 bg-primary-100 rounded-full flex items-center justify-center">
                <User size={16} className="text-primary-600" />
              </div>
            </Link>
            <Button
              variant="ghost"
              size="sm"
              onClick={handleLogout}
              isLoading={isLoggingOut}
              leftIcon={<LogOut size={16} />}
            >
              Logout
            </Button>
          </div>
        </header>

        {/* Page Content */}
        <main className="flex-1 overflow-auto p-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
};
