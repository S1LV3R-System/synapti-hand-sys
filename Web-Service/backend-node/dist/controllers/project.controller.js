"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getProjectMembers = exports.removeProjectMember = exports.addProjectMember = exports.deleteProject = exports.updateProject = exports.createProject = exports.getProjectById = exports.getProjects = void 0;
const client_1 = require("@prisma/client");
const schema_compat_1 = require("../utils/schema-compat");
const basePrisma = new client_1.PrismaClient();
const prisma = (0, schema_compat_1.extendPrismaWithStubs)(basePrisma);
/**
 * Get all projects for the authenticated user
 * Returns projects owned by user or where user is in projectMembers array
 * Updated for new schema: projectCreatorId, projectMembers array, projectName
 */
const getProjects = async (req, res) => {
    try {
        const userId = req.user.userId;
        const projects = await prisma.project.findMany({
            where: {
                OR: [
                    { projectCreatorId: userId },
                    { projectMembers: { has: userId } }
                ],
                deletedAt: null
            },
            include: {
                projectCreator: {
                    select: {
                        id: true,
                        email: true,
                        firstName: true,
                        middleName: true,
                        lastName: true,
                    },
                },
                _count: {
                    select: {
                        patients: {
                            where: { deletedAt: null }
                        }
                    },
                },
            },
            orderBy: {
                createdAt: 'desc',
            },
        });
        // Transform for backward compatibility
        const transformedProjects = projects.map(p => ({
            ...p,
            name: p.projectName,
            description: p.projectDescription,
            owner: p.projectCreator,
            ownerId: p.projectCreatorId,
            members: p.projectMembers,
            patientsCount: p._count.patients,
        }));
        res.json({
            success: true,
            data: transformedProjects,
        });
    }
    catch (error) {
        console.error('Get projects error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch projects',
        });
    }
};
exports.getProjects = getProjects;
/**
 * Get a single project by ID
 * Users can access projects they created or are members of
 */
const getProjectById = async (req, res) => {
    try {
        const { id } = req.params;
        const userId = req.user.userId;
        const project = await prisma.project.findFirst({
            where: {
                id,
                OR: [
                    { projectCreatorId: userId },
                    { projectMembers: { has: userId } }
                ],
                deletedAt: null
            },
            include: {
                projectCreator: {
                    select: {
                        id: true,
                        email: true,
                        firstName: true,
                        middleName: true,
                        lastName: true,
                    },
                },
                patients: {
                    where: { deletedAt: null },
                    orderBy: { createdAt: 'desc' },
                    include: {
                        _count: {
                            select: {
                                sessions: {
                                    where: { deletedAt: null }
                                },
                            },
                        },
                    },
                },
                _count: {
                    select: {
                        patients: {
                            where: { deletedAt: null }
                        }
                    },
                },
            },
        });
        if (!project) {
            return res.status(404).json({
                success: false,
                message: 'Project not found or access denied',
            });
        }
        // Transform patients for backward compatibility
        const transformedPatients = project.patients.map(p => ({
            ...p,
            patientName: [p.firstName, p.middleName, p.lastName].filter(Boolean).join(' '),
            dateOfBirth: p.birthDate,
            recordingsCount: p._count.sessions,
        }));
        // Transform project for backward compatibility
        const transformedProject = {
            ...project,
            name: project.projectName,
            description: project.projectDescription,
            owner: project.projectCreator,
            ownerId: project.projectCreatorId,
            members: project.projectMembers,
            patients: transformedPatients,
            patientsCount: project._count.patients,
        };
        res.json({
            success: true,
            data: transformedProject,
        });
    }
    catch (error) {
        console.error('Get project by ID error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch project',
        });
    }
};
exports.getProjectById = getProjectById;
/**
 * Create a new project
 * New schema: projectName, projectDescription, projectDataPath
 */
