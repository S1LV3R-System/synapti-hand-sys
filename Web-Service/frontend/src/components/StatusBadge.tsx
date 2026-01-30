import type { RecordingStatus, ReviewStatus, UserRole, SeverityLevel } from '../types/api.types';
import { formatRecordingStatus, formatReviewStatus, formatRole, formatSeverityLevel } from '../utils/formatters';

type BadgeVariant = 'success' | 'warning' | 'error' | 'info' | 'secondary';

interface StatusBadgeProps {
  status: RecordingStatus | ReviewStatus | UserRole | SeverityLevel | string;
  type?: 'recording' | 'review' | 'role' | 'severity' | 'custom';
}

const variantClasses: Record<BadgeVariant, string> = {
  success: 'bg-success-100 text-success-800 border-success-200',
  warning: 'bg-warning-100 text-warning-800 border-warning-200',
  error: 'bg-error-100 text-error-800 border-error-200',
  info: 'bg-primary-100 text-primary-800 border-primary-200',
  secondary: 'bg-secondary-100 text-secondary-800 border-secondary-200',
};

function getVariant(status: string, type: string): BadgeVariant {
  if (type === 'recording') {
    const statusMap: Record<string, BadgeVariant> = {
      completed: 'success',
      analyzed: 'success',
      processed: 'info',
      processing: 'warning',
      uploaded: 'secondary',
      failed: 'error',
    };
    return statusMap[status] || 'secondary';
  }

  if (type === 'review') {
    const statusMap: Record<string, BadgeVariant> = {
      approved: 'success',
      pending: 'warning',
      flagged: 'error',
    };
    return statusMap[status] || 'secondary';
  }

  if (type === 'severity') {
    const statusMap: Record<string, BadgeVariant> = {
      low: 'info',
      medium: 'warning',
      high: 'warning',
      critical: 'error',
    };
    return statusMap[status] || 'secondary';
  }

  return 'secondary';
}

export const StatusBadge = ({ status, type = 'custom' }: StatusBadgeProps) => {
  const variant = getVariant(status, type);

  let displayText = status;
  if (type === 'recording') displayText = formatRecordingStatus(status as RecordingStatus);
  else if (type === 'review') displayText = formatReviewStatus(status as ReviewStatus);
  else if (type === 'role') displayText = formatRole(status as UserRole);
  else if (type === 'severity') displayText = formatSeverityLevel(status as SeverityLevel);

  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border ${variantClasses[variant]}`}>
      {displayText}
    </span>
  );
};
