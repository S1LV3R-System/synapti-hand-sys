// ============================================================================
// AUTHENTICATION TYPES
// ============================================================================

import { UserRole } from './api.types';

export interface RegisterUserInput {
  email: string;
  password: string;
  fullName: string;
  phoneNumber?: string;
  hospital?: string;
  department?: string;
  role?: UserRole;
}

export interface LoginCredentials {
  email: string;
  password: string;
}

export interface AuthResponse {
  user: {
    id: string;
    email: string;
    fullName: string | null;
    firstName: string | null;
    lastName: string | null;
    role: string;
    isActive: boolean;
    isApproved: boolean;
    phoneNumber: string | null;
    hospital: string | null;
    department: string | null;
  };
  token: string;
}

export interface ApproveUserInput {
  userId: string;
  approved: boolean;
  reason?: string;
}
