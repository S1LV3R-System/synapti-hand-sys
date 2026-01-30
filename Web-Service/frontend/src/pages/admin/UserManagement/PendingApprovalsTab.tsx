import React, { useState } from 'react';
import {
  Card,
  Row,
  Col,
  Space,
  Typography,
  Tag,
  Button,
  Empty,
  Spin,
  Input,
  Badge,
  Tooltip,
  Divider,
} from 'antd';
import {
  CheckCircleOutlined,
  CloseCircleOutlined,
  UserOutlined,
  MailOutlined,
  IdcardOutlined,
  ClockCircleOutlined,
  SearchOutlined,
  ReloadOutlined,
} from '@ant-design/icons';
import type { PendingUser } from '../../../types/admin.types';
import { usePendingUsers } from '../../../hooks/useAdmin';
import { ApprovalModal } from './ApprovalModal';
import { RejectionModal } from './RejectionModal';
import { statusColors } from '../../../theme/antd-theme';

const { Text, Title } = Typography;
const { Search } = Input;

export const PendingApprovalsTab: React.FC = () => {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedUser, setSelectedUser] = useState<PendingUser | null>(null);
  const [approvalModalOpen, setApprovalModalOpen] = useState(false);
  const [rejectionModalOpen, setRejectionModalOpen] = useState(false);

  const { data, isLoading, refetch } = usePendingUsers();

  const pendingUsers = data?.data || [];
  const filteredUsers = pendingUsers.filter(
    (user) =>
      user.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
      user.fullName?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      user.hospital?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const handleApprove = (user: PendingUser) => {
    setSelectedUser(user);
    setApprovalModalOpen(true);
  };

  const handleReject = (user: PendingUser) => {
    setSelectedUser(user);
    setRejectionModalOpen(true);
  };

  const handleModalClose = () => {
    setSelectedUser(null);
    setApprovalModalOpen(false);
    setRejectionModalOpen(false);
  };

  const handleSuccess = () => {
    refetch();
  };

  const getDaysWaiting = (createdAt: string) => {
    const days = Math.floor((Date.now() - new Date(createdAt).getTime()) / (1000 * 60 * 60 * 24));
    return days;
  };

  return (
    <div>
      {/* Header */}
      <div style={{ marginBottom: 24 }}>
        <Space direction="vertical" style={{ width: '100%' }} size="middle">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <Space>
              <Title level={4} style={{ margin: 0 }}>
                Pending Approvals
              </Title>
              <Badge count={pendingUsers.length} showZero style={{ backgroundColor: statusColors.pending }} />
            </Space>
            <Button
              icon={<ReloadOutlined />}
              onClick={() => refetch()}
              loading={isLoading}
            >
              Refresh
            </Button>
          </div>

          <Search
            placeholder="Search by name, email, or hospital..."
            allowClear
            prefix={<SearchOutlined />}
            onChange={(e) => setSearchTerm(e.target.value)}
            style={{ maxWidth: 400 }}
          />
        </Space>
      </div>

      {/* Loading State */}
      {isLoading && (
        <div style={{ textAlign: 'center', padding: '60px 0' }}>
          <Spin size="large" tip="Loading pending users..." />
        </div>
      )}

      {/* Empty State */}
      {!isLoading && filteredUsers.length === 0 && (
        <Empty
          image={Empty.PRESENTED_IMAGE_SIMPLE}
          description={
            searchTerm
              ? `No pending users match "${searchTerm}"`
              : 'No pending user registrations'
          }
        />
      )}

      {/* User Cards Grid */}
      {!isLoading && filteredUsers.length > 0 && (
        <Row gutter={[16, 16]}>
          {filteredUsers.map((user) => {
            const daysWaiting = getDaysWaiting(user.createdAt);
            const isUrgent = daysWaiting >= 3;

            return (
              <Col xs={24} sm={24} md={12} lg={12} xl={8} key={user.id}>
                <Card
                  hoverable
                  style={{
                    height: '100%',
                    border: isUrgent ? `2px solid ${statusColors.warning}` : undefined,
                  }}
                  styles={{
                    body: { padding: 20 },
                  }}
                >
                  <Space direction="vertical" size="middle" style={{ width: '100%' }}>
                    {/* Header with urgent badge */}
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start' }}>
                      <Space>
                        <UserOutlined style={{ fontSize: 20, color: '#0070f3' }} />
                        <div>
                          <Text strong style={{ fontSize: 16 }}>
                            {user.fullName || `${user.firstName} ${user.lastName}`}
                          </Text>
                          <br />
                          <Tag color="blue" style={{ marginTop: 4 }}>
                            {user.role}
                          </Tag>
                        </div>
                      </Space>
                      {isUrgent && (
                        <Tooltip title={`Waiting ${daysWaiting} days`}>
                          <Tag color="warning" icon={<ClockCircleOutlined />}>
                            Urgent
                          </Tag>
                        </Tooltip>
                      )}
                    </div>

                    <Divider style={{ margin: 0 }} />

                    {/* User Details */}
                    <Space direction="vertical" size="small" style={{ width: '100%' }}>
                      <Space>
                        <MailOutlined style={{ color: '#666' }} />
                        <Text style={{ fontSize: 13 }}>{user.email}</Text>
                      </Space>

                      {user.hospital && (
                        <Space>
                          <IdcardOutlined style={{ color: '#666' }} />
                          <Text style={{ fontSize: 13 }}>
                            {user.hospital}
                            {user.department && ` - ${user.department}`}
                          </Text>
                        </Space>
                      )}

                      {user.licenseNumber && (
                        <Space>
                          <IdcardOutlined style={{ color: '#666' }} />
                          <Text style={{ fontSize: 13 }}>
                            License: {user.licenseNumber}
                            {user.licenseState && ` (${user.licenseState})`}
                          </Text>
                        </Space>
                      )}

                      <Space>
                        <ClockCircleOutlined style={{ color: '#666' }} />
                        <Text type="secondary" style={{ fontSize: 12 }}>
                          Registered {daysWaiting === 0 ? 'today' : `${daysWaiting} day${daysWaiting > 1 ? 's' : ''} ago`}
                        </Text>
                      </Space>

                      {user.adminNotes && user.adminNotes.length > 0 && (
                        <Tag color="default" style={{ marginTop: 4 }}>
                          {user.adminNotes.length} note{user.adminNotes.length > 1 ? 's' : ''}
                        </Tag>
                      )}
                    </Space>

                    <Divider style={{ margin: 0 }} />

                    {/* Action Buttons */}
                    <Space style={{ width: '100%', justifyContent: 'flex-end' }}>
                      <Button
                        type="default"
                        danger
                        icon={<CloseCircleOutlined />}
                        onClick={() => handleReject(user)}
                      >
                        Reject
                      </Button>
                      <Button
                        type="primary"
                        icon={<CheckCircleOutlined />}
                        onClick={() => handleApprove(user)}
                      >
                        Approve
                      </Button>
                    </Space>
                  </Space>
                </Card>
              </Col>
            );
          })}
        </Row>
      )}

      {/* Modals */}
      <ApprovalModal
        open={approvalModalOpen}
        user={selectedUser}
        onClose={handleModalClose}
        onSuccess={handleSuccess}
      />

      <RejectionModal
        open={rejectionModalOpen}
        user={selectedUser}
        onClose={handleModalClose}
        onSuccess={handleSuccess}
      />
    </div>
  );
};
