import type { User } from '../types/api.types';

// Helper to get user role (handles both userType and legacy role field)
function getUserRole(user: User | null | undefined): string | undefined {
  return user?.userType || user?.role;
}

/**
 * Get display-friendly role name for a user
 */
export function getUserDisplayRole(user: User | null | undefined): string {
  const role = getUserRole(user);
  if (!role) return 'Unknown';
  // Capitalize first letter for display
  return role.charAt(0).toUpperCase() + role.slice(1).toLowerCase();
}

/**
 * Check if user is admin
 */
export function isAdmin(user: User | null | undefined): boolean {
  const role = getUserRole(user);
  return role === 'Admin' || role === 'admin';
}

/**
 * Check if user is clinician
 */
export function isClinician(user: User | null | undefined): boolean {
  const role = getUserRole(user);
  return role === 'Clinician' || role === 'clinician';
}

/**
 * Check if user is researcher
 */
export function isResearcher(user: User | null | undefined): boolean {
  const role = getUserRole(user);
  return role === 'Researcher' || role === 'researcher';
}

/**
 * Check if user is clinician or admin
 */
export function isClinicianOrAdmin(user: User | null | undefined): boolean {
  if (!user) return false;
  const role = getUserRole(user);
  return ['clinician', 'admin', 'Clinician', 'Admin'].includes(role || '');
}

/**
 * Check if user is researcher or admin
 */
export function isResearcherOrAdmin(user: User | null | undefined): boolean {
  if (!user) return false;
  const role = getUserRole(user);
  return ['researcher', 'admin', 'Researcher', 'Admin'].includes(role || '');
}

/**
 * Protocol permissions
 * - Only Researchers and Admins can create/edit/delete protocols
 * - Clinicians can only VIEW protocols (admin-created public ones)
 * - Admin-created public protocols are visible to everyone
 * - Researcher-created protocols are visible only to the creator and admins
 */
export const protocolPermissions = {
  canCreate: (user: User | null | undefined) => isResearcherOrAdmin(user),
  canEdit: (user: User | null | undefined, createdById?: string) => {
    if (isAdmin(user)) return true;
    if (isResearcher(user) && user?.id === createdById) return true;
    return false;
  },
  canDelete: (user: User | null | undefined, createdById?: string) => {
    if (isAdmin(user)) return true;
    if (isResearcher(user) && user?.id === createdById) return true;
    return false;
  },
  canView: (user: User | null | undefined) => !!user, // All authenticated users
};

/**
 * Patient permissions
 * - All authenticated project members can manage patients
 * - Admins, Clinicians, and Researchers have full CRUD access
 */
export const patientPermissions = {
  canCreate: (user: User | null | undefined) => {
    if (!user) return false;
    return isAdmin(user) || isClinician(user) || isResearcher(user);
  },
  canEdit: (user: User | null | undefined) => {
    if (!user) return false;
    return isAdmin(user) || isClinician(user) || isResearcher(user);
  },
  canDelete: (user: User | null | undefined) => {
    if (!user) return false;
    return isAdmin(user) || isClinician(user) || isResearcher(user);
  },
  canView: (user: User | null | undefined) => {
    if (!user) return false;
    return isAdmin(user) || isClinician(user) || isResearcher(user);
  },
};

/**
 * Recording permissions
 * - Clinicians and Researchers can upload recordings
 * - Admins have full access
 * - Backend currently allows any authenticated user (security gap to be fixed)
 */
export const recordingPermissions = {
  canCreate: (user: User | null | undefined) => {
    if (!user) return false;
    // Allow clinicians, researchers, and admins
    return isAdmin(user) || isClinician(user) || isResearcher(user);
  },
  canEdit: (user: User | null | undefined, patientId?: string, clinicianId?: string) => {
    if (isAdmin(user)) return true;
    if (isClinician(user) && (user?.id === clinicianId || user?.id === patientId)) return true;
    if (isResearcher(user) && user?.id === clinicianId) return true;
    return false;
  },
  canDelete: (user: User | null | undefined, _patientId?: string, clinicianId?: string) => {
    if (isAdmin(user)) return true;
    if (isClinician(user) && user?.id === clinicianId) return true;
    if (isResearcher(user) && user?.id === clinicianId) return true;
    return false;
  },
  canView: (user: User | null | undefined, _patientId?: string) => {
    if (isAdmin(user)) return true;
    if (isClinician(user)) return true;
    if (isResearcher(user)) return true;
    return false;
  },
  canReview: (user: User | null | undefined) => isClinicianOrAdmin(user),
  canUpload: (user: User | null | undefined) => {
    if (!user) return false;
    // Allow clinicians, researchers, and admins to upload
    return isAdmin(user) || isClinician(user) || isResearcher(user);
  },
};

/**
 * Comparison permissions
 * - Only Researchers and Admins have access to comparisons
 * - Clinicians do NOT have access to comparisons
 */
export const comparisonPermissions = {
  canCreate: (user: User | null | undefined) => isResearcherOrAdmin(user),
  canView: (user: User | null | undefined) => isResearcherOrAdmin(user),
  canDelete: (user: User | null | undefined, comparedById?: string) => {
    if (isAdmin(user)) return true;
    if (isResearcher(user) && user?.id === comparedById) return true;
    return false;
  },
};
