import React, { useState } from 'react';
import {
  Table,
  Button,
  Select,
  Space,
  Tag,
  Modal,
  message,
  Card,
  Typography,
  Row,
  Col,
  Statistic,
  Empty,
  Tooltip,
  Progress,
  Dropdown,
  Tabs,
  Alert,
} from 'antd';
import {
  PlusOutlined,
  DeleteOutlined,
  EyeOutlined,
  MoreOutlined,
  ReloadOutlined,
  SwapOutlined,
  ArrowUpOutlined,
  ArrowDownOutlined,
  MinusOutlined,
  LineChartOutlined,
  TeamOutlined,
  ExperimentOutlined,
} from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import type { MenuProps } from 'antd';
import { useComparisons, useDeleteComparison } from '../../hooks/useClinical';
import { useDiagnosisComparison } from '../../hooks/useStats';
import type { RecordingComparison, ComparisonType } from '../../types/api.types';
import CreateComparisonModal from './CreateComparisonModal';
import ComparisonDetailDrawer from './ComparisonDetailDrawer';

const { Title, Text } = Typography;
const { Option } = Select;

const comparisonTypeLabels: Record<string, string> = {
  longitudinal: 'Longitudinal',
  bilateral: 'Bilateral',
  treatment_response: 'Treatment Response',
};

const overallChangeConfig: Record<string, { color: string; icon: React.ReactNode }> = {
  improved: { color: 'success', icon: <ArrowUpOutlined /> },
  stable: { color: 'default', icon: <MinusOutlined /> },
  declined: { color: 'error', icon: <ArrowDownOutlined /> },
};

