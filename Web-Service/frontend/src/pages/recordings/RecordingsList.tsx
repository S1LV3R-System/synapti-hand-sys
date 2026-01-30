import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Table,
  Button as AntButton,
  Input,
  Select,
  Space,
  Tag,
  Modal,
  message,
  Card as AntCard,
  Typography,
  Row,
  Col,
  Statistic,
  Empty,
  Tooltip,
  Dropdown,
  DatePicker,
} from 'antd';
import {
  PlusOutlined,
  SearchOutlined,
  EditOutlined,
  DeleteOutlined,
  EyeOutlined,
  MoreOutlined,
  ReloadOutlined,
  ExportOutlined,
  DownloadOutlined,
  VideoCameraOutlined,
  CloudUploadOutlined,
  SyncOutlined,
  CheckCircleOutlined,
  LineChartOutlined,
} from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import type { MenuProps } from 'antd';
import { StatusBadge } from '../../components/StatusBadge';
import { useRecordings, useDeleteRecording } from '../../hooks/useRecordings';
import type { RecordingSession } from '../../types/api.types';

const { Title, Text } = Typography;
const { Option } = Select;

export const RecordingsList: React.FC = () => {
  const navigate = useNavigate();
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [selectedRowKeys, setSelectedRowKeys] = useState<React.Key[]>([]);
  const [bulkStatusModalOpen, setBulkStatusModalOpen] = useState(false);
  const [bulkDeleteModalOpen, setBulkDeleteModalOpen] = useState(false);
  const [selectedStatus, setSelectedStatus] = useState<string>('');
  const [filters, setFilters] = useState({
    status: '',
    search: '',
    startDate: '',
    endDate: '',
    reviewStatus: '',
  });

  const { data, isLoading, refetch } = useRecordings({
    page,
    limit: pageSize,
    status: (filters.status as any) || undefined,
    search: filters.search || undefined,
    reviewStatus: (filters.reviewStatus as any) || undefined,
  });
  const deleteRecordingMutation = useDeleteRecording();

  const recordings = data?.data || [];
  const pagination = data?.pagination;

  const handleFilterChange = (key: string, value: any) => {
    setFilters(prev => ({ ...prev, [key]: value }));
    setPage(1);
  };

  const handleRowClick = (recording: RecordingSession) => {
    navigate(`/recordings/${recording.id}`);
  };

  // Bulk actions
  const handleBulkDelete = async () => {
    const hideLoading = message.loading(`Deleting ${selectedRowKeys.length} recordings...`, 0);
    try {
      // Delete recordings one by one
      const deletePromises = selectedRowKeys.map(id =>
        deleteRecordingMutation.mutateAsync({ id: id as string })
      );
      await Promise.all(deletePromises);
      hideLoading();
      message.success(`Successfully deleted ${selectedRowKeys.length} recordings`);
      setSelectedRowKeys([]);
    } catch (error: any) {
      hideLoading();
      message.error(error.response?.data?.message || 'Failed to delete some recordings');
    }
    setBulkDeleteModalOpen(false);
  };

  const handleBulkStatusChange = async () => {
    if (!selectedStatus) {
      message.error('Please select a status');
      return;
    }
    // In a real implementation, this would call a bulk status update API
    message.info(`Updating ${selectedRowKeys.length} recordings to ${selectedStatus}...`);
    setBulkStatusModalOpen(false);
    setSelectedRowKeys([]);
    setSelectedStatus('');
    refetch();
  };

  const handleExport = () => {
    // In a real implementation, this would export selected or all recordings
    const exportData = selectedRowKeys.length > 0
      ? recordings.filter(r => selectedRowKeys.includes(r.id))
      : recordings;

    const csv = [
      ['ID', 'Patient', 'Date', 'Status', 'Duration', 'Protocol'].join(','),
      ...exportData.map(r => [
        r.id,
        `${r.patient?.firstName || ''} ${r.patient?.lastName || ''}`,
        new Date(r.recordingDate).toLocaleDateString(),
        r.status,
        r.duration || '',
        r.protocol?.name || '',
      ].join(','))
    ].join('\n');

    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `recordings-export-${new Date().toISOString()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    message.success('Export completed');
  };

  // Row actions menu
  const getRowActions = (recording: RecordingSession): MenuProps['items'] => [
    {
      key: 'view',
      icon: <EyeOutlined />,
      label: 'View Details',
      onClick: () => navigate(`/recordings/${recording.id}`),
    },
    {
      key: 'analysis',
      icon: <LineChartOutlined />,
      label: 'View Analysis',
      disabled: recording.status !== 'analyzed',
      onClick: () => navigate(`/analysis/${recording.id}`),
    },
    { type: 'divider' },
    {
      key: 'download',
      icon: <DownloadOutlined />,
      label: 'Download Video',
      disabled: !recording.videoPath,
      onClick: () => {
        if (recording.videoPath) {
          window.open(recording.videoPath, '_blank');
        }
      },
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
          content: 'Are you sure you want to delete this recording? This will also remove associated files from cloud storage.',
          okText: 'Delete',
          okType: 'danger',
          onOk: async () => {
            try {
              await deleteRecordingMutation.mutateAsync({ id: recording.id });
              message.success('Recording deleted successfully');
            } catch (error: any) {
              message.error(error.response?.data?.message || 'Failed to delete recording');
            }
          },
        });
      },
    },
  ];

  // Table columns
  const columns: ColumnsType<RecordingSession> = [
    {
      title: 'Recording',
      key: 'recording',
      render: (_, record) => (
        <Space direction="vertical" size={0}>
          <Text
            strong
            className="text-blue-600 cursor-pointer hover:underline"
            onClick={() => handleRowClick(record)}
          >
            {record.id.substring(0, 8)}...
          </Text>
          <Text type="secondary" className="text-xs">
            {new Date(record.recordingDate).toLocaleDateString()}
          </Text>
        </Space>
      ),
      width: 150,
    },
    {
      title: 'Patient',
      key: 'patient',
      render: (_, record) => (
        <Space direction="vertical" size={0}>
          <Text strong>
            {record.patient?.firstName} {record.patient?.lastName}
          </Text>
          <Text type="secondary" className="text-xs">
            MRN: {record.patient?.mrn || '-'}
          </Text>
        </Space>
      ),
    },
    {
      title: 'Protocol',
      dataIndex: 'protocol',
      key: 'protocol',
      render: (protocol) => protocol?.name || <Text type="secondary">None</Text>,
      width: 180,
    },
    {
      title: 'Status',
      key: 'status',
      width: 120,
      render: (_, record) => <StatusBadge status={record.status} />,
      filters: [
        { text: 'Uploaded', value: 'uploaded' },
        { text: 'Processing', value: 'processing' },
        { text: 'Analyzed', value: 'analyzed' },
        { text: 'Completed', value: 'completed' },
        { text: 'Failed', value: 'failed' },
      ],
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
        return (
          <Tag color={colorMap[record.reviewStatus] || 'default'}>
            {record.reviewStatus}
          </Tag>
        );
      },
    },
    {
      title: 'Duration',
      key: 'duration',
      width: 100,
      render: (_, record) =>
        record.duration
          ? `${Math.floor(record.duration / 60)}:${String(record.duration % 60).padStart(2, '0')}`
          : '-',
    },
    {
      title: 'Uploaded',
      dataIndex: 'createdAt',
      key: 'createdAt',
      width: 120,
      render: (date) => new Date(date).toLocaleDateString(),
      sorter: true,
    },
    {
      title: '',
      key: 'actions',
      width: 50,
      fixed: 'right',
      render: (_, record) => (
        <Dropdown menu={{ items: getRowActions(record) }} trigger={['click']}>
          <AntButton type="text" icon={<MoreOutlined />} />
        </Dropdown>
      ),
    },
  ];

  // Row selection
  const rowSelection = {
    selectedRowKeys,
    onChange: (keys: React.Key[]) => setSelectedRowKeys(keys),
    selections: [
      Table.SELECTION_ALL,
      Table.SELECTION_INVERT,
      Table.SELECTION_NONE,
    ],
  };

  // Calculate stats
  const uploadedCount = recordings.filter(r => r.status === 'uploaded').length;
  const processingCount = recordings.filter(r => r.status === 'processing').length;
  const analyzedCount = recordings.filter(r => r.status === 'analyzed').length;

  return (
    <div className="p-6">
      {/* Header */}
      <div className="mb-6">
        <div className="flex justify-between items-start">
          <div>
            <Title level={2} className="!mb-1">
              <VideoCameraOutlined className="mr-2" />
              Recordings
            </Title>
            <Text type="secondary">
              Manage and review video recordings
            </Text>
          </div>
          <AntButton
            type="primary"
            icon={<PlusOutlined />}
            onClick={() => navigate('/recordings/upload')}
          >
            Upload Recording
          </AntButton>
        </div>
      </div>

      {/* Stats Cards */}
      <Row gutter={16} className="mb-6">
        <Col span={6}>
          <AntCard size="small">
            <Statistic
              title="Total Recordings"
              value={pagination?.total || 0}
              prefix={<VideoCameraOutlined />}
            />
          </AntCard>
        </Col>
        <Col span={6}>
          <AntCard size="small">
            <Statistic
              title="Uploaded"
              value={uploadedCount}
              valueStyle={{ color: '#faad14' }}
              prefix={<CloudUploadOutlined />}
            />
          </AntCard>
        </Col>
        <Col span={6}>
          <AntCard size="small">
            <Statistic
              title="Processing"
              value={processingCount}
              valueStyle={{ color: '#1890ff' }}
              prefix={<SyncOutlined spin={processingCount > 0} />}
            />
          </AntCard>
        </Col>
        <Col span={6}>
          <AntCard size="small">
            <Statistic
              title="Analyzed"
              value={analyzedCount}
              valueStyle={{ color: '#52c41a' }}
              prefix={<CheckCircleOutlined />}
            />
          </AntCard>
        </Col>
      </Row>

      {/* Filters & Bulk Actions Bar */}
      <AntCard className="mb-4">
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
              value={filters.status || undefined}
              onChange={(value) => handleFilterChange('status', value)}
            >
              <Option value="uploaded">Uploaded</Option>
              <Option value="processing">Processing</Option>
              <Option value="analyzed">Analyzed</Option>
              <Option value="completed">Completed</Option>
              <Option value="failed">Failed</Option>
            </Select>
            <Select
              placeholder="Review Status"
              allowClear
              style={{ width: 140 }}
              value={filters.reviewStatus || undefined}
              onChange={(value) => handleFilterChange('reviewStatus', value)}
            >
              <Option value="pending">Pending</Option>
              <Option value="approved">Approved</Option>
              <Option value="flagged">Flagged</Option>
            </Select>
            <DatePicker.RangePicker
              onChange={(dates) => {
                setFilters(prev => ({
                  ...prev,
                  startDate: dates?.[0]?.toISOString() || '',
                  endDate: dates?.[1]?.toISOString() || '',
                }));
              }}
            />
          </Space>

          <Space>
            {selectedRowKeys.length > 0 && (
              <>
                <Text type="secondary">{selectedRowKeys.length} selected</Text>
                <AntButton
                  icon={<EditOutlined />}
                  onClick={() => setBulkStatusModalOpen(true)}
                >
                  Change Status
                </AntButton>
                <AntButton
                  icon={<ExportOutlined />}
                  onClick={handleExport}
                >
                  Export
                </AntButton>
                <AntButton
                  danger
                  icon={<DeleteOutlined />}
                  onClick={() => setBulkDeleteModalOpen(true)}
                >
                  Delete
                </AntButton>
              </>
            )}
            {selectedRowKeys.length === 0 && (
              <AntButton
                icon={<ExportOutlined />}
                onClick={handleExport}
              >
                Export All
              </AntButton>
            )}
            <Tooltip title="Refresh">
              <AntButton icon={<ReloadOutlined />} onClick={() => refetch()} />
            </Tooltip>
          </Space>
        </div>
      </AntCard>

      {/* Data Table */}
      <AntCard>
        <Table
          rowKey="id"
          columns={columns}
          dataSource={recordings}
          loading={isLoading}
          rowSelection={rowSelection}
          onRow={(record) => ({
            onClick: () => handleRowClick(record),
            style: { cursor: 'pointer' },
          })}
          pagination={{
            current: page,
            pageSize: pageSize,
            total: pagination?.total || 0,
            showSizeChanger: true,
            showQuickJumper: true,
            showTotal: (total, range) => `${range[0]}-${range[1]} of ${total} recordings`,
            onChange: (p, ps) => {
              setPage(p);
              setPageSize(ps);
            },
          }}
          scroll={{ x: 1200 }}
          locale={{
            emptyText: (
              <Empty
                image={Empty.PRESENTED_IMAGE_SIMPLE}
                description="No recordings found"
              >
                <AntButton type="primary" onClick={() => navigate('/recordings/upload')}>
                  Upload First Recording
                </AntButton>
              </Empty>
            ),
          }}
        />
      </AntCard>

      {/* Bulk Status Change Modal */}
      <Modal
        title="Change Status for Selected Recordings"
        open={bulkStatusModalOpen}
        onOk={handleBulkStatusChange}
        onCancel={() => {
          setBulkStatusModalOpen(false);
          setSelectedStatus('');
        }}
        okText="Update Status"
      >
        <p className="mb-4">
          Update status for <strong>{selectedRowKeys.length}</strong> recording(s):
        </p>
        <Select
          placeholder="Select new status"
          style={{ width: '100%' }}
          value={selectedStatus || undefined}
          onChange={setSelectedStatus}
        >
          <Option value="uploaded">Uploaded</Option>
          <Option value="processing">Processing</Option>
          <Option value="analyzed">Analyzed</Option>
          <Option value="completed">Completed</Option>
        </Select>
      </Modal>

      {/* Bulk Delete Confirmation Modal */}
      <Modal
        title="Delete Selected Recordings"
        open={bulkDeleteModalOpen}
        onOk={handleBulkDelete}
        onCancel={() => setBulkDeleteModalOpen(false)}
        okText="Delete All"
        okButtonProps={{ danger: true }}
      >
        <p>
          Are you sure you want to delete <strong>{selectedRowKeys.length}</strong> recording(s)?
        </p>
        <p className="text-gray-500 text-sm mt-2">
          This action cannot be undone. All associated analysis data will also be deleted.
        </p>
      </Modal>
    </div>
  );
};

export default RecordingsList;
