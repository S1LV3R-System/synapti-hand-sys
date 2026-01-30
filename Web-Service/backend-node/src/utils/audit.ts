import prisma from '../lib/prisma';
import { Request } from 'express';
import { AuthRequest } from '../middleware/auth.middleware';


// ============================================================================
// Audit Logging Utility
// ============================================================================

export interface AuditLogData {
  userId?: string;
  action: string;
  resource?: string;
  resourceId?: string;
  details?: any;
  ipAddress?: string;
  userAgent?: string;
}

/**
 * Create audit log entry
 */
export async function createAuditLog(data: AuditLogData): Promise<void> {
  try {
    await prisma.auditLog.create({
      data: {
        userId: data.userId,
        action: data.action,
        resource: data.resource,
        resourceId: data.resourceId,
        details: data.details ? JSON.stringify(data.details) : null,
        ipAddress: data.ipAddress,
        userAgent: data.userAgent
      }
    });
  } catch (error) {
    console.error('Failed to create audit log:', error);
    // Don't throw - audit logging should not break main functionality
  }
}

/**
 * Extract audit info from request
 */
export function extractAuditInfo(req: Request | AuthRequest): {
  ipAddress: string;
  userAgent: string;
  userId?: string;
} {
  const authReq = req as AuthRequest;
  return {
    ipAddress: req.ip || req.socket.remoteAddress || 'unknown',
    userAgent: req.get('user-agent') || 'unknown',
    userId: authReq.user?.userId
  };
}

/**
 * Log action with request context
 */
export async function logAction(
  req: Request | AuthRequest,
  action: string,
  resource?: string,
  resourceId?: string,
  details?: any
): Promise<void> {
  const auditInfo = extractAuditInfo(req);

  await createAuditLog({
    ...auditInfo,
    action,
    resource,
    resourceId,
    details
  });
}

// ============================================================================
// Predefined Actions
// ============================================================================

export const AuditActions = {
  // Authentication
  LOGIN: 'auth.login',
  LOGOUT: 'auth.logout',
  REGISTER: 'auth.register',
  PASSWORD_CHANGE: 'auth.password_change',
  PASSWORD_RESET: 'auth.password_reset',

  // Protocol
  PROTOCOL_CREATE: 'protocol.create',
  PROTOCOL_UPDATE: 'protocol.update',
  PROTOCOL_DELETE: 'protocol.delete',
  PROTOCOL_VIEW: 'protocol.view',

  // Recording
  RECORDING_CREATE: 'recording.create',
  RECORDING_UPDATE: 'recording.update',
  RECORDING_DELETE: 'recording.delete',
  RECORDING_VIEW: 'recording.view',
  RECORDING_STATUS_CHANGE: 'recording.status_change',
  RECORDING_REVIEW: 'recording.review',

  // Clinical Analysis
  ANALYSIS_CREATE: 'analysis.create',
  ANALYSIS_UPDATE: 'analysis.update',
  ANALYSIS_VIEW: 'analysis.view',

  // Annotation
  ANNOTATION_CREATE: 'annotation.create',
  ANNOTATION_UPDATE: 'annotation.update',
  ANNOTATION_DELETE: 'annotation.delete',

  // Clinical Annotation
  CLINICAL_ANNOTATION_CREATE: 'clinical_annotation.create',
  CLINICAL_ANNOTATION_UPDATE: 'clinical_annotation.update',
  CLINICAL_ANNOTATION_DELETE: 'clinical_annotation.delete',

  // Comparison
  COMPARISON_CREATE: 'comparison.create',
  COMPARISON_VIEW: 'comparison.view',

  // Admin
  USER_ROLE_CHANGE: 'admin.user_role_change',
  USER_DEACTIVATE: 'admin.user_deactivate',
  USER_ACTIVATE: 'admin.user_activate',
  USER_APPROVE: 'admin.user_approve',
  USER_REJECT: 'admin.user_reject',
  USER_DELETE: 'admin.user_delete',
  SYSTEM_CONFIG_CHANGE: 'admin.system_config_change',

  // System Operations
  SYSTEM_CLEANUP: 'system.cleanup',
  HARD_DELETE_PROTOCOL: 'system.hard_delete_protocol',
  HARD_DELETE_PATIENT: 'system.hard_delete_patient',
  HARD_DELETE_USER: 'system.hard_delete_user',
  HARD_DELETE_PROJECT: 'system.hard_delete_project',
  HARD_DELETE_RECORDING: 'system.hard_delete_recording',

  // Project & Patient
  PROJECT_CREATE: 'project.create',
  PROJECT_UPDATE: 'project.update',
  PROJECT_DELETE: 'project.delete',
  PATIENT_CREATE: 'patient.create',
  PATIENT_UPDATE: 'patient.update',
  PATIENT_DELETE: 'patient.delete'
};