const createProject = async (req, res) => {
    try {
        const { name, projectName, description, projectDescription } = req.body;
        const userId = req.user.userId;
        // Handle both old and new field names
        const finalName = projectName || name;
        const finalDescription = projectDescription || description;
        if (!finalName) {
            return res.status(400).json({
                success: false,
                message: 'Project name is required',
            });
        }
        const project = await prisma.project.create({
            data: {
                projectName: finalName,
                projectDescription: finalDescription || null,
                projectCreatorId: userId,
                projectMembers: [],
                projectDataPath: {
                    base_path: '',
                    exports_path: ''
                },
            },
            include: {
                projectCreator: {
                    select: {
                        id: true,
                        email: true,
                        firstName: true,
                        middleName: true,
                        lastName: true,
                    },
                },
            },
        });
        // Create audit log
        await prisma.auditLog.create({
            data: {
                userId,
                action: 'project.create',
                resource: 'projects',
                resourceId: project.id,
                details: JSON.stringify({ name: project.projectName }),
                ipAddress: req.ip,
                userAgent: req.get('user-agent'),
            },
        });
        // Transform for backward compatibility
        const transformedProject = {
            ...project,
            name: project.projectName,
            description: project.projectDescription,
            owner: project.projectCreator,
            ownerId: project.projectCreatorId,
            members: project.projectMembers,
        };
        res.status(201).json({
            success: true,
            message: 'Project created successfully',
            data: transformedProject,
        });
    }
    catch (error) {
        console.error('Create project error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to create project',
        });
    }
};
exports.createProject = createProject;
/**
 * Update a project
 */
const updateProject = async (req, res) => {
    try {
        const { id } = req.params;
        const { name, projectName, description, projectDescription, projectDataPath } = req.body;
        const userId = req.user.userId;
        // Check if user is the creator
        const existingProject = await prisma.project.findFirst({
            where: {
                id,
                projectCreatorId: userId,
                deletedAt: null,
            },
        });
        if (!existingProject) {
            return res.status(404).json({
                success: false,
                message: 'Project not found or you do not have permission to update it',
            });
        }
        const project = await prisma.project.update({
            where: { id },
            data: {
                ...((name || projectName) && { projectName: projectName || name }),
                ...((description !== undefined || projectDescription !== undefined) && {
                    projectDescription: projectDescription !== undefined ? projectDescription : description
                }),
                ...(projectDataPath && { projectDataPath }),
            },
            include: {
                projectCreator: {
                    select: {
                        id: true,
                        email: true,
                        firstName: true,
                        middleName: true,
                        lastName: true,
                    },
                },
            },
        });
        // Create audit log
        await prisma.auditLog.create({
            data: {
                userId,
                action: 'project.update',
                resource: 'projects',
                resourceId: project.id,
                details: JSON.stringify({ name: projectName || name, description: projectDescription || description }),
                ipAddress: req.ip,
                userAgent: req.get('user-agent'),
            },
        });
        // Transform for backward compatibility
        const transformedProject = {
            ...project,
            name: project.projectName,
            description: project.projectDescription,
            owner: project.projectCreator,
            ownerId: project.projectCreatorId,
            members: project.projectMembers,
        };
        res.json({
            success: true,
            message: 'Project updated successfully',
            data: transformedProject,
        });
    }
    catch (error) {
        console.error('Update project error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to update project',
        });
    }
};
exports.updateProject = updateProject;
/**
 * Delete a project (soft delete)
 * The project will be permanently deleted after 15 days by the cleanup job.
 */
const deleteProject = async (req, res) => {
    try {
        const { id } = req.params;
        const userId = req.user.userId;
        // Check if project exists and user is creator
        const existingProject = await prisma.project.findFirst({
            where: {
                id,
                projectCreatorId: userId,
                deletedAt: null,
            },
        });
        if (!existingProject) {
            return res.status(404).json({
                success: false,
                message: 'Project not found or you do not have permission to delete it',
            });
        }
        // Soft delete the project
        const deletedProject = await prisma.project.update({
            where: { id },
            data: { deletedAt: new Date() },
        });
        // Create audit log
        await prisma.auditLog.create({
            data: {
                userId,
                action: 'project.delete',
                resource: 'projects',
                resourceId: id,
                details: JSON.stringify({
                    name: existingProject.projectName,
                    softDelete: true,
                    permanentDeletionDate: new Date(Date.now() + 15 * 24 * 60 * 60 * 1000).toISOString()
                }),
                ipAddress: req.ip,
                userAgent: req.get('user-agent'),
            },
        });
        res.json({
            success: true,
            message: 'Project deleted successfully. It will be permanently removed after 15 days.',
            data: {
                id: deletedProject.id,
                deletedAt: deletedProject.deletedAt,
                permanentDeletionDate: new Date(Date.now() + 15 * 24 * 60 * 60 * 1000).toISOString()
            }
        });
    }
    catch (error) {
        console.error('Delete project error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to delete project',
        });
    }
};
exports.deleteProject = deleteProject;
/**
 * Add a member to a project
 * New schema: members stored as UUID array in projectMembers
 */
