import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '../../services/api.service';
import { LoadingSpinner } from '../LoadingSpinner';

interface User {
  id: string;
  email: string;
  firstName?: string;
  lastName?: string;
  role: string;
  isActive: boolean;
  isApproved?: boolean;
  createdAt: string;
  lastLogin?: string;
}

export const UserManagementPanel = () => {
  const [activeTab, setActiveTab] = useState<'all' | 'pending'>('all');
  const [page, setPage] = useState(1);
  const queryClient = useQueryClient();

  // Fetch all users
  const {
    data: users = [],
    isLoading: loadingUsers,
    error: usersError,
  } = useQuery({
    queryKey: ['users', page],
    queryFn: async () => {
      const response = await apiClient.get<User[]>(`/admin/users?page=${page}&limit=10`);
      return Array.isArray(response.data) ? response.data : [];
    },
    staleTime: 1000 * 60, // 1 minute
  });

  // Fetch pending users
  const {
    data: pendingUsers = [],
    isLoading: loadingPending,
    error: pendingError,
  } = useQuery({
    queryKey: ['pending-users'],
    queryFn: async () => {
      const response = await apiClient.get<User[]>('/auth/pending-users');
      return response.data || [];
    },
    staleTime: 1000 * 60, // 1 minute
  });

  // Approve user mutation
  const approveUserMutation = useMutation({
    mutationFn: async (userId: string) => {
      return apiClient.post(`/auth/users/${userId}/approve`, { approved: true });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['pending-users'] });
      alert('User approved successfully');
    },
    onError: (error) => {
      console.error('Failed to approve user:', error);
      alert('Failed to approve user');
    },
  });

  // Reject user mutation
  const rejectUserMutation = useMutation({
    mutationFn: async (userId: string) => {
      return apiClient.post(`/auth/users/${userId}/approve`, { approved: false });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['pending-users'] });
      alert('User rejected successfully');
    },
    onError: (error) => {
      console.error('Failed to reject user:', error);
      alert('Failed to reject user');
    },
  });

  // Toggle user status mutation
  const toggleStatusMutation = useMutation({
    mutationFn: async (userId: string) => {
      return apiClient.patch(`/admin/users/${userId}/status`);
    },
    onSuccess: () => {
      if (activeTab === 'all') {
        queryClient.invalidateQueries({ queryKey: ['users', page] });
      }
      alert('User status updated successfully');
    },
    onError: (error) => {
      console.error('Failed to toggle user status:', error);
      alert('Failed to update user status');
    },
  });

  // Change user role mutation
  const changeRoleMutation = useMutation({
    mutationFn: async ({ userId, newRole }: { userId: string; newRole: string }) => {
      return apiClient.patch(`/admin/users/${userId}/role`, { role: newRole });
    },
    onSuccess: () => {
      if (activeTab === 'all') {
        queryClient.invalidateQueries({ queryKey: ['users', page] });
      }
      alert('User role updated successfully');
    },
    onError: (error) => {
      console.error('Failed to change user role:', error);
      alert('Failed to change user role');
    },
  });

  const handleApproveUser = (userId: string) => {
    approveUserMutation.mutate(userId);
  };

  const handleRejectUser = (userId: string) => {
    rejectUserMutation.mutate(userId);
  };

  const handleToggleStatus = (userId: string) => {
    toggleStatusMutation.mutate(userId);
  };

  const handleChangeRole = (userId: string, newRole: string) => {
    changeRoleMutation.mutate({ userId, newRole });
  };

  const isLoading = activeTab === 'all' ? loadingUsers : loadingPending;

  if (isLoading) {
    return <LoadingSpinner message="Loading users..." />;
  }

  if (activeTab === 'all' && usersError) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-lg p-4">
        <p className="text-red-800">Failed to load users. Please try again.</p>
      </div>
    );
  }

  if (activeTab === 'pending' && pendingError) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-lg p-4">
        <p className="text-red-800">Failed to load pending users. Please try again.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Tabs */}
      <div className="flex space-x-4 border-b">
        <button
          onClick={() => {
            setActiveTab('all');
            setPage(1);
          }}
          className={`px-4 py-2 font-medium border-b-2 transition ${
            activeTab === 'all'
              ? 'border-blue-600 text-blue-600'
              : 'border-transparent text-gray-600 hover:text-gray-900'
          }`}
        >
          All Users
        </button>
        <button
          onClick={() => {
            setActiveTab('pending');
            setPage(1);
          }}
          className={`px-4 py-2 font-medium border-b-2 transition ${
            activeTab === 'pending'
              ? 'border-blue-600 text-blue-600'
              : 'border-transparent text-gray-600 hover:text-gray-900'
          }`}
        >
          Pending Approval ({pendingUsers.length})
        </button>
      </div>

      {/* All Users Tab */}
      {activeTab === 'all' && (
        <div className="bg-white rounded-lg shadow overflow-hidden">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Email
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Name
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Role
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Status
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Last Login
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {users.map((user) => (
                <tr key={user.id} className="hover:bg-gray-50">
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{user.email}</td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                    {user.firstName} {user.lastName}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm">
                    <select
                      value={user.role}
                      onChange={(e) => handleChangeRole(user.id, e.target.value)}
                      className="px-3 py-1 border border-gray-300 rounded text-gray-900"
                    >
                      <option value="patient">Patient</option>
                      <option value="clinician">Clinician</option>
                      <option value="researcher">Researcher</option>
                      <option value="admin">Admin</option>
                    </select>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm">
                    <span
                      className={`px-3 py-1 rounded-full text-xs font-medium ${
                        user.isActive
                          ? 'bg-green-100 text-green-800'
                          : 'bg-red-100 text-red-800'
                      }`}
                    >
                      {user.isActive ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {user.lastLogin ? new Date(user.lastLogin).toLocaleDateString() : 'Never'}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm space-x-2">
                    <button
                      onClick={() => handleToggleStatus(user.id)}
                      className={`px-3 py-1 rounded text-white text-xs font-medium ${
                        user.isActive
                          ? 'bg-red-600 hover:bg-red-700'
                          : 'bg-green-600 hover:bg-green-700'
                      }`}
                    >
                      {user.isActive ? 'Deactivate' : 'Activate'}
                    </button>
                  </td>
                </tr>
              ))}
              {users.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-6 py-4 text-center text-gray-500">
                    No users found
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* Pending Users Tab */}
      {activeTab === 'pending' && (
        <div className="bg-white rounded-lg shadow overflow-hidden">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Email
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Name
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Requested Role
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Applied At
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {pendingUsers.map((user) => (
                <tr key={user.id} className="hover:bg-gray-50">
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{user.email}</td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                    {user.firstName} {user.lastName}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm">
                    <span className="px-3 py-1 bg-yellow-100 text-yellow-800 rounded-full text-xs font-medium">
                      {user.role}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {new Date(user.createdAt).toLocaleDateString()}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm space-x-2">
                    <button
                      onClick={() => handleApproveUser(user.id)}
                      className="px-3 py-1 bg-green-600 hover:bg-green-700 text-white rounded text-xs font-medium"
                    >
                      Approve
                    </button>
                    <button
                      onClick={() => handleRejectUser(user.id)}
                      className="px-3 py-1 bg-red-600 hover:bg-red-700 text-white rounded text-xs font-medium"
                    >
                      Reject
                    </button>
                  </td>
                </tr>
              ))}
              {pendingUsers.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-6 py-4 text-center text-gray-500">
                    No pending users
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};
