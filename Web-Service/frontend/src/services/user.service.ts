import { apiClient, extractData } from './api.service';
import type { ApiResponse } from '../types/api.types';

export interface UserSearchResult {
  id: string;
  email: string;
  firstName: string;
  middleName?: string;
  lastName: string;
  fullName: string;
  role: string;
  institute: string;
}

export interface UserDetail extends UserSearchResult {
  department: string;
}

/**
 * Search users by email
 * Used for finding users to add as project members
 */
export const searchUsersByEmail = async (email: string): Promise<UserSearchResult[]> => {
  const response = await apiClient.get<ApiResponse<UserSearchResult[]>>('/users/search', {
    params: { email },
  });
  return extractData(response);
};

/**
 * Get user details by ID
 */
export const getUserById = async (userId: string): Promise<UserDetail> => {
  const response = await apiClient.get<ApiResponse<UserDetail>>(`/users/${userId}`);
  return extractData(response);
};

const userService = {
  searchUsersByEmail,
  getUserById,
};

export default userService;
