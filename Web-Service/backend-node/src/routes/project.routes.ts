import { Router } from 'express';
import {
  getProjects,
  getProjectById,
  createProject,
  updateProject,
  deleteProject,
  addProjectMember,
  removeProjectMember,
  getProjectMembers,
} from '../controllers/project.controller';
import { authMiddleware } from '../middleware/auth.middleware';
import { canDeleteProject } from '../middleware/rbac.middleware';

const router = Router();

// All routes require authentication
router.use(authMiddleware);

// Project CRUD
router.get('/', getProjects);
router.post('/', createProject);
router.get('/:id', getProjectById);
router.put('/:id', updateProject);
router.delete('/:id', canDeleteProject, deleteProject);

// Project members
router.get('/:id/members', getProjectMembers);
router.post('/:id/members', addProjectMember);
router.delete('/:id/members/:memberId', removeProjectMember);

export default router;
