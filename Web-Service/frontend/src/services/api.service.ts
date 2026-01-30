import axios, { type AxiosError, type AxiosResponse } from 'axios';
import type { ApiResponse } from '../types/api.types';
import { supabase } from '../lib/supabase';

// For single-container deployment (frontend + backend on same port)
// Use relative URL so it works from any host/port
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '/api';

// Create axios instance with default config
export const apiClient = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
  timeout: 30000, // 30 seconds
});

// Request interceptor to add auth token from Supabase session
apiClient.interceptors.request.use(
  async (config) => {
    // Get token from Supabase session
    const { data: { session } } = await supabase.auth.getSession();
    if (session?.access_token) {
      config.headers.Authorization = `Bearer ${session.access_token}`;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

// Response interceptor for unified error handling
apiClient.interceptors.response.use(
  (response: AxiosResponse<ApiResponse>) => {
    // Unwrap the data from {success: true, data: ...} structure
    // If response has success and data fields, return just the data
    if (response.data && typeof response.data === 'object' && 'data' in response.data) {
      return { ...response, data: response.data.data };
    }
    // Otherwise return as-is
    return response;
  },
  async (error: AxiosError<ApiResponse>) => {
    // Handle 401 Unauthorized - sign out and redirect to login
    if (error.response?.status === 401) {
      await supabase.auth.signOut();
      localStorage.removeItem('user');

      // Only redirect if not already on login page
      if (!window.location.pathname.includes('/login')) {
        window.location.href = '/login';
      }
    }

    // Handle 403 Forbidden - insufficient permissions
    if (error.response?.status === 403) {
      console.error('Access forbidden:', error.response.data?.message);
    }

    // Handle network errors
    if (!error.response) {
      console.error('Network error:', error.message);
      return Promise.reject({
        success: false,
        message: 'Network error. Please check your connection.',
        error: { code: 'NETWORK_ERROR' }
      });
    }

    // Return the error response
    return Promise.reject(error.response?.data || {
      success: false,
      message: error.message || 'An error occurred',
      error: { code: 'UNKNOWN_ERROR' }
    });
  }
);

// Helper function to extract data from API response
export function extractData<T>(response: AxiosResponse<ApiResponse<T> | T>): T {
  // If response is already unwrapped by interceptor, return as-is
  if (!response.data || typeof response.data !== 'object') {
    return response.data as T;
  }

  // Check if it's a wrapped response {success, data}
  const wrappedResponse = response.data as any;
  if (wrappedResponse.success !== undefined && wrappedResponse.data !== undefined) {
    return wrappedResponse.data;
  }

  // Otherwise, assume it's already unwrapped data
  return response.data as T;
}

// Helper function to extract pagination info
export function extractPagination(response: AxiosResponse<ApiResponse>) {
  return response.data.pagination;
}

// Token management (uses Supabase session)
export const tokenManager = {
  async getToken(): Promise<string | null> {
    const { data: { session } } = await supabase.auth.getSession();
    return session?.access_token || null;
  },

  // These are no-ops since Supabase manages the session
  setToken(_token: string): void {
    // Supabase manages token storage
  },

  removeToken(): void {
    // Use supabase.auth.signOut() instead
  },

  async isAuthenticated(): Promise<boolean> {
    const token = await this.getToken();
    return !!token;
  }
};

// User storage
export const userStorage = {
  getUser(): any | null {
    const userStr = localStorage.getItem('user');
    return userStr ? JSON.parse(userStr) : null;
  },

  setUser(user: any): void {
    localStorage.setItem('user', JSON.stringify(user));
  },

  removeUser(): void {
    localStorage.removeItem('user');
  }
};

// Export default instance
export default apiClient;
