// ============================================================================
// EMAIL SERVICE
// ============================================================================
// Using Hostinger SMTP for transactional emails
// Available addresses:
//   - no-reply@synaptihand.com (verification, notifications)
//   - admin@synaptihand.com (admin notifications)
//   - system@synaptihand.com (system alerts)
// ============================================================================

import nodemailer from 'nodemailer';
import prisma from '../lib/prisma';
import crypto from 'crypto';


// Email configuration from environment variables
const EMAIL_CONFIG = {
  host: process.env.SMTP_HOST || 'smtp.hostinger.com',
  port: parseInt(process.env.SMTP_PORT || '465'),
  secure: process.env.SMTP_SECURE !== 'false', // true for 465, false for other ports
  auth: {
    user: process.env.SMTP_USER || 'no-reply@synaptihand.com',
    pass: process.env.SMTP_PASSWORD || '',
  },
  from: {
    noreply: process.env.SMTP_FROM_NOREPLY || 'SynaptiHand <no-reply@synaptihand.com>',
    admin: process.env.SMTP_FROM_ADMIN || 'SynaptiHand Admin <admin@synaptihand.com>',
    system: process.env.SMTP_FROM_SYSTEM || 'SynaptiHand System <system@synaptihand.com>',
  },
};

// App URL for links in emails
const APP_URL = process.env.APP_URL || 'https://app.synaptihand.com';

// Verification code expiry (5 minutes)
const VERIFICATION_CODE_EXPIRY_MINUTES = 5;

// Create transporter
let transporter: nodemailer.Transporter | null = null;

function getTransporter(): nodemailer.Transporter {
  if (!transporter) {
    if (!EMAIL_CONFIG.auth.pass) {
      console.warn('SMTP_PASSWORD not set - email service will not work');
    }

    transporter = nodemailer.createTransport({
      host: EMAIL_CONFIG.host,
      port: EMAIL_CONFIG.port,
      secure: EMAIL_CONFIG.secure,
      auth: EMAIL_CONFIG.auth,
    });

    console.log(`Email service initialized with ${EMAIL_CONFIG.host}:${EMAIL_CONFIG.port}`);
  }
  return transporter;
}

// ============================================================================
// VERIFICATION TOKEN MANAGEMENT
// ============================================================================

/**
 * Generate a 6-character alphanumeric verification code
 * Ensures mix of letters AND numbers for security
 * Excludes similar-looking chars: 0,O,1,I,L
 */
function generateVerificationCode(): string {
  const letters = 'ABCDEFGHJKMNPQRSTUVWXYZ'; // Excluding O, I, L
  const numbers = '23456789'; // Excluding 0, 1

  // Ensure at least 2 letters and 2 numbers in the code
  const code: string[] = [];
  // Need 11 bytes: 6 for characters (0-5) + 5 for shuffle operations (6-10)
  const randomBytes = crypto.randomBytes(11);

  // Add 2 guaranteed letters
  code.push(letters[randomBytes[0] % letters.length]);
  code.push(letters[randomBytes[1] % letters.length]);

  // Add 2 guaranteed numbers
  code.push(numbers[randomBytes[2] % numbers.length]);
  code.push(numbers[randomBytes[3] % numbers.length]);

  // Add 2 random alphanumeric characters
  const allChars = letters + numbers;
  code.push(allChars[randomBytes[4] % allChars.length]);
  code.push(allChars[randomBytes[5] % allChars.length]);

  // Shuffle the code array using Fisher-Yates
  for (let i = code.length - 1; i > 0; i--) {
    const j = randomBytes[6 + (5 - i)] % (i + 1);
    [code[i], code[j]] = [code[j], code[i]];
  }

  return code.join('');
}

/**
 * Generate a secure verification token (legacy - kept for backward compatibility)
 */
function generateVerificationToken(): string {
  return crypto.randomBytes(32).toString('hex');
}

/**
 * Store verification code in database using EmailVerification table
 */
