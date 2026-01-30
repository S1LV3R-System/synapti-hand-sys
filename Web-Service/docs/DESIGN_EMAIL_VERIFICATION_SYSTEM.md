# Email Verification System Design

## Overview

This document outlines the design for implementing email verification in the HandPose Web-Service application. The system enables users to verify their email addresses during registration, which is required before admin approval.

---

## System Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           EMAIL VERIFICATION FLOW                            │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  ┌──────────┐      ┌──────────┐      ┌──────────┐      ┌──────────┐        │
│  │  User    │──────│ Register │──────│  Send    │──────│  Email   │        │
│  │  Client  │      │   API    │      │  Email   │      │  Service │        │
│  └──────────┘      └──────────┘      └──────────┘      └──────────┘        │
│       │                 │                  │                  │             │
│       │                 ▼                  │                  │             │
│       │         ┌──────────────┐           │                  │             │
│       │         │   Database   │◄──────────┘                  │             │
│       │         │ EmailVerify  │                              │             │
│       │         └──────────────┘                              │             │
│       │                                                       │             │
│       │◄──────────────────────────────────────────────────────┘             │
│       │         (Verification Email with Link/Code)                         │
│       │                                                                      │
│       ▼                                                                      │
│  ┌──────────┐      ┌──────────┐      ┌──────────┐                          │
│  │  Verify  │──────│  Verify  │──────│  Update  │                          │
│  │  Click   │      │   API    │      │   User   │                          │
│  └──────────┘      └──────────┘      └──────────┘                          │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Database Schema

The `EmailVerification` model already exists in `prisma/schema.prisma`:

```prisma
model EmailVerification {
  id        String   @id @default(uuid())
  email     String
  code      String   // 6-digit code OR secure token
  expiresAt DateTime @map("expires_at")
  verified  Boolean  @default(false)
  attempts  Int      @default(0) // Track verification attempts
  createdAt DateTime @default(now()) @map("created_at")

  @@index([email])
  @@index([code])
  @@index([expiresAt])
  @@map("email_verifications")
}
```

### Schema Considerations
- **code**: Store a secure 6-digit code for simple verification or a UUID token for link-based verification
- **expiresAt**: Default 24 hours for verification links, 10 minutes for codes
- **attempts**: Limit to 5 attempts to prevent brute force attacks

---

## API Endpoints

### 1. Send Verification Email

**POST** `/api/auth/send-verification`

**Request:**
```json
{
  "email": "user@example.com"
}
```

**Response (200):**
```json
{
  "success": true,
  "message": "Verification email sent",
  "data": {
    "expiresAt": "2024-01-14T12:00:00Z"
  }
}
```

**Error Responses:**
- `400` - Email already verified
- `429` - Too many requests (rate limited)
- `500` - Email service error

---

### 2. Verify Email (Code-based)

**POST** `/api/auth/verify-email`

**Request:**
```json
{
  "email": "user@example.com",
  "code": "123456"
}
```

**Response (200):**
```json
{
  "success": true,
  "message": "Email verified successfully",
  "data": {
    "email": "user@example.com",
    "verifiedAt": "2024-01-14T10:30:00Z"
  }
}
```

**Error Responses:**
- `400` - Invalid or expired code
- `400` - Maximum attempts exceeded
- `404` - Verification record not found

---

### 3. Verify Email (Link-based)

**GET** `/api/auth/verify-email/:token`

**Response (302):** Redirect to frontend with status
- Success: `/login?verified=true`
- Error: `/login?verified=false&error=expired`

---

### 4. Resend Verification Email

**POST** `/api/auth/resend-verification`

**Request:**
```json
{
  "email": "user@example.com"
}
```

**Response (200):**
```json
{
  "success": true,
  "message": "Verification email resent"
}
```

**Rate Limiting:** 3 requests per hour per email

---

## Email Service Design

### Option A: Nodemailer with SMTP (Recommended for Development)

