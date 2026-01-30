import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  Card,
  Row,
  Col,
  Statistic,
  Button,
  Table,
  Tag,
  Input,
  Select,
  Space,
  Modal,
  Form,
  Badge,
  Typography,
  message,
  Tooltip,
  Progress,
  Alert
} from 'antd';
import {
  ProjectOutlined,
  TeamOutlined,
  VideoCameraOutlined,
  ClockCircleOutlined,
  PlusOutlined,
  ReloadOutlined,
  LineChartOutlined,
  UserAddOutlined,
  CheckCircleOutlined,
  SyncOutlined,
  ExclamationCircleOutlined,
  MailOutlined
} from '@ant-design/icons';
import { useCurrentUser } from '../hooks/useAuth';
import { useUserStats } from '../hooks/useStats';
import { useMyInvitations, useAcceptInvitation, useRejectInvitation } from '../hooks/useInvitations';
import { apiClient } from '../services/api.service';
import { LoadingSpinner } from '../components/LoadingSpinner';
import type { TableProps } from 'antd';

const { Title, Text, Paragraph } = Typography;
const { Search } = Input;

interface Project {
  id: string;
  name: string;
  description?: string;
  _count?: { patients: number };
}

interface Patient {
  id: string;
  patientId: string;
  patientName: string;
  gender?: string;
  diagnosis?: string;
  projectId: string;
  project?: { name: string };
  _count?: { recordings: number };
}

