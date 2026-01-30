import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Card } from '../../components/Card';
import { Button } from '../../components/Button';
import { LoadingSpinner } from '../../components/LoadingSpinner';
import { apiClient } from '../../services/api.service';
import { Modal, message } from 'antd';
import { ExclamationCircleOutlined, DeleteOutlined } from '@ant-design/icons';

const { confirm } = Modal;

interface Project {
  id: string;
  name: string;
  description?: string;
  isPublic: boolean;
  owner: {
    id: string;
    fullName?: string;
    firstName: string;
    lastName: string;
  };
  _count: {
    patients: number;
    recordings: number;
  };
  createdAt: string;
  updatedAt: string;
}

export default function ProjectsList() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const navigate = useNavigate();

  useEffect(() => {
    fetchProjects();
  }, []);

  const fetchProjects = async () => {
    try {
      setLoading(true);
      const response = await apiClient.get('/projects');
      // Interceptor already unwraps {success, data} - response.data is the array directly
      setProjects(Array.isArray(response.data) ? response.data : []);
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to load projects');
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteProject = (projectId: string, projectName: string) => {
    confirm({
      title: 'Delete Project',
      icon: <ExclamationCircleOutlined />,
      content: (
        <div>
          <p>Are you sure you want to delete "{projectName}"?</p>
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
          await apiClient.delete(`/projects/${projectId}`);
          message.success('Project deleted successfully');
          fetchProjects(); // Refresh the list
        } catch (err: any) {
          message.error(err.message || 'Failed to delete project');
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

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Projects</h1>
          <p className="text-gray-600 mt-1">Manage your research projects and patients</p>
        </div>
        <Button onClick={() => navigate('/projects/create')}>
          Create Project
        </Button>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded mb-4">
          {error}
        </div>
      )}

      {projects.length === 0 ? (
        <Card>
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
                d="M9 13h6m-3-3v6m-9 1V7a2 2 0 012-2h6l2 2h6a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2z"
              />
            </svg>
            <h3 className="mt-2 text-sm font-medium text-gray-900">No projects</h3>
            <p className="mt-1 text-sm text-gray-500">
              Get started by creating a new project.
            </p>
            <div className="mt-6">
              <Button onClick={() => navigate('/projects/create')}>
                Create Project
              </Button>
            </div>
          </div>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {projects.map((project) => (
            <Card key={project.id} className="hover:shadow-lg transition-shadow">
              <div className="p-6">
                <div className="flex justify-between items-start mb-4">
                  <h3 className="text-lg font-semibold text-gray-900">
                    {project.name}
                  </h3>
                  {project.isPublic && (
                    <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                      Public
                    </span>
                  )}
                </div>

                {project.description && (
                  <p className="text-sm text-gray-600 mb-4 line-clamp-2">
                    {project.description}
                  </p>
                )}

                <div className="grid grid-cols-2 gap-4 mb-4 text-sm">
                  <div>
                    <span className="text-gray-500">Patients:</span>
                    <span className="ml-2 font-semibold text-gray-900">
                      {project._count.patients}
                    </span>
                  </div>
                  <div>
                    <span className="text-gray-500">Recordings:</span>
                    <span className="ml-2 font-semibold text-gray-900">
                      {project._count.recordings}
                    </span>
                  </div>
                </div>

                <div className="text-xs text-gray-500 mb-4">
                  Owner: {project.owner.fullName || `${project.owner.firstName} ${project.owner.lastName}`}
                </div>

                <div className="flex gap-2">
                  <Link to={`/projects/${project.id}`} className="flex-1">
                    <Button variant="outline" fullWidth>
                      View Project
                    </Button>
                  </Link>
                  <button
                    onClick={(e) => {
                      e.preventDefault();
                      handleDeleteProject(project.id, project.name);
                    }}
                    className="px-3 py-2 text-red-600 hover:bg-red-50 border border-red-300 rounded-md transition-colors"
                    title="Delete Project"
                  >
                    <DeleteOutlined />
                  </button>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