```typescript
// src/services/email.service.ts

import nodemailer from 'nodemailer';

interface EmailConfig {
  host: string;
  port: number;
  secure: boolean;
  auth: {
    user: string;
    pass: string;
  };
}

interface SendEmailOptions {
  to: string;
  subject: string;
  html: string;
  text?: string;
}

export class EmailService {
  private transporter: nodemailer.Transporter;

  constructor(config: EmailConfig) {
    this.transporter = nodemailer.createTransport(config);
  }

  async sendVerificationEmail(email: string, code: string): Promise<void> {
    const subject = 'Verify your HandPose account';
    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2>Welcome to HandPose</h2>
        <p>Your verification code is:</p>
        <div style="background: #f4f4f4; padding: 20px; text-align: center; font-size: 32px; letter-spacing: 8px; font-weight: bold;">
          ${code}
        </div>
        <p>This code expires in 10 minutes.</p>
        <p>If you didn't create an account, you can safely ignore this email.</p>
      </div>
    `;

    await this.send({ to: email, subject, html });
  }

  async send(options: SendEmailOptions): Promise<void> {
    await this.transporter.sendMail({
      from: process.env.EMAIL_FROM || 'noreply@handpose.com',
      ...options
    });
  }
}
```

### Option B: SendGrid/Mailgun (Recommended for Production)

```typescript
// For production, use a transactional email service
import sgMail from '@sendgrid/mail';

sgMail.setApiKey(process.env.SENDGRID_API_KEY);

export async function sendVerificationEmail(email: string, code: string) {
  await sgMail.send({
    to: email,
    from: 'noreply@handpose.com',
    templateId: 'd-xxxx', // SendGrid template
    dynamicTemplateData: {
      verification_code: code,
      expires_in: '10 minutes'
    }
  });
}
```

---

## Environment Variables

Add to `.env`:

```env
# Email Configuration
EMAIL_ENABLED=true
EMAIL_PROVIDER=smtp  # smtp | sendgrid | mailgun

# SMTP Configuration
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=your-email@gmail.com
SMTP_PASS=your-app-password

# SendGrid Configuration (Production)
SENDGRID_API_KEY=your-sendgrid-key

# Verification Settings
VERIFICATION_CODE_EXPIRY_MINUTES=10
VERIFICATION_LINK_EXPIRY_HOURS=24
VERIFICATION_MAX_ATTEMPTS=5
```

---

## Backend Implementation

### Controller: `src/controllers/verification.controller.ts`

```typescript
import { Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { EmailService } from '../services/email.service';
import crypto from 'crypto';

const prisma = new PrismaClient();
const emailService = new EmailService(/* config */);

// Generate 6-digit code
function generateCode(): string {
  return crypto.randomInt(100000, 999999).toString();
}

export async function sendVerification(req: Request, res: Response) {
  const { email } = req.body;

  // Check if user exists and is not verified
  const user = await prisma.user.findUnique({ where: { email } });

  if (!user) {
    return res.status(404).json({
      success: false,
      message: 'User not found'
    });
  }

  if (user.emailVerified) {
    return res.status(400).json({
      success: false,
      message: 'Email already verified'
    });
  }

  // Invalidate existing codes
  await prisma.emailVerification.updateMany({
    where: { email, verified: false },
    data: { verified: true } // Mark as used
  });

  // Generate new code
  const code = generateCode();
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

  await prisma.emailVerification.create({
    data: {
      email,
      code,
      expiresAt,
      verified: false,
      attempts: 0
    }
  });

  // Send email
  await emailService.sendVerificationEmail(email, code);

  return res.json({
    success: true,
    message: 'Verification email sent',
    data: { expiresAt }
  });
}

export async function verifyEmail(req: Request, res: Response) {
  const { email, code } = req.body;

  const verification = await prisma.emailVerification.findFirst({
    where: {
      email,
      code,
      verified: false,
      expiresAt: { gt: new Date() }
    }
  });

  if (!verification) {
    // Check if code exists but expired
    const expiredCheck = await prisma.emailVerification.findFirst({
      where: { email, code }
    });

    if (expiredCheck) {
      return res.status(400).json({
        success: false,
        message: 'Verification code has expired',
        error: { code: 'CODE_EXPIRED' }
      });
    }

    // Track failed attempts
    await prisma.emailVerification.updateMany({
      where: { email, verified: false },
      data: { attempts: { increment: 1 } }
    });

    return res.status(400).json({
      success: false,
      message: 'Invalid verification code',
      error: { code: 'INVALID_CODE' }
    });
  }

  // Check max attempts
  if (verification.attempts >= 5) {
    return res.status(400).json({
      success: false,
      message: 'Maximum verification attempts exceeded',
      error: { code: 'MAX_ATTEMPTS' }
    });
  }

  // Mark as verified
  await prisma.$transaction([
    prisma.emailVerification.update({
      where: { id: verification.id },
      data: { verified: true }
    }),
    prisma.user.update({
      where: { email },
      data: {
        emailVerified: true,
        emailVerifiedAt: new Date()
      }
    })
  ]);

  return res.json({
    success: true,
    message: 'Email verified successfully',
    data: {
      email,
      verifiedAt: new Date()
    }
  });
}
```

### Routes: `src/routes/verification.routes.ts`

```typescript
import { Router } from 'express';
import {
  sendVerification,
  verifyEmail,
  resendVerification
} from '../controllers/verification.controller';
import { rateLimit } from 'express-rate-limit';

const router = Router();

// Rate limiting for email sending
const emailRateLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 5, // 5 requests per hour
  message: {
    success: false,
    message: 'Too many verification requests. Please try again later.'
  }
});