const UserDashboard = () => {
  const navigate = useNavigate();
  const { data: user } = useCurrentUser();
  const { data: stats, isLoading: statsLoading, refetch: refetchStats } = useUserStats();
  const { data: invitations, refetch: refetchInvitations } = useMyInvitations();
  const acceptInvitation = useAcceptInvitation();
  const rejectInvitation = useRejectInvitation();

  const [projects, setProjects] = useState<Project[]>([]);
  const [patients, setPatients] = useState<Patient[]>([]);
  const [showProjectModal, setShowProjectModal] = useState(false);
  const [showPatientModal, setShowPatientModal] = useState(false);
  const [selectedProject, setSelectedProject] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [loading, setLoading] = useState(true);

  // Forms
  const [projectForm] = Form.useForm();
  const [patientForm] = Form.useForm();

  useEffect(() => {
    fetchProjects();
    fetchPatients();
  }, []);

  const fetchProjects = async () => {
    setLoading(true);
    try {
      const res = await apiClient.get('/projects');
      // Interceptor already unwraps {success, data} - res.data is the array directly
      const projectsData = Array.isArray(res.data) ? res.data : [];
      setProjects(projectsData);
    } catch (error) {
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  const fetchPatients = async () => {
    try {
      const res = await apiClient.get('/patients');
      // Interceptor already unwraps {success, data} - res.data is the array directly
      setPatients(Array.isArray(res.data) ? res.data : []);
    } catch (error) {
      console.error(error);
    }
  };

  const handleCreateProject = async (values: { name: string; description?: string }) => {
    try {
      await apiClient.post('/projects', values);
      setShowProjectModal(false);
      projectForm.resetFields();
      fetchProjects();
      refetchStats();
      message.success('Project created successfully');
    } catch (error) {
      console.error(error);
      message.error('Failed to create project');
    }
  };

  const handleCreatePatient = async (values: any) => {
    try {
      await apiClient.post(`/patients/project/${values.projectId}`, {
        patientId: values.patientId,
        patientName: values.patientName,
        gender: values.gender,
        diagnosis: values.diagnosis,
        dateOfBirth: values.dateOfBirth || undefined,
        height: values.height || undefined,
        weight: values.weight || undefined
      });
      setShowPatientModal(false);
      patientForm.resetFields();
      fetchPatients();
      refetchStats();
      message.success('Patient added successfully');
    } catch (error) {
      console.error(error);
      message.error('Failed to add patient');
    }
  };

  const handleAcceptInvitation = async (invitationId: string) => {
    try {
      await acceptInvitation.mutateAsync(invitationId);
      message.success('You have joined the project');
      refetchInvitations();
      fetchProjects();
      refetchStats();
    } catch (error) {
      message.error('Failed to accept invitation');
    }
  };

  const handleRejectInvitation = async (invitationId: string) => {
    try {
      await rejectInvitation.mutateAsync(invitationId);
      message.info('Invitation declined');
      refetchInvitations();
    } catch (error) {
      message.error('Failed to reject invitation');
    }
  };

  const getStatusColor = (status: string) => {
    const colors: Record<string, string> = {
      uploaded: 'blue',
      processing: 'orange',
      processed: 'cyan',
      analyzed: 'green',
      completed: 'green',
      failed: 'red'
    };
    return colors[status] || 'default';
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'uploaded':
        return <ClockCircleOutlined />;
      case 'processing':
        return <SyncOutlined spin />;
      case 'analyzed':
      case 'completed':
        return <CheckCircleOutlined />;
      case 'failed':
        return <ExclamationCircleOutlined />;
      default:
        return null;
    }
  };

  const filteredPatients = patients.filter(p => {
    const matchesProject = selectedProject ? p.projectId === selectedProject : true;
    const matchesSearch = (p.patientName?.toLowerCase() || '').includes(searchTerm.toLowerCase()) ||
      (p.patientId?.toLowerCase() || '').includes(searchTerm.toLowerCase()) ||
      (p.diagnosis?.toLowerCase() || '').includes(searchTerm.toLowerCase());
    return matchesProject && matchesSearch;
  });

  const patientColumns: TableProps<Patient>['columns'] = [
    {
      title: 'Patient ID',
      dataIndex: 'patientId',
      key: 'patientId',
      width: 120,
      render: (id: string) => <Text strong>{id}</Text>
    },
    {
      title: 'Name',
      dataIndex: 'patientName',
      key: 'patientName',
      width: 150
    },
    {
      title: 'Diagnosis',
      dataIndex: 'diagnosis',
      key: 'diagnosis',
      width: 150,
      render: (diagnosis: string) =>
        diagnosis ? <Tag color="purple">{diagnosis}</Tag> : <Text type="secondary">—</Text>
    },
    {
      title: 'Gender',
      dataIndex: 'gender',
      key: 'gender',
      width: 80,
      render: (gender: string) => gender || '—'
    },
    {
      title: 'Project',
      dataIndex: 'project',
      key: 'project',
      width: 150,
      render: (project: { name: string }) => project?.name || '—'
    },
    {
      title: 'Recordings',
      dataIndex: '_count',
      key: 'recordings',
      width: 100,
      align: 'center',
      render: (count: { recordings: number }) =>
        <Badge count={count?.recordings || 0} showZero color={count?.recordings ? 'blue' : 'default'} />
    },
    {
      title: 'Actions',
      key: 'actions',
      width: 120,
      render: (_: any, patient: Patient) => (
        <Link to={`/patients/${patient.id}`}>
          <Button type="link" icon={<VideoCameraOutlined />}>
            Record
          </Button>
        </Link>
      )
    }
  ];

  if (loading && !stats) {
    return <LoadingSpinner fullScreen message="Loading dashboard..." />;
  }

  return (
    <div className="p-6 bg-gray-50 min-h-screen">
      {/* Welcome Header */}
      <div className="mb-6">
        <Title level={2} className="mb-1">
          Welcome back, {user?.firstName || user?.fullName || 'User'}
        </Title>
        <Text type="secondary">
          Manage your research projects and recordings
        </Text>
      </div>

      {/* Pending Invitations Alert */}
      {invitations && invitations.length > 0 && (
        <Alert
          message={`You have ${invitations.length} pending project invitation${invitations.length > 1 ? 's' : ''}`}
          description={
            <div className="mt-2 space-y-2">
              {invitations.map(inv => (
                <div key={inv.id} className="flex items-center justify-between bg-white p-3 rounded">
                  <div>
                    <Text strong>{inv.project.name}</Text>
                    <br />
                    <Text type="secondary" className="text-xs">
                      Invited by {inv.invitedBy.fullName} • Role: {inv.role}
                    </Text>
                  </div>
                  <Space>
                    <Button
                      type="primary"
                      size="small"
                      onClick={() => handleAcceptInvitation(inv.id)}
                      loading={acceptInvitation.isPending}
                    >
                      Accept
                    </Button>
                    <Button
                      size="small"
                      onClick={() => handleRejectInvitation(inv.id)}
                      loading={rejectInvitation.isPending}
                    >
                      Decline
                    </Button>
                  </Space>
                </div>
              ))}
            </div>
          }
          type="info"
          showIcon
          icon={<MailOutlined />}
          className="mb-6"
        />
      )}

      {/* Stats Cards */}
      <Row gutter={[16, 16]} className="mb-6">
        <Col xs={12} sm={12} md={6}>
          <Card hoverable onClick={() => navigate('/projects')}>
            <Statistic
              title="Projects"
              value={stats?.projects || 0}
              prefix={<ProjectOutlined className="text-blue-500" />}
              loading={statsLoading}
            />
          </Card>
        </Col>
        <Col xs={12} sm={12} md={6}>
          <Card hoverable>
            <Statistic
              title="Patients"
              value={stats?.patients || 0}
              prefix={<TeamOutlined className="text-green-500" />}
              loading={statsLoading}
            />
          </Card>
        </Col>
        <Col xs={12} sm={12} md={6}>
          <Card hoverable onClick={() => navigate('/recordings')}>
            <Statistic
              title="Recordings"
              value={stats?.recordings || 0}
              prefix={<VideoCameraOutlined className="text-purple-500" />}
              loading={statsLoading}
            />
          </Card>
        </Col>
        <Col xs={12} sm={12} md={6}>
          <Card hoverable>
            <Statistic
              title="Pending Analysis"
              value={stats?.pendingAnalysis || 0}
              prefix={<ClockCircleOutlined className="text-orange-500" />}
              loading={statsLoading}
            />
            {stats?.pendingAnalysis ? (
              <Progress
                percent={Math.round(((stats?.recordings || 0) - (stats?.pendingAnalysis || 0)) / (stats?.recordings || 1) * 100)}
                size="small"
                status="active"
                className="mt-2"
              />
            ) : null}
          </Card>
        </Col>
      </Row>

      {/* Quick Actions */}
      <Card className="mb-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <Title level={5} className="m-0">Quick Actions</Title>
          <Space wrap>
            <Button
              type="primary"
              icon={<PlusOutlined />}
              onClick={() => setShowProjectModal(true)}
            >
              New Project
            </Button>
            <Button
              icon={<UserAddOutlined />}
              onClick={() => {
                if (projects.length === 0) {
                  message.warning('Please create a project first');
                  return;
                }
                setShowPatientModal(true);
              }}
            >
              Add Patient
            </Button>
            <Button
              icon={<LineChartOutlined />}
              onClick={() => navigate('/comparisons')}
            >
              View Comparisons
            </Button>
            <Tooltip title="Refresh Data">
              <Button
                icon={<ReloadOutlined />}
                onClick={() => {
                  refetchStats();
                  fetchProjects();
                  fetchPatients();
                }}
              />
            </Tooltip>
          </Space>
        </div>
      </Card>

      {/* Recent Activity */}
      {stats?.recentRecordings && stats.recentRecordings.length > 0 && (
        <Card title="Recent Recordings" className="mb-6">
          <div className="space-y-3">
            {stats.recentRecordings.map(recording => (
              <div
                key={recording.id}
                className="flex items-center justify-between p-3 bg-gray-50 rounded-lg hover:bg-gray-100 cursor-pointer"
                onClick={() => navigate(`/recordings/${recording.id}`)}
              >
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center">
                    <VideoCameraOutlined className="text-blue-500" />
                  </div>
                  <div>
                    <Text strong>
                      {recording.patient?.patientName || 'Unknown Patient'}
                    </Text>
                    <br />
                    <Text type="secondary" className="text-xs">
                      {recording.project?.name} •{' '}
                      {new Date(recording.createdAt).toLocaleString()}
                    </Text>
                  </div>
                </div>
                <Tag color={getStatusColor(recording.status)} icon={getStatusIcon(recording.status)}>
                  {recording.status}
                </Tag>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Diagnosis Groups */}
      {stats?.diagnosisGroups && stats.diagnosisGroups.length > 0 && (
        <Card title="Diagnosis Groups" className="mb-6">
          <Row gutter={[16, 16]}>
            {stats.diagnosisGroups.map(group => (
              <Col key={group.diagnosis} xs={12} sm={8} md={6}>
                <Card size="small" hoverable onClick={() => navigate('/comparisons')}>
                  <Statistic
                    title={group.diagnosis}
                    value={group.count}
                    suffix="patients"
                    valueStyle={{ fontSize: 20 }}
                  />
                </Card>
              </Col>
            ))}
          </Row>
        </Card>
      )}

      {/* Projects Section */}
      <Card
        title="Projects"
        extra={
          <Button
            type="primary"
            icon={<PlusOutlined />}
            onClick={() => setShowProjectModal(true)}
          >
            Create Project
          </Button>
        }
        className="mb-6"
      >
        <Row gutter={[16, 16]}>
          {projects.length === 0 ? (
            <Col span={24}>
              <div className="text-center py-8">
                <ProjectOutlined style={{ fontSize: 48, color: '#ccc' }} />
                <Paragraph type="secondary" className="mt-4">
                  No projects yet. Create your first project to get started.
                </Paragraph>
                <Button
                  type="primary"
                  icon={<PlusOutlined />}
                  onClick={() => setShowProjectModal(true)}
                >
                  Create Project
                </Button>
              </div>
            </Col>
          ) : (
            projects.map(project => (
              <Col key={project.id} xs={24} sm={12} md={8} lg={6}>
                <Card
                  hoverable
                  className={selectedProject === project.id ? 'border-blue-500 border-2' : ''}
                  onClick={() => setSelectedProject(selectedProject === project.id ? null : project.id)}
                >
                  <div className="flex justify-between items-start mb-2">
                    <Text strong className="text-base">{project.name}</Text>
                    {selectedProject === project.id && (
                      <Tag color="blue">Selected</Tag>
                    )}
                  </div>
                  <Paragraph type="secondary" ellipsis={{ rows: 2 }} className="mb-2">
                    {project.description || 'No description'}
                  </Paragraph>
                  <div className="flex justify-between items-center">
                    <Badge
                      count={project._count?.patients || 0}
                      showZero
                      color={project._count?.patients ? 'blue' : 'default'}
                    />
                    <Link to={`/projects/${project.id}`}>
                      <Button type="link" size="small">View</Button>
                    </Link>
                  </div>
                </Card>
              </Col>
            ))
          )}
        </Row>
      </Card>

      {/* Patients Section */}
      <Card
        title={
          <div className="flex items-center gap-2">
            <span>Patients</span>
            {selectedProject && (
              <Tag color="blue" closable onClose={() => setSelectedProject(null)}>
                {projects.find(p => p.id === selectedProject)?.name}
              </Tag>
            )}
          </div>
        }
        extra={
          <Space>
            <Search
              placeholder="Search patients..."
              allowClear
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              style={{ width: 200 }}
            />
            <Button
              icon={<UserAddOutlined />}
              onClick={() => {
                if (projects.length === 0) {
                  message.warning('Please create a project first');
                  return;
                }
                setShowPatientModal(true);
              }}
            >
              Add Patient
            </Button>
          </Space>
        }
      >
        <Table
          columns={patientColumns}
          dataSource={filteredPatients}
          rowKey="id"
          loading={loading}
          pagination={{ pageSize: 10, showSizeChanger: true }}
          onRow={(patient) => ({
            onClick: () => navigate(`/patients/${patient.id}`),
            style: { cursor: 'pointer' }
          })}
          scroll={{ x: 800 }}
        />
      </Card>

      {/* Create Project Modal */}
      <Modal
        title="Create New Project"
        open={showProjectModal}
        onCancel={() => {
          setShowProjectModal(false);
          projectForm.resetFields();
        }}
        footer={null}
      >
        <Form
          form={projectForm}
          layout="vertical"
          onFinish={handleCreateProject}
        >
          <Form.Item
            name="name"
            label="Project Name"
            rules={[{ required: true, message: 'Please enter project name' }]}
          >
            <Input placeholder="e.g., Parkinson's Study 2026" />
          </Form.Item>
          <Form.Item
            name="description"
            label="Description"
          >
            <Input.TextArea rows={3} placeholder="Brief description of the project" />
          </Form.Item>
          <Form.Item className="mb-0 text-right">
            <Space>
              <Button onClick={() => {
                setShowProjectModal(false);
                projectForm.resetFields();
              }}>
                Cancel
              </Button>
              <Button type="primary" htmlType="submit">
                Create Project
              </Button>
            </Space>
          </Form.Item>
        </Form>
      </Modal>

      {/* Create Patient Modal */}
      <Modal
        title="Add New Patient"
        open={showPatientModal}
        onCancel={() => {
          setShowPatientModal(false);
          patientForm.resetFields();
        }}
        footer={null}
        width={600}
      >
        <Form
          form={patientForm}
          layout="vertical"
          onFinish={handleCreatePatient}
          initialValues={{ projectId: selectedProject || projects[0]?.id }}
        >
          <Form.Item
            name="projectId"
            label="Project"
            rules={[{ required: true, message: 'Please select a project' }]}
          >
            <Select placeholder="Select project">
              {projects.map(p => (
                <Select.Option key={p.id} value={p.id}>{p.name}</Select.Option>
              ))}
            </Select>
          </Form.Item>

          <Row gutter={16}>
            <Col span={12}>
              <Form.Item
                name="patientId"
                label="Patient ID"
                rules={[{ required: true, message: 'Please enter patient ID' }]}
              >
                <Input placeholder="e.g., P-001" />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item
                name="patientName"
                label="Patient Name"
                rules={[{ required: true, message: 'Please enter patient name' }]}
              >
                <Input placeholder="Full name" />
              </Form.Item>
            </Col>
          </Row>

          <Row gutter={16}>
            <Col span={12}>
              <Form.Item name="gender" label="Gender">
                <Select placeholder="Select gender">
                  <Select.Option value="male">Male</Select.Option>
                  <Select.Option value="female">Female</Select.Option>
                  <Select.Option value="other">Other</Select.Option>
                </Select>
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="diagnosis" label="Diagnosis">
                <Input placeholder="e.g., parkinsons, essential_tremor" />
              </Form.Item>
            </Col>
          </Row>

          <Row gutter={16}>
            <Col span={8}>
              <Form.Item name="dateOfBirth" label="Date of Birth">
                <Input type="date" />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item name="height" label="Height (cm)">
                <Input type="number" placeholder="170" />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item name="weight" label="Weight (kg)">
                <Input type="number" placeholder="70" />
              </Form.Item>
            </Col>
          </Row>

          <Form.Item className="mb-0 text-right">
            <Space>
              <Button onClick={() => {
                setShowPatientModal(false);
                patientForm.resetFields();
              }}>
                Cancel
              </Button>
              <Button type="primary" htmlType="submit">
                Add Patient
              </Button>
            </Space>
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
};

export default UserDashboard;