// Diagnosis Group Comparison Component
const DiagnosisGroupComparison: React.FC = () => {
  const [selectedDiagnosis, setSelectedDiagnosis] = useState<string>('all');
  const { data, isLoading, refetch } = useDiagnosisComparison(selectedDiagnosis);

  const formatMetricValue = (value: number | null | undefined, decimals = 2) => {
    if (value === null || value === undefined) return '—';
    return value.toFixed(decimals);
  };

  const getScalePosition = (value: number, min: number, max: number) => {
    if (min === max) return 50;
    return ((value - min) / (max - min)) * 100;
  };

  if (isLoading) {
    return (
      <div className="p-6 text-center">
        <Progress type="circle" percent={75} status="active" />
        <Text className="block mt-4">Loading comparison data...</Text>
      </div>
    );
  }

  return (
    <div>
      {/* Filter Bar */}
      <Card className="mb-4">
        <div className="flex justify-between items-center flex-wrap gap-4">
          <Space>
            <Text strong>Filter by Diagnosis:</Text>
            <Select
              value={selectedDiagnosis}
              onChange={setSelectedDiagnosis}
              style={{ width: 200 }}
            >
              <Option value="all">All Diagnoses</Option>
              {data?.availableDiagnoses?.map(d => (
                <Option key={d} value={d}>{d}</Option>
              ))}
            </Select>
          </Space>
          <Space>
            <Text type="secondary">
              Total: {data?.totalPatients || 0} patients
            </Text>
            {data?.isAdminView && (
              <Tag color="blue">Admin View (All Users)</Tag>
            )}
            <Tooltip title="Refresh">
              <Button icon={<ReloadOutlined />} onClick={() => refetch()} />
            </Tooltip>
          </Space>
        </div>
      </Card>

      {/* Info Alert */}
      <Alert
        message="Diagnosis Group Comparison"
        description="Compare clinical metrics across patients with the same diagnosis. This helps identify patterns and ranges typical for each condition group."
        type="info"
        showIcon
        icon={<ExperimentOutlined />}
        className="mb-4"
      />

      {/* Comparison Cards */}
      {!data?.comparison?.length ? (
        <Empty
          image={Empty.PRESENTED_IMAGE_SIMPLE}
          description="No diagnosis data available. Add diagnoses to patients to see comparisons."
        />
      ) : (
        <Row gutter={[16, 16]}>
          {data.comparison.map(group => (
            <Col key={group.diagnosis} xs={24} lg={12}>
              <Card
                title={
                  <Space>
                    <ExperimentOutlined />
                    <Text strong className="text-lg capitalize">
                      {group.diagnosis.replace(/_/g, ' ')}
                    </Text>
                  </Space>
                }
                extra={
                  <Tag color="purple">
                    {group.patientCount} patient{group.patientCount !== 1 ? 's' : ''}
                  </Tag>
                }
              >
                {/* Patient & Recording Stats */}
                <Row gutter={16} className="mb-4">
                  <Col span={12}>
                    <Statistic
                      title="Patients"
                      value={group.patientCount}
                      prefix={<TeamOutlined />}
                    />
                  </Col>
                  <Col span={12}>
                    <Statistic
                      title="Recordings"
                      value={group.recordingCount}
                      prefix={<LineChartOutlined />}
                    />
                  </Col>
                </Row>

                {/* Metrics */}
                <div className="space-y-4">
                  {/* Tremor Frequency */}
                  <div className="p-3 bg-gray-50 rounded">
                    <div className="flex justify-between mb-2">
                      <Text strong>Tremor Frequency</Text>
                      <Text type="secondary">
                        {group.metrics.tremorFrequency?.count || 0} samples
                      </Text>
                    </div>
                    {group.metrics.tremorFrequency ? (
                      <>
                        <div className="flex justify-between text-sm mb-1">
                          <Text type="secondary">
                            Min: {formatMetricValue(group.metrics.tremorFrequency.min)} Hz
                          </Text>
                          <Text strong>
                            Mean: {formatMetricValue(group.metrics.tremorFrequency.mean)} Hz
                          </Text>
                          <Text type="secondary">
                            Max: {formatMetricValue(group.metrics.tremorFrequency.max)} Hz
                          </Text>
                        </div>
                        <div className="relative h-2 bg-gradient-to-r from-green-300 via-yellow-300 to-red-300 rounded">
                          <div
                            className="absolute w-3 h-3 bg-blue-600 rounded-full border-2 border-white shadow"
                            style={{
                              left: `${getScalePosition(
                                group.metrics.tremorFrequency.mean,
                                group.metrics.tremorFrequency.min,
                                group.metrics.tremorFrequency.max
                              )}%`,
                              top: '-2px',
                              transform: 'translateX(-50%)'
                            }}
                          />
                        </div>
                        <Text type="secondary" className="text-xs block mt-1">
                          Median: {formatMetricValue(group.metrics.tremorFrequency.median)} Hz
                        </Text>
                      </>
                    ) : (
                      <Text type="secondary">No data available</Text>
                    )}
                  </div>

                  {/* Tremor Amplitude */}
                  <div className="p-3 bg-gray-50 rounded">
                    <div className="flex justify-between mb-2">
                      <Text strong>Tremor Amplitude</Text>
                      <Text type="secondary">
                        {group.metrics.tremorAmplitude?.count || 0} samples
                      </Text>
                    </div>
                    {group.metrics.tremorAmplitude ? (
                      <>
                        <div className="flex justify-between text-sm mb-1">
                          <Text type="secondary">
                            Min: {formatMetricValue(group.metrics.tremorAmplitude.min)} mm
                          </Text>
                          <Text strong>
                            Mean: {formatMetricValue(group.metrics.tremorAmplitude.mean)} mm
                          </Text>
                          <Text type="secondary">
                            Max: {formatMetricValue(group.metrics.tremorAmplitude.max)} mm
                          </Text>
                        </div>
                        <div className="relative h-2 bg-gradient-to-r from-green-300 via-yellow-300 to-red-300 rounded">
                          <div
                            className="absolute w-3 h-3 bg-blue-600 rounded-full border-2 border-white shadow"
                            style={{
                              left: `${getScalePosition(
                                group.metrics.tremorAmplitude.mean,
                                group.metrics.tremorAmplitude.min,
                                group.metrics.tremorAmplitude.max
                              )}%`,
                              top: '-2px',
                              transform: 'translateX(-50%)'
                            }}
                          />
                        </div>
                        <Text type="secondary" className="text-xs block mt-1">
                          Median: {formatMetricValue(group.metrics.tremorAmplitude.median)} mm
                        </Text>
                      </>
                    ) : (
                      <Text type="secondary">No data available</Text>
                    )}
                  </div>

                  {/* SPARC Score */}
                  <div className="p-3 bg-gray-50 rounded">
                    <div className="flex justify-between mb-2">
                      <Text strong>SPARC (Smoothness)</Text>
                      <Text type="secondary">
                        {group.metrics.sparc?.count || 0} samples
                      </Text>
                    </div>
                    {group.metrics.sparc ? (
                      <>
                        <div className="flex justify-between text-sm mb-1">
                          <Text type="secondary">
                            Min: {formatMetricValue(group.metrics.sparc.min)}
                          </Text>
                          <Text strong>
                            Mean: {formatMetricValue(group.metrics.sparc.mean)}
                          </Text>
                          <Text type="secondary">
                            Max: {formatMetricValue(group.metrics.sparc.max)}
                          </Text>
                        </div>
                        <div className="relative h-2 bg-gradient-to-r from-red-300 via-yellow-300 to-green-300 rounded">
                          <div
                            className="absolute w-3 h-3 bg-blue-600 rounded-full border-2 border-white shadow"
                            style={{
                              left: `${getScalePosition(
                                group.metrics.sparc.mean,
                                group.metrics.sparc.min,
                                group.metrics.sparc.max
                              )}%`,
                              top: '-2px',
                              transform: 'translateX(-50%)'
                            }}
                          />
                        </div>
                        <Text type="secondary" className="text-xs block mt-1">
                          Median: {formatMetricValue(group.metrics.sparc.median)} (Higher = Smoother)
                        </Text>
                      </>
                    ) : (
                      <Text type="secondary">No data available</Text>
                    )}
                  </div>
                </div>
              </Card>
            </Col>
          ))}
        </Row>
      )}
    </div>
  );
};

