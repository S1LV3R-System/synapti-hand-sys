"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const project_controller_1 = require("../controllers/project.controller");
const auth_middleware_1 = require("../middleware/auth.middleware");
const rbac_middleware_1 = require("../middleware/rbac.middleware");
const router = (0, express_1.Router)();
// All routes require authentication
router.use(auth_middleware_1.authMiddleware);
// Project CRUD
router.get('/', project_controller_1.getProjects);
router.post('/', project_controller_1.createProject);
router.get('/:id', project_controller_1.getProjectById);
router.put('/:id', project_controller_1.updateProject);
router.delete('/:id', rbac_middleware_1.canDeleteProject, project_controller_1.deleteProject);
// Project members
router.post('/:id/members', project_controller_1.addProjectMember);
router.delete('/:id/members/:memberId', project_controller_1.removeProjectMember);
exports.default = router;
