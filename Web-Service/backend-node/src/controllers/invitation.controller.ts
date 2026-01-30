import { Response } from 'express';
import prisma from '../lib/prisma';
import { AuthRequest } from '../middleware/auth.middleware';


/**
 * Send a project invitation by email
 */
export async function sendInvitation(req: AuthRequest, res: Response) {
  try {
    const userId = req.user!.userId;
    const { projectId } = req.params;
    const { email, role = 'member' } = req.body;

    // Check if project exists and user has access
    const project = await prisma.project.findFirst({
      where: {
        id: projectId,
        deletedAt: null,
        OR: [
          { ownerId: userId },
          { members: { some: { userId, role: { in: ['owner', 'admin'] } } } }
        ]
      }
    });

    if (!project) {
      return res.status(404).json({
        success: false,
        message: 'Project not found or you do not have permission to invite'
      });
    }

    // Check if email is already invited
    const existingInvitation = await prisma.projectInvitation.findFirst({
      where: {
        projectId,
        invitedEmail: email.toLowerCase(),
        status: 'pending'
      }
    });

    if (existingInvitation) {
      return res.status(400).json({
        success: false,
        message: 'An invitation is already pending for this email'
      });
    }

    // Check if user is already a member
    const existingUser = await prisma.user.findUnique({
      where: { email: email.toLowerCase() }
    });

    if (existingUser) {
      const existingMember = await prisma.projectMember.findFirst({
        where: {
          projectId,
          userId: existingUser.id
        }
      });

      if (existingMember || project.ownerId === existingUser.id) {
        return res.status(400).json({
          success: false,
          message: 'This user is already a member of the project'
        });
      }
    }

    // Create invitation (expires in 7 days)
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7);

    const invitation = await prisma.projectInvitation.create({
      data: {
        projectId,
        invitedEmail: email.toLowerCase(),
        invitedById: userId,
        role,
        expiresAt
      },
      include: {
        project: { select: { name: true } },
        invitedBy: { select: { fullName: true, email: true } }
      }
    });

    // TODO: Send email notification (implement email service)
    // For now, the invitation is stored and can be seen in pending invitations

    // Create audit log
    await prisma.auditLog.create({
      data: {
        userId,
        action: 'project.invite',
        resource: 'project_invitations',
        resourceId: invitation.id,
        details: JSON.stringify({
          projectId,
          invitedEmail: email,
          role
        })
      }
    });

    return res.status(201).json({
      success: true,
      message: `Invitation sent to ${email}`,
      data: {
        id: invitation.id,
        email: invitation.invitedEmail,
        role: invitation.role,
        status: invitation.status,
        expiresAt: invitation.expiresAt,
        project: invitation.project
      }
    });
  } catch (error) {
    console.error('Send invitation error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to send invitation'
    });
  }
}

/**
 * Get pending invitations for the current user
 */
export async function getMyInvitations(req: AuthRequest, res: Response) {
  try {
    const userEmail = req.user!.email;

    const invitations = await prisma.projectInvitation.findMany({
      where: {
        invitedEmail: userEmail.toLowerCase(),
        status: 'pending',
        expiresAt: { gt: new Date() }
      },
      include: {
        project: { select: { id: true, name: true, description: true } },
        invitedBy: { select: { fullName: true, email: true } }
      },
      orderBy: { createdAt: 'desc' }
    });

    return res.json({
      success: true,
      data: invitations.map(inv => ({
        id: inv.id,
        role: inv.role,
        createdAt: inv.createdAt,
        expiresAt: inv.expiresAt,
        project: inv.project,
        invitedBy: inv.invitedBy
      }))
    });
  } catch (error) {
    console.error('Get my invitations error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to get invitations'
    });
  }
}

/**
 * Accept a project invitation
 */
