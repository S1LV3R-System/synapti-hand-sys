import React, { useState, useMemo } from 'react';
import {
  Table,
  Space,
  Tag,
  Button,
  Input,
  Select,
  Badge,
  Tooltip,
  Dropdown,
  Typography,
  Row,
  Col,
  Card,
} from 'antd';
import type { TableProps, MenuProps } from 'antd';
import {
  SearchOutlined,
  FilterOutlined,
  ReloadOutlined,
  MoreOutlined,
  CheckCircleOutlined,
  CloseCircleOutlined,
  ClockCircleOutlined,
  UserOutlined,
  MailOutlined,
  IdcardOutlined,
} from '@ant-design/icons';
import type { User } from '../../../types/api.types';
import { useUsers, useToggleUserStatus } from '../../../hooks/useAdmin';
import { statusColors } from '../../../theme/antd-theme';

const { Text } = Typography;
const { Search } = Input;

interface UserListTableProps {
  onUserClick?: (user: User) => void;
}

type ApprovalFilter = 'all' | 'pending' | 'approved' | 'rejected';
type ActiveFilter = 'all' | 'active' | 'inactive';
type RoleFilter = 'all' | 'admin' | 'clinician' | 'researcher';

export const UserListTable: React.FC<UserListTableProps> = ({ onUserClick }) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [approvalFilter, setApprovalFilter] = useState<ApprovalFilter>('all');
  const [activeFilter, setActiveFilter] = useState<ActiveFilter>('all');
  const [roleFilter, setRoleFilter] = useState<RoleFilter>('all');
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  const { data, isLoading, refetch } = useUsers();
  const toggleUserStatus = useToggleUserStatus();

  const allUsers = data?.data || [];

  // Filter and search logic
  const filteredUsers = useMemo(() => {
    return allUsers.filter((user) => {
      // Search filter
      const searchLower = searchTerm.toLowerCase();
      const matchesSearch =
        !searchTerm ||
        user.email.toLowerCase().includes(searchLower) ||
        user.fullName?.toLowerCase().includes(searchLower) ||
        user.firstName?.toLowerCase().includes(searchLower) ||
        user.lastName?.toLowerCase().includes(searchLower) ||
        user.hospital?.toLowerCase().includes(searchLower) ||
        user.department?.toLowerCase().includes(searchLower);

      // Approval filter
      const matchesApproval =
        approvalFilter === 'all' ||
        (approvalFilter === 'pending' && user.isApproved === null) ||
        (approvalFilter === 'approved' && user.isApproved === true) ||
        (approvalFilter === 'rejected' && user.isApproved === false);

      // Active filter
      const matchesActive =
        activeFilter === 'all' ||
        (activeFilter === 'active' && user.isActive) ||
        (activeFilter === 'inactive' && !user.isActive);

      // Role filter
      const matchesRole =
        roleFilter === 'all' || user.role.toLowerCase() === roleFilter.toLowerCase();

      return matchesSearch && matchesApproval && matchesActive && matchesRole;
    });
  }, [allUsers, searchTerm, approvalFilter, activeFilter, roleFilter]);

  // Get approval status tag
  const getApprovalStatusTag = (user: User) => {
    if (user.isApproved === null) {
      return (
        <Tag color={statusColors.pending} icon={<ClockCircleOutlined />}>
          Pending
        </Tag>
      );
    } else if (user.isApproved === true) {
      return (
        <Tag color={statusColors.approved} icon={<CheckCircleOutlined />}>
          Approved
        </Tag>
      );
    } else {
      return (
        <Tag color={statusColors.rejected} icon={<CloseCircleOutlined />}>
          Rejected
        </Tag>
      );
    }
  };

  // Handle toggle user active status
  const handleToggleStatus = async (userId: string) => {
    try {
      await toggleUserStatus.mutateAsync(userId);
      refetch();
    } catch (error) {
      console.error('Failed to toggle user status:', error);
    }
  };

  // Action menu items
  const getActionMenuItems = (user: User): MenuProps['items'] => [
    {
      key: 'view',
      label: 'View Details',
      icon: <UserOutlined />,
      onClick: () => onUserClick?.(user),
    },
    {
      key: 'toggle-status',
      label: user.isActive ? 'Deactivate User' : 'Activate User',
      icon: user.isActive ? <CloseCircleOutlined /> : <CheckCircleOutlined />,
      onClick: () => handleToggleStatus(user.id),
    },
    {
      type: 'divider',
    },
    {
      key: 'email',
      label: 'Send Email',
      icon: <MailOutlined />,
      disabled: true, // TODO: Implement email functionality
    },
  ];

  // Table columns
  const columns: TableProps<User>['columns'] = [
    {
      title: 'Email',
      dataIndex: 'email',
      key: 'email',
      width: 250,
      sorter: (a, b) => a.email.localeCompare(b.email),
      render: (email: string, user) => (
        <Space direction="vertical" size={0}>
          <Text strong style={{ fontSize: 13 }}>
            {email}
          </Text>
          {user.emailVerified ? (
            <Tag color="success" style={{ fontSize: 10, padding: '0 4px' }}>
              Verified
            </Tag>
          ) : (
            <Tag color="warning" style={{ fontSize: 10, padding: '0 4px' }}>
              Unverified
            </Tag>
          )}
        </Space>
      ),
    },
    {
      title: 'Name',
      dataIndex: 'fullName',
      key: 'fullName',
      width: 200,
      sorter: (a, b) => {
        const nameA = a.fullName || `${a.firstName} ${a.lastName}`;
        const nameB = b.fullName || `${b.firstName} ${b.lastName}`;
        return nameA.localeCompare(nameB);
      },
      render: (fullName: string | null, user) => (
        <Text style={{ fontSize: 13 }}>
          {fullName || `${user.firstName || ''} ${user.lastName || ''}`.trim() || '—'}
        </Text>
      ),
    },
    {
      title: 'Role',
      dataIndex: 'role',
      key: 'role',
      width: 120,
      filters: [
        { text: 'Admin', value: 'admin' },
        { text: 'Clinician', value: 'clinician' },
        { text: 'Researcher', value: 'researcher' },
      ],
      onFilter: (value, record) => record.role === value,
      render: (role: string) => (
        <Tag color="blue" style={{ textTransform: 'capitalize' }}>
          {role}
        </Tag>
      ),
    },
    {
      title: 'Hospital / Org',
      dataIndex: 'hospital',
      key: 'hospital',
      width: 200,
      render: (hospital: string | null, user) => (
        <Space direction="vertical" size={0}>
          {hospital && (
            <Text style={{ fontSize: 12 }}>
              <IdcardOutlined style={{ marginRight: 4, color: '#666' }} />
              {hospital}
            </Text>
          )}
          {user.department && (
            <Text type="secondary" style={{ fontSize: 11 }}>
              {user.department}
            </Text>
          )}
          {!hospital && !user.department && <Text type="secondary">—</Text>}
        </Space>
      ),
    },
    {
      title: 'Status',
      dataIndex: 'isActive',
      key: 'isActive',
      width: 100,
      align: 'center',
      filters: [
        { text: 'Active', value: true },
        { text: 'Inactive', value: false },
      ],
      onFilter: (value, record) => record.isActive === value,
      render: (isActive: boolean) => (
        <Badge
          status={isActive ? 'success' : 'default'}
          text={isActive ? 'Active' : 'Inactive'}
        />
      ),
    },
    {
      title: 'Approval',
      dataIndex: 'isApproved',
      key: 'isApproved',
      width: 120,
      align: 'center',
      filters: [
        { text: 'Pending', value: 'null' },
        { text: 'Approved', value: 'true' },
        { text: 'Rejected', value: 'false' },
      ],
      onFilter: (value, record) => {
        if (value === 'null') return record.isApproved === null;
        if (value === 'true') return record.isApproved === true;
        if (value === 'false') return record.isApproved === false;
        return true;
      },
      render: (_: any, user: User) => getApprovalStatusTag(user),
    },
    {
      title: 'Registered',
      dataIndex: 'createdAt',
      key: 'createdAt',
      width: 130,
      sorter: (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
      render: (createdAt: string) => (
        <Text type="secondary" style={{ fontSize: 12 }}>
          {new Date(createdAt).toLocaleDateString()}
        </Text>
      ),
    },
    {
      title: 'Last Login',
      dataIndex: 'lastLogin',
      key: 'lastLogin',
      width: 130,
      sorter: (a, b) => {
        if (!a.lastLogin) return 1;
        if (!b.lastLogin) return -1;
        return new Date(a.lastLogin).getTime() - new Date(b.lastLogin).getTime();
      },
      render: (lastLogin: string | null) => (
        <Text type="secondary" style={{ fontSize: 12 }}>
          {lastLogin ? new Date(lastLogin).toLocaleDateString() : 'Never'}
        </Text>
      ),
    },
    {
      title: 'Actions',
      key: 'actions',
      width: 80,
      align: 'center',
      render: (_: any, user: User) => (
        <Dropdown menu={{ items: getActionMenuItems(user) }} trigger={['click']}>
          <Button type="text" icon={<MoreOutlined />} />
        </Dropdown>
      ),
    },
  ];

  // Count active filters
  const activeFiltersCount = [
    approvalFilter !== 'all',
    activeFilter !== 'all',
    roleFilter !== 'all',
  ].filter(Boolean).length;

  return (
    <div>
      {/* Filters and Search */}
      <Card style={{ marginBottom: 16 }} bodyStyle={{ padding: '16px' }}>
        <Row gutter={[16, 16]}>
          <Col xs={24} sm={24} md={12} lg={10}>
            <Search
              placeholder="Search by email, name, hospital..."
              allowClear
              prefix={<SearchOutlined />}
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              style={{ width: '100%' }}
            />
          </Col>

          <Col xs={12} sm={8} md={6} lg={4}>
            <Select
              value={approvalFilter}
              onChange={setApprovalFilter}
              style={{ width: '100%' }}
              options={[
                { label: 'All Approvals', value: 'all' },
                { label: 'Pending', value: 'pending' },
                { label: 'Approved', value: 'approved' },
                { label: 'Rejected', value: 'rejected' },
              ]}
            />
          </Col>

          <Col xs={12} sm={8} md={6} lg={4}>
            <Select
              value={activeFilter}
              onChange={setActiveFilter}
              style={{ width: '100%' }}
              options={[
                { label: 'All Status', value: 'all' },
                { label: 'Active', value: 'active' },
                { label: 'Inactive', value: 'inactive' },
              ]}
            />
          </Col>

          <Col xs={12} sm={8} md={6} lg={4}>
            <Select
              value={roleFilter}
              onChange={setRoleFilter}
              style={{ width: '100%' }}
              options={[
                { label: 'All Roles', value: 'all' },
                { label: 'Admin', value: 'admin' },
                { label: 'Clinician', value: 'clinician' },
                { label: 'Researcher', value: 'researcher' },
              ]}
            />
          </Col>

          <Col xs={12} sm={24} md={6} lg={2}>
            <Space>
              <Tooltip title="Refresh">
                <Button
                  icon={<ReloadOutlined />}
                  onClick={() => refetch()}
                  loading={isLoading}
                />
              </Tooltip>
              {activeFiltersCount > 0 && (
                <Badge count={activeFiltersCount} offset={[-5, 5]}>
                  <FilterOutlined style={{ fontSize: 16, color: '#0070f3' }} />
                </Badge>
              )}
            </Space>
          </Col>
        </Row>

        {/* Results count */}
        <div style={{ marginTop: 12 }}>
          <Text type="secondary" style={{ fontSize: 13 }}>
            Showing {filteredUsers.length} of {allUsers.length} users
            {searchTerm && ` matching "${searchTerm}"`}
          </Text>
        </div>
      </Card>

      {/* Table */}
      <Table
        columns={columns}
        dataSource={filteredUsers}
        rowKey="id"
        loading={isLoading}
        pagination={{
          current: currentPage,
          pageSize: pageSize,
          total: filteredUsers.length,
          showSizeChanger: true,
          showQuickJumper: true,
          pageSizeOptions: ['10', '20', '50', '100'],
          showTotal: (total, range) => `${range[0]}-${range[1]} of ${total} users`,
          onChange: (page, size) => {
            setCurrentPage(page);
            setPageSize(size);
          },
        }}
        onRow={(user) => ({
          onClick: () => onUserClick?.(user),
          style: { cursor: 'pointer' },
        })}
        scroll={{ x: 1400 }}
        size="middle"
      />
    </div>
  );
};
