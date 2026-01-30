import { Router } from 'express';
import {
  getAllPatients,
  getPatientsByProject,
  getPatientById,
  createPatient,
  updatePatient,
  deletePatient,
  getPatientRecordings,
} from '../controllers/patient.controller';
import { authMiddleware } from '../middleware/auth.middleware';
import { canDeletePatient, canCreatePatient } from '../middleware/rbac.middleware';

const router = Router();

// All routes require authentication
router.use(authMiddleware);

// Patient CRUD
router.get('/', getAllPatients); // Get all patients (must come before /:id)
router.get('/project/:projectId', getPatientsByProject);
router.post('/project/:projectId', canCreatePatient, createPatient);
router.get('/:id', getPatientById);
router.get('/:id/recordings', getPatientRecordings); // Get patient recordings
router.put('/:id', updatePatient);
router.delete('/:id', canDeletePatient, deletePatient);

export default router;
