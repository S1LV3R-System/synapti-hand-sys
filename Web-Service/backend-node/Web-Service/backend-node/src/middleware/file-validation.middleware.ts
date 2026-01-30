import { Request, Response, NextFunction } from 'express';
import { AuthRequest } from './auth.middleware';

// ============================================================================
// File Upload Validation Middleware
// ============================================================================

// Allowed MIME types
const ALLOWED_VIDEO_TYPES = [
  'video/mp4',
  'video/webm',
  'video/quicktime', // .mov
  'video/x-msvideo', // .avi
  'video/mpeg',
];

const ALLOWED_CSV_TYPES = [
  'text/csv',
  'text/plain',
  'application/csv',
  'application/vnd.ms-excel',
];

const ALLOWED_IMAGE_TYPES = [
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
];

// File size limits (in bytes)
const MAX_VIDEO_SIZE = 500 * 1024 * 1024; // 500MB
const MAX_CSV_SIZE = 50 * 1024 * 1024; // 50MB
const MAX_IMAGE_SIZE = 10 * 1024 * 1024; // 10MB

/**
 * Validate video file upload
 */
export const validateVideoUpload = (req: Request, res: Response, next: NextFunction) => {
  const contentType = req.body.contentType || req.headers['content-type'];
  const contentLength = parseInt(req.body.contentLength || req.headers['content-length'] || '0');

  // Validate content type
  if (!contentType || !ALLOWED_VIDEO_TYPES.includes(contentType)) {
    return res.status(400).json({
      success: false,
      message: 'Invalid video file type',
      error: {
        code: 'INVALID_FILE_TYPE',
        details: `Allowed types: ${ALLOWED_VIDEO_TYPES.join(', ')}`,
        received: contentType || 'unknown'
      }
    });
  }

  // Validate file size
  if (contentLength > MAX_VIDEO_SIZE) {
    return res.status(400).json({
      success: false,
      message: 'Video file too large',
      error: {
        code: 'FILE_TOO_LARGE',
        details: `Maximum size: ${MAX_VIDEO_SIZE / 1024 / 1024}MB`,
        received: `${Math.round(contentLength / 1024 / 1024)}MB`
      }
    });
  }

  // Validate minimum size (1KB to prevent empty files)
  if (contentLength < 1024) {
    return res.status(400).json({
      success: false,
      message: 'Video file too small or empty',
      error: {
        code: 'FILE_TOO_SMALL',
        details: 'Minimum size: 1KB'
      }
    });
  }

  next();
};

/**
 * Validate CSV file upload
 */
export const validateCsvUpload = (req: Request, res: Response, next: NextFunction) => {
  const contentType = req.body.contentType || req.headers['content-type'];
  const contentLength = parseInt(req.body.contentLength || req.headers['content-length'] || '0');

  if (!contentType || !ALLOWED_CSV_TYPES.includes(contentType)) {
    return res.status(400).json({
      success: false,
      message: 'Invalid CSV file type',
      error: {
        code: 'INVALID_FILE_TYPE',
        details: `Allowed types: ${ALLOWED_CSV_TYPES.join(', ')}`,
        received: contentType || 'unknown'
      }
    });
  }

  if (contentLength > MAX_CSV_SIZE) {
    return res.status(400).json({
      success: false,
      message: 'CSV file too large',
      error: {
        code: 'FILE_TOO_LARGE',
        details: `Maximum size: ${MAX_CSV_SIZE / 1024 / 1024}MB`
      }
    });
  }

  if (contentLength < 10) {
    return res.status(400).json({
      success: false,
      message: 'CSV file too small or empty',
      error: {
        code: 'FILE_TOO_SMALL'
      }
    });
  }

  next();
};

/**
 * Validate image file upload
 */