async function storeVerificationCode(email: string, code: string): Promise<void> {
  const expiresAt = new Date(Date.now() + VERIFICATION_CODE_EXPIRY_MINUTES * 60 * 1000);

  // Delete any existing codes for this email
  await prisma.emailVerification.deleteMany({
    where: { email },
  });

  // Store new code in EmailVerification table
  await prisma.emailVerification.create({
    data: {
      email,
      code,
      expiresAt,
      verified: false,
      attempts: 0,
    },
  });
}

/**
 * Store verification token in database (legacy)
 */
async function storeVerificationToken(userId: string, token: string): Promise<void> {
  const expiresAt = new Date(Date.now() + VERIFICATION_CODE_EXPIRY_MINUTES * 60 * 1000);

  await prisma.auditLog.deleteMany({
    where: {
      userId,
      action: 'email.verification_token',
    },
  });

  await prisma.auditLog.create({
    data: {
      userId,
      action: 'email.verification_token',
      resource: 'user',
      resourceId: userId,
      details: JSON.stringify({
        token,
        expiresAt: expiresAt.toISOString(),
      }),
      ipAddress: 'system',
      userAgent: 'email-service',
    },
  });
}

/**
 * Verify and consume a verification token
 */
async function verifyToken(token: string): Promise<{ valid: boolean; userId?: string; error?: string }> {
  // Find token in audit logs
  const tokenRecords = await prisma.auditLog.findMany({
    where: {
      action: 'email.verification_token',
    },
    orderBy: { createdAt: 'desc' },
    take: 100, // Limit search
  });

  for (const record of tokenRecords) {
    try {
      const tokenData = JSON.parse(record.details || '{}');
      if (tokenData.token === token) {
        // Check expiry
        if (new Date(tokenData.expiresAt) < new Date()) {
          // Delete expired token
          await prisma.auditLog.delete({ where: { id: record.id } });
          return { valid: false, error: 'Token has expired' };
        }

        // Delete used token
        await prisma.auditLog.delete({ where: { id: record.id } });

        return { valid: true, userId: record.userId || undefined };
      }
    } catch (e) {
      // Skip malformed records
    }
  }

  return { valid: false, error: 'Invalid token' };
}

// ============================================================================
// EMAIL TEMPLATES
// ============================================================================

/**
 * Email template for 6-digit verification code
 */
