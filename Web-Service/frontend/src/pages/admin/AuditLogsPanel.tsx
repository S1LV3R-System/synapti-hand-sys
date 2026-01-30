import React, { useState } from 'react';
import {
  Table,
  Card,
  Space,
  Tag,
  Button,
  Input,
  Select,
  Typography,
  DatePicker,
  Tooltip,
  Drawer,
  Descriptions,
  message,
} from 'antd';
import {
  SearchOutlined,
  ReloadOutlined,
  ExportOutlined,
  EyeOutlined,
  HistoryOutlined,
  UserOutlined,
  ClockCircleOutlined,
  GlobalOutlined,
} from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import { useAuditLogs, useExportAuditLogs } from '../../hooks/useAdmin';
import type { AuditLog, AuditLogFilters } from '../../types/api.types';

const { Title, Text } = Typography;
const { Option } = Select;
const { RangePicker } = DatePicker;

const actionColors: Record<string, string> = {
  create: 'green',
  update: 'blue',
  delete: 'red',
  login: 'purple',
  logout: 'orange',
  approve: 'cyan',
  reject: 'magenta',
};

export const AuditLogsPanel: React.FC = () => {
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);
  const [selectedLog, setSelectedLog] = useState<AuditLog | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [filters, setFilters] = useState<AuditLogFilters>({});

  const { data, isLoading, refetch } = useAuditLogs({
    page,
    limit: pageSize,
    ...filters,
  });

  const exportLogs = useExportAuditLogs();

  const logs = data?.data || [];
  const pagination = data?.pagination;

  const handleFilterChange = (key: keyof AuditLogFilters, value: any) => {
    setFilters(prev => ({ ...prev, [key]: value }));
    setPage(1);
  };

  const handleDateRangeChange = (dates: any) => {
    setFilters(prev => ({
      ...prev,
      startDate: dates?.[0]?.toISOString(),
      endDate: dates?.[1]?.toISOString(),
    }));
    setPage(1);
  };

  const handleViewDetails = (log: AuditLog) => {
    setSelectedLog(log);
    setDrawerOpen(true);
  };

  const handleExport = async () => {
    try {
      await exportLogs.mutateAsync(filters);
    } catch (error) {
      message.error('Failed to export audit logs');
    }
  };

  const parseDetails = (details?: string) => {
    if (!details) return null;
    try {
      return JSON.parse(details);
    } catch {
      return details;
    }
  };

  const columns: ColumnsType<AuditLog> = [
    {
      title: 'Timestamp',
      dataIndex: 'createdAt',
      key: 'createdAt',
      width: 180,
      render: (date) => (
        <Space direction="vertical" size={0}>
          <Text>{new Date(date).toLocaleDateString()}</Text>
          <Text type="secondary" className="text-xs">
            {new Date(date).toLocaleTimeString()}
          </Text>
        </Space>
      ),
      sorter: true,
    },
    {
      title: 'User',
      key: 'user',
      width: 200,
      render: (_, record) => (
        <Space>
          <UserOutlined />
          <div>
            <Text strong>{record.user?.email || 'System'}</Text>
            {record.user?.role && (
              <Tag className="ml-2">{record.user.role}</Tag>
            )}
          </div>
        </Space>
      ),
    },
    {
      title: 'Action',
      dataIndex: 'action',
      key: 'action',
      width: 150,
      render: (action) => {
        const parts = action.split('.');
        const actionType = parts[parts.length - 1];
        return (
          <Tag color={actionColors[actionType] || 'default'}>
            {action}
          </Tag>
        );
      },
      filters: [
        { text: 'Create', value: 'create' },
        { text: 'Update', value: 'update' },
        { text: 'Delete', value: 'delete' },
        { text: 'Login', value: 'login' },
        { text: 'Logout', value: 'logout' },
      ],
    },
    {
      title: 'Resource',
      key: 'resource',
      width: 150,
      render: (_, record) => (
        <Space direction="vertical" size={0}>
          <Text>{record.entityType}</Text>
          {record.entityId && (
            <Text type="secondary" className="text-xs">
              {record.entityId.substring(0, 8)}...
            </Text>
          )}
        </Space>
      ),
    },
    {
      title: 'IP Address',
      dataIndex: 'ipAddress',
      key: 'ipAddress',
      width: 130,
      render: (ip) => (
        <Space>
          <GlobalOutlined />
          <Text code className="text-xs">{ip || '-'}</Text>
        </Space>
      ),
    },
    {
      title: '',
      key: 'actions',
      width: 60,
      render: (_, record) => (
        <Tooltip title="View Details">
          <Button
            type="text"
            size="small"
            icon={<EyeOutlined />}
            onClick={() => handleViewDetails(record)}
          />
        </Tooltip>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <Title level={4}>
          <HistoryOutlined className="mr-2" />
          Audit Logs
        </Title>
        <Button
          icon={<ExportOutlined />}
          onClick={handleExport}
          loading={exportLogs.isPending}
        >
          Export CSV
        </Button>
      </div>

      {/* Filters */}
      <Card size="small">
        <div className="flex justify-between items-center flex-wrap gap-4">
          <Space wrap>
            <Input.Search
              placeholder="Search by user or action..."
              allowClear
              style={{ width: 250 }}
              onSearch={(value) => handleFilterChange('action', value)}
              prefix={<SearchOutlined />}
            />
            <Select
              placeholder="Action Type"
              allowClear
              style={{ width: 150 }}
              onChange={(value) => handleFilterChange('action', value)}
            >
              <Option value="create">Create</Option>
              <Option value="update">Update</Option>
              <Option value="delete">Delete</Option>
              <Option value="login">Login</Option>
              <Option value="logout">Logout</Option>
              <Option value="approve">Approve</Option>
              <Option value="reject">Reject</Option>
            </Select>
            <Select
              placeholder="Resource Type"
              allowClear
              style={{ width: 150 }}
              onChange={(value) => handleFilterChange('entityType', value)}
            >
              <Option value="user">User</Option>
              <Option value="recording">Recording</Option>
              <Option value="protocol">Protocol</Option>
              <Option value="analysis">Analysis</Option>
            </Select>
            <RangePicker
              onChange={handleDateRangeChange}
              placeholder={['Start Date', 'End Date']}
            />
          </Space>

          <Tooltip title="Refresh">
            <Button icon={<ReloadOutlined />} onClick={() => refetch()} />
          </Tooltip>
        </div>
      </Card>

      {/* Table */}
      <Card>
        <Table
          rowKey="id"
          columns={columns}
          dataSource={logs}
          loading={isLoading}
          pagination={{
            current: page,
            pageSize: pageSize,
            total: pagination?.total || 0,
            showSizeChanger: true,
            pageSizeOptions: ['20', '50', '100'],
            showTotal: (total, range) => `${range[0]}-${range[1]} of ${total} logs`,
            onChange: (p, ps) => {
              setPage(p);
              setPageSize(ps);
            },
          }}
          scroll={{ x: 1000 }}
          size="small"
        />
      </Card>

      {/* Detail Drawer */}
      <Drawer
        title="Audit Log Details"
        placement="right"
        width={500}
        onClose={() => {
          setDrawerOpen(false);
          setSelectedLog(null);
        }}
        open={drawerOpen}
      >
        {selectedLog && (
          <div className="space-y-6">
            <Descriptions column={1} size="small" bordered>
              <Descriptions.Item label="Log ID">
                <Text code>{selectedLog.id}</Text>
              </Descriptions.Item>
              <Descriptions.Item label="Timestamp">
                <Space>
                  <ClockCircleOutlined />
                  {new Date(selectedLog.createdAt).toLocaleString()}
                </Space>
              </Descriptions.Item>
              <Descriptions.Item label="User">
                <Space>
                  <UserOutlined />
                  {selectedLog.user?.email || 'System'}
                  {selectedLog.user?.role && (
                    <Tag>{selectedLog.user.role}</Tag>
                  )}
                </Space>
              </Descriptions.Item>
              <Descriptions.Item label="Action">
                <Tag color={actionColors[selectedLog.action.split('.').pop() || ''] || 'default'}>
                  {selectedLog.action}
                </Tag>
              </Descriptions.Item>
              <Descriptions.Item label="Resource Type">
                {selectedLog.entityType}
              </Descriptions.Item>
              <Descriptions.Item label="Resource ID">
                <Text code>{selectedLog.entityId || '-'}</Text>
              </Descriptions.Item>
              <Descriptions.Item label="IP Address">
                <Space>
                  <GlobalOutlined />
                  <Text code>{selectedLog.ipAddress || '-'}</Text>
                </Space>
              </Descriptions.Item>
            </Descriptions>

            {selectedLog.userAgent && (
              <Card size="small" title="User Agent">
                <Text className="text-xs" type="secondary">
                  {selectedLog.userAgent}
                </Text>
              </Card>
            )}

            {selectedLog.details && (
              <Card size="small" title="Details">
                <pre className="bg-gray-50 p-3 rounded text-xs overflow-auto max-h-64">
                  {JSON.stringify(parseDetails(selectedLog.details), null, 2)}
                </pre>
              </Card>
            )}
          </div>
        )}
      </Drawer>
    </div>
  );
};

export default AuditLogsPanel;