export async function acceptInvitation(req: AuthRequest, res: Response) {
  try {
    const userId = req.user!.userId;
    const userEmail = req.user!.email;
    const { invitationId } = req.params;

    // Find the invitation
    const invitation = await prisma.projectInvitation.findFirst({
      where: {
        id: invitationId,
        invitedEmail: userEmail.toLowerCase(),
        status: 'pending',
        expiresAt: { gt: new Date() }
      },
      include: {
        project: { select: { name: true } }
      }
    });

    if (!invitation) {
      return res.status(404).json({
        success: false,
        message: 'Invitation not found, expired, or already processed'
      });
    }

    // Add user to project members
    await prisma.projectMember.create({
      data: {
        projectId: invitation.projectId,
        userId,
        role: invitation.role
      }
    });

    // Update invitation status
    await prisma.projectInvitation.update({
      where: { id: invitationId },
      data: {
        status: 'accepted',
        acceptedAt: new Date()
      }
    });

    // Create audit log
    await prisma.auditLog.create({
      data: {
        userId,
        action: 'project.join',
        resource: 'project_members',
        resourceId: invitation.projectId,
        details: JSON.stringify({
          invitationId,
          projectId: invitation.projectId,
          role: invitation.role
        })
      }
    });

    return res.json({
      success: true,
      message: `You have joined the project "${invitation.project.name}"`,
      data: {
        projectId: invitation.projectId,
        projectName: invitation.project.name,
        role: invitation.role
      }
    });
  } catch (error) {
    console.error('Accept invitation error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to accept invitation'
    });
  }
}

/**
 * Reject a project invitation
 */
export async function rejectInvitation(req: AuthRequest, res: Response) {
  try {
    const userEmail = req.user!.email;
    const { invitationId } = req.params;

    // Find and update the invitation
    const invitation = await prisma.projectInvitation.findFirst({
      where: {
        id: invitationId,
        invitedEmail: userEmail.toLowerCase(),
        status: 'pending'
      }
    });

    if (!invitation) {
      return res.status(404).json({
        success: false,
        message: 'Invitation not found or already processed'
      });
    }

    await prisma.projectInvitation.update({
      where: { id: invitationId },
      data: { status: 'rejected' }
    });

    return res.json({
      success: true,
      message: 'Invitation rejected'
    });
  } catch (error) {
    console.error('Reject invitation error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to reject invitation'
    });
  }
}

/**
 * Get project invitations (sent by the project owner/admin)
 */
export async function getProjectInvitations(req: AuthRequest, res: Response) {
  try {
    const userId = req.user!.userId;
    const { projectId } = req.params;

    // Check access
    const project = await prisma.project.findFirst({
      where: {
        id: projectId,
        deletedAt: null,
        OR: [
          { ownerId: userId },
          { members: { some: { userId, role: { in: ['owner', 'admin'] } } } }
        ]
      }
    });

    if (!project) {
      return res.status(404).json({
        success: false,
        message: 'Project not found or access denied'
      });
    }

    const invitations = await prisma.projectInvitation.findMany({
      where: { projectId },
      include: {
        invitedBy: { select: { fullName: true, email: true } }
      },
      orderBy: { createdAt: 'desc' }
    });

    return res.json({
      success: true,
      data: invitations.map(inv => ({
        id: inv.id,
        email: inv.invitedEmail,
        role: inv.role,
        status: inv.status,
        createdAt: inv.createdAt,
        expiresAt: inv.expiresAt,
        acceptedAt: inv.acceptedAt,
        invitedBy: inv.invitedBy
      }))
    });
  } catch (error) {
    console.error('Get project invitations error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to get project invitations'
    });
  }
}

/**
 * Cancel a pending invitation
 */
export async function cancelInvitation(req: AuthRequest, res: Response) {
  try {
    const userId = req.user!.userId;
    const { invitationId } = req.params;

    // Find invitation and check ownership
    const invitation = await prisma.projectInvitation.findFirst({
      where: {
        id: invitationId,
        status: 'pending'
      },
      include: {
        project: true
      }
    });

    if (!invitation) {
      return res.status(404).json({
        success: false,
        message: 'Invitation not found or already processed'
      });
    }

    // Check if user can cancel (owner or original inviter)
    const canCancel = invitation.invitedById === userId || invitation.project.ownerId === userId;
    if (!canCancel) {
      return res.status(403).json({
        success: false,
        message: 'You do not have permission to cancel this invitation'
      });
    }

    await prisma.projectInvitation.delete({
      where: { id: invitationId }
    });

    return res.json({
      success: true,
      message: 'Invitation cancelled'
    });
  } catch (error) {
    console.error('Cancel invitation error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to cancel invitation'
    });
  }
}