function getVerificationCodeEmailHtml(userName: string, verificationCode: string): string {
  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Your Verification Code - SynaptiHand</title>
</head>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color: #f5f5f5;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f5f5f5; padding: 40px 20px;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="background-color: #ffffff; border-radius: 8px; box-shadow: 0 2px 8px rgba(0,0,0,0.1);">
          <!-- Header -->
          <tr>
            <td style="padding: 40px 40px 20px; text-align: center; border-bottom: 1px solid #eee;">
              <h1 style="margin: 0; color: #2563eb; font-size: 28px; font-weight: 600;">SynaptiHand</h1>
              <p style="margin: 10px 0 0; color: #6b7280; font-size: 14px; font-style: italic;">From Movement to Meaning</p>
            </td>
          </tr>

          <!-- Content -->
          <tr>
            <td style="padding: 40px;">
              <h2 style="margin: 0 0 20px; color: #111827; font-size: 20px; font-weight: 600;">Verify Your Email Address</h2>
              <p style="margin: 0 0 20px; color: #4b5563; font-size: 16px; line-height: 1.6;">
                Hello ${userName},
              </p>
              <p style="margin: 0 0 30px; color: #4b5563; font-size: 16px; line-height: 1.6;">
                Thank you for registering with SynaptiHand. Please use the verification code below to complete your registration:
              </p>

              <!-- Verification Code Box -->
              <table width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td align="center" style="padding: 20px 0 30px;">
                    <div style="display: inline-block; background-color: #f3f4f6; border: 2px dashed #d1d5db; border-radius: 8px; padding: 20px 40px;">
                      <span style="font-size: 36px; font-weight: 700; letter-spacing: 8px; color: #2563eb; font-family: 'Courier New', monospace;">
                        ${verificationCode}
                      </span>
                    </div>
                  </td>
                </tr>
              </table>

              <p style="margin: 0 0 15px; color: #4b5563; font-size: 14px; text-align: center;">
                Enter this code on the verification page to confirm your email address.
              </p>

              <p style="margin: 0; color: #6b7280; font-size: 14px; line-height: 1.6;">
                This code will expire in ${VERIFICATION_CODE_EXPIRY_MINUTES} minutes. If you didn't create an account with SynaptiHand, you can safely ignore this email.
              </p>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding: 20px 40px 30px; background-color: #f9fafb; border-top: 1px solid #eee; border-radius: 0 0 8px 8px;">
              <p style="margin: 0; color: #9ca3af; font-size: 12px; text-align: center;">
                &copy; ${new Date().getFullYear()} SynaptiHand. All rights reserved.<br>
                This is an automated message from system@synaptihand.com
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
  `.trim();
}

/**
 * Legacy email template with verification link (kept for backward compatibility)
 */
function getVerificationEmailHtml(userName: string, verificationLink: string): string {
  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Verify Your Email - SynaptiHand</title>
</head>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color: #f5f5f5;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f5f5f5; padding: 40px 20px;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="background-color: #ffffff; border-radius: 8px; box-shadow: 0 2px 8px rgba(0,0,0,0.1);">
          <tr>
            <td style="padding: 40px 40px 20px; text-align: center; border-bottom: 1px solid #eee;">
              <h1 style="margin: 0; color: #2563eb; font-size: 28px; font-weight: 600;">SynaptiHand</h1>
              <p style="margin: 10px 0 0; color: #6b7280; font-size: 14px; font-style: italic;">From Movement to Meaning</p>
            </td>
          </tr>
          <tr>
            <td style="padding: 40px;">
              <h2 style="margin: 0 0 20px; color: #111827; font-size: 20px; font-weight: 600;">Verify Your Email Address</h2>
              <p style="margin: 0 0 20px; color: #4b5563; font-size: 16px; line-height: 1.6;">Hello ${userName},</p>
              <p style="margin: 0 0 30px; color: #4b5563; font-size: 16px; line-height: 1.6;">
                Click the button below to verify your email address:
              </p>
              <table width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td align="center" style="padding: 10px 0 30px;">
                    <a href="${verificationLink}" style="display: inline-block; background-color: #2563eb; color: #ffffff; text-decoration: none; font-size: 16px; font-weight: 600; padding: 14px 32px; border-radius: 6px;">
                      Verify Email Address
                    </a>
                  </td>
                </tr>
              </table>
              <p style="margin: 0 0 10px; color: #6b7280; font-size: 14px;">Or copy this link: ${verificationLink}</p>
              <p style="margin: 0; color: #6b7280; font-size: 14px;">This link expires in ${VERIFICATION_CODE_EXPIRY_MINUTES} minutes.</p>
            </td>
          </tr>
          <tr>
            <td style="padding: 20px 40px 30px; background-color: #f9fafb; border-top: 1px solid #eee; border-radius: 0 0 8px 8px;">
              <p style="margin: 0; color: #9ca3af; font-size: 12px; text-align: center;">&copy; ${new Date().getFullYear()} SynaptiHand. All rights reserved.</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
  `.trim();
}

