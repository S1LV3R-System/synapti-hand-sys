import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  Card,
  Row,
  Col,
  Statistic,
  Progress,
  Tag,
  Space,
  Button,
  Tabs,
  Timeline,
  Typography,
  Tooltip,
} from 'antd';
import {
  DashboardOutlined,
  UserOutlined,
  VideoCameraOutlined,
  HistoryOutlined,
  SettingOutlined,
  TeamOutlined,
  FileTextOutlined,
  LineChartOutlined,
  PieChartOutlined,
  ThunderboltOutlined,
  UserAddOutlined,
  ClockCircleOutlined,
  ReloadOutlined,
} from '@ant-design/icons';
import { useCurrentUser } from '../hooks/useAuth';
import { apiClient } from '../services/api.service';
import { LoadingSpinner } from '../components/LoadingSpinner';
import { UserManagementPanel } from './admin/UserManagement/UserManagementPanel';
import AdminRecordingsPanel from './admin/AdminRecordingsPanel';
import AuditLogsPanel from './admin/AuditLogsPanel';
import AdminSettingsPanel from './admin/AdminSettingsPanel';

const { Title, Text } = Typography;

interface SystemStats {
  users: {
    total: number;
    active: number;
    inactive: number;
    byRole: Record<string, number>;
  };
  recordings: {
    total: number;
    recent30Days: number;
    withFiles: number;
    byStatus: Record<string, number>;
  };
  protocols: { total: number };
  analyses: { total: number };
  performance: { avgProcessingTimeMs: number };
  recentActivity: any[];
}

