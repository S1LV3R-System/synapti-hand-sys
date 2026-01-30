"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const patient_controller_1 = require("../controllers/patient.controller");
const auth_middleware_1 = require("../middleware/auth.middleware");
const rbac_middleware_1 = require("../middleware/rbac.middleware");
const router = (0, express_1.Router)();
// All routes require authentication
router.use(auth_middleware_1.authMiddleware);
// Patient CRUD
router.get('/', patient_controller_1.getAllPatients); // Get all patients (must come before /:id)
router.get('/project/:projectId', patient_controller_1.getPatientsByProject);
router.post('/project/:projectId', patient_controller_1.createPatient);
router.get('/:id', patient_controller_1.getPatientById);
router.get('/:id/recordings', patient_controller_1.getPatientRecordings); // Get patient recordings
router.put('/:id', patient_controller_1.updatePatient);
router.delete('/:id', rbac_middleware_1.canDeletePatient, patient_controller_1.deletePatient);
exports.default = router;