function getWelcomeEmailHtml(userName: string): string {
  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Welcome to SynaptiHand</title>
</head>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color: #f5f5f5;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f5f5f5; padding: 40px 20px;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="background-color: #ffffff; border-radius: 8px; box-shadow: 0 2px 8px rgba(0,0,0,0.1);">
          <!-- Header -->
          <tr>
            <td style="padding: 40px 40px 20px; text-align: center; border-bottom: 1px solid #eee;">
              <h1 style="margin: 0; color: #2563eb; font-size: 28px; font-weight: 600;">SynaptiHand</h1>
            </td>
          </tr>

          <!-- Content -->
          <tr>
            <td style="padding: 40px;">
              <h2 style="margin: 0 0 20px; color: #111827; font-size: 20px; font-weight: 600;">Welcome, ${userName}!</h2>
              <p style="margin: 0 0 20px; color: #4b5563; font-size: 16px; line-height: 1.6;">
                Your email has been verified successfully. Your account is now pending administrator approval.
              </p>
              <p style="margin: 0 0 20px; color: #4b5563; font-size: 16px; line-height: 1.6;">
                Once approved, you'll receive another email and will be able to access all features of the SynaptiHand platform.
              </p>

              <!-- CTA Button -->
              <table width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td align="center" style="padding: 10px 0 30px;">
                    <a href="${APP_URL}/login" style="display: inline-block; background-color: #2563eb; color: #ffffff; text-decoration: none; font-size: 16px; font-weight: 600; padding: 14px 32px; border-radius: 6px;">
                      Go to Login
                    </a>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding: 20px 40px 30px; background-color: #f9fafb; border-top: 1px solid #eee; border-radius: 0 0 8px 8px;">
              <p style="margin: 0; color: #9ca3af; font-size: 12px; text-align: center;">
                &copy; ${new Date().getFullYear()} SynaptiHand. All rights reserved.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
  `.trim();
}

function getPasswordResetEmailHtml(userName: string, resetLink: string): string {
  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Reset Your Password - SynaptiHand</title>
</head>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color: #f5f5f5;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f5f5f5; padding: 40px 20px;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="background-color: #ffffff; border-radius: 8px; box-shadow: 0 2px 8px rgba(0,0,0,0.1);">
          <!-- Header -->
          <tr>
            <td style="padding: 40px 40px 20px; text-align: center; border-bottom: 1px solid #eee;">
              <h1 style="margin: 0; color: #2563eb; font-size: 28px; font-weight: 600;">SynaptiHand</h1>
            </td>
          </tr>

          <!-- Content -->
          <tr>
            <td style="padding: 40px;">
              <h2 style="margin: 0 0 20px; color: #111827; font-size: 20px; font-weight: 600;">Reset Your Password</h2>
              <p style="margin: 0 0 20px; color: #4b5563; font-size: 16px; line-height: 1.6;">
                Hello ${userName},
              </p>
              <p style="margin: 0 0 30px; color: #4b5563; font-size: 16px; line-height: 1.6;">
                We received a request to reset your password. Click the button below to create a new password.
              </p>

              <!-- CTA Button -->
              <table width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td align="center" style="padding: 10px 0 30px;">
                    <a href="${resetLink}" style="display: inline-block; background-color: #dc2626; color: #ffffff; text-decoration: none; font-size: 16px; font-weight: 600; padding: 14px 32px; border-radius: 6px;">
                      Reset Password
                    </a>
                  </td>
                </tr>
              </table>

              <p style="margin: 0; color: #6b7280; font-size: 14px; line-height: 1.6;">
                If you didn't request a password reset, you can safely ignore this email. Your password will remain unchanged.
              </p>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding: 20px 40px 30px; background-color: #f9fafb; border-top: 1px solid #eee; border-radius: 0 0 8px 8px;">
              <p style="margin: 0; color: #9ca3af; font-size: 12px; text-align: center;">
                &copy; ${new Date().getFullYear()} SynaptiHand. All rights reserved.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
  `.trim();
}

// ============================================================================
// EMAIL SERVICE CLASS
// ============================================================================