// Recording Comparison Component (Original)
const RecordingComparisonList: React.FC = () => {
  // State
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [filters, setFilters] = useState<{
    comparisonType?: ComparisonType;
    search?: string;
  }>({});
  const [selectedRowKeys, setSelectedRowKeys] = useState<React.Key[]>([]);
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [detailDrawerOpen, setDetailDrawerOpen] = useState(false);
  const [selectedComparison, setSelectedComparison] = useState<RecordingComparison | null>(null);
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [comparisonToDelete, setComparisonToDelete] = useState<RecordingComparison | null>(null);

  // Data fetching
  const { data, isLoading, refetch } = useComparisons({
    page,
    limit: pageSize,
    ...filters,
  });

  const deleteComparison = useDeleteComparison();

  // Handlers
  const handleFilterChange = (key: string, value: any) => {
    setFilters(prev => ({ ...prev, [key]: value }));
    setPage(1);
  };

  const handleView = (comparison: RecordingComparison) => {
    setSelectedComparison(comparison);
    setDetailDrawerOpen(true);
  };

  const handleDeleteClick = (comparison: RecordingComparison) => {
    setComparisonToDelete(comparison);
    setDeleteModalOpen(true);
  };

  const handleDeleteConfirm = async () => {
    if (!comparisonToDelete) return;

    try {
      await deleteComparison.mutateAsync(comparisonToDelete.id);
      message.success('Comparison deleted successfully');
      setDeleteModalOpen(false);
      setComparisonToDelete(null);
    } catch (error: any) {
      message.error(error.response?.data?.message || 'Failed to delete comparison');
    }
  };

  const handleBulkDelete = async () => {
    Modal.confirm({
      title: `Delete ${selectedRowKeys.length} comparisons?`,
      content: 'This action cannot be undone.',
      okText: 'Delete All',
      okType: 'danger',
      onOk: async () => {
        let successCount = 0;
        for (const id of selectedRowKeys) {
          try {
            await deleteComparison.mutateAsync(id as string);
            successCount++;
          } catch {
            // Continue
          }
        }
        message.success(`Deleted ${successCount} comparison(s)`);
        setSelectedRowKeys([]);
      },
    });
  };

  // Parse metric differences
  const parseMetrics = (comparison: RecordingComparison) => {
    try {
      return typeof comparison.metricDifferences === 'string'
        ? JSON.parse(comparison.metricDifferences)
        : comparison.metricDifferences || {};
    } catch {
      return {};
    }
  };

  // Row actions menu
  const getRowActions = (comparison: RecordingComparison): MenuProps['items'] => [
    {
      key: 'view',
      icon: <EyeOutlined />,
      label: 'View Details',
      onClick: () => handleView(comparison),
    },
    { type: 'divider' },
    {
      key: 'delete',
      icon: <DeleteOutlined />,
      label: 'Delete',
      danger: true,
      onClick: () => handleDeleteClick(comparison),
    },
  ];

  // Table columns
  const columns: ColumnsType<RecordingComparison> = [
    {
      title: 'Comparison',
      key: 'comparison',
      render: (_, record) => {
        const basePatient = record.baselineRecording?.patient;
        return (
          <Space direction="vertical" size={0}>
            <Text
              strong
              className="text-blue-600 cursor-pointer hover:underline"
              onClick={() => handleView(record)}
            >
              {basePatient?.firstName} {basePatient?.lastName || 'Unknown'}
            </Text>
            <Text type="secondary" className="text-xs">
              {new Date(record.baselineRecording?.recordingDate || record.createdAt).toLocaleDateString()}
              {' → '}
              {new Date(record.comparedRecording?.recordingDate || record.createdAt).toLocaleDateString()}
            </Text>
          </Space>
        );
      },
    },
    {
      title: 'Type',
      dataIndex: 'comparisonType',
      key: 'comparisonType',
      width: 150,
      render: (type: ComparisonType) => (
        <Tag color="blue">{comparisonTypeLabels[type] || type}</Tag>
      ),
      filters: [
        { text: 'Longitudinal', value: 'longitudinal' },
        { text: 'Bilateral', value: 'bilateral' },
        { text: 'Treatment Response', value: 'treatment_response' },
      ],
    },
    {
      title: 'Overall Change',
      dataIndex: 'overallChange',
      key: 'overallChange',
      width: 130,
      render: (change) => {
        if (!change) return <Text type="secondary">-</Text>;
        const config = overallChangeConfig[change] || overallChangeConfig.stable;
        return (
          <Tag color={config.color} icon={config.icon}>
            {change.charAt(0).toUpperCase() + change.slice(1)}
          </Tag>
        );
      },
    },
    {
      title: 'Change Score',
      dataIndex: 'changeScore',
      key: 'changeScore',
      width: 120,
      render: (score) => {
        if (score === undefined || score === null) return '-';
        const color = score > 0 ? '#52c41a' : score < 0 ? '#ff4d4f' : '#999';
        return (
          <Space>
            <Progress
              type="circle"
              percent={Math.abs(score)}
              size={40}
              strokeColor={color}
              format={() => `${score > 0 ? '+' : ''}${score.toFixed(1)}`}
            />
          </Space>
        );
      },
      sorter: true,
    },
    {
      title: 'Key Metrics',
      key: 'metrics',
      width: 200,
      render: (_, record) => {
        const metrics = parseMetrics(record);
        const metricKeys = Object.keys(metrics).slice(0, 3);

        if (metricKeys.length === 0) {
          return <Text type="secondary">No metrics</Text>;
        }

        return (
          <Space direction="vertical" size={0}>
            {metricKeys.map((key) => {
              const metric = metrics[key];
              const change = metric?.changePercent || 0;
              const color = change > 0 ? 'green' : change < 0 ? 'red' : 'gray';
              return (
                <Text key={key} type="secondary" className="text-xs">
                  {key.replace(/_/g, ' ')}:
                  <Text style={{ color }} className="ml-1">
                    {change > 0 ? '+' : ''}{change.toFixed(1)}%
                  </Text>
                </Text>
              );
            })}
          </Space>
        );
      },
    },
    {
      title: 'Compared By',
      dataIndex: 'comparedBy',
      key: 'comparedBy',
      width: 150,
      render: (user) => user?.email || '-',
    },
    {
      title: 'Created',
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
      render: (_, record) => (
        <Dropdown menu={{ items: getRowActions(record) }} trigger={['click']}>
          <Button type="text" icon={<MoreOutlined />} />
        </Dropdown>
      ),
    },
  ];

  // Row selection
  const rowSelection = {
    selectedRowKeys,
    onChange: (keys: React.Key[]) => setSelectedRowKeys(keys),
  };

  const comparisons = (data?.data || []) as RecordingComparison[];
  const pagination = data?.pagination as { total?: number; page?: number; limit?: number } | undefined;

  // Stats calculation
  const improvedCount = comparisons.filter(c => (c as any).overallChange === 'improved').length;
  const stableCount = comparisons.filter(c => (c as any).overallChange === 'stable').length;
  const declinedCount = comparisons.filter(c => (c as any).overallChange === 'declined').length;

  return (
    <div>
      {/* Stats Cards */}
      <Row gutter={16} className="mb-6">
        <Col span={6}>
          <Card size="small">
            <Statistic
              title="Total Comparisons"
              value={pagination?.total || 0}
              prefix={<SwapOutlined />}
            />
          </Card>
        </Col>
        <Col span={6}>
          <Card size="small">
            <Statistic
              title="Improved"
              value={improvedCount}
              valueStyle={{ color: '#52c41a' }}
              prefix={<ArrowUpOutlined />}
            />
          </Card>
        </Col>
        <Col span={6}>
          <Card size="small">
            <Statistic
              title="Stable"
              value={stableCount}
              valueStyle={{ color: '#999' }}
              prefix={<MinusOutlined />}
            />
          </Card>
        </Col>
        <Col span={6}>
          <Card size="small">
            <Statistic
              title="Declined"
              value={declinedCount}
              valueStyle={{ color: '#ff4d4f' }}
              prefix={<ArrowDownOutlined />}
            />
          </Card>
        </Col>
      </Row>

      {/* Filters & Actions Bar */}
      <Card className="mb-4">
        <div className="flex justify-between items-center flex-wrap gap-4">
          <Space wrap>
            <Select
              placeholder="Comparison Type"
              allowClear
              style={{ width: 180 }}
              onChange={(value) => handleFilterChange('comparisonType', value)}
            >
              <Option value="longitudinal">Longitudinal</Option>
              <Option value="bilateral">Bilateral</Option>
              <Option value="treatment_response">Treatment Response</Option>
            </Select>
            <Button
              type="primary"
              icon={<PlusOutlined />}
              onClick={() => setCreateModalOpen(true)}
            >
              New Comparison
            </Button>
          </Space>

          <Space>
            {selectedRowKeys.length > 0 && (
              <>
                <Text type="secondary">{selectedRowKeys.length} selected</Text>
                <Button danger onClick={handleBulkDelete}>
                  Delete Selected
                </Button>
              </>
            )}
            <Tooltip title="Refresh">
              <Button icon={<ReloadOutlined />} onClick={() => refetch()} />
            </Tooltip>
          </Space>
        </div>
      </Card>

      {/* Data Table */}
      <Card>
        <Table
          rowKey="id"
          columns={columns}
          dataSource={comparisons}
          loading={isLoading}
          rowSelection={rowSelection}
          pagination={{
            current: page,
            pageSize: pageSize,
            total: pagination?.total || 0,
            showSizeChanger: true,
            showQuickJumper: true,
            showTotal: (total, range) => `${range[0]}-${range[1]} of ${total} comparisons`,
            onChange: (p, ps) => {
              setPage(p);
              setPageSize(ps);
            },
          }}
          scroll={{ x: 1100 }}
          locale={{
            emptyText: (
              <Empty
                image={Empty.PRESENTED_IMAGE_SIMPLE}
                description="No comparisons found"
              >
                <Button type="primary" onClick={() => setCreateModalOpen(true)}>
                  Create First Comparison
                </Button>
              </Empty>
            ),
          }}
        />
      </Card>

      {/* Create Modal */}
      <CreateComparisonModal
        open={createModalOpen}
        onClose={() => setCreateModalOpen(false)}
        onSuccess={() => {
          setCreateModalOpen(false);
          refetch();
        }}
      />

      {/* Detail Drawer */}
      <ComparisonDetailDrawer
        open={detailDrawerOpen}
        comparison={selectedComparison}
        onClose={() => {
          setDetailDrawerOpen(false);
          setSelectedComparison(null);
        }}
      />

      {/* Delete Confirmation Modal */}
      <Modal
        title="Delete Comparison"
        open={deleteModalOpen}
        onOk={handleDeleteConfirm}
        onCancel={() => {
          setDeleteModalOpen(false);
          setComparisonToDelete(null);
        }}
        okText="Delete"
        okButtonProps={{ danger: true, loading: deleteComparison.isPending }}
      >
        <p>Are you sure you want to delete this comparison?</p>
        <p className="text-gray-500 text-sm mt-2">
          This action cannot be undone.
        </p>
      </Modal>
    </div>
  );
};

// Main Component with Tabs
export const ComparisonsList: React.FC = () => {
  return (
    <div className="p-6">
      {/* Header */}
      <div className="mb-6">
        <Title level={2} className="!mb-1">
          <LineChartOutlined className="mr-2" />
          Comparisons & Analytics
        </Title>
        <Text type="secondary">
          Compare recordings and analyze patient groups by diagnosis
        </Text>
      </div>

      {/* Tabs */}
      <Tabs
        defaultActiveKey="diagnosis"
        items={[
          {
            key: 'diagnosis',
            label: (
              <Space>
                <ExperimentOutlined />
                Diagnosis Groups
              </Space>
            ),
            children: <DiagnosisGroupComparison />,
          },
          {
            key: 'recordings',
            label: (
              <Space>
                <SwapOutlined />
                Recording Comparisons
              </Space>
            ),
            children: <RecordingComparisonList />,
          },
        ]}
      />
    </div>
  );
};

export default ComparisonsList;
