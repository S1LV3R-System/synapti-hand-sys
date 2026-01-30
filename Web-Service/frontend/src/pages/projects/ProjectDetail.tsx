import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Card } from '../../components/Card';
import { Button } from '../../components/Button';
import { LoadingSpinner } from '../../components/LoadingSpinner';
import { apiClient } from '../../services/api.service';
import { Modal, message } from 'antd';
import { ExclamationCircleOutlined, DeleteOutlined, EditOutlined, UserAddOutlined } from '@ant-design/icons';
import AddProjectMemberModal from '../../components/projects/AddProjectMemberModal';

const { confirm } = Modal;

interface Patient {
  id: string;
  patientId: string;
  patientName: string;
  gender?: string;
  dateOfBirth?: string;
  height?: number;
  weight?: number;
  _count: {
    recordings: number;
  };
  createdAt: string;
}

interface ProjectMember {
  id: string;
  email: string;
  firstName: string;
  middleName?: string;
  lastName: string;
  fullName?: string;
  userType: string;
}

interface Project {
  id: string;
  name: string;
  description?: string;
  isPublic: boolean;
  ownerId: string;
  owner: {
    id: string;
    fullName?: string;
    firstName: string;
    lastName: string;
  };
  members?: string[];
  projectMembers?: ProjectMember[];
  patients: Patient[];
  _count: {
    patients: number;
    recordings: number;
  };
}

