import React, { useState } from 'react';
import {
  Card,
  Tabs,
  Button,
  Space,
  Modal,
  message,
  Statistic,
  Row,
  Col,
  Typography,
  Empty,
  Alert,
} from 'antd';
import {
  DeleteOutlined,
  WarningOutlined,
  ClockCircleOutlined,
  FileTextOutlined,
  UserOutlined,
  TeamOutlined,
  FolderOutlined,
  VideoCameraOutlined,
} from '@ant-design/icons';
import { useQuery } from '@tanstack/react-query';
import { systemService } from '../../services';

const { Title, Text } = Typography;
const { TabPane } = Tabs;



export const SoftDeletedItemsPanel: React.FC = () => {
  const [activeTab, setActiveTab] = useState<string>('overview');

  // Fetch soft-deleted stats
  const { data: stats, refetch: refetchStats } = useQuery({
    queryKey: ['softDeletedStats'],
    queryFn: () => systemService.getSoftDeletedStats(),
  });

  // Fetch cleanup preview
  const { data: cleanupPreview, refetch: refetchPreview } = useQuery({
    queryKey: ['cleanupPreview'],
    queryFn: () => systemService.previewCleanup(),
  });



  // Manual cleanup trigger
  const handleRunCleanup = async () => {
    Modal.confirm({
      title: 'Run Cleanup Now?',
      content: (
        <div>
          <p>This will permanently delete all soft-deleted items older than 15 days.</p>
          <p className="text-red-600 mt-2">
            <strong>Items to be deleted:</strong>
          </p>
          <ul className="list-disc ml-5 mt-2">
            <li>Recordings: {cleanupPreview?.toDelete.recordings || 0}</li>
            <li>Protocols: {cleanupPreview?.toDelete.protocols || 0}</li>
            <li>Patients: {cleanupPreview?.toDelete.patients || 0}</li>
            <li>Projects: {cleanupPreview?.toDelete.projects || 0}</li>
            <li>Users: {cleanupPreview?.toDelete.users || 0}</li>
          </ul>
          <p className="text-gray-600 mt-2 text-sm">
            Total: {cleanupPreview?.toDelete.total || 0} items
          </p>
        </div>
      ),
      okText: 'Run Cleanup',
      okType: 'danger',
      onOk: async () => {
        try {
          const result = await systemService.runCleanup();
          message.success(`Cleanup completed: ${result.total} items deleted`);
          refetchStats();
          refetchPreview();
        } catch (error: any) {
          message.error(error.response?.data?.message || 'Failed to run cleanup');
        }
      },
    });
  };





  return (
    <div className="p-6">
      {/* Header */}
      <div className="mb-6">
        <Title level={2} className="!mb-1">
          <DeleteOutlined className="mr-2" />
          Soft-Deleted Items Management
        </Title>
        <Text type="secondary">
          Manage soft-deleted items and cleanup operations
        </Text>
      </div>

      {/* Stats Overview */}
      <Row gutter={16} className="mb-6">
        <Col span={4}>
          <Card size="small">
            <Statistic
              title="Total Soft-Deleted"
              value={stats?.total || 0}
              prefix={<DeleteOutlined />}
              valueStyle={{ color: '#ff4d4f' }}
            />
          </Card>
        </Col>
        <Col span={4}>
          <Card size="small">
            <Statistic
              title="Protocols"
              value={stats?.protocols || 0}
              prefix={<FileTextOutlined />}
            />
          </Card>
        </Col>
        <Col span={4}>
          <Card size="small">
            <Statistic
              title="Patients"
              value={stats?.patients || 0}
              prefix={<UserOutlined />}
            />
          </Card>
        </Col>
        <Col span={4}>
          <Card size="small">
            <Statistic
              title="Projects"
              value={stats?.projects || 0}
              prefix={<FolderOutlined />}
            />
          </Card>
        </Col>
        <Col span={4}>
          <Card size="small">
            <Statistic
              title="Users"
              value={stats?.users || 0}
              prefix={<TeamOutlined />}
            />
          </Card>
        </Col>
        <Col span={4}>
          <Card size="small">
            <Statistic
              title="Recordings"
              value={stats?.recordings || 0}
              prefix={<VideoCameraOutlined />}
            />
          </Card>
        </Col>
      </Row>

      {/* Cleanup Preview Alert */}
      {cleanupPreview && cleanupPreview.toDelete.total > 0 && (
        <Alert
          message={
            <div className="flex justify-between items-center">
              <span>
                <ClockCircleOutlined className="mr-2" />
                <strong>{cleanupPreview.toDelete.total} items</strong> are scheduled for automatic deletion
                {cleanupPreview.retentionDays && ` (older than ${cleanupPreview.retentionDays} days)`}
              </span>
              <Button danger onClick={handleRunCleanup}>
                Run Cleanup Now
              </Button>
            </div>
          }
          type="warning"
          className="mb-6"
          showIcon
        />
      )}

      {/* Info Box */}
      <Card className="mb-6" size="small">
        <Space direction="vertical" className="w-full">
          <Text strong>
            <WarningOutlined className="mr-2 text-yellow-600" />
            Soft Delete System Information
          </Text>
          <ul className="list-disc ml-5 text-sm text-gray-600">
            <li>Soft-deleted items are hidden from normal listings but retained for 15 days</li>
            <li>After 15 days, items are automatically permanently deleted (cron runs daily at 2 AM UTC)</li>
            <li>Admin users can <strong>hard-delete</strong> items immediately, bypassing the retention period</li>
            <li>All hard-delete operations are logged in the audit trail for compliance</li>
          </ul>
        </Space>
      </Card>

      {/* Tabs */}
      <Card>
        <Tabs activeKey={activeTab} onChange={setActiveTab}>
          <TabPane tab="Overview" key="overview">
            <Space direction="vertical" className="w-full">
              <Title level={4}>System Overview</Title>
              <Row gutter={16}>
                <Col span={12}>
                  <Card size="small" title="Current Statistics" className="mb-4">
                    <p><strong>Total Soft-Deleted:</strong> {stats?.total || 0} items</p>
                    <p><strong>Next Auto-Cleanup:</strong> Daily at 2:00 AM UTC</p>
                    <p><strong>Retention Period:</strong> 15 days</p>
                  </Card>
                </Col>
                <Col span={12}>
                  <Card size="small" title="Upcoming Cleanup" className="mb-4">
                    <p><strong>Items to Delete:</strong> {cleanupPreview?.toDelete.total || 0}</p>
                    <p><strong>Cutoff Date:</strong> {cleanupPreview?.cutoffDate ? new Date(cleanupPreview.cutoffDate).toLocaleDateString() : '-'}</p>
                    <Button 
                      type="primary" 
                      danger 
                      onClick={handleRunCleanup}
                      disabled={!cleanupPreview || cleanupPreview.toDelete.total === 0}
                      className="mt-2"
                    >
                      Run Manual Cleanup
                    </Button>
                  </Card>
                </Col>
              </Row>
            </Space>
          </TabPane>

          <TabPane 
            tab={
              <span>
                <FileTextOutlined /> Protocols ({stats?.protocols || 0})
              </span>
            } 
            key="protocols"
          >
            <Empty description="Protocol listing integration pending" />
            <Text type="secondary" className="block mt-4">
              Navigate to the Protocols page to manage soft-deleted protocols.
            </Text>
          </TabPane>

          <TabPane 
            tab={
              <span>
                <UserOutlined /> Patients ({stats?.patients || 0})
              </span>
            } 
            key="patients"
          >
            <Empty description="Patient listing integration pending" />
          </TabPane>

          <TabPane 
            tab={
              <span>
                <FolderOutlined /> Projects ({stats?.projects || 0})
              </span>
            } 
            key="projects"
          >
            <Empty description="Project listing integration pending" />
          </TabPane>

          <TabPane 
            tab={
              <span>
                <TeamOutlined /> Users ({stats?.users || 0})
              </span>
            } 
            key="users"
          >
            <Empty description="User listing integration pending" />
          </TabPane>

          <TabPane 
            tab={
              <span>
                <VideoCameraOutlined /> Recordings ({stats?.recordings || 0})
              </span>
            } 
            key="recordings"
          >
            <Empty description="Recording listing integration pending" />
          </TabPane>
        </Tabs>
      </Card>

    </div>
  );
};

export default SoftDeletedItemsPanel;