class EmailService {
  /**
   * Send verification email with 6-digit code to user
   * Uses system@synaptihand.com via Hostinger SMTP
   */
  async sendVerificationEmail(userId: string, email: string, userName: string): Promise<{ success: boolean; error?: string; code?: string }> {
    try {
      // Generate and store 6-digit alphanumeric code
      const verificationCode = generateVerificationCode();
      await storeVerificationCode(email, verificationCode);

      // Send email with code
      const transport = getTransporter();
      await transport.sendMail({
        from: EMAIL_CONFIG.from.system, // Use system@synaptihand.com
        to: email,
        subject: 'Your Verification Code - SynaptiHand',
        html: getVerificationCodeEmailHtml(userName, verificationCode),
      });

      console.log(`Verification code email sent to ${email} (code: ${verificationCode})`);
      return { success: true };
    } catch (error) {
      console.error('Failed to send verification email:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to send email',
      };
    }
  }

  /**
   * Send verification code directly (without storing in database)
   * Used for deferred registration flow where code is stored in Redis
   */
  async sendVerificationCodeDirect(
    email: string,
    userName: string,
    verificationCode: string
  ): Promise<{ success: boolean; error?: string }> {
    try {
      const transport = getTransporter();
      await transport.sendMail({
        from: EMAIL_CONFIG.from.system,
        to: email,
        subject: 'Your Verification Code - SynaptiHand',
        html: getVerificationCodeEmailHtml(userName, verificationCode),
      });

      console.log(`[EmailService] Verification code sent to ${email}`);
      return { success: true };
    } catch (error) {
      console.error('[EmailService] Failed to send verification email:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to send email',
      };
    }
  }

  /**
   * Verify email token and mark user as verified
   */
  async verifyEmailToken(token: string): Promise<{ success: boolean; userId?: string; error?: string }> {
    try {
      // Verify token (legacy method)
      const result = await verifyToken(token);
      if (!result.valid || !result.userId) {
        return { success: false, error: result.error || 'Invalid token' };
      }

      // Update user with new schema fields
      const user = await prisma.user.update({
        where: { id: result.userId },
        data: {
          verificationStatus: true,
          verifiedAt: new Date(),
        },
        select: {
          id: true,
          email: true,
          firstName: true,
          lastName: true,
        },
      });

      // Send welcome email
      const userName = user.firstName || user.email.split('@')[0];
      await this.sendWelcomeEmail(user.email, userName);

      console.log(`Email verified for user ${user.email}`);
      return { success: true, userId: user.id };
    } catch (error) {
      console.error('Failed to verify email:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to verify email',
      };
    }
  }

  /**
   * Verify email using 6-digit code
   */
  async verifyEmailCode(email: string, code: string): Promise<{ success: boolean; userId?: string; error?: string }> {
    try {
      // Find user by email
      const user = await prisma.user.findUnique({
        where: { email },
        select: { id: true, verificationStatus: true, firstName: true },
      });

      if (!user) {
        return { success: false, error: 'User not found' };
      }

      if (user.verificationStatus) {
        return { success: false, error: 'Email is already verified' };
      }

      // Find verification code in EmailVerification table
      const verification = await prisma.emailVerification.findFirst({
        where: { email },
        orderBy: { createdAt: 'desc' },
      });

      if (!verification) {
        return { success: false, error: 'No verification code found. Please request a new code.' };
      }

      // Increment attempts
      await prisma.emailVerification.update({
        where: { id: verification.id },
        data: { attempts: { increment: 1 } },
      });

      // Check max attempts (5 attempts allowed)
      if (verification.attempts >= 5) {
        await prisma.emailVerification.delete({ where: { id: verification.id } });
        return { success: false, error: 'Too many failed attempts. Please request a new code.' };
      }

      // Check if code matches (case-insensitive)
      if (verification.code.toUpperCase() !== code.toUpperCase()) {
        return { success: false, error: 'Invalid verification code' };
      }

      // Check if code is expired
      if (new Date(verification.expiresAt) < new Date()) {
        await prisma.emailVerification.delete({ where: { id: verification.id } });
        return { success: false, error: 'Verification code has expired. Please request a new code.' };
      }

      // Mark verification record as verified and delete it
      await prisma.emailVerification.delete({ where: { id: verification.id } });

      // Update user verification status
      await prisma.user.update({
        where: { id: user.id },
        data: {
          verificationStatus: true,
          verifiedAt: new Date(),
        },
      });

      // Send welcome email
      await this.sendWelcomeEmail(email, user.firstName || email.split('@')[0]);

      console.log(`Email verified for user ${email} using code`);
      return { success: true, userId: user.id };
    } catch (error) {
      console.error('Failed to verify email code:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to verify email',
      };
    }
  }