export const validateImageUpload = (req: Request, res: Response, next: NextFunction) => {
  const contentType = req.body.contentType || req.headers['content-type'];
  const contentLength = parseInt(req.body.contentLength || req.headers['content-length'] || '0');

  if (!contentType || !ALLOWED_IMAGE_TYPES.includes(contentType)) {
    return res.status(400).json({
      success: false,
      message: 'Invalid image file type',
      error: {
        code: 'INVALID_FILE_TYPE',
        details: `Allowed types: ${ALLOWED_IMAGE_TYPES.join(', ')}`,
        received: contentType || 'unknown'
      }
    });
  }

  if (contentLength > MAX_IMAGE_SIZE) {
    return res.status(400).json({
      success: false,
      message: 'Image file too large',
      error: {
        code: 'FILE_TOO_LARGE',
        details: `Maximum size: ${MAX_IMAGE_SIZE / 1024 / 1024}MB`
      }
    });
  }

  next();
};

/**
 * Generic file validation middleware
 * Validates based on file extension and size
 */
export const validateFileUpload = (
  allowedExtensions: string[],
  maxSize: number
) => {
  return (req: AuthRequest, res: Response, next: NextFunction) => {
    const file = req.file;
    const files = req.files;

    if (!file && (!files || (Array.isArray(files) && files.length === 0))) {
      return res.status(400).json({
        success: false,
        message: 'No file uploaded',
        error: { code: 'NO_FILE' }
      });
    }

    // Handle single file
    if (file) {
      const ext = file.originalname.split('.').pop()?.toLowerCase();
      if (!ext || !allowedExtensions.includes(ext)) {
        return res.status(400).json({
          success: false,
          message: 'Invalid file extension',
          error: {
            code: 'INVALID_EXTENSION',
            details: `Allowed: ${allowedExtensions.join(', ')}`
          }
        });
      }

      if (file.size > maxSize) {
        return res.status(400).json({
          success: false,
          message: 'File too large',
          error: {
            code: 'FILE_TOO_LARGE',
            details: `Maximum: ${Math.round(maxSize / 1024 / 1024)}MB`
          }
        });
      }
    }

    // Handle multiple files
    if (files && !Array.isArray(files)) {
      // req.files is an object with field names as keys
      for (const fieldName in files) {
        const fieldFiles = (files as any)[fieldName];
        for (const f of fieldFiles) {
          const ext = f.originalname.split('.').pop()?.toLowerCase();
          if (!ext || !allowedExtensions.includes(ext)) {
            return res.status(400).json({
              success: false,
              message: `Invalid file extension for ${fieldName}`,
              error: {
                code: 'INVALID_EXTENSION',
                details: `Allowed: ${allowedExtensions.join(', ')}`
              }
            });
          }

          if (f.size > maxSize) {
            return res.status(400).json({
              success: false,
              message: `File too large: ${fieldName}`,
              error: {
                code: 'FILE_TOO_LARGE',
                details: `Maximum: ${Math.round(maxSize / 1024 / 1024)}MB`
              }
            });
          }
        }
      }
    }

    next();
  };
};

/**
 * Malicious file detection (basic checks)
 * Prevents common attack vectors
 */
export const detectMaliciousFile = (req: AuthRequest, res: Response, next: NextFunction) => {
  const file = req.file;

  if (!file) {
    return next();
  }

  // Check for null bytes (common in malicious files)
  if (file.originalname.includes('\0')) {
    return res.status(400).json({
      success: false,
      message: 'Malicious filename detected',
      error: { code: 'MALICIOUS_FILE' }
    });
  }

  // Check for path traversal attempts
  if (file.originalname.includes('..') || file.originalname.includes('/') || file.originalname.includes('\\')) {
    return res.status(400).json({
      success: false,
      message: 'Invalid filename',
      error: {
        code: 'INVALID_FILENAME',
        details: 'Filename cannot contain path separators or parent directory references'
      }
    });
  }

  // Check for double extensions (common in malware)
  const nameParts = file.originalname.split('.');
  if (nameParts.length > 2) {
    const suspiciousExtensions = ['exe', 'bat', 'cmd', 'sh', 'php', 'jsp', 'asp'];
    if (nameParts.some(part => suspiciousExtensions.includes(part.toLowerCase()))) {
      return res.status(400).json({
        success: false,
        message: 'Suspicious file detected',
        error: {
          code: 'SUSPICIOUS_FILE',
          details: 'File appears to have executable extensions'
        }
      });
    }
  }

  next();
};
