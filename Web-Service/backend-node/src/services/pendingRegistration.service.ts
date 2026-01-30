// ============================================================================
// PENDING REGISTRATION SERVICE
// ============================================================================
// Stores registration data in Redis temporarily until email is verified
// Only after verification code is confirmed, the actual user is created
// ============================================================================

import Redis from 'ioredis';
import crypto from 'crypto';
import { hashPassword } from '../utils/password';

// Redis client
const redis = new Redis({
  host: process.env.REDIS_HOST || 'localhost',
  port: parseInt(process.env.REDIS_PORT || '6379'),
  password: process.env.REDIS_PASSWORD || undefined,
  db: parseInt(process.env.REDIS_DB || '0'),
});

// Pending registration data structure
export interface PendingRegistrationData {
  email: string;
  password: string; // Original password (needed for Supabase Auth)
  passwordHash: string; // Hashed password (for User-Main table)
  firstName: string;
  middleName: string;
  lastName: string;
  birthDate: string;
  phoneNumber: string;
  institute: string;
  department: string;
  userType: string;
  verificationCode: string;
  codeExpiresAt: number;
  attempts: number;
  createdAt: number;
}

// Key prefix for Redis
const PENDING_REG_PREFIX = 'pending_registration:';
const EXPIRY_SECONDS = 30 * 60; // 30 minutes for pending registration
const CODE_EXPIRY_SECONDS = 5 * 60; // 5 minutes for verification code
const MAX_ATTEMPTS = 5;

/**
 * Generate a 6-character alphanumeric verification code
 */
function generateVerificationCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // Removed confusing chars: I, O, 0, 1
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

/**
 * Store a pending registration in Redis
 * Returns the verification code
 */
export async function storePendingRegistration(data: {
  email: string;
  password: string;
  firstName: string;
  middleName?: string;
  lastName: string;
  birthDate: string;
  phoneNumber: string;
  institute: string;
  department: string;
  userType: string;
}): Promise<{ success: boolean; code?: string; error?: string }> {
  try {
    const key = PENDING_REG_PREFIX + data.email.toLowerCase();

    // Check if there's already a pending registration
    const existing = await redis.get(key);
    if (existing) {
      const existingData: PendingRegistrationData = JSON.parse(existing);
      // If code hasn't expired and there are attempts left, reject
      if (existingData.codeExpiresAt > Date.now() && existingData.attempts < MAX_ATTEMPTS) {
        return {
          success: false,
          error: 'A verification code was already sent. Please check your email or wait a few minutes to request a new one.'
        };
      }
    }

    // Hash the password
    const passwordHash = await hashPassword(data.password);

    // Generate verification code
    const verificationCode = generateVerificationCode();
    const now = Date.now();

    const pendingData: PendingRegistrationData = {
      email: data.email.toLowerCase().trim(),
      password: data.password, // Original password for Supabase Auth
      passwordHash,
      firstName: data.firstName.trim(),
      middleName: data.middleName?.trim() || '',
      lastName: data.lastName.trim(),
      birthDate: data.birthDate,
      phoneNumber: data.phoneNumber.trim(),
      institute: data.institute.trim(),
      department: data.department.trim(),
      userType: data.userType,
      verificationCode,
      codeExpiresAt: now + (CODE_EXPIRY_SECONDS * 1000),
      attempts: 0,
      createdAt: now,
    };

    // Store in Redis with expiry
    await redis.setex(key, EXPIRY_SECONDS, JSON.stringify(pendingData));

    console.log(`[PendingReg] Stored pending registration for ${data.email}`);

    return { success: true, code: verificationCode };
  } catch (error) {
    console.error('[PendingReg] Error storing pending registration:', error);
    return { success: false, error: 'Failed to initiate registration' };
  }
}

/**
 * Get pending registration data
 */
export async function getPendingRegistration(email: string): Promise<PendingRegistrationData | null> {
  try {
    const key = PENDING_REG_PREFIX + email.toLowerCase();
    const data = await redis.get(key);
    if (!data) return null;
    return JSON.parse(data);
  } catch (error) {
    console.error('[PendingReg] Error getting pending registration:', error);
    return null;
  }
}

/**
 * Verify the code and return the registration data if valid
 */
export async function verifyPendingRegistration(
  email: string,
  code: string
): Promise<{ success: boolean; data?: PendingRegistrationData; error?: string }> {
  try {
    const key = PENDING_REG_PREFIX + email.toLowerCase();
    const storedData = await redis.get(key);

    if (!storedData) {
      return { success: false, error: 'No pending registration found. Please register again.' };
    }

    const pendingData: PendingRegistrationData = JSON.parse(storedData);

    // Check attempts
    if (pendingData.attempts >= MAX_ATTEMPTS) {
      await redis.del(key);
      return { success: false, error: 'Too many failed attempts. Please register again.' };
    }

    // Check expiry
    if (pendingData.codeExpiresAt < Date.now()) {
      return { success: false, error: 'Verification code has expired. Please request a new code.' };
    }

    // Check code
    if (pendingData.verificationCode !== code.toUpperCase()) {
      // Increment attempts
      pendingData.attempts += 1;
      await redis.setex(key, EXPIRY_SECONDS, JSON.stringify(pendingData));

      const attemptsLeft = MAX_ATTEMPTS - pendingData.attempts;
      return {
        success: false,
        error: `Invalid verification code. ${attemptsLeft} attempts remaining.`
      };
    }

    // Success! Return the data
    console.log(`[PendingReg] Verification successful for ${email}`);
    return { success: true, data: pendingData };
  } catch (error) {
    console.error('[PendingReg] Error verifying pending registration:', error);
    return { success: false, error: 'Verification failed' };
  }
}

/**
 * Delete pending registration (after successful creation)
 */
export async function deletePendingRegistration(email: string): Promise<void> {
  try {
    const key = PENDING_REG_PREFIX + email.toLowerCase();
    await redis.del(key);
    console.log(`[PendingReg] Deleted pending registration for ${email}`);
  } catch (error) {
    console.error('[PendingReg] Error deleting pending registration:', error);
  }
}

/**
 * Regenerate verification code for existing pending registration
 */
export async function regenerateVerificationCode(email: string): Promise<{ success: boolean; code?: string; error?: string }> {
  try {
    const key = PENDING_REG_PREFIX + email.toLowerCase();
    const storedData = await redis.get(key);

    if (!storedData) {
      return { success: false, error: 'No pending registration found. Please register again.' };
    }

    const pendingData: PendingRegistrationData = JSON.parse(storedData);

    // Generate new code
    const verificationCode = generateVerificationCode();
    pendingData.verificationCode = verificationCode;
    pendingData.codeExpiresAt = Date.now() + (CODE_EXPIRY_SECONDS * 1000);
    pendingData.attempts = 0; // Reset attempts

    await redis.setex(key, EXPIRY_SECONDS, JSON.stringify(pendingData));

    console.log(`[PendingReg] Regenerated verification code for ${email}`);
    return { success: true, code: verificationCode };
  } catch (error) {
    console.error('[PendingReg] Error regenerating code:', error);
    return { success: false, error: 'Failed to regenerate verification code' };
  }
}

/**
 * Check if email has a pending registration
 */
export async function hasPendingRegistration(email: string): Promise<boolean> {
  try {
    const key = PENDING_REG_PREFIX + email.toLowerCase();
    const exists = await redis.exists(key);
    return exists === 1;
  } catch (error) {
    console.error('[PendingReg] Error checking pending registration:', error);
    return false;
  }
}
