import type {
  RecordingStatus,
  ReviewStatus,
  UserRole,
  SeverityLevel
} from '../types/api.types';

/**
 * Format file size in bytes to readable string
 */
export function formatFileSize(bytes: number | undefined): string {
  if (!bytes) return 'N/A';
  const units = ['B', 'KB', 'MB', 'GB'];
  let size = bytes;
  let unitIndex = 0;
  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex++;
  }
  return `${size.toFixed(1)} ${units[unitIndex]}`;
}

/**
 * Format user role to readable string
 */
export function formatRole(role: UserRole | undefined): string {
  if (!role) return 'Unknown';
  const roleMap: Record<string, string> = {
    patient: 'Patient',
    clinician: 'Clinician',
    admin: 'Administrator',
    researcher: 'Researcher',
  };
  return roleMap[role] || role;
}

/**
 * Format recording status to readable string
 */
export function formatRecordingStatus(status: RecordingStatus | undefined): string {
  if (!status) return 'Unknown';
  const statusMap: Record<string, string> = {
    uploaded: 'Uploaded',
    processing: 'Processing',
    processed: 'Processed',
    analyzed: 'Analyzed',
    completed: 'Completed',
    failed: 'Failed',
  };
  return statusMap[status] || status;
}

/**
 * Format review status to readable string
 */
export function formatReviewStatus(status: ReviewStatus | undefined): string {
  if (!status) return 'Unknown';
  const statusMap: Record<string, string> = {
    pending: 'Pending Review',
    approved: 'Approved',
    flagged: 'Flagged',
  };
  return statusMap[status] || status;
}

/**
 * Format severity level to readable string
 */
export function formatSeverityLevel(level: SeverityLevel | undefined): string {
  if (!level) return 'Unknown';
  const levelMap: Record<string, string> = {
    low: 'Low',
    medium: 'Medium',
    high: 'High',
    critical: 'Critical',
  };
  return levelMap[level] || level;
}

/**
 * Format user full name
 */
export function formatUserName(user: { firstName?: string | null; lastName?: string | null } | undefined): string {
  if (!user) return 'Unknown';
  if (!user.firstName && !user.lastName) return 'Unknown';
  return `${user.firstName || ''} ${user.lastName || ''}`.trim();
}

/**
 * Truncate text to specified length
 */
export function truncate(text: string | undefined, length: number = 50): string {
  if (!text) return '';
  if (text.length <= length) return text;
  return `${text.substring(0, length)}...`;
}
