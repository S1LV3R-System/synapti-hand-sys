import { Request, Response } from 'express';
import prisma from '../lib/prisma';
import { hashPassword, comparePassword, validatePassword, getPasswordValidationError } from '../utils/password';
import { generateToken } from '../utils/jwt';
import { AuthRequest } from '../middleware/auth.middleware';
import { RegisterUserInput } from '../types/auth.types';
import { UserRole } from '../types/api.types';
import { emailService } from '../services/email.service';
import { supabaseAdmin } from '../lib/supabase';
import {
  storePendingRegistration,
  verifyPendingRegistration,
  deletePendingRegistration,
  regenerateVerificationCode,
  hasPendingRegistration,
  PendingRegistrationData
} from '../services/pendingRegistration.service';


// ============================================================================
// REGISTRATION - DEFERRED SAVE PATTERN
// ============================================================================
// User data is NOT saved to database until email verification is complete.
// This prevents orphaned records and ensures data integrity.
// Flow:
//   1. Validate all fields thoroughly
//   2. Store in Redis temporarily (NOT database)
//   3. Send verification email
//   4. User enters code
//   5. ONLY THEN create Supabase Auth + User-Main records
// ============================================================================

export const register = async (req: Request, res: Response) => {
  try {
    const {
      email,
      password,
      firstName,
      middleName,
      lastName,
      birthDate,
      phoneNumber,
      institute,
      department,
      userType = 'Clinician'
    } = req.body;

    // ========================================================================
    // STEP 1: Validate ALL required fields
    // ========================================================================
    const missingFields: string[] = [];
    if (!email) missingFields.push('email');
    if (!password) missingFields.push('password');
    if (!firstName) missingFields.push('firstName');
    if (!lastName) missingFields.push('lastName');
    if (!birthDate) missingFields.push('birthDate');
    if (!phoneNumber) missingFields.push('phoneNumber');
    if (!institute) missingFields.push('institute');
    if (!department) missingFields.push('department');

    if (missingFields.length > 0) {
      return res.status(400).json({
        success: false,
        message: `Missing required fields: ${missingFields.join(', ')}`,
        missingFields,
      });
    }

    // ========================================================================
    // STEP 2: Validate password with SPECIFIC error message
    // ========================================================================
    const passwordError = getPasswordValidationError(password);
    if (passwordError) {
      return res.status(400).json({
        success: false,
        message: passwordError,
        field: 'password',
      });
    }

    // ========================================================================
    // STEP 3: Validate email format
    // ========================================================================
    const emailRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
    const normalizedEmail = email.toLowerCase().trim();
    if (!emailRegex.test(normalizedEmail)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid email format. Please enter a valid email address.',
        field: 'email',
      });
    }

    // ========================================================================
    // STEP 4: Validate birth date format
    // ========================================================================
    const parsedBirthDate = new Date(birthDate);
    if (isNaN(parsedBirthDate.getTime())) {
      return res.status(400).json({
        success: false,
        message: 'Invalid birth date format. Please use YYYY-MM-DD format.',
        field: 'birthDate',
      });
    }

    // Validate birth date is in the past
    if (parsedBirthDate > new Date()) {
      return res.status(400).json({
        success: false,
        message: 'Birth date cannot be in the future.',
        field: 'birthDate',
      });
    }

    // ========================================================================
    // STEP 5: Validate phone number format
    // ========================================================================
    const normalizedPhone = phoneNumber.trim();
    if (!/^\+\d{7,15}$/.test(normalizedPhone)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid phone number format. Please include country code (e.g., +821012345678).',
        field: 'phoneNumber',
      });
    }

    // ========================================================================
    // STEP 6: Check if user ALREADY EXISTS in database
    // ========================================================================
    const existingUser = await prisma.user.findFirst({
      where: {
        OR: [
          { email: normalizedEmail },
          { phoneNumber: normalizedPhone }
        ],
        deletedAt: null, // Only check non-deleted users
      },
    });

    if (existingUser) {
      // Check if this is an incomplete record created by Supabase trigger
      // These records have default/empty values and were never properly verified
      const isIncompleteRecord = (
        !existingUser.verificationStatus &&
        (existingUser.institute === 'Unknown' || existingUser.passwordHash === '' || !existingUser.passwordHash)
      );

      if (isIncompleteRecord && existingUser.email === normalizedEmail) {
        // Delete the incomplete record to allow re-registration
        console.log(`[Register] Deleting incomplete record for ${normalizedEmail} to allow re-registration`);
        await prisma.user.delete({ where: { id: existingUser.id } });

        // Also clean up any orphaned Supabase Auth user
        if (supabaseAdmin && existingUser.authUserId) {
          try {
            await supabaseAdmin.auth.admin.deleteUser(existingUser.authUserId);
            console.log(`[Register] Deleted orphaned Supabase Auth user: ${existingUser.authUserId}`);
          } catch (e) {
            console.warn('[Register] Failed to delete orphaned Supabase Auth user:', e);
          }
        }
      } else {
        // This is a real user account - don't allow re-registration
        const field = existingUser.email === normalizedEmail ? 'email' : 'phone number';
        return res.status(409).json({
          success: false,
          message: `An account with this ${field} already exists. Please login or use a different ${field}.`,
          field: field === 'email' ? 'email' : 'phoneNumber',
        });
      }
    }

    // Check if there's already a pending registration
    const hasPending = await hasPendingRegistration(normalizedEmail);
    if (hasPending) {
      return res.status(409).json({
        success: false,
        message: 'A verification email was already sent to this address. Please check your inbox or wait a few minutes to try again.',
        field: 'email',
      });
    }

    // ========================================================================
    // STEP 7: Store PENDING registration in Redis (NOT database!)
    // ========================================================================
    console.log(`[Register] Storing pending registration for ${normalizedEmail}`);

    const pendingResult = await storePendingRegistration({
      email: normalizedEmail,
      password, // Will be hashed inside the service
      firstName: firstName.trim(),
      middleName: middleName?.trim() || '',
      lastName: lastName.trim(),
      birthDate,
      phoneNumber: normalizedPhone,
      institute: institute.trim(),
      department: department.trim(),
      userType,
    });

    if (!pendingResult.success) {
      return res.status(400).json({
        success: false,
        message: pendingResult.error || 'Failed to initiate registration',
      });
    }

    // ========================================================================
    // STEP 8: Send verification email with 6-digit code
    // ========================================================================
    let emailSent = false;
    try {
      const emailResult = await emailService.sendVerificationCodeDirect(
        normalizedEmail,
        firstName.trim(),
        pendingResult.code!
      );
      emailSent = emailResult.success;

      if (!emailResult.success) {
        console.warn('[Register] Failed to send verification email:', emailResult.error);
        // Delete pending registration if email failed
        await deletePendingRegistration(normalizedEmail);
        return res.status(500).json({
          success: false,
          message: 'Failed to send verification email. Please try again or contact support.',
        });
      }
    } catch (emailError) {
      console.error('[Register] Error sending verification email:', emailError);
      await deletePendingRegistration(normalizedEmail);
      return res.status(500).json({
        success: false,
        message: 'Failed to send verification email. Please try again.',
      });
    }

    // ========================================================================
    // STEP 9: Return success - NO DATA SAVED TO DATABASE YET!
    // ========================================================================
    console.log(`[Register] Verification email sent to ${normalizedEmail}. Awaiting code confirmation.`);

    res.status(200).json({
      success: true,
      message: 'A 6-digit verification code has been sent to your email. Please enter the code to complete registration.',
      data: {
        email: normalizedEmail,
        emailSent: true,
        requiresVerification: true,
        registrationComplete: false,
        codeExpiresInMinutes: 5,
        // NO user ID - user not created yet!
      },
    });

  } catch (error) {
    console.error('[Register] Error:', error);
    res.status(500).json({
      success: false,
      message: 'Registration failed. Please try again.',
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
};

export const login = async (req: Request, res: Response) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({
        success: false,
        message: 'Email and password are required',
      });
    }

    // Find user
    const user = await prisma.user.findUnique({
      where: { email },
    });

    if (!user) {
      return res.status(401).json({
        success: false,
        message: 'Invalid credentials',
      });
    }

    // Check if user is soft-deleted
    if (user.deletedAt) {
      return res.status(401).json({
        success: false,
        message: 'Account has been deactivated',
      });
    }

    // Check if email is verified
    if (!user.verificationStatus) {
      return res.status(403).json({
        success: false,
        message: 'Please verify your email address before logging in',
        code: 'EMAIL_NOT_VERIFIED',
      });
    }

    // Check if user is approved (approvalStatus=true means approved)
    if (!user.approvalStatus) {
      // Check if rejected (rejectedAt is set)
      if (user.rejectedAt) {
        return res.status(403).json({
          success: false,
          message: 'Your account registration was not approved. Please contact support.',
          code: 'ACCOUNT_REJECTED',
        });
      }
      // Otherwise pending
      return res.status(403).json({
        success: false,
        message: 'Account is pending admin approval',
        code: 'PENDING_APPROVAL',
      });
    }

    // Verify password
    const isPasswordValid = await comparePassword(password, user.passwordHash);

    if (!isPasswordValid) {
      return res.status(401).json({
        success: false,
        message: 'Invalid credentials',
      });
    }

    // Generate token with userType (role)
    const token = generateToken({
      userId: user.id,
      email: user.email,
      role: user.userType, // Use userType as role
    });

    // Create audit log
    await prisma.auditLog.create({
      data: {
        userId: user.id,
        action: 'user.login',
        resource: 'users',
        ipAddress: req.ip,
        userAgent: req.get('user-agent'),
      },
    });

    res.json({
      success: true,
      message: 'Login successful',
      data: {
        user: {
          id: user.id,
          email: user.email,
          firstName: user.firstName,
          lastName: user.lastName,
          fullName: [user.firstName, user.middleName, user.lastName].filter(Boolean).join(' '),
          role: user.userType, // Use userType as role
          institute: user.institute,
          department: user.department,
        },
        token,
      },
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({
      success: false,
      message: 'Login failed',
    });
  }
};

export const logout = async (req: AuthRequest, res: Response) => {
  try {
    // Create audit log
    if (req.user) {
      await prisma.auditLog.create({
        data: {
          userId: req.user.userId,
          action: 'user.logout',
          resource: 'users',
          ipAddress: req.ip,
          userAgent: req.get('user-agent'),
        },
      });
    }

    res.json({
      success: true,
      message: 'Logout successful',
    });
  } catch (error) {
    console.error('Logout error:', error);
    res.status(500).json({
      success: false,
      message: 'Logout failed',
    });
  }
};

export const getCurrentUser = async (req: AuthRequest, res: Response) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user!.userId },
      select: {
        id: true,
        email: true,
        fullName: true,
        firstName: true,
        lastName: true,
        phoneNumber: true,
        hospital: true,
        department: true,
        role: true,
        isApproved: true,
        isActive: true,
        createdAt: true,
        lastLogin: true,
      },
    });

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found',
      });
    }

    res.json({
      success: true,
      data: user,
    });
  } catch (error) {
    console.error('Get current user error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get user',
    });
  }
};

