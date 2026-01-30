import { Response } from 'express';
import prisma from '../lib/prisma';
import { AuthRequest } from '../middleware/auth.middleware';
import { buildSoftDeleteFilter } from '../utils/validation';

/**
 * Search users by email
 * Returns limited user info for adding to projects
 * Accessible to all authenticated users
 *
 * @route GET /api/users/search?email=user@example.com
 */
export const searchUsersByEmail = async (req: AuthRequest, res: Response) => {
  try {
    const { email } = req.query;

    if (!email || typeof email !== 'string') {
      return res.status(400).json({
        success: false,
        message: 'Email parameter is required',
      });
    }

    // Only search verified and approved users
    const users = await prisma.user.findMany({
      where: {
        email: {
          contains: email.trim(),
          mode: 'insensitive',
        },
        verificationStatus: true,
        approvalStatus: true,
        ...buildSoftDeleteFilter(false),
      },
      select: {
        id: true,
        email: true,
        firstName: true,
        middleName: true,
        lastName: true,
        userType: true,
        institute: true,
      },
      take: 10, // Limit to 10 results
      orderBy: {
        email: 'asc',
      },
    });

    // Transform for frontend
    const transformedUsers = users.map(user => ({
      id: user.id,
      email: user.email,
      firstName: user.firstName,
      middleName: user.middleName,
      lastName: user.lastName,
      fullName: [user.firstName, user.middleName, user.lastName].filter(Boolean).join(' '),
      role: user.userType,
      institute: user.institute,
    }));

    res.json({
      success: true,
      data: transformedUsers,
    });
  } catch (error) {
    console.error('Search users by email error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to search users',
    });
  }
};

/**
 * Get user by ID (for verifying before adding to project)
 * Accessible to all authenticated users
 *
 * @route GET /api/users/:id
 */
export const getUserById = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;

    const user = await prisma.user.findFirst({
      where: {
        id,
        verificationStatus: true,
        approvalStatus: true,
        ...buildSoftDeleteFilter(false),
      },
      select: {
        id: true,
        email: true,
        firstName: true,
        middleName: true,
        lastName: true,
        userType: true,
        institute: true,
        department: true,
      },
    });

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found',
      });
    }

    // Transform for frontend
    const transformedUser = {
      id: user.id,
      email: user.email,
      firstName: user.firstName,
      middleName: user.middleName,
      lastName: user.lastName,
      fullName: [user.firstName, user.middleName, user.lastName].filter(Boolean).join(' '),
      role: user.userType,
      institute: user.institute,
      department: user.department,
    };

    res.json({
      success: true,
      data: transformedUser,
    });
  } catch (error) {
    console.error('Get user by ID error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch user',
    });
  }
};