  /**
   * Send welcome email after verification
   */
  async sendWelcomeEmail(email: string, userName: string): Promise<void> {
    try {
      const transport = getTransporter();
      await transport.sendMail({
        from: EMAIL_CONFIG.from.noreply,
        to: email,
        subject: 'Welcome to SynaptiHand',
        html: getWelcomeEmailHtml(userName),
      });
      console.log(`Welcome email sent to ${email}`);
    } catch (error) {
      console.error('Failed to send welcome email:', error);
      // Don't throw - welcome email is not critical
    }
  }

  /**
   * Resend verification email
   */
  async resendVerificationEmail(email: string): Promise<{ success: boolean; error?: string }> {
    try {
      // Find user
      const user = await prisma.user.findUnique({
        where: { email },
        select: {
          id: true,
          email: true,
          firstName: true,
          verificationStatus: true,
        },
      });

      if (!user) {
        // Don't reveal if user exists or not
        return { success: true };
      }

      if (user.verificationStatus) {
        return { success: false, error: 'Email is already verified' };
      }

      // Delete any existing verification codes for this email
      await prisma.emailVerification.deleteMany({
        where: { email },
      });

      // Send new verification email with 6-digit code
      const userName = user.firstName || email.split('@')[0];
      return await this.sendVerificationEmail(user.id, user.email, userName);
    } catch (error) {
      console.error('Failed to resend verification email:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to resend email',
      };
    }
  }

  /**
   * Send password reset email
   */
  async sendPasswordResetEmail(email: string): Promise<{ success: boolean; error?: string }> {
    try {
      // Find user
      const user = await prisma.user.findUnique({
        where: { email },
        select: {
          id: true,
          email: true,
          firstName: true,
        },
      });

      if (!user) {
        // Don't reveal if user exists
        return { success: true };
      }

      // Generate and store token
      const token = generateVerificationToken();

      // Store token (using same mechanism but different action)
      await prisma.auditLog.deleteMany({
        where: {
          userId: user.id,
          action: 'email.password_reset_token',
        },
      });

      const expiresAt = new Date(Date.now() + 1 * 60 * 60 * 1000); // 1 hour
      await prisma.auditLog.create({
        data: {
          userId: user.id,
          action: 'email.password_reset_token',
          resource: 'user',
          resourceId: user.id,
          details: JSON.stringify({
            token,
            expiresAt: expiresAt.toISOString(),
          }),
          ipAddress: 'system',
          userAgent: 'email-service',
        },
      });

      // Create reset link
      const resetLink = `${APP_URL}/reset-password?token=${token}`;
      const userName = user.firstName || email.split('@')[0];

      // Send email
      const transport = getTransporter();
      await transport.sendMail({
        from: EMAIL_CONFIG.from.noreply,
        to: email,
        subject: 'Reset Your Password - SynaptiHand',
        html: getPasswordResetEmailHtml(userName, resetLink),
      });

      console.log(`Password reset email sent to ${email}`);
      return { success: true };
    } catch (error) {
      console.error('Failed to send password reset email:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to send email',
      };
    }
  }

  /**
   * Test email connection
   */
  async testConnection(): Promise<{ success: boolean; error?: string }> {
    try {
      const transport = getTransporter();
      await transport.verify();
      return { success: true };
    } catch (error) {
      console.error('Email connection test failed:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Connection failed',
      };
    }
  }
}

// Export singleton instance
export const emailService = new EmailService();