const addProjectMember = async (req, res) => {
    try {
        const { id } = req.params;
        const { userId: memberUserId } = req.body;
        const userId = req.user.userId;
        if (!memberUserId) {
            return res.status(400).json({
                success: false,
                message: 'User ID is required',
            });
        }
        // Check if user is the creator
        const project = await prisma.project.findFirst({
            where: {
                id,
                projectCreatorId: userId,
                deletedAt: null,
            },
        });
        if (!project) {
            return res.status(404).json({
                success: false,
                message: 'Project not found or you do not have permission to add members',
            });
        }
        // Check if user exists
        const memberUser = await prisma.user.findUnique({
            where: { id: memberUserId },
        });
        if (!memberUser) {
            return res.status(404).json({
                success: false,
                message: 'User not found',
            });
        }
        // Check if already a member
        if (project.projectMembers.includes(memberUserId)) {
            return res.status(400).json({
                success: false,
                message: 'User is already a member of this project',
            });
        }
        // Add member to array
        const updatedProject = await prisma.project.update({
            where: { id },
            data: {
                projectMembers: {
                    push: memberUserId
                }
            },
            include: {
                projectCreator: {
                    select: {
                        id: true,
                        email: true,
                        firstName: true,
                        middleName: true,
                        lastName: true,
                    },
                },
            },
        });
        // Create audit log
        await prisma.auditLog.create({
            data: {
                userId,
                action: 'project.add_member',
                resource: 'projects',
                resourceId: id,
                details: JSON.stringify({ memberUserId }),
                ipAddress: req.ip,
                userAgent: req.get('user-agent'),
            },
        });
        res.status(201).json({
            success: true,
            message: 'Member added successfully',
            data: {
                projectId: updatedProject.id,
                members: updatedProject.projectMembers,
                addedMember: {
                    id: memberUser.id,
                    email: memberUser.email,
                    firstName: memberUser.firstName,
                    lastName: memberUser.lastName,
                }
            },
        });
    }
    catch (error) {
        console.error('Add project member error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to add member',
        });
    }
};
exports.addProjectMember = addProjectMember;
/**
 * Remove a member from a project
 * New schema: members stored as UUID array
 */
const removeProjectMember = async (req, res) => {
    try {
        const { id, memberId } = req.params;
        const userId = req.user.userId;
        // Check if user is the creator
        const project = await prisma.project.findFirst({
            where: {
                id,
                projectCreatorId: userId,
                deletedAt: null,
            },
        });
        if (!project) {
            return res.status(404).json({
                success: false,
                message: 'Project not found or you do not have permission to remove members',
            });
        }
        // Check if member exists in array
        if (!project.projectMembers.includes(memberId)) {
            return res.status(404).json({
                success: false,
                message: 'Member not found in this project',
            });
        }
        // Remove member from array
        const updatedMembers = project.projectMembers.filter(m => m !== memberId);
        await prisma.project.update({
            where: { id },
            data: {
                projectMembers: updatedMembers
            },
        });
        // Create audit log
        await prisma.auditLog.create({
            data: {
                userId,
                action: 'project.remove_member',
                resource: 'projects',
                resourceId: id,
                details: JSON.stringify({ memberId }),
                ipAddress: req.ip,
                userAgent: req.get('user-agent'),
            },
        });
        res.json({
            success: true,
            message: 'Member removed successfully',
        });
    }
    catch (error) {
        console.error('Remove project member error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to remove member',
        });
    }
};
exports.removeProjectMember = removeProjectMember;
/**
 * Get project members
 * Returns list of users who are members of the project
 */
const getProjectMembers = async (req, res) => {
    try {
        const { id } = req.params;
        const userId = req.user.userId;
        // Get project with members
        const project = await prisma.project.findFirst({
            where: {
                id,
                OR: [
                    { projectCreatorId: userId },
                    { projectMembers: { has: userId } }
                ],
                deletedAt: null
            },
        });
        if (!project) {
            return res.status(404).json({
                success: false,
                message: 'Project not found or access denied',
            });
        }
        // Fetch member details
        const members = await prisma.user.findMany({
            where: {
                id: { in: project.projectMembers }
            },
            select: {
                id: true,
                email: true,
                firstName: true,
                middleName: true,
                lastName: true,
                userType: true,
            }
        });
        res.json({
            success: true,
            data: members,
        });
    }
    catch (error) {
        console.error('Get project members error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch members',
        });
    }
};
exports.getProjectMembers = getProjectMembers;
