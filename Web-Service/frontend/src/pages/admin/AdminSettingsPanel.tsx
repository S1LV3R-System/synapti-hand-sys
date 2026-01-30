import React, { useState, useEffect } from 'react';
import {
  Card,
  Typography,
  Button,
  Alert,
  Row,
  Col,
  Descriptions,
  Tag,
} from 'antd';
import {
  SettingOutlined,
  CloudServerOutlined,
  SafetyOutlined,
  DatabaseOutlined,
  ReloadOutlined,
  CheckCircleOutlined,
  ExclamationCircleOutlined,
} from '@ant-design/icons';
import { apiClient } from '../../services/api.service';

const { Title, Text, Paragraph } = Typography;

interface SystemHealth {
  database: boolean;
  api: boolean;
  environment: string;
}

export const AdminSettingsPanel: React.FC = () => {
  const [systemHealth, setSystemHealth] = useState<SystemHealth | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    checkSystemHealth();
  }, []);

  const checkSystemHealth = async () => {
    setLoading(true);
    try {
      const response = await apiClient.get('/system/health');
      setSystemHealth({
        database: response.data?.database?.connected ?? true,
        api: true,
        environment: response.data?.environment || 'production',
      });
    } catch (error) {
      setSystemHealth({
        database: false,
        api: false,
        environment: 'unknown',
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <Title level={4}>
        <SettingOutlined className="mr-2" />
        System Settings
      </Title>

      <Alert
        message="Settings Coming Soon"
        description="System settings configuration is under development. Currently, you can view system health status below."
        type="info"
        showIcon
        className="mb-6"
      />

      <Row gutter={[16, 16]}>
        {/* System Health */}
        <Col xs={24} lg={12}>
          <Card
            title={<><CloudServerOutlined className="mr-2" />System Health</>}
            extra={
              <Button
                icon={<ReloadOutlined />}
                size="small"
                onClick={checkSystemHealth}
                loading={loading}
              >
                Refresh
              </Button>
            }
          >
            {loading ? (
              <div className="text-center py-4">Loading...</div>
            ) : systemHealth ? (
              <Descriptions column={1} size="small">
                <Descriptions.Item label="API Status">
                  {systemHealth.api ? (
                    <Tag icon={<CheckCircleOutlined />} color="success">Healthy</Tag>
                  ) : (
                    <Tag icon={<ExclamationCircleOutlined />} color="error">Unavailable</Tag>
                  )}
                </Descriptions.Item>
                <Descriptions.Item label="Database">
                  {systemHealth.database ? (
                    <Tag icon={<CheckCircleOutlined />} color="success">Connected</Tag>
                  ) : (
                    <Tag icon={<ExclamationCircleOutlined />} color="error">Disconnected</Tag>
                  )}
                </Descriptions.Item>
                <Descriptions.Item label="Environment">
                  <Tag color={systemHealth.environment === 'production' ? 'blue' : 'orange'}>
                    {systemHealth.environment}
                  </Tag>
                </Descriptions.Item>
              </Descriptions>
            ) : (
              <div className="text-center py-4 text-red-500">Failed to load health status</div>
            )}
          </Card>
        </Col>

        {/* Quick Info */}
        <Col xs={24} lg={12}>
          <Card title={<><DatabaseOutlined className="mr-2" />Application Info</>}>
            <Descriptions column={1} size="small">
              <Descriptions.Item label="Version">
                <Tag color="blue">v1.0.0</Tag>
              </Descriptions.Item>
              <Descriptions.Item label="Storage">
                <Tag color="purple">Google Cloud Storage</Tag>
              </Descriptions.Item>
              <Descriptions.Item label="Database">
                <Tag color="cyan">PostgreSQL</Tag>
              </Descriptions.Item>
            </Descriptions>
          </Card>
        </Col>
      </Row>

      {/* Security Notice */}
      <Card title={<><SafetyOutlined className="mr-2" />Security Notice</>}>
        <Paragraph type="secondary">
          The following security features are enabled by default:
        </Paragraph>
        <ul className="list-disc list-inside text-gray-600 space-y-1">
          <li>New user registration requires admin approval</li>
          <li>JWT-based authentication with secure tokens</li>
          <li>Role-based access control (Admin, Clinician, Researcher, Patient)</li>
          <li>Soft-delete with 15-day retention before permanent deletion</li>
          <li>Audit logging for all administrative actions</li>
        </ul>
      </Card>

      {/* Future Settings */}
      <Card title="Future Settings (Coming Soon)">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-gray-500">
          <div className="p-3 bg-gray-50 rounded">
            <Text type="secondary">Email notification settings</Text>
          </div>
          <div className="p-3 bg-gray-50 rounded">
            <Text type="secondary">Data retention configuration</Text>
          </div>
          <div className="p-3 bg-gray-50 rounded">
            <Text type="secondary">Processing queue settings</Text>
          </div>
          <div className="p-3 bg-gray-50 rounded">
            <Text type="secondary">Storage quota management</Text>
          </div>
        </div>
      </Card>
    </div>
  );
};

export default AdminSettingsPanel;
