import { useState, useEffect } from 'react';
import { Button } from '../Button';
import { message, AutoComplete } from 'antd';
import { apiClient } from '../../services/api.service';
import type { UserSearchResult } from '../../services/user.service';
import { LoadingOutlined } from '@ant-design/icons';

interface AddProjectMemberModalProps {
  projectId: string;
  onClose: () => void;
  onSuccess: () => void;
}

export default function AddProjectMemberModal({
  projectId,
  onClose,
  onSuccess,
}: AddProjectMemberModalProps) {
  const [email, setEmail] = useState('');
  const [searchResults, setSearchResults] = useState<UserSearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [selectedUser, setSelectedUser] = useState<UserSearchResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Search users by email with debouncing
  useEffect(() => {
    if (!email || email.length < 2) {
      setSearchResults([]);
      return;
    }

    const timeoutId = setTimeout(async () => {
      try {
        setSearching(true);
        const response = await apiClient.get('/users/search', {
          params: { email },
        });
        setSearchResults(response.data || []);
      } catch (err: any) {
        console.error('Search error:', err);
        // Don't show error message for search failures
      } finally {
        setSearching(false);
      }
    }, 300); // 300ms debounce

    return () => clearTimeout(timeoutId);
  }, [email]);

  const handleSelect = (value: string) => {
    const user = searchResults.find(u => u.email === value);
    if (user) {
      setSelectedUser(user);
      setEmail(user.email);
    }
  };

  const handleAddMember = async () => {
    if (!selectedUser) {
      setError('Please select a user from the search results');
      return;
    }

    try {
      setLoading(true);
      setError('');

      await apiClient.post(`/projects/${projectId}/members`, {
        email: selectedUser.email,
      });

      message.success(`${selectedUser.fullName} added to project successfully`);
      onSuccess();
    } catch (err: any) {
      const errorMessage = err.response?.data?.message || err.message || 'Failed to add member';
      setError(errorMessage);
      message.error(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  const options = searchResults.map(user => ({
    value: user.email,
    label: (
      <div className="flex items-center justify-between py-1">
        <div>
          <div className="font-medium">{user.fullName}</div>
          <div className="text-xs text-gray-500">{user.email}</div>
        </div>
        <div className="text-xs text-gray-400">{user.role}</div>
      </div>
    ),
  }));

  return (
    <div className="fixed inset-0 bg-gray-500 bg-opacity-75 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-lg max-w-md w-full">
        <div className="p-6">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-xl font-semibold text-gray-900">Add Project Member</h2>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-gray-600"
            >
              <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          <div className="space-y-4">
            {error && (
              <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded text-sm">
                {error}
              </div>
            )}

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Search by Email
              </label>
              <AutoComplete
                value={email}
                options={options}
                onSelect={handleSelect}
                onChange={(value) => {
                  setEmail(value);
                  if (!value) setSelectedUser(null);
                }}
                onSearch={(value) => setEmail(value)}
                placeholder="Enter email address to search..."
                className="w-full"
                notFoundContent={
                  searching ? (
                    <div className="text-center py-2">
                      <LoadingOutlined className="mr-2" />
                      Searching...
                    </div>
                  ) : email.length >= 2 ? (
                    <div className="text-center py-2 text-gray-500">
                      No users found
                    </div>
                  ) : null
                }
                size="large"
              />
              <p className="text-xs text-gray-500 mt-1">
                Type at least 2 characters to search for verified and approved users
              </p>
            </div>

            {selectedUser && (
              <div className="bg-blue-50 border border-blue-200 rounded p-3">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="font-medium text-gray-900">{selectedUser.fullName}</div>
                    <div className="text-sm text-gray-600">{selectedUser.email}</div>
                    <div className="text-xs text-gray-500 mt-1">
                      {selectedUser.role} • {selectedUser.institute}
                    </div>
                  </div>
                  <button
                    onClick={() => {
                      setSelectedUser(null);
                      setEmail('');
                    }}
                    className="text-gray-400 hover:text-gray-600"
                  >
                    <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
              </div>
            )}

            <div className="flex justify-end space-x-3 pt-4">
              <Button type="button" variant="outline" onClick={onClose}>
                Cancel
              </Button>
              <Button
                type="button"
                onClick={handleAddMember}
                isLoading={loading}
                disabled={loading || !selectedUser}
              >
                {loading ? 'Adding...' : 'Add Member'}
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
