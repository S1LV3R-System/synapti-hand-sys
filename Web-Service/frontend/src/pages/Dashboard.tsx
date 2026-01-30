import { useState, useEffect } from 'react';
import { apiClient } from '../services/api.service';
import { Link } from 'react-router-dom';

interface Project {
  id: string;
  name: string;
  description?: string;
}

interface Patient {
  id: string;
  patientId: string;
  patientName: string;
  gender?: string;
  projectId: string;
}

const Dashboard = () => {
  const [projects, setProjects] = useState<Project[]>([]);
  const [patients, setPatients] = useState<Patient[]>([]);
  const [showProjectModal, setShowProjectModal] = useState(false);
  const [showPatientModal, setShowPatientModal] = useState(false);
  const [selectedProject, setSelectedProject] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');

  // Forms
  const [newProject, setNewProject] = useState({ name: '', description: '' });
  const [newPatient, setNewPatient] = useState({
    patientId: '', patientName: '', gender: 'male', dateOfBirth: '', height: 0, weight: 0, projectId: ''
  });

  useEffect(() => {
    fetchProjects();
    fetchPatients();
  }, []);

  const fetchProjects = async () => {
    try {
      const res = await apiClient.get('/projects');
      const projectsData = res.data || [];
      setProjects(projectsData);
      if (projectsData.length > 0 && !newPatient.projectId) {
        setNewPatient(p => ({ ...p, projectId: projectsData[0].id }));
      }
    } catch (error) {
      console.error(error);
    }
  };

  const fetchPatients = async () => {
    try {
      const res = await apiClient.get('/patients');
      setPatients(res.data || []);
    } catch (error) {
      console.error(error);
    }
  }

  const handleCreateProject = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await apiClient.post('/projects', newProject);
      setShowProjectModal(false);
      setNewProject({ name: '', description: '' });
      fetchProjects();
    } catch (error) {
      console.error(error);
    }
  };

  const handleCreatePatient = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await apiClient.post(`/patients/project/${newPatient.projectId}`, {
        patientId: newPatient.patientId,
        patientName: newPatient.patientName,
        gender: newPatient.gender,
        dateOfBirth: newPatient.dateOfBirth || undefined,
        height: newPatient.height || undefined,
        weight: newPatient.weight || undefined
      });
      setShowPatientModal(false);
      setNewPatient({
        patientId: '', patientName: '', gender: 'male', dateOfBirth: '', height: 0, weight: 0, projectId: projects[0]?.id || ''
      });
      fetchPatients();
    } catch (error) {
      console.error(error);
    }
  };

  const filteredPatients = patients.filter(p => {
    const matchesProject = selectedProject ? p.projectId === selectedProject : true;
    const matchesSearch = (p.patientName?.toLowerCase() || '').includes(searchTerm.toLowerCase()) ||
      (p.patientId?.toLowerCase() || '').includes(searchTerm.toLowerCase());
    return matchesProject && matchesSearch;
  });

  return (
    <div className="p-6 bg-gray-50 min-h-screen">
      <h1 className="text-3xl font-bold text-gray-800 mb-8">Dashboard</h1>

      {/* Projects Section */}
      <div className="mb-10">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-xl font-bold text-gray-700">Projects</h2>
          <button
            onClick={() => setShowProjectModal(true)}
            className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700"
          >
            Create Project
          </button>
        </div>
        <div className="bg-white rounded-lg shadow overflow-hidden">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Name</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Description</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {projects.map((proj) => (
                <tr
                  key={proj.id}
                  className={`cursor-pointer hover:bg-gray-50 ${selectedProject === proj.id ? 'bg-blue-50' : ''}`}
                  onClick={() => setSelectedProject(selectedProject === proj.id ? null : proj.id)}
                >
                  <td className="px-6 py-4 whitespace-nowrap font-medium text-blue-600">{proj.name}</td>
                  <td className="px-6 py-4 whitespace-nowrap text-gray-500">{proj.description || '-'}</td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {selectedProject === proj.id ? 'Selected' : 'Select to Filter'}
                  </td>
                </tr>
              ))}
              {projects.length === 0 && (
                <tr><td colSpan={3} className="px-6 py-4 text-center text-gray-500">No projects found</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Patients Section */}
      <div>
        <div className="flex justify-between items-center mb-4">
          <div className="flex items-center space-x-4">
            <h2 className="text-xl font-bold text-gray-700">
              {selectedProject ? `Patients (Project ${projects.find(p => p.id === selectedProject)?.name})` : 'All Patients'}
            </h2>
            <input
              type="text"
              placeholder="Search patients..."
              className="px-4 py-2 border rounded-md focus:outline-none focus:ring-1 focus:ring-blue-500"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
          <button
            onClick={() => setShowPatientModal(true)}
            className="bg-green-600 text-white px-4 py-2 rounded hover:bg-green-700"
          >
            Create Patient
          </button>
        </div>
        <div className="bg-white rounded-lg shadow overflow-hidden">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">ID</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Name</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Gender</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {filteredPatients.map((pat) => (
                <tr key={pat.id} className="hover:bg-gray-50">
                  <td className="px-6 py-4 whitespace-nowrap">{pat.patientId}</td>
                  <td className="px-6 py-4 whitespace-nowrap">{pat.patientName}</td>
                  <td className="px-6 py-4 whitespace-nowrap">{pat.gender || '-'}</td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <Link to={`/patients/${pat.id}`} className="text-blue-600 hover:text-blue-900 font-medium">View & Record</Link>
                  </td>
                </tr>
              ))}
              {filteredPatients.length === 0 && (
                <tr><td colSpan={4} className="px-6 py-4 text-center text-gray-500">No patients found</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Create Project Modal */}
      {showProjectModal && (
        <div className="fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full flex items-center justify-center">
          <div className="bg-white p-8 rounded-lg shadow-xl w-96">
            <h3 className="text-xl font-bold mb-4">Create New Project</h3>
            <form onSubmit={handleCreateProject}>
              <div className="mb-4">
                <label className="block text-gray-700 text-sm font-bold mb-2">Project Name</label>
                <input className="shadow appearance-none border rounded w-full py-2 px-3 text-gray-700 leading-tight focus:outline-none focus:shadow-outline"
                  type="text" required
                  value={newProject.name}
                  onChange={(e) => setNewProject({ ...newProject, name: e.target.value })}
                />
              </div>
              <div className="mb-4">
                <label className="block text-gray-700 text-sm font-bold mb-2">Description</label>
                <textarea className="shadow appearance-none border rounded w-full py-2 px-3 text-gray-700 leading-tight focus:outline-none focus:shadow-outline"
                  value={newProject.description}
                  onChange={(e) => setNewProject({ ...newProject, description: e.target.value })}
                />
              </div>
              <div className="flex justify-end">
                <button type="button" onClick={() => setShowProjectModal(false)} className="mr-2 px-4 py-2 bg-gray-300 rounded hover:bg-gray-400">Cancel</button>
                <button type="submit" className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700">Create</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Create Patient Modal */}
      {showPatientModal && (
        <div className="fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full flex items-center justify-center">
          <div className="bg-white p-8 rounded-lg shadow-xl w-full max-w-md">
            <h3 className="text-xl font-bold mb-4">Create New Patient</h3>
            <form onSubmit={handleCreatePatient}>
              <div className="mb-4">
                <label className="block text-gray-700 text-sm font-bold mb-2">Select Project</label>
                <select className="shadow border rounded w-full py-2 px-3 text-gray-700"
                  onChange={(e) => setNewPatient({ ...newPatient, projectId: e.target.value })}
                  value={newPatient.projectId}
                >
                  {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="mb-4">
                  <label className="block text-gray-700 text-sm font-bold mb-2">Patient ID</label>
                  <input className="shadow border rounded w-full py-2 px-3 text-gray-700" type="text" required
                    value={newPatient.patientId}
                    onChange={(e) => setNewPatient({ ...newPatient, patientId: e.target.value })} />
                </div>
                <div className="mb-4">
                  <label className="block text-gray-700 text-sm font-bold mb-2">Name</label>
                  <input className="shadow border rounded w-full py-2 px-3 text-gray-700" type="text" required
                    value={newPatient.patientName}
                    onChange={(e) => setNewPatient({ ...newPatient, patientName: e.target.value })} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="mb-4">
                  <label className="block text-gray-700 text-sm font-bold mb-2">Gender</label>
                  <select className="shadow border rounded w-full py-2 px-3 text-gray-700"
                    value={newPatient.gender}
                    onChange={(e) => setNewPatient({ ...newPatient, gender: e.target.value })}>
                    <option value="male">Male</option>
                    <option value="female">Female</option>
                    <option value="other">Other</option>
                  </select>
                </div>
                <div className="mb-4">
                  <label className="block text-gray-700 text-sm font-bold mb-2">Date of Birth</label>
                  <input className="shadow border rounded w-full py-2 px-3 text-gray-700" type="date"
                    value={newPatient.dateOfBirth}
                    onChange={(e) => setNewPatient({ ...newPatient, dateOfBirth: e.target.value })} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="mb-4">
                  <label className="block text-gray-700 text-sm font-bold mb-2">Height (cm)</label>
                  <input className="shadow border rounded w-full py-2 px-3 text-gray-700" type="number"
                    value={newPatient.height || ''}
                    onChange={(e) => setNewPatient({ ...newPatient, height: Number(e.target.value) })} />
                </div>
                <div className="mb-4">
                  <label className="block text-gray-700 text-sm font-bold mb-2">Weight (kg)</label>
                  <input className="shadow border rounded w-full py-2 px-3 text-gray-700" type="number"
                    value={newPatient.weight || ''}
                    onChange={(e) => setNewPatient({ ...newPatient, weight: Number(e.target.value) })} />
                </div>
              </div>

              <div className="flex justify-end mt-4">
                <button type="button" onClick={() => setShowPatientModal(false)} className="mr-2 px-4 py-2 bg-gray-300 rounded hover:bg-gray-400">Cancel</button>
                <button type="submit" className="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700">Create</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default Dashboard;