export const updateProfile = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.userId;
    const { fullName, firstName, lastName, phoneNumber, hospital, department } = req.body;

    // Validate at least one field
    if (!fullName && !firstName && !lastName && phoneNumber === undefined && hospital === undefined && department === undefined) {
      return res.status(400).json({
        success: false,
        message: 'At least one field is required to update',
      });
    }

    // Build update data
    const updateData: any = {};
    if (fullName) {
      updateData.fullName = fullName;
      // Also update firstName and lastName from fullName if not provided separately
      if (!firstName && !lastName) {
        const nameParts = fullName.trim().split(' ');
        updateData.firstName = nameParts[0];
        updateData.lastName = nameParts.length > 1 ? nameParts.slice(1).join(' ') : '';
      }
    }
    if (firstName) updateData.firstName = firstName;
    if (lastName) updateData.lastName = lastName;
    if (phoneNumber !== undefined) updateData.phoneNumber = phoneNumber || null;
    if (hospital !== undefined) updateData.hospital = hospital || null;
    if (department !== undefined) updateData.department = department || null;

    const updatedUser = await prisma.user.update({
      where: { id: userId },
      data: updateData,
      select: {
        id: true,
        email: true,
        fullName: true,
        firstName: true,
        lastName: true,
        phoneNumber: true,
        hospital: true,
        department: true,
        role: true,
        isApproved: true,
        isActive: true,
        createdAt: true,
        lastLogin: true,
      },
    });

    // Create audit log
    await prisma.auditLog.create({
      data: {
        userId,
        action: 'user.profile_update',
        resource: 'users',
        resourceId: userId,
        details: JSON.stringify({ updatedFields: Object.keys(updateData) }),
        ipAddress: req.ip,
        userAgent: req.get('user-agent'),
      },
    });

    res.json({
      success: true,
      message: 'Profile updated successfully',
      data: updatedUser,
    });
  } catch (error) {
    console.error('Update profile error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update profile',
    });
  }
};

