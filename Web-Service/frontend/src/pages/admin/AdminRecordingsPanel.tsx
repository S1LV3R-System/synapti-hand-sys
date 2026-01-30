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
  Statistic,
  Row,
  Col,
  Modal,
  message,
  Tooltip,
  Dropdown,
} from 'antd';
import {
  SearchOutlined,
  ReloadOutlined,
  DeleteOutlined,
  EyeOutlined,
  MoreOutlined,
  ExportOutlined,
  VideoCameraOutlined,
  SyncOutlined,
  CheckCircleOutlined,
  CloseCircleOutlined,
} from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import type { MenuProps } from 'antd';
import { useRecordings, useDeleteRecording } from '../../hooks/useRecordings';
import { StatusBadge } from '../../components/StatusBadge';
import type { RecordingSession } from '../../types/api.types';

const { Title, Text } = Typography;
const { Option } = Select;

export const AdminRecordingsPanel: React.FC = () => {
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [selectedRowKeys, setSelectedRowKeys] = useState<React.Key[]>([]);
  const [filters, setFilters] = useState<{
    status?: string;
    search?: string;
  }>({});

  const { data, isLoading, refetch } = useRecordings({
    page,
    limit: pageSize,
    status: filters.status as any,
    search: filters.search,
  });

  const deleteRecordingMutation = useDeleteRecording();

  const recordings = data?.data || [];
  const pagination = data?.pagination;

  const handleFilterChange = (key: string, value: any) => {
    setFilters(prev => ({ ...prev, [key]: value }));
    setPage(1);
  };

  const handleBulkDelete = () => {
    Modal.confirm({
      title: `Delete ${selectedRowKeys.length} recordings?`,
      content: 'These recordings will be moved to trash and permanently deleted after 30 days.',
      okText: 'Delete All',
      okType: 'danger',
      onOk: async () => {
        try {
          // Delete all selected recordings
          await Promise.all(
            selectedRowKeys.map(id =>
              deleteRecordingMutation.mutateAsync({ id: id as string })
            )
          );
          message.success(`${selectedRowKeys.length} recordings deleted. They will be permanently removed after 30 days.`);
          setSelectedRowKeys([]);
        } catch (error) {
          message.error('Failed to delete some recordings');
        }
      },
    });
  };

  const handleExport = () => {
    const exportData = selectedRowKeys.length > 0
      ? recordings.filter(r => selectedRowKeys.includes(r.id))
      : recordings;

    const csv = [
      ['ID', 'Patient', 'Date', 'Status', 'Protocol'].join(','),
      ...exportData.map(r => [
        r.id,
        `${r.patient?.firstName || ''} ${r.patient?.lastName || ''}`,
        new Date(r.recordingDate).toLocaleDateString(),
        r.status,
        r.protocol?.name || '',
      ].join(','))
    ].join('\n');

    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `admin-recordings-${new Date().toISOString()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    message.success('Export completed');
  };

  const getRowActions = (record: RecordingSession): MenuProps['items'] => [
    {
      key: 'view',
      icon: <EyeOutlined />,
      label: 'View Details',
      onClick: () => window.open(`/recordings/${record.id}`, '_blank'),
    },
    { type: 'divider' },
    {
      key: 'delete',
      icon: <DeleteOutlined />,
      label: 'Delete',
      danger: true,
      onClick: () => {
        Modal.confirm({
          title: 'Delete Recording',
          content: 'This recording will be moved to trash and permanently deleted after 30 days.',
          okText: 'Delete',
          okType: 'danger',
          onOk: async () => {
            try {
              await deleteRecordingMutation.mutateAsync({ id: record.id });
              message.success('Recording deleted. It will be permanently removed after 30 days.');
            } catch (error) {
              message.error('Failed to delete recording');
            }
          },
        });
      },
    },
  ];

  const columns: ColumnsType<RecordingSession> = [
    {
      title: 'ID',
      dataIndex: 'id',
      key: 'id',
      width: 100,
      render: (id) => <Text code className="text-xs">{id.substring(0, 8)}</Text>,
    },
    {
      title: 'Patient',
      key: 'patient',
      render: (_, record) => (
        <Space direction="vertical" size={0}>
          <Text strong>{record.patient?.firstName} {record.patient?.lastName}</Text>
          <Text type="secondary" className="text-xs">
            MRN: {record.patient?.mrn || '-'}
          </Text>
        </Space>
      ),
    },
    {
      title: 'Clinician',
      key: 'clinician',
      render: (_, record) => record.clinician?.email || '-',
      width: 180,
    },
    {
      title: 'Protocol',
      dataIndex: 'protocol',
      key: 'protocol',
      render: (protocol) => protocol?.name || <Text type="secondary">None</Text>,
      width: 150,
    },
    {
      title: 'Status',
      key: 'status',
      width: 120,
      render: (_, record) => <StatusBadge status={record.status} />,
    },
    {
      title: 'Review',
      key: 'reviewStatus',
      width: 100,
      render: (_, record) => {
        const colorMap: Record<string, string> = {
          pending: 'orange',
          approved: 'green',
          flagged: 'red',
        };
        return <Tag color={colorMap[record.reviewStatus]}>{record.reviewStatus}</Tag>;
      },
    },
    {
      title: 'Date',
      dataIndex: 'recordingDate',
      key: 'recordingDate',
      width: 110,
      render: (date) => new Date(date).toLocaleDateString(),
      sorter: true,
    },
    {
      title: '',
      key: 'actions',
      width: 50,
      render: (_, record) => (
        <Dropdown menu={{ items: getRowActions(record) }} trigger={['click']}>
          <Button type="text" icon={<MoreOutlined />} />
        </Dropdown>
      ),
    },
  ];

  const rowSelection = {
    selectedRowKeys,
    onChange: (keys: React.Key[]) => setSelectedRowKeys(keys),
  };

  // Stats
  const byStatus = recordings.reduce((acc, r) => {
    acc[r.status] = (acc[r.status] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  return (
    <div className="space-y-6">
      <Title level={4}>
        <VideoCameraOutlined className="mr-2" />
        All Recordings (Admin View)
      </Title>

      {/* Stats */}
      <Row gutter={16}>
        <Col span={6}>
          <Card size="small">
            <Statistic
              title="Total"
              value={pagination?.total || 0}
              prefix={<VideoCameraOutlined />}
            />
          </Card>
        </Col>
        <Col span={6}>
          <Card size="small">
            <Statistic
              title="Processing"
              value={byStatus['processing'] || 0}
              valueStyle={{ color: '#1890ff' }}
              prefix={<SyncOutlined spin />}
            />
          </Card>
        </Col>
        <Col span={6}>
          <Card size="small">
            <Statistic
              title="Analyzed"
              value={byStatus['analyzed'] || 0}
              valueStyle={{ color: '#52c41a' }}
              prefix={<CheckCircleOutlined />}
            />
          </Card>
        </Col>
        <Col span={6}>
          <Card size="small">
            <Statistic
              title="Failed"
              value={byStatus['failed'] || 0}
              valueStyle={{ color: '#ff4d4f' }}
              prefix={<CloseCircleOutlined />}
            />
          </Card>
        </Col>
      </Row>

      {/* Filters & Actions */}
      <Card size="small">
        <div className="flex justify-between items-center flex-wrap gap-4">
          <Space wrap>
            <Input.Search
              placeholder="Search recordings..."
              allowClear
              style={{ width: 250 }}
              onSearch={(value) => handleFilterChange('search', value)}
              prefix={<SearchOutlined />}
            />
            <Select
              placeholder="Status"
              allowClear
              style={{ width: 140 }}
              onChange={(value) => handleFilterChange('status', value)}
            >
              <Option value="uploaded">Uploaded</Option>
              <Option value="processing">Processing</Option>
              <Option value="analyzed">Analyzed</Option>
              <Option value="failed">Failed</Option>
            </Select>
          </Space>

          <Space>
            {selectedRowKeys.length > 0 && (
              <>
                <Text type="secondary">{selectedRowKeys.length} selected</Text>
                <Button icon={<ExportOutlined />} onClick={handleExport}>
                  Export
                </Button>
                <Button danger icon={<DeleteOutlined />} onClick={handleBulkDelete}>
                  Delete
                </Button>
              </>
            )}
            <Tooltip title="Refresh">
              <Button icon={<ReloadOutlined />} onClick={() => refetch()} />
            </Tooltip>
          </Space>
        </div>
      </Card>

      {/* Table */}
      <Card>
        <Table
          rowKey="id"
          columns={columns}
          dataSource={recordings}
          loading={isLoading}
          rowSelection={rowSelection}
          pagination={{
            current: page,
            pageSize: pageSize,
            total: pagination?.total || 0,
            showSizeChanger: true,
            showTotal: (total, range) => `${range[0]}-${range[1]} of ${total}`,
            onChange: (p, ps) => {
              setPage(p);
              setPageSize(ps);
            },
          }}
          scroll={{ x: 1100 }}
          size="small"
        />
      </Card>
    </div>
  );
};

export default AdminRecordingsPanel;
