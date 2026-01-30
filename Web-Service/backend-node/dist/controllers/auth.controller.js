"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.requestPasswordReset = exports.resendVerificationEmail = exports.verifyEmail = exports.approveUser = exports.getPendingUsers = exports.changePassword = exports.updateProfile = exports.getCurrentUser = exports.logout = exports.login = exports.register = void 0;
const client_1 = require("@prisma/client");
const schema_compat_1 = require("../utils/schema-compat");
const password_1 = require("../utils/password");
const jwt_1 = require("../utils/jwt");
const email_service_1 = require("../services/email.service");
const basePrisma = new client_1.PrismaClient();
const prisma = (0, schema_compat_1.extendPrismaWithStubs)(basePrisma);
const register = async (req, res) => {
    try {
        const { email, password, firstName, middleName, lastName, birthDate, phoneNumber, institute, department, userType = 'Clinician' } = req.body;
        // Validate required fields (matching new schema)
        if (!email || !password || !firstName || !lastName || !birthDate || !phoneNumber || !institute || !department) {
            return res.status(400).json({
                success: false,
                message: 'All required fields must be provided: email, password, firstName, lastName, birthDate, phoneNumber, institute, department',
            });
        }
        // Validate password strength
        if (!(0, password_1.validatePassword)(password)) {
            return res.status(400).json({
                success: false,
                message: 'Password must be at least 8 characters with 1 uppercase, 1 lowercase, 1 number, and 1 special character',
            });
        }
        // Validate email format
        const emailRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
        if (!emailRegex.test(email)) {
            return res.status(400).json({
                success: false,
                message: 'Invalid email format',
            });
        }
        // Check if user already exists (by email or phone)
        const existingUser = await prisma.user.findFirst({
            where: {
                OR: [
                    { email },
                    { phoneNumber }
                ]
            },
        });
        if (existingUser) {
            const field = existingUser.email === email ? 'email' : 'phone number';
            return res.status(409).json({
                success: false,
                message: `User with this ${field} already exists`,
            });
        }
        // Hash password
        const passwordHash = await (0, password_1.hashPassword)(password);
        // Parse birth date
        const parsedBirthDate = new Date(birthDate);
        if (isNaN(parsedBirthDate.getTime())) {
            return res.status(400).json({
                success: false,
                message: 'Invalid birth date format',
            });
        }
        // Create user with new schema fields
        // verificationStatus = false (needs email verification)
        // approvalStatus = false (needs admin approval)
        const user = await prisma.user.create({
            data: {
                email,
                passwordHash,
                firstName,
                middleName: middleName || '',
                lastName,
                birthDate: parsedBirthDate,
                phoneNumber,
                institute,
                department,
                userType,
                verificationStatus: false,
                approvalStatus: false,
            },
        });
        // Create audit log
        await prisma.auditLog.create({
            data: {
                userId: user.id,
                action: 'user.register',
                resource: 'users',
                details: JSON.stringify({
                    email: user.email,
                    institute: user.institute,
                    department: user.department,
                    userType: user.userType
                }),
                ipAddress: req.ip,
                userAgent: req.get('user-agent'),
            },
        });
        // Send verification email with 6-digit code
        let emailSent = false;
        try {
            const emailResult = await email_service_1.emailService.sendVerificationEmail(user.id, user.email, user.firstName);
            emailSent = emailResult.success;
            if (!emailResult.success) {
                console.warn('Failed to send verification email:', emailResult.error);
            }
        }
        catch (emailError) {
            console.error('Error sending verification email:', emailError);
        }
        // Return response indicating verification is required (NOT "registration successful")
        res.status(201).json({
            success: true,
            message: emailSent
                ? 'A 6-digit verification code has been sent to your email. Please verify to complete registration.'
                : 'Account created but email could not be sent. Please contact support.',
            data: {
                user: {
                    id: user.id,
                    email: user.email,
                    firstName: user.firstName,
                    lastName: user.lastName,
                    fullName: [user.firstName, user.middleName, user.lastName].filter(Boolean).join(' '),
                    verificationStatus: user.verificationStatus,
                    approvalStatus: user.approvalStatus,
                    institute: user.institute,
                    department: user.department,
                    userType: user.userType,
                },
                emailSent,
                requiresVerification: true,
                registrationComplete: false, // Registration is NOT complete until email verified
            },
        });
    }
    catch (error) {
        console.error('Register error:', error);
        res.status(500).json({
            success: false,
            message: 'Registration failed',
            error: error instanceof Error ? error.message : 'Unknown error'
        });
    }
};
exports.register = register;
const login = async (req, res) => {
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
        const isPasswordValid = await (0, password_1.comparePassword)(password, user.passwordHash);
        if (!isPasswordValid) {
            return res.status(401).json({
                success: false,
                message: 'Invalid credentials',
            });
        }
        // Generate token with userType (role)
        const token = (0, jwt_1.generateToken)({
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
    }
    catch (error) {
        console.error('Login error:', error);
        res.status(500).json({
            success: false,
            message: 'Login failed',
        });
    }
};
exports.login = login;
const logout = async (req, res) => {
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
    }
    catch (error) {
        console.error('Logout error:', error);
        res.status(500).json({
            success: false,
            message: 'Logout failed',
        });
    }
};
exports.logout = logout;
const getCurrentUser = async (req, res) => {
    try {
        const user = await prisma.user.findUnique({
            where: { id: req.user.userId },
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
    }
    catch (error) {
        console.error('Get current user error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to get user',
        });
    }
};
exports.getCurrentUser = getCurrentUser;
const updateProfile = async (req, res) => {
    try {
        const userId = req.user.userId;
        const { fullName, firstName, lastName, phoneNumber, hospital, department } = req.body;
        // Validate at least one field
        if (!fullName && !firstName && !lastName && phoneNumber === undefined && hospital === undefined && department === undefined) {
            return res.status(400).json({
                success: false,
                message: 'At least one field is required to update',
            });
        }
        // Build update data
        const updateData = {};
        if (fullName) {
            updateData.fullName = fullName;
            // Also update firstName and lastName from fullName if not provided separately
            if (!firstName && !lastName) {
                const nameParts = fullName.trim().split(' ');
                updateData.firstName = nameParts[0];
                updateData.lastName = nameParts.length > 1 ? nameParts.slice(1).join(' ') : '';
            }
        }
        if (firstName)
            updateData.firstName = firstName;
        if (lastName)
            updateData.lastName = lastName;
        if (phoneNumber !== undefined)
            updateData.phoneNumber = phoneNumber || null;
        if (hospital !== undefined)
            updateData.hospital = hospital || null;
        if (department !== undefined)
            updateData.department = department || null;
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
    }
    catch (error) {
        console.error('Update profile error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to update profile',
        });
    }
};
exports.updateProfile = updateProfile;
const changePassword = async (req, res) => {
    try {
        const userId = req.user.userId;
        const { currentPassword, newPassword } = req.body;
        if (!currentPassword || !newPassword) {
            return res.status(400).json({
                success: false,
                message: 'Current password and new password are required',
            });
        }
        // Validate new password strength
        if (!(0, password_1.validatePassword)(newPassword)) {
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
        const isValid = await (0, password_1.comparePassword)(currentPassword, user.passwordHash);
        if (!isValid) {
            return res.status(401).json({
                success: false,
                message: 'Current password is incorrect',
            });
        }
        // Hash new password and update
        const newPasswordHash = await (0, password_1.hashPassword)(newPassword);
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
    }
    catch (error) {
        console.error('Change password error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to change password',
        });
    }
};
exports.changePassword = changePassword;
/**
 * Get pending users (admin only)
 */
