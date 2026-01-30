import React, { useState } from 'react';
import { Card, Tabs, Space, Statistic, Row, Col, Badge } from 'antd';
import {
  UserOutlined,
  ClockCircleOutlined,
  CheckCircleOutlined,
  TeamOutlined,
  HistoryOutlined,
} from '@ant-design/icons';
import type { User } from '../../../types/api.types';
import { useAdminStats, usePendingUsers, useUsers } from '../../../hooks/useAdmin';
import { PendingApprovalsTab } from './PendingApprovalsTab';
import { UserListTable } from './UserListTable';
import { UserDetailDrawer } from './UserDetailDrawer';
import { AuditLogsPanel } from '../AuditLogsPanel';
import { statusColors } from '../../../theme/antd-theme';

type TabKey = 'all' | 'pending' | 'audit';

export const UserManagementPanel: React.FC = () => {
  const [activeTab, setActiveTab] = useState<TabKey>('all');
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);

  const { data: stats } = useAdminStats();
  const { data: pendingData } = usePendingUsers();
  const { data: usersData } = useUsers();

  const pendingCount = pendingData?.data?.length || 0;
  const totalUsers = usersData?.data?.length || 0;

  // Handle user click from table
  const handleUserClick = (user: User) => {
    setSelectedUserId(user.id);
    setDrawerOpen(true);
  };

  // Handle drawer close
  const handleDrawerClose = () => {
    setDrawerOpen(false);
    // Delay clearing selectedUserId to prevent flickering
    setTimeout(() => setSelectedUserId(null), 300);
  };

  // Tab items
  const tabItems = [
    {
      key: 'all',
      label: (
        <Space>
          <TeamOutlined />
          <span>All Users</span>
          <Badge count={totalUsers} showZero style={{ backgroundColor: '#0070f3' }} />
        </Space>
      ),
      children: <UserListTable onUserClick={handleUserClick} />,
    },
    {
      key: 'pending',
      label: (
        <Space>
          <ClockCircleOutlined />
          <span>Pending Approvals</span>
          <Badge count={pendingCount} showZero style={{ backgroundColor: statusColors.pending }} />
        </Space>
      ),
      children: <PendingApprovalsTab />,
    },
    {
      key: 'audit',
      label: (
        <Space>
          <HistoryOutlined />
          <span>Audit Logs</span>
        </Space>
      ),
      children: <AuditLogsPanel />,
    },
  ];

  return (
    <div>
      {/* Stats Cards */}
      <Row gutter={16} style={{ marginBottom: 24 }}>
        <Col xs={24} sm={12} md={6}>
          <Card>
            <Statistic
              title="Total Users"
              value={stats?.users?.total || totalUsers}
              prefix={<TeamOutlined />}
              valueStyle={{ color: '#0070f3' }}
            />
          </Card>
        </Col>
        <Col xs={24} sm={12} md={6}>
          <Card>
            <Statistic
              title="Pending Approval"
              value={pendingCount}
              prefix={<ClockCircleOutlined />}
              valueStyle={{ color: statusColors.pending }}
            />
          </Card>
        </Col>
        <Col xs={24} sm={12} md={6}>
          <Card>
            <Statistic
              title="Approved Today"
              value={0}
              prefix={<CheckCircleOutlined />}
              valueStyle={{ color: statusColors.approved }}
            />
          </Card>
        </Col>
        <Col xs={24} sm={12} md={6}>
          <Card>
            <Statistic
              title="Active Users"
              value={stats?.users?.total || 0}
              prefix={<UserOutlined />}
              valueStyle={{ color: '#52c41a' }}
            />
          </Card>
        </Col>
      </Row>

      {/* Tabs Section */}
      <Card>
        <Tabs
          activeKey={activeTab}
          onChange={(key) => setActiveTab(key as TabKey)}
          items={tabItems}
          size="large"
        />
      </Card>

      {/* User Detail Drawer */}
      <UserDetailDrawer
        userId={selectedUserId}
        open={drawerOpen}
        onClose={handleDrawerClose}
      />
    </div>
  );
};
