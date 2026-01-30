// Admin Portal Types - User Management & Approval Workflow

export interface AdminNote {
  id: string;
  content: string;
  noteType: 'general' | 'approval' | 'rejection' | 'info_request';
  isInternal: boolean;
  createdAt: string;
  updatedAt: string;
  admin: {
    id: string;
    email: string;
    fullName: string | null;
  };
}

export interface UserWithApprovalStatus {
  id: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
  fullName: string | null;
  role: string;
  hospital: string | null;
  department: string | null;
  licenseNumber: string | null;
  licenseState: string | null;
  specialty: string | null;
  organization: string | null;
  emailVerified: boolean;
  emailVerifiedAt: string | null;
  isApproved: boolean | null; // null=pending, true=approved, false=rejected
  approvedAt: string | null;
  rejectedAt: string | null;
  rejectionReason?: string | null;
  registrationIp: string | null;
  registrationDevice: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  lastLogin: string | null;
  _count?: {
    patientRecordings: number;
    clinicianRecordings: number;
    protocols: number;
    annotations: number;
    adminNotes: number;
  };
  adminNotes?: AdminNote[];
}

export interface PendingUser extends UserWithApprovalStatus {
  isApproved: null; // Always null for pending users
  emailVerified: true; // Always true for pending users
  adminNotes: AdminNote[]; // Always included for pending users
}

export interface ApprovalStats {
  pending: number;
  approvedToday: number;
  rejectedToday: number;
  totalApproved: number;
  totalRejected: number;
  avgApprovalTime: number; // in hours
}

export interface ApproveUserRequest {
  notes?: string;
}

export interface RejectUserRequest {
  reason: string;
  notes?: string;
}

export interface RequestMoreInfoRequest {
  message: string;
  fields?: string[];
}

export interface AddAdminNoteRequest {
  content: string;
  isInternal?: boolean;
}

export interface SystemStats {
  users: {
    total: number;
    active: number;
    inactive: number;
    byRole: Record<string, number>;
  };
  recordings: {
    total: number;
    recent30Days: number;
    withFiles: number;
    byStatus: Record<string, number>;
  };
  protocols: {
    total: number;
  };
  analyses: {
    total: number;
  };
  performance: {
    avgProcessingTimeMs: number;
  };
  recentActivity: Array<{
    id: number;
    action: string;
    resource: string | null;
    resourceId: string | null;
    createdAt: string;
    user: {
      email: string;
      role: string;
    } | null;
  }>;
}

export interface AuditLog {
  id: number;
  userId: string | null;
  action: string;
  resource: string | null;
  resourceId: string | null;
  details: string | null;
  ipAddress: string | null;
  userAgent: string | null;
  status: string;
  createdAt: string;
  user: {
    id: string;
    email: string;
    firstName: string | null;
    lastName: string | null;
    role: string;
  } | null;
}

export interface PaginationMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
  hasNext: boolean;
  hasPrev: boolean;
}

export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  message?: string;
  error?: {
    code: string;
    details: string;
  };
  pagination?: PaginationMeta;
}

// Filter types for user list
export interface UserFilters {
  page?: number;
  limit?: number;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
  role?: string;
  isActive?: boolean;
  isApproved?: boolean | null;
  search?: string;
}

// Approval status badge types
export type ApprovalStatus = 'pending' | 'approved' | 'rejected';
export type VerificationStatus = 'verified' | 'unverified';
export type ActivityStatus = 'active' | 'inactive';

// User action types for drawer
export type UserAction =
  | 'approve'
  | 'reject'
  | 'request-info'
  | 'add-note'
  | 'toggle-status'
  | 'change-role';

// Timeline event for user activity
export interface UserTimelineEvent {
  id: string;
  timestamp: string;
  type: 'registration' | 'verification' | 'approval' | 'rejection' | 'note' | 'login' | 'activity';
  title: string;
  description?: string;
  actor?: string; // Admin who performed action
  metadata?: Record<string, any>;
}