const getPendingUsers = async (req, res) => {
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
    }
    catch (error) {
        console.error('Get pending users error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to get pending users',
        });
    }
};
exports.getPendingUsers = getPendingUsers;
/**
 * Approve or reject user (admin only)
 */
const approveUser = async (req, res) => {
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
                approvedBy: approved ? req.user.userId : null,
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
                userId: req.user.userId,
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
    }
    catch (error) {
        console.error('Approve user error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to update user approval status',
        });
    }
};
exports.approveUser = approveUser;
// ============================================================================
// EMAIL VERIFICATION ENDPOINTS
// ============================================================================
/**
 * Verify email with token (public endpoint)
 */
const verifyEmail = async (req, res) => {
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
                message: 'Invalid verification code format',
            });
        }
        const result = await email_service_1.emailService.verifyEmailCode(email, code.toUpperCase());
        if (!result.success) {
            return res.status(400).json({
                success: false,
                message: result.error || 'Email verification failed',
            });
        }
        res.json({
            success: true,
            message: 'Registration successful! Email verified. Your account is now pending admin approval.',
            data: {
                verified: true,
                registrationComplete: true,
                pendingApproval: true
            }
        });
    }
    catch (error) {
        console.error('Verify email error:', error);
        res.status(500).json({
            success: false,
            message: 'Email verification failed',
        });
    }
};
exports.verifyEmail = verifyEmail;
/**
 * Resend verification email (public endpoint)
 */
const resendVerificationEmail = async (req, res) => {
    try {
        const { email } = req.body;
        if (!email) {
            return res.status(400).json({
                success: false,
                message: 'Email is required',
            });
        }
        const result = await email_service_1.emailService.resendVerificationEmail(email);
        // Always return success to prevent email enumeration
        res.json({
            success: true,
            message: 'If an account with that email exists and is not verified, a verification email has been sent.',
        });
    }
    catch (error) {
        console.error('Resend verification email error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to resend verification email',
        });
    }
};
exports.resendVerificationEmail = resendVerificationEmail;
/**
 * Request password reset (public endpoint)
 */
const requestPasswordReset = async (req, res) => {
    try {
        const { email } = req.body;
        if (!email) {
            return res.status(400).json({
                success: false,
                message: 'Email is required',
            });
        }
        await email_service_1.emailService.sendPasswordResetEmail(email);
        // Always return success to prevent email enumeration
        res.json({
            success: true,
            message: 'If an account with that email exists, a password reset email has been sent.',
        });
    }
    catch (error) {
        console.error('Request password reset error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to process password reset request',
        });
    }
};
exports.requestPasswordReset = requestPasswordReset;