router.post('/send-verification', emailRateLimiter, sendVerification);
router.post('/verify-email', verifyEmail);
router.post('/resend-verification', emailRateLimiter, resendVerification);

export default router;
```

---

## Frontend Integration

### Registration Flow Update

```typescript
// src/pages/RegisterPage.tsx

// After successful registration, show verification prompt
const handleRegister = async (values: RegisterFormData) => {
  try {
    const response = await authService.register(values);

    if (response.success) {
      // Navigate to verification page
      navigate('/verify-email', {
        state: { email: values.email }
      });
    }
  } catch (error) {
    // Handle error
  }
};
```

### New Page: Email Verification

```typescript
// src/pages/VerifyEmailPage.tsx

import React, { useState } from 'react';
import { Card, Input, Button, message, Typography, Space } from 'antd';
import { MailOutlined, CheckCircleOutlined } from '@ant-design/icons';
import { useLocation, useNavigate } from 'react-router-dom';

const { Title, Text } = Typography;

export const VerifyEmailPage: React.FC = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const email = location.state?.email;

  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [verified, setVerified] = useState(false);
  const [resendCooldown, setResendCooldown] = useState(0);

  const handleVerify = async () => {
    setLoading(true);
    try {
      await authService.verifyEmail(email, code);
      setVerified(true);
      message.success('Email verified successfully!');
      setTimeout(() => navigate('/login'), 2000);
    } catch (error) {
      message.error(error.message || 'Verification failed');
    } finally {
      setLoading(false);
    }
  };

  const handleResend = async () => {
    try {
      await authService.resendVerification(email);
      message.success('Verification code resent');
      setResendCooldown(60); // 60 second cooldown
    } catch (error) {
      message.error('Failed to resend code');
    }
  };

  if (verified) {
    return (
      <Card className="max-w-md mx-auto mt-16 text-center">
        <CheckCircleOutlined style={{ fontSize: 64, color: '#52c41a' }} />
        <Title level={3}>Email Verified!</Title>
        <Text>Redirecting to login...</Text>
      </Card>
    );
  }

  return (
    <Card className="max-w-md mx-auto mt-16">
      <Space direction="vertical" size="large" style={{ width: '100%' }}>
        <div className="text-center">
          <MailOutlined style={{ fontSize: 48, color: '#1890ff' }} />
          <Title level={3}>Verify Your Email</Title>
          <Text type="secondary">
            We've sent a 6-digit code to <strong>{email}</strong>
          </Text>
        </div>

        <Input.OTP
          length={6}
          value={code}
          onChange={setCode}
          size="large"
        />

        <Button
          type="primary"
          block
          size="large"
          loading={loading}
          onClick={handleVerify}
          disabled={code.length !== 6}
        >
          Verify Email
        </Button>

        <div className="text-center">
          <Text type="secondary">Didn't receive the code? </Text>
          <Button
            type="link"
            onClick={handleResend}
            disabled={resendCooldown > 0}
          >
            {resendCooldown > 0 ? `Resend in ${resendCooldown}s` : 'Resend'}
          </Button>
        </div>
      </Space>
    </Card>
  );
};
```

### Auth Service Update

```typescript
// src/services/authService.ts

