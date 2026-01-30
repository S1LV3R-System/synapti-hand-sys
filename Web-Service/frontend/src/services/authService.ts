import { supabase } from '../lib/supabase';
import type {
  User,
  LoginCredentials,
  RegisterUserInput,
  AuthResponse
} from '../types/api.types';

// User storage for local caching
export const userStorage = {
  getUser(): User | null {
    const userStr = localStorage.getItem('user');
    return userStr ? JSON.parse(userStr) : null;
  },
  setUser(user: User): void {
    localStorage.setItem('user', JSON.stringify(user));
  },
  removeUser(): void {
    localStorage.removeItem('user');
  }
};

// Token manager for compatibility with existing code
export const tokenManager = {
  async getToken(): Promise<string | null> {
    const { data } = await supabase.auth.getSession();
    return data.session?.access_token || null;
  },
  isAuthenticated(): boolean {
    return !!userStorage.getUser();
  },
  removeToken(): void {
    // Session is managed by Supabase
  }
};

/**
 * Auth service using Supabase Auth.
 * Uses User-Main table from Final-schema.sql
 *
 * Schema: User-Main with User_ID, user_type, split names, birth_date
 * - Verification_status, Approval_status for user workflow
 * - Institute, Department for organization
 * - passwordHash stored (but not exposed to frontend)
 */
export const authService = {
  /**
   * Login with email and password using Supabase Auth.
   * After auth, fetches user profile from `User-Main` table.
   */
  async login(credentials: LoginCredentials): Promise<AuthResponse> {
    // Authenticate with Supabase
    const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
      email: credentials.email,
      password: credentials.password
    });

    if (authError) {
      const errorMessage = authError.message.includes('Invalid login credentials')
        ? 'Invalid email or password'
        : authError.message;
      throw new Error(errorMessage);
    }

    if (!authData.user) {
      throw new Error('Authentication failed');
    }

    // Fetch user profile from User-Main table
    const { data: userProfile, error: profileError } = await supabase
      .from('User-Main')
      .select('*')
      .eq('email', credentials.email)
      .single();

    if (profileError || !userProfile) {
      await supabase.auth.signOut();
      throw new Error('User profile not found');
    }

    // Check if user is approved
    if (userProfile.Approval_status !== true) {
      await supabase.auth.signOut();
      throw new Error('Your account is pending approval');
    }

    // Check if user is not deleted
    if (userProfile.deleted_at) {
      await supabase.auth.signOut();
      throw new Error('Your account has been deactivated');
    }

    // Convert to app User model
    const user = mapToUser(userProfile);

    // Store user locally
    userStorage.setUser(user);

    return {
      user,
      token: authData.session?.access_token || ''
    };
  },

  /**
   * Register new user with Supabase Auth.
   * Creates auth user and user profile in User-Main table.
   */
  async register(data: RegisterUserInput): Promise<AuthResponse> {
    // Create auth user in Supabase
    const { data: authData, error: authError } = await supabase.auth.signUp({
      email: data.email,
      password: data.password,
      options: {
        data: {
          first_name: data.firstName,
          middle_name: data.middleName,
          last_name: data.lastName,
          user_type: data.userType || 'Clinician'
        }
      }
    });

    if (authError) {
      throw new Error(authError.message);
    }

    if (!authData.user) {
      throw new Error('Registration failed');
    }

    // Create user profile in User-Main table
    // Note: This might be handled by a Supabase trigger/function instead
    const { data: userProfile, error: profileError } = await supabase
      .from('User-Main')
      .insert({
        email: data.email,
        user_type: data.userType || 'Clinician',
        first_name: data.firstName,
        middle__name: data.middleName || '',
        last_name: data.lastName,
        birth_date: data.birthDate,
        phone_number: data.phoneNumber,
        Institute: data.institute,
        Department: data.department,
        Verification_status: false,
        Approval_status: false,
        passwordHash: '' // Backend handles password hashing
      })
      .select('*')
      .single();

    if (profileError) {
      // If profile creation fails, the user needs admin approval anyway
      throw new Error('Registration successful. Your account is pending approval.');
    }

    const user = mapToUser(userProfile);
    userStorage.setUser(user);

    return {
      user,
      token: authData.session?.access_token || ''
    };
  },

  /**
   * Logout current user from Supabase.
   */
  async logout(): Promise<void> {
    await supabase.auth.signOut();
    userStorage.removeUser();
  },

  /**
   * Get current authenticated user.
   * Validates session and refreshes user profile.
   */
  async getCurrentUser(): Promise<User> {
    const { data: sessionData } = await supabase.auth.getSession();

    if (!sessionData.session?.user) {
      userStorage.removeUser();
      throw new Error('Not authenticated');
    }

    // Fetch fresh user profile from User-Main
    const { data: userProfile, error: profileError } = await supabase
      .from('User-Main')
      .select('*')
      .eq('email', sessionData.session.user.email)
      .single();

    if (profileError || !userProfile) {
      await supabase.auth.signOut();
      userStorage.removeUser();
      throw new Error('User profile not found');
    }

    const user = mapToUser(userProfile);
    userStorage.setUser(user);
    return user;
  },

  /**
   * Check if user is authenticated.
   */
  isAuthenticated(): boolean {
    return tokenManager.isAuthenticated();
  },

  /**
   * Get stored user from local storage.
   */
  getStoredUser(): User | null {
    return userStorage.getUser();
  },

  /**
   * Listen for auth state changes.
   */
  onAuthStateChange(callback: (user: User | null) => void) {
    return supabase.auth.onAuthStateChange(async (event, session) => {
      if (event === 'SIGNED_OUT' || !session) {
        userStorage.removeUser();
        callback(null);
        return;
      }

      if (session?.user) {
        try {
          const user = await authService.getCurrentUser();
          callback(user);
        } catch {
          callback(null);
        }
      }
    });
  }
};

/**
 * Map User-Main row to User type
 */
function mapToUser(row: Record<string, unknown>): User {
  const firstName = row.first_name as string;
  const middleName = row.middle__name as string | null; // Note: double underscore in schema
  const lastName = row.last_name as string;
  const fullName = [firstName, middleName, lastName].filter(Boolean).join(' ');

  return {
    id: row.User_ID as string,
    email: row.email as string,
    userType: row.user_type as User['userType'],
    firstName,
    middleName,
    lastName,
    fullName,
    birthDate: row.birth_date as string,
    phoneNumber: row.phone_number as string,
    institute: row.Institute as string,
    department: row.Department as string,
    verificationStatus: row.Verification_status as boolean,
    approvalStatus: row.Approval_status as boolean,
    createdAt: row.created_at as string,
    deletedAt: row.deleted_at as string | null,
    approvedAt: row.Approved_at as string | null,
    rejectedAt: row.Rejected_at as string | null,
    verifiedAt: row.Verified_at as string | null,
    // Legacy compatibility fields
    role: row.user_type as User['userType'],
    isActive: !(row.deleted_at as string | null),
    isApproved: row.Approval_status as boolean,
    hospital: row.Institute as string,
    organization: row.Institute as string,
    lastLogin: row.last_login as string | null,
    emailVerified: row.Verification_status as boolean,
    emailVerifiedAt: row.Verified_at as string | null
  };
}

// Legacy type alias for backward compatibility
/** @deprecated Use RegisterUserInput instead */
export type RegisterData = RegisterUserInput;
