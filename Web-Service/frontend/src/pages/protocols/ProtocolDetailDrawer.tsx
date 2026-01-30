import React from 'react';
import {
  Drawer,
  Descriptions,
  Tag,
  Space,
  Button,
  Typography,
  Divider,
  Card,
  Timeline,
  Empty,
} from 'antd';
import {
  EditOutlined,
  ClockCircleOutlined,
  UserOutlined,
  FileTextOutlined,
  PlayCircleOutlined,
} from '@ant-design/icons';
import type { Protocol, ProtocolMovement } from '../../types/api.types';
import { useCurrentUser } from '../../hooks/useAuth';
import { isClinicianOrAdmin } from '../../utils/permissions';

const { Title, Text, Paragraph } = Typography;

interface ProtocolDetailDrawerProps {
  open: boolean;
  protocol: Protocol | null;
  onClose: () => void;
  onEdit: () => void;
}

export const ProtocolDetailDrawer: React.FC<ProtocolDetailDrawerProps> = ({
  open,
  protocol,
  onClose,
  onEdit,
}) => {
  const { data: currentUser } = useCurrentUser();

  if (!protocol) return null;

  // Parse configuration
  let config: {
    movements?: ProtocolMovement[];
    requiredMetrics?: string[];
    instructions?: string;
    clinicalGuidelines?: string;
  } = {};
  
  try {
    config = typeof protocol.configuration === 'string'
      ? JSON.parse(protocol.configuration)
      : protocol.configuration || {};
  } catch {
    config = {};
  }

  const movements = config.movements || [];
  const totalDuration = movements.reduce((sum, m) => sum + (m.duration || 0), 0);

  return (
    <Drawer
      title={
        <Space>
          <FileTextOutlined />
          <span>Protocol Details</span>
        </Space>
      }
      placement="right"
      width={600}
      onClose={onClose}
      open={open}
      extra={
        isClinicianOrAdmin(currentUser) && (
          <Button type="primary" icon={<EditOutlined />} onClick={onEdit}>
            Edit
          </Button>
        )
      }
    >
      {/* Header */}
      <div className="mb-6">
        <Title level={3} className="!mb-2">{protocol.name}</Title>
        <Space>
          <Tag color="blue">{protocol.version || 'v1.0'}</Tag>
          <Tag color={protocol.isActive ? 'success' : 'default'}>
            {protocol.isActive ? 'Active' : 'Inactive'}
          </Tag>
          <Tag color={protocol.isPublic ? 'blue' : 'orange'}>
            {protocol.isPublic ? 'Public' : 'Private'}
          </Tag>
        </Space>
      </div>

      {protocol.description && (
        <Paragraph className="text-gray-600">{protocol.description}</Paragraph>
      )}

      <Divider />

      {/* Basic Info */}
      <Descriptions column={1} size="small" className="mb-6">
        <Descriptions.Item 
          label={<Space><UserOutlined /> Created By</Space>}
        >
          {protocol.createdBy?.email || 'Unknown'}
        </Descriptions.Item>
        <Descriptions.Item 
          label={<Space><ClockCircleOutlined /> Created</Space>}
        >
          {new Date(protocol.createdAt).toLocaleString()}
        </Descriptions.Item>
        <Descriptions.Item 
          label={<Space><ClockCircleOutlined /> Last Updated</Space>}
        >
          {new Date(protocol.updatedAt).toLocaleString()}
        </Descriptions.Item>
      </Descriptions>

      {/* Clinical Info */}
      {(protocol.indicatedFor || protocol.contraindications) && (
        <>
          <Divider>Clinical Information</Divider>
          
          {protocol.indicatedFor && (
            <div className="mb-4">
              <Text strong className="text-green-600">Indicated For:</Text>
              <Paragraph className="mt-1">{protocol.indicatedFor}</Paragraph>
            </div>
          )}
          
          {protocol.contraindications && (
            <div className="mb-4">
              <Text strong className="text-red-600">Contraindications:</Text>
              <Paragraph className="mt-1">{protocol.contraindications}</Paragraph>
            </div>
          )}
        </>
      )}

      {/* Movements */}
      <Divider>
        Movements ({movements.length}) • Total: {Math.floor(totalDuration / 60)}:{String(totalDuration % 60).padStart(2, '0')}
      </Divider>

      {movements.length === 0 ? (
        <Empty 
          image={Empty.PRESENTED_IMAGE_SIMPLE} 
          description="No movements configured"
        />
      ) : (
        <Timeline
          items={movements.map((movement, index) => ({
            dot: <PlayCircleOutlined style={{ fontSize: '16px' }} />,
            children: (
              <Card size="small" className="mb-2">
                <div className="flex justify-between items-start">
                  <div>
                    <Text strong>{movement.name}</Text>
                    <div className="mt-1">
                      <Space size="small">
                        <Tag>{movement.duration}s</Tag>
                        <Tag>{movement.repetitions} rep(s)</Tag>
                      </Space>
                    </div>
                  </div>
                  <Text type="secondary">#{index + 1}</Text>
                </div>
                {movement.instructions && (
                  <Paragraph type="secondary" className="mt-2 mb-0 text-sm">
                    {movement.instructions}
                  </Paragraph>
                )}
              </Card>
            ),
          }))}
        />
      )}

      {/* Instructions */}
      {config.instructions && (
        <>
          <Divider>Patient Instructions</Divider>
          <Card size="small" className="bg-blue-50 border-blue-200">
            <Paragraph className="mb-0">{config.instructions}</Paragraph>
          </Card>
        </>
      )}

      {/* Clinical Guidelines */}
      {config.clinicalGuidelines && (
        <>
          <Divider>Clinical Guidelines</Divider>
          <Card size="small" className="bg-green-50 border-green-200">
            <Paragraph className="mb-0">{config.clinicalGuidelines}</Paragraph>
          </Card>
        </>
      )}

      {/* Required Metrics */}
      {config.requiredMetrics && config.requiredMetrics.length > 0 && (
        <>
          <Divider>Required Metrics</Divider>
          <Space wrap>
            {config.requiredMetrics.map((metric) => (
              <Tag key={metric} color="purple">{metric}</Tag>
            ))}
          </Space>
        </>
      )}
    </Drawer>
  );
};

export default ProtocolDetailDrawer;