export const changePassword = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.userId;
    const { currentPassword, newPassword } = req.body;

    if (!currentPassword || !newPassword) {
      return res.status(400).json({
        success: false,
        message: 'Current password and new password are required',
      });
    }

    // Validate new password strength
    if (!validatePassword(newPassword)) {
      return res.status(400).json({
        success: false,
        message: 'New password must be at least 8 characters with 1 uppercase, 1 lowercase, 1 number, and 1 special character',
      });
    }

    // Get current user
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { passwordHash: true },
    });

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found',
      });
    }

    // Verify current password
    const isValid = await comparePassword(currentPassword, user.passwordHash);
    if (!isValid) {
      return res.status(401).json({
        success: false,
        message: 'Current password is incorrect',
      });
    }

    // Hash new password and update
    const newPasswordHash = await hashPassword(newPassword);
    await prisma.user.update({
      where: { id: userId },
      data: { passwordHash: newPasswordHash },
    });

    // Create audit log
    await prisma.auditLog.create({
      data: {
        userId,
        action: 'user.password_change',
        resource: 'users',
        resourceId: userId,
        ipAddress: req.ip,
        userAgent: req.get('user-agent'),
      },
    });

    res.json({
      success: true,
      message: 'Password changed successfully',
    });
  } catch (error) {
    console.error('Change password error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to change password',
    });
  }
};