export default function ProjectDetail() {
  const { id } = useParams<{ id: string }>();
  const [project, setProject] = useState<Project | null>(null);
  const [projectMembers, setProjectMembers] = useState<ProjectMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showCreatePatient, setShowCreatePatient] = useState(false);
  const [showEditProject, setShowEditProject] = useState(false);
  const [showAddMember, setShowAddMember] = useState(false);
  const [deletingPatientId, setDeletingPatientId] = useState<string | null>(null);
  const navigate = useNavigate();

  // Delete project handler
  const handleDeleteProject = () => {
    confirm({
      title: 'Delete Project',
      icon: <ExclamationCircleOutlined />,
      content: (
        <div>
          <p>Are you sure you want to delete this project?</p>
          <p className="text-red-600 mt-2">
            This will permanently delete the project and all associated patients and recordings.
          </p>
        </div>
      ),
      okText: 'Delete',
      okType: 'danger',
      cancelText: 'Cancel',
      onOk: async () => {
        try {
          await apiClient.delete(`/projects/${id}`);
          message.success('Project deleted successfully');
          navigate('/projects');
        } catch (err: any) {
          message.error(err.message || 'Failed to delete project');
        }
      },
    });
  };

  // Delete patient handler
  const handleDeletePatient = (patientId: string, patientName: string) => {
    confirm({
      title: 'Delete Patient',
      icon: <ExclamationCircleOutlined />,
      content: (
        <div>
          <p>Are you sure you want to delete patient "{patientName}"?</p>
          <p className="text-red-600 mt-2">
            This will permanently delete all recordings associated with this patient.
          </p>
        </div>
      ),
      okText: 'Delete',
      okType: 'danger',
      cancelText: 'Cancel',
      onOk: async () => {
        try {
          setDeletingPatientId(patientId);
          await apiClient.delete(`/patients/${patientId}`);
          message.success('Patient deleted successfully');
          fetchProject(); // Refresh the project data
        } catch (err: any) {
          message.error(err.message || 'Failed to delete patient');
        } finally {
          setDeletingPatientId(null);
        }
      },
    });
  };

  useEffect(() => {
    if (id) {
      fetchProject();
    }
  }, [id]);

  const fetchProject = async () => {
    try {
      setLoading(true);
      const response = await apiClient.get(`/projects/${id}`);
      // Interceptor already unwraps {success, data} - response.data is the project directly
      setProject(response.data);
      // Fetch project members if user is the owner
      if (response.data.ownerId) {
        fetchProjectMembers();
      }
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to load project');
    } finally {
      setLoading(false);
    }
  };

  const fetchProjectMembers = async () => {
    try {
      const response = await apiClient.get(`/projects/${id}/members`);
      setProjectMembers(response.data || []);
    } catch (err: any) {
      console.error('Failed to load project members:', err);
      // Don't show error - members section will just be empty
    }
  };

  const handleRemoveMember = (memberId: string, memberName: string) => {
    confirm({
      title: 'Remove Member',
      icon: <ExclamationCircleOutlined />,
      content: `Are you sure you want to remove ${memberName} from this project?`,
      okText: 'Remove',
      okType: 'danger',
      cancelText: 'Cancel',
      onOk: async () => {
        try {
          await apiClient.delete(`/projects/${id}/members/${memberId}`);
          message.success('Member removed successfully');
          fetchProjectMembers(); // Refresh members list
        } catch (err: any) {
          message.error(err.message || 'Failed to remove member');
        }
      },
    });
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center min-h-screen">
        <LoadingSpinner />
      </div>
    );
  }

  if (error || !project) {
    return (
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded">
          {error || 'Project not found'}
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {/* Project Header */}
      <div className="mb-6">
        <div className="flex items-center mb-2">
          <button
            onClick={() => navigate('/projects')}
            className="text-blue-600 hover:text-blue-700 mr-3"
          >
            ← Back to Projects
          </button>
        </div>
        <div className="flex justify-between items-start">
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-3xl font-bold text-gray-900">{project.name}</h1>
              {project.isPublic && (
                <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                  Public
                </span>
              )}
            </div>
            {project.description && (
              <p className="text-gray-600 mt-2">{project.description}</p>
            )}
            <p className="text-sm text-gray-500 mt-1">
              Owner: {project.owner.fullName || `${project.owner.firstName} ${project.owner.lastName}`}
            </p>
          </div>
          <div className="flex gap-3">
            <Button onClick={() => setShowCreatePatient(true)}>
              Add Patient
            </Button>
            <Button
              variant="outline"
              onClick={() => setShowEditProject(true)}
            >
              <EditOutlined className="mr-1" /> Edit Project
            </Button>
            <Button
              variant="outline"
              onClick={handleDeleteProject}
              className="text-red-600 border-red-600 hover:bg-red-50"
            >
              <DeleteOutlined className="mr-1" /> Delete Project
            </Button>
          </div>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
        <Card>
          <div className="p-4">
            <div className="text-2xl font-bold text-gray-900">
              {project._count.patients}
            </div>
            <div className="text-sm text-gray-600">Total Patients</div>
          </div>
        </Card>
        <Card>
          <div className="p-4">
            <div className="text-2xl font-bold text-gray-900">
              {project._count.recordings}
            </div>
            <div className="text-sm text-gray-600">Total Recordings</div>
          </div>
        </Card>
      </div>

      {/* Project Members */}
      <Card className="mb-6">
        <div className="p-6">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-xl font-semibold text-gray-900">Project Members</h2>
            <Button onClick={() => setShowAddMember(true)}>
              <UserAddOutlined className="mr-1" /> Add Member
            </Button>
          </div>

          {projectMembers.length === 0 ? (
            <div className="text-center py-8">
              <p className="text-gray-500 text-sm">
                No members added yet. Add members to collaborate on this project.
              </p>
            </div>
          ) : (
            <div className="divide-y divide-gray-200">
              {projectMembers.map((member) => (
                <div key={member.id} className="py-3 flex items-center justify-between">
                  <div>
                    <div className="font-medium text-gray-900">
                      {member.fullName || `${member.firstName} ${member.lastName}`}
                    </div>
                    <div className="text-sm text-gray-500">{member.email}</div>
                    <div className="text-xs text-gray-400 mt-1">{member.userType}</div>
                  </div>
                  <button
                    onClick={() =>
                      handleRemoveMember(
                        member.id,
                        member.fullName || `${member.firstName} ${member.lastName}`
                      )
                    }
                    className="text-red-600 hover:text-red-900 text-sm"
                  >
                    Remove
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </Card>

      {/* Patients List */}
      <Card>
        <div className="p-6">
          <h2 className="text-xl font-semibold text-gray-900 mb-4">Patients</h2>

          {project.patients.length === 0 ? (
            <div className="text-center py-12">
              <svg
                className="mx-auto h-12 w-12 text-gray-400"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z"
                />
              </svg>
              <h3 className="mt-2 text-sm font-medium text-gray-900">No patients</h3>
              <p className="mt-1 text-sm text-gray-500">
                Get started by adding a patient to this project.
              </p>
              <div className="mt-6">
                <Button onClick={() => setShowCreatePatient(true)}>
                  Add Patient
                </Button>
              </div>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Patient ID
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Name
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Gender
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Height (cm)
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Weight (kg)
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Recordings
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {project.patients.map((patient) => (
                    <tr key={patient.id} className="hover:bg-gray-50">
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                        {patient.patientId}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        {patient.patientName}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {patient.gender || '-'}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {patient.height || '-'}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {patient.weight || '-'}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {patient._count.recordings}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        <div className="flex items-center gap-3">
                          <button
                            onClick={() => navigate(`/patients/${patient.id}`)}
                            className="text-blue-600 hover:text-blue-900"
                          >
                            View
                          </button>
                          <button
                            onClick={() => handleDeletePatient(patient.id, patient.patientName)}
                            className="text-red-600 hover:text-red-900"
                            disabled={deletingPatientId === patient.id}
                          >
                            {deletingPatientId === patient.id ? 'Deleting...' : 'Delete'}
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </Card>

      {/* Create Patient Modal */}
      {showCreatePatient && (
        <CreatePatientModal
          projectId={project.id}
          onClose={() => setShowCreatePatient(false)}
          onSuccess={() => {
            setShowCreatePatient(false);
            fetchProject();
          }}
        />
      )}

      {/* Edit Project Modal */}
      {showEditProject && (
        <EditProjectModal
          project={project}
          onClose={() => setShowEditProject(false)}
          onSuccess={() => {
            setShowEditProject(false);
            fetchProject();
          }}
        />
      )}

      {/* Add Project Member Modal */}
      {showAddMember && (
        <AddProjectMemberModal
          projectId={project.id}
          onClose={() => setShowAddMember(false)}
          onSuccess={() => {
            setShowAddMember(false);
            fetchProjectMembers();
          }}
        />
      )}
    </div>
  );
}

// Create Patient Modal Component
function CreatePatientModal({
  projectId,
  onClose,
  onSuccess,
}: {
  projectId: string;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [formData, setFormData] = useState({
    patientId: '',
    firstName: '',
    middleName: '',
    lastName: '',
    gender: '',
    dateOfBirth: '',
    height: '',
    weight: '',
    diagnosis: '',
  });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>
  ) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!formData.patientId || !formData.firstName || !formData.lastName) {
      setError('Patient ID, first name, and last name are required');
      return;
    }

    if (!formData.gender || !formData.dateOfBirth || !formData.height || !formData.weight) {
      setError('Gender, date of birth, height, and weight are required');
      return;
    }

    try {
      setLoading(true);
      await apiClient.post(`/patients/project/${projectId}`, {
        patientId: formData.patientId,
        firstName: formData.firstName,
        middleName: formData.middleName || undefined,
        lastName: formData.lastName,
        gender: formData.gender || undefined,
        birthDate: formData.dateOfBirth,
        height: parseFloat(formData.height),
        weight: parseFloat(formData.weight),
        diagnosis: formData.diagnosis || 'Healthy',
      });
      onSuccess();
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to create patient');
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-gray-500 bg-opacity-75 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-lg max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        <div className="p-6">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-xl font-semibold text-gray-900">Add New Patient</h2>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-gray-600"
            >
              <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            {error && (
              <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded">
                {error}
              </div>
            )}

            {/* Row 1: Patient ID */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Patient ID *
              </label>
              <input
                type="text"
                name="patientId"
                required
                className="appearance-none block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                placeholder="e.g., P001"
                value={formData.patientId}
                onChange={handleChange}
              />
            </div>

            {/* Row 2: First Name, Middle Name, Last Name */}
            <div className="grid grid-cols-3 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  First Name *
                </label>
                <input
                  type="text"
                  name="firstName"
                  required
                  className="appearance-none block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                  placeholder="First name"
                  value={formData.firstName}
                  onChange={handleChange}
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Middle Name
                </label>
                <input
                  type="text"
                  name="middleName"
                  className="appearance-none block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                  placeholder="Middle name"
                  value={formData.middleName}
                  onChange={handleChange}
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Last Name *
                </label>
                <input
                  type="text"
                  name="lastName"
                  required
                  className="appearance-none block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                  placeholder="Last name"
                  value={formData.lastName}
                  onChange={handleChange}
                />
              </div>
            </div>

            {/* Row 3: Gender, Date of Birth */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Gender *
                </label>
                <select
                  name="gender"
                  required
                  className="appearance-none block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                  value={formData.gender}
                  onChange={handleChange}
                >
                  <option value="">Select gender</option>
                  <option value="male">Male</option>
                  <option value="female">Female</option>
                  <option value="other">Other</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Date of Birth *
                </label>
                <input
                  type="date"
                  name="dateOfBirth"
                  required
                  className="appearance-none block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                  value={formData.dateOfBirth}
                  onChange={handleChange}
                />
              </div>
            </div>

            {/* Row 4: Height, Weight */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Height (cm) *
                </label>
                <input
                  type="number"
                  name="height"
                  required
                  step="0.1"
                  className="appearance-none block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                  placeholder="e.g., 170.5"
                  value={formData.height}
                  onChange={handleChange}
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Weight (kg) *
                </label>
                <input
                  type="number"
                  name="weight"
                  required
                  step="0.1"
                  className="appearance-none block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                  placeholder="e.g., 70.5"
                  value={formData.weight}
                  onChange={handleChange}
                />
              </div>
            </div>

            {/* Row 5: Diagnosis */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Diagnosis
              </label>
              <input
                type="text"
                name="diagnosis"
                className="appearance-none block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                placeholder="e.g., Parkinson's Disease, Healthy"
                value={formData.diagnosis}
                onChange={handleChange}
              />
            </div>

            <div className="flex justify-end space-x-3 pt-4">
              <Button type="button" variant="outline" onClick={onClose}>
                Cancel
              </Button>
              <Button type="submit" isLoading={loading} disabled={loading}>
                {loading ? 'Adding...' : 'Add Patient'}
              </Button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}

// Edit Project Modal Component
function EditProjectModal({
  project,
  onClose,
  onSuccess,
}: {
  project: Project;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [formData, setFormData] = useState({
    name: project.name,
    description: project.description || '',
    isPublic: project.isPublic,
  });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>
  ) => {
    const { name, value, type } = e.target;
    setFormData({
      ...formData,
      [name]: type === 'checkbox' ? (e.target as HTMLInputElement).checked : value,
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!formData.name) {
      setError('Project name is required');
      return;
    }

    try {
      setLoading(true);
      await apiClient.put(`/projects/${project.id}`, {
        name: formData.name,
        description: formData.description || null,
        isPublic: formData.isPublic,
      });
      message.success('Project updated successfully');
      onSuccess();
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to update project');
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-gray-500 bg-opacity-75 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-lg max-w-md w-full">
        <div className="p-6">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-xl font-semibold text-gray-900">Edit Project</h2>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-gray-600"
            >
              <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            {error && (
              <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded">
                {error}
              </div>
            )}

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Project Name *
              </label>
              <input
                type="text"
                name="name"
                required
                className="appearance-none block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                value={formData.name}
                onChange={handleChange}
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Description
              </label>
              <textarea
                name="description"
                rows={3}
                className="appearance-none block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                placeholder="Project description..."
                value={formData.description}
                onChange={handleChange}
              />
            </div>

            <div className="flex items-center">
              <input
                type="checkbox"
                name="isPublic"
                id="isPublic"
                className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                checked={formData.isPublic}
                onChange={handleChange}
              />
              <label htmlFor="isPublic" className="ml-2 block text-sm text-gray-900">
                Make this project public (visible to all users)
              </label>
            </div>

            <div className="flex justify-end space-x-3 pt-4">
              <Button type="button" variant="outline" onClick={onClose}>
                Cancel
              </Button>
              <Button type="submit" isLoading={loading} disabled={loading}>
                {loading ? 'Saving...' : 'Save Changes'}
              </Button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