export const authService = {
  // ... existing methods

  async sendVerification(email: string): Promise<void> {
    await apiClient.post('/auth/send-verification', { email });
  },

  async verifyEmail(email: string, code: string): Promise<void> {
    await apiClient.post('/auth/verify-email', { email, code });
  },

  async resendVerification(email: string): Promise<void> {
    await apiClient.post('/auth/resend-verification', { email });
  }
};
```

---

## Security Considerations

### 1. Rate Limiting
- **Send verification**: 5 requests/hour per email
- **Verify code**: 10 requests/hour per IP
- **Global**: 100 requests/minute per IP

### 2. Code Security
- Use cryptographically secure random number generation
- Codes expire after 10 minutes
- Maximum 5 attempts per verification session
- Invalidate old codes when new one is requested

### 3. Email Security
- Don't reveal if email exists (for send-verification endpoint)
- Use DKIM/SPF for email authentication
- Implement CAPTCHA for resend functionality

### 4. Token Security (for link-based verification)
- Use UUID v4 tokens (128-bit random)
- Store hashed tokens in database
- One-time use tokens

---

## Implementation Checklist

### Phase 1: Backend Core
- [ ] Install nodemailer: `npm install nodemailer @types/nodemailer`
- [ ] Create `src/services/email.service.ts`
- [ ] Create `src/controllers/verification.controller.ts`
- [ ] Create `src/routes/verification.routes.ts`
- [ ] Add routes to `src/index.ts`
- [ ] Add environment variables
- [ ] Add rate limiting middleware

### Phase 2: Registration Integration
- [ ] Update `auth.controller.ts` register to trigger verification email
- [ ] Re-enable `emailVerified` check in `admin.controller.ts` for pending users
- [ ] Re-enable `emailVerified` check in `approveUser` function

### Phase 3: Frontend
- [ ] Create `VerifyEmailPage.tsx`
- [ ] Update `RegisterPage.tsx` to redirect to verification
- [ ] Update `authService.ts` with verification methods
- [ ] Add route `/verify-email` in `App.tsx`
- [ ] Add verification status display in admin panel

### Phase 4: Testing & Deployment
- [ ] Test with development SMTP (Ethereal/Mailtrap)
- [ ] Configure production email service
- [ ] Add email templates
- [ ] Monitor email delivery rates

---

## Dependencies to Install

```bash
# Backend
npm install nodemailer
npm install -D @types/nodemailer

# Optional: For production email services
npm install @sendgrid/mail  # or
npm install mailgun-js
```

---

## Alternative: Skip Email Verification

If email verification is not required for the initial MVP, the current solution (removed email verification checks) is valid. The system can be enhanced later with email verification when an email service is configured.

**Current Workaround Status:**
- `getPendingUsers`: Email verification filter removed
- `approveUser`: Email verification check removed
- Users can be approved without email verification

---

## Estimated Implementation Time

| Phase | Tasks | Estimate |
|-------|-------|----------|
| Phase 1 | Backend Core | 2-3 hours |
| Phase 2 | Registration Integration | 1 hour |
| Phase 3 | Frontend | 2-3 hours |
| Phase 4 | Testing & Deployment | 1-2 hours |
| **Total** | | **6-9 hours** |

---

## References

- [Nodemailer Documentation](https://nodemailer.com/)
- [SendGrid Node.js Docs](https://docs.sendgrid.com/for-developers/sending-email/quickstart-nodejs)
- [OWASP Email Security](https://cheatsheetseries.owasp.org/cheatsheets/Forgot_Password_Cheat_Sheet.html)