/**
 * Get pending users (admin only)
 */
export const getPendingUsers = async (req: AuthRequest, res: Response) => {
  try {
    const pendingUsers = await prisma.user.findMany({
      where: {
        isApproved: false,
        deletedAt: null,
      },
      select: {
        id: true,
        email: true,
        fullName: true,
        phoneNumber: true,
        hospital: true,
        department: true,
        role: true,
        createdAt: true,
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    res.json({
      success: true,
      data: pendingUsers,
    });
  } catch (error) {
    console.error('Get pending users error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get pending users',
    });
  }
};

/**
 * Approve or reject user (admin only)
 */
export const approveUser = async (req: AuthRequest, res: Response) => {
  try {
    const { userId } = req.params;
    const { approved } = req.body;

    if (typeof approved !== 'boolean') {
      return res.status(400).json({
        success: false,
        message: 'Approved field must be a boolean',
      });
    }

    const user = await prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found',
      });
    }

    if (user.isApproved) {
      return res.status(400).json({
        success: false,
        message: 'User is already approved',
      });
    }

    // Update user approval status
    const updatedUser = await prisma.user.update({
      where: { id: userId },
      data: {
        isApproved: approved,
        approvedBy: approved ? req.user!.userId : null,
        approvedAt: approved ? new Date() : null,
      },
      select: {
        id: true,
        email: true,
        fullName: true,
        isApproved: true,
        approvedAt: true,
      },
    });

    // Create audit log
    await prisma.auditLog.create({
      data: {
        userId: req.user!.userId,
        action: approved ? 'user.approve' : 'user.reject',
        resource: 'users',
        resourceId: userId,
        details: JSON.stringify({
          targetUser: updatedUser.email,
          approved,
        }),
        ipAddress: req.ip,
        userAgent: req.get('user-agent'),
      },
    });

    res.json({
      success: true,
      message: approved ? 'User approved successfully' : 'User rejected',
      data: updatedUser,
    });
  } catch (error) {
    console.error('Approve user error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update user approval status',
    });
  }
};