export default function AdminDashboard() {
  const navigate = useNavigate();
  const { data: user, isLoading: isUserLoading } = useCurrentUser();
  const [activeTab, setActiveTab] = useState<'overview' | 'users' | 'recordings' | 'logs' | 'settings'>('overview');

  // Fetch admin stats BEFORE any early returns (Rules of Hooks)
  const {
    data: stats,
    isLoading,
    error: statsError,
    refetch: refetchStats,
  } = useQuery({
    queryKey: ['admin-stats'],
    queryFn: async () => {
      const response = await apiClient.get<SystemStats>('/system/stats');
      return response.data;
    },
    staleTime: 1000 * 60 * 5, // 5 minutes
  });

  // Show loading while user or stats are being fetched
  if (isUserLoading || isLoading) {
    return <LoadingSpinner fullScreen message="Loading admin dashboard..." />;
  }

  // Don't render if user not available
  if (!user) {
    return <LoadingSpinner fullScreen message="Loading admin dashboard..." />;
  }

  if (statsError) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="bg-red-50 border border-red-200 rounded-lg p-6 max-w-md">
          <p className="text-red-800 font-medium">Failed to load admin dashboard</p>
          <p className="text-red-600 text-sm mt-2">Please try refreshing the page</p>
        </div>
      </div>
    );
  }

  const tabItems = [
    { key: 'overview', icon: <DashboardOutlined />, label: 'Overview' },
    { key: 'users', icon: <UserOutlined />, label: 'Users' },
    { key: 'recordings', icon: <VideoCameraOutlined />, label: 'Recordings' },
    { key: 'logs', icon: <HistoryOutlined />, label: 'Audit Logs' },
    { key: 'settings', icon: <SettingOutlined />, label: 'Settings' },
  ];

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white shadow-sm sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <div className="flex items-center space-x-4">
              <Title level={3} className="!mb-0 flex items-center">
                <SettingOutlined className="mr-2" />
                Admin Dashboard
              </Title>
            </div>
            <Space>
              <Tooltip title="Refresh Data">
                <Button icon={<ReloadOutlined />} onClick={() => refetchStats()} />
              </Tooltip>
              <Button onClick={() => navigate('/home')}>
                Back to App
              </Button>
            </Space>
          </div>
        </div>
      </div>

      {/* Tabs Navigation */}
      <div className="bg-white border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <Tabs
            activeKey={activeTab}
            onChange={(key) => setActiveTab(key as typeof activeTab)}
            items={tabItems.map(item => ({
              key: item.key,
              label: (
                <span>
                  {item.icon}
                  <span className="ml-2">{item.label}</span>
                </span>
              ),
            }))}
          />
        </div>
      </div>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto py-6 px-4 sm:px-6 lg:px-8">
        {/* Overview Tab */}
        {activeTab === 'overview' && stats && (
          <div className="space-y-6">
            {/* Key Metrics */}
            <Row gutter={[16, 16]}>
              <Col xs={24} sm={12} lg={6}>
                <Card hoverable className="h-full">
                  <Statistic
                    title="Total Users"
                    value={stats.users.total}
                    prefix={<TeamOutlined />}
                    valueStyle={{ color: '#1890ff' }}
                  />
                  <Progress
                    percent={Math.round((stats.users.active / stats.users.total) * 100)}
                    size="small"
                    format={() => `${stats.users.active} active`}
                  />
                </Card>
              </Col>
              <Col xs={24} sm={12} lg={6}>
                <Card hoverable className="h-full">
                  <Statistic
                    title="Total Recordings"
                    value={stats.recordings.total}
                    prefix={<VideoCameraOutlined />}
                    valueStyle={{ color: '#52c41a' }}
                  />
                  <Text type="secondary" className="text-xs">
                    {stats.recordings.recent30Days} in last 30 days
                  </Text>
                </Card>
              </Col>
              <Col xs={24} sm={12} lg={6}>
                <Card hoverable className="h-full">
                  <Statistic
                    title="Protocols"
                    value={stats.protocols.total}
                    prefix={<FileTextOutlined />}
                    valueStyle={{ color: '#722ed1' }}
                  />
                </Card>
              </Col>
              <Col xs={24} sm={12} lg={6}>
                <Card hoverable className="h-full">
                  <Statistic
                    title="Analyses"
                    value={stats.analyses.total}
                    prefix={<LineChartOutlined />}
                    valueStyle={{ color: '#fa8c16' }}
                  />
                  <Text type="secondary" className="text-xs">
                    Avg processing: {Math.round(stats.performance.avgProcessingTimeMs / 1000)}s
                  </Text>
                </Card>
              </Col>
            </Row>

            {/* Users by Role */}
            <Row gutter={[16, 16]}>
              <Col xs={24} lg={12}>
                <Card title="Users by Role" extra={<TeamOutlined />}>
                  <Space direction="vertical" style={{ width: '100%' }}>
                    {Object.entries(stats.users.byRole).map(([role, count]) => (
                      <div key={role} className="flex justify-between items-center">
                        <Tag color={
                          role === 'admin' ? 'purple' :
                          role === 'clinician' ? 'blue' :
                          role === 'researcher' ? 'orange' : 'green'
                        }>
                          {role.charAt(0).toUpperCase() + role.slice(1)}
                        </Tag>
                        <Space>
                          <Progress
                            type="line"
                            percent={Math.round((count / stats.users.total) * 100)}
                            style={{ width: 150 }}
                            size="small"
                          />
                          <Text strong>{count}</Text>
                        </Space>
                      </div>
                    ))}
                  </Space>
                </Card>
              </Col>
              <Col xs={24} lg={12}>
                <Card title="Recordings by Status" extra={<PieChartOutlined />}>
                  <Space direction="vertical" style={{ width: '100%' }}>
                    {Object.entries(stats.recordings.byStatus).map(([status, count]) => {
                      const colorMap: Record<string, string> = {
                        uploaded: 'orange',
                        processing: 'blue',
                        processed: 'cyan',
                        analyzed: 'green',
                        completed: 'purple',
                        failed: 'red',
                      };
                      return (
                        <div key={status} className="flex justify-between items-center">
                          <Tag color={colorMap[status] || 'default'}>
                            {status.charAt(0).toUpperCase() + status.slice(1)}
                          </Tag>
                          <Space>
                            <Progress
                              type="line"
                              percent={Math.round((count / stats.recordings.total) * 100)}
                              style={{ width: 150 }}
                              size="small"
                              strokeColor={colorMap[status]}
                            />
                            <Text strong>{count}</Text>
                          </Space>
                        </div>
                      );
                    })}
                  </Space>
                </Card>
              </Col>
            </Row>

            {/* Quick Actions */}
            <Card title="Quick Actions" extra={<ThunderboltOutlined />}>
              <Row gutter={[16, 16]}>
                <Col xs={24} sm={12} md={6}>
                  <Button
                    block
                    icon={<UserAddOutlined />}
                    onClick={() => setActiveTab('users')}
                    className="h-20 flex flex-col items-center justify-center"
                  >
                    Manage Users
                  </Button>
                </Col>
                <Col xs={24} sm={12} md={6}>
                  <Button
                    block
                    icon={<VideoCameraOutlined />}
                    onClick={() => setActiveTab('recordings')}
                    className="h-20 flex flex-col items-center justify-center"
                  >
                    View Recordings
                  </Button>
                </Col>
                <Col xs={24} sm={12} md={6}>
                  <Button
                    block
                    icon={<HistoryOutlined />}
                    onClick={() => setActiveTab('logs')}
                    className="h-20 flex flex-col items-center justify-center"
                  >
                    Audit Logs
                  </Button>
                </Col>
                <Col xs={24} sm={12} md={6}>
                  <Button
                    block
                    icon={<SettingOutlined />}
                    onClick={() => setActiveTab('settings')}
                    className="h-20 flex flex-col items-center justify-center"
                  >
                    Settings
                  </Button>
                </Col>
              </Row>
            </Card>

            {/* Recent Activity */}
            {stats.recentActivity && stats.recentActivity.length > 0 && (
              <Card title="Recent Activity" extra={<ClockCircleOutlined />}>
                <Timeline
                  items={stats.recentActivity.slice(0, 5).map((activity: any, index: number) => ({
                    color: index === 0 ? 'green' : 'gray',
                    children: (
                      <div>
                        <Text strong>{activity.action}</Text>
                        <br />
                        <Text type="secondary" className="text-xs">
                          {typeof activity.user === 'string' ? activity.user : activity.user?.email || 'Unknown User'} • {new Date(activity.createdAt).toLocaleString()}
                        </Text>
                      </div>
                    ),
                  }))}
                />
              </Card>
            )}
          </div>
        )}

        {/* User Management Tab */}
        {activeTab === 'users' && (
          <UserManagementPanel />
        )}

        {/* Recordings Tab */}
        {activeTab === 'recordings' && (
          <AdminRecordingsPanel />
        )}

        {/* Audit Logs Tab */}
        {activeTab === 'logs' && (
          <AuditLogsPanel />
        )}

        {/* Settings Tab */}
        {activeTab === 'settings' && (
          <AdminSettingsPanel />
        )}
      </main>
    </div>
  );
}