// ============================================================================
// EMAIL VERIFICATION ENDPOINTS
// ============================================================================
// CRITICAL: This is where the ACTUAL user is created in the database!
// Only after the verification code is confirmed do we save to:
//   1. Supabase Auth (auth.users)
//   2. User-Main table
// ============================================================================

/**
 * Verify email with code and CREATE the actual user records
 * This is the ONLY place where user data is saved to the database
 */
export const verifyEmail = async (req: Request, res: Response) => {
  try {
    const { code, email } = req.body;

    if (!code || !email) {
      return res.status(400).json({
        success: false,
        message: 'Verification code and email are required',
      });
    }

    // Validate code format (6 alphanumeric characters)
    if (!/^[A-Z0-9]{6}$/i.test(code)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid verification code format. Code should be 6 characters.',
      });
    }

    const normalizedEmail = email.toLowerCase().trim();

    // ========================================================================
    // STEP 1: Verify the code from Redis (pending registration)
    // ========================================================================
    const verificationResult = await verifyPendingRegistration(normalizedEmail, code.toUpperCase());

    if (!verificationResult.success || !verificationResult.data) {
      return res.status(400).json({
        success: false,
        message: verificationResult.error || 'Email verification failed',
      });
    }

    const pendingData = verificationResult.data;
    console.log(`[VerifyEmail] Code verified for ${normalizedEmail}. Creating user records...`);

    // ========================================================================
    // STEP 2: Create user in Supabase Auth (required for Android app)
    // ========================================================================
    let authUserId: string | null = null;

    if (supabaseAdmin) {
      try {
        // First check if user already exists in Supabase Auth (cleanup orphaned)
        const { data: existingAuthUsers } = await supabaseAdmin.auth.admin.listUsers();
        const existingAuthUser = existingAuthUsers?.users?.find(u => u.email === normalizedEmail);

        if (existingAuthUser) {
          // Delete orphaned user before creating new one
          await supabaseAdmin.auth.admin.deleteUser(existingAuthUser.id);
          console.log(`[VerifyEmail] Deleted orphaned Supabase Auth user: ${existingAuthUser.id}`);
        }

        // Create new Supabase Auth user
        const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
          email: normalizedEmail,
          password: pendingData.password, // Original password from pending registration
          email_confirm: true,
          user_metadata: {
            user_type: pendingData.userType,
            first_name: pendingData.firstName,
            last_name: pendingData.lastName,
          }
        });

        if (authError) {
          console.error('[VerifyEmail] Supabase Auth creation failed:', authError);
          // Continue without Supabase Auth - user can still use web login
        } else {
          authUserId = authData.user?.id || null;
          console.log(`[VerifyEmail] Supabase Auth user created: ${authUserId}`);
        }
      } catch (supabaseError) {
        console.error('[VerifyEmail] Supabase Auth error:', supabaseError);
        // Continue without Supabase Auth
      }
    }

    // ========================================================================
    // STEP 3: Create or update user in User-Main table
    // Note: Supabase trigger may have created a record with default values.
    // We use upsert to either create new or update existing with correct data.
    // ========================================================================
    const user = await prisma.user.upsert({
      where: { email: pendingData.email },
      update: {
        // Update existing record (possibly created by Supabase trigger) with correct data
        passwordHash: pendingData.passwordHash,
        firstName: pendingData.firstName,
        middleName: pendingData.middleName || '',
        lastName: pendingData.lastName,
        birthDate: new Date(pendingData.birthDate),
        phoneNumber: pendingData.phoneNumber,
        institute: pendingData.institute,
        department: pendingData.department,
        userType: pendingData.userType,
        authUserId,
        verificationStatus: true,
        verifiedAt: new Date(),
        approvalStatus: false,
        deletedAt: null, // Ensure not soft-deleted
      },
      create: {
        // Create new record if none exists
        email: pendingData.email,
        passwordHash: pendingData.passwordHash,
        firstName: pendingData.firstName,
        middleName: pendingData.middleName || '',
        lastName: pendingData.lastName,
        birthDate: new Date(pendingData.birthDate),
        phoneNumber: pendingData.phoneNumber,
        institute: pendingData.institute,
        department: pendingData.department,
        userType: pendingData.userType,
        authUserId,
        verificationStatus: true,
        verifiedAt: new Date(),
        approvalStatus: false,
      },
    });

    console.log(`[VerifyEmail] User record upserted in User-Main: ${user.id} (${user.email})`);

    // ========================================================================
    // STEP 4: Create audit log
    // ========================================================================
    await prisma.auditLog.create({
      data: {
        userId: user.id,
        action: 'user.register',
        resource: 'users',
        details: JSON.stringify({
          email: user.email,
          institute: user.institute,
          department: user.department,
          userType: user.userType,
          verifiedVia: 'email_code'
        }),
        ipAddress: req.ip,
        userAgent: req.get('user-agent'),
      },
    });

    // ========================================================================
    // STEP 5: Clean up pending registration from Redis
    // ========================================================================
    await deletePendingRegistration(normalizedEmail);
    console.log(`[VerifyEmail] Deleted pending registration for ${normalizedEmail}`);

    // ========================================================================
    // STEP 6: Send welcome email
    // ========================================================================
    try {
      await emailService.sendWelcomeEmail(user.email, user.firstName);
    } catch (welcomeError) {
      console.warn('[VerifyEmail] Failed to send welcome email:', welcomeError);
    }

    // ========================================================================
    // STEP 7: Return success
    // ========================================================================
    res.json({
      success: true,
      message: 'Registration complete! Your account is now pending admin approval.',
      data: {
        user: {
          id: user.id,
          email: user.email,
          firstName: user.firstName,
          lastName: user.lastName,
          fullName: [user.firstName, user.middleName, user.lastName].filter(Boolean).join(' '),
          institute: user.institute,
          department: user.department,
          userType: user.userType,
        },
        verified: true,
        registrationComplete: true,
        pendingApproval: true
      }
    });

  } catch (error) {
    console.error('[VerifyEmail] Error:', error);

    // Check for duplicate key errors
    if (error instanceof Error && error.message.includes('Unique constraint')) {
      return res.status(409).json({
        success: false,
        message: 'An account with this email or phone number already exists.',
      });
    }

    res.status(500).json({
      success: false,
      message: 'Email verification failed. Please try again.',
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
};

/**
 * Resend verification email (public endpoint)
 */
export const resendVerificationEmail = async (req: Request, res: Response) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({
        success: false,
        message: 'Email is required',
      });
    }

    const result = await emailService.resendVerificationEmail(email);

    // Always return success to prevent email enumeration
    res.json({
      success: true,
      message: 'If an account with that email exists and is not verified, a verification email has been sent.',
    });
  } catch (error) {
    console.error('Resend verification email error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to resend verification email',
    });
  }
};

/**
 * Request password reset (public endpoint)
 */
export const requestPasswordReset = async (req: Request, res: Response) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({
        success: false,
        message: 'Email is required',
      });
    }

    await emailService.sendPasswordResetEmail(email);

    // Always return success to prevent email enumeration
    res.json({
      success: true,
      message: 'If an account with that email exists, a password reset email has been sent.',
    });
  } catch (error) {
    console.error('Request password reset error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to process password reset request',
    });
  }
};
