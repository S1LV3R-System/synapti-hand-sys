import React from 'react';
import {
  Drawer,
  Descriptions,
  Tag,
  Space,
  Typography,
  Divider,
  Card,
  Row,
  Col,
  Progress,
  Statistic,
  Table,
} from 'antd';
import {
  SwapOutlined,
  UserOutlined,
  CalendarOutlined,
  ArrowUpOutlined,
  ArrowDownOutlined,
  MinusOutlined,
} from '@ant-design/icons';
import type { RecordingComparison } from '../../types/api.types';

const { Title, Text, Paragraph } = Typography;

interface ComparisonDetailDrawerProps {
  open: boolean;
  comparison: RecordingComparison | null;
  onClose: () => void;
}

interface MetricDifference {
  baseline: number;
  compared: number;
  change: number;
  changePercent: number;
}

const comparisonTypeLabels: Record<string, string> = {
  longitudinal: 'Longitudinal',
  bilateral: 'Bilateral',
  treatment_response: 'Treatment Response',
};

export const ComparisonDetailDrawer: React.FC<ComparisonDetailDrawerProps> = ({
  open,
  comparison,
  onClose,
}) => {
  if (!comparison) return null;

  // Parse metric differences
  let metrics: Record<string, MetricDifference> = {};
  try {
    metrics = typeof comparison.metricDifferences === 'string'
      ? JSON.parse(comparison.metricDifferences)
      : comparison.metricDifferences || {};
  } catch {
    metrics = {};
  }

  const baselineRecording = comparison.baselineRecording;
  const comparedRecording = comparison.comparedRecording;
  const basePatient = baselineRecording?.patient;
  const compPatient = comparedRecording?.patient;

  const getChangeIcon = (change: number) => {
    if (change > 0) return <ArrowUpOutlined style={{ color: '#52c41a' }} />;
    if (change < 0) return <ArrowDownOutlined style={{ color: '#ff4d4f' }} />;
    return <MinusOutlined style={{ color: '#999' }} />;
  };

  const getOverallChangeConfig = (change?: string) => {
    switch (change) {
      case 'improved':
        return { color: 'success', icon: <ArrowUpOutlined /> };
      case 'declined':
        return { color: 'error', icon: <ArrowDownOutlined /> };
      default:
        return { color: 'default', icon: <MinusOutlined /> };
    }
  };

  const overallConfig = getOverallChangeConfig(comparison.overallChange);

  // Metrics table data
  const metricsData = Object.entries(metrics).map(([key, value]) => ({
    key,
    metric: key.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase()),
    baseline: value.baseline?.toFixed(2) || '0.00',
    compared: value.compared?.toFixed(2) || '0.00',
    change: value.change?.toFixed(2) || '0.00',
    changePercent: value.changePercent?.toFixed(1) || '0.0',
  }));

  return (
    <Drawer
      title={
        <Space>
          <SwapOutlined />
          <span>Comparison Details</span>
        </Space>
      }
      placement="right"
      width={700}
      onClose={onClose}
      open={open}
    >
      {/* Overview */}
      <Row gutter={16} className="mb-6">
        <Col span={12}>
          <Card size="small" className="bg-blue-50 h-full">
            <Title level={5} className="!mb-2">
              <Text type="secondary">Baseline</Text>
            </Title>
            <Space direction="vertical" size={0}>
              <Text strong>
                <UserOutlined className="mr-1" />
                {basePatient?.firstName} {basePatient?.lastName || 'Unknown'}
              </Text>
              <Text type="secondary">
                <CalendarOutlined className="mr-1" />
                {new Date(baselineRecording?.recordingDate || comparison.createdAt).toLocaleDateString()}
              </Text>
              <Text type="secondary" className="text-xs">
                Protocol: {baselineRecording?.protocol?.name || 'None'}
              </Text>
            </Space>
          </Card>
        </Col>
        <Col span={12}>
          <Card size="small" className="bg-green-50 h-full">
            <Title level={5} className="!mb-2">
              <Text type="secondary">Compared</Text>
            </Title>
            <Space direction="vertical" size={0}>
              <Text strong>
                <UserOutlined className="mr-1" />
                {compPatient?.firstName} {compPatient?.lastName || 'Unknown'}
              </Text>
              <Text type="secondary">
                <CalendarOutlined className="mr-1" />
                {new Date(comparedRecording?.recordingDate || comparison.createdAt).toLocaleDateString()}
              </Text>
              <Text type="secondary" className="text-xs">
                Protocol: {comparedRecording?.protocol?.name || 'None'}
              </Text>
            </Space>
          </Card>
        </Col>
      </Row>

      {/* Summary Stats */}
      <Card className="mb-6">
        <Row gutter={16}>
          <Col span={8}>
            <Statistic
              title="Comparison Type"
              value={comparisonTypeLabels[comparison.comparisonType] || comparison.comparisonType}
              valueStyle={{ fontSize: '16px' }}
            />
          </Col>
          <Col span={8}>
            <Statistic
              title="Overall Change"
              value={comparison.overallChange ? comparison.overallChange.charAt(0).toUpperCase() + comparison.overallChange.slice(1) : 'N/A'}
              valueStyle={{
                fontSize: '16px',
                color: comparison.overallChange === 'improved' 
                  ? '#52c41a' 
                  : comparison.overallChange === 'declined' 
                  ? '#ff4d4f' 
                  : '#999'
              }}
              prefix={overallConfig.icon}
            />
          </Col>
          <Col span={8}>
            <Statistic
              title="Change Score"
              value={comparison.changeScore?.toFixed(1) || 'N/A'}
              valueStyle={{
                fontSize: '16px',
                color: (comparison.changeScore || 0) > 0 
                  ? '#52c41a' 
                  : (comparison.changeScore || 0) < 0 
                  ? '#ff4d4f' 
                  : '#999'
              }}
              prefix={(comparison.changeScore || 0) > 0 ? '+' : ''}
              suffix="%"
            />
          </Col>
        </Row>
      </Card>

      {/* Metric Differences Table */}
      <Divider>Metric Differences</Divider>
      <Table
        size="small"
        dataSource={metricsData}
        pagination={false}
        columns={[
          {
            title: 'Metric',
            dataIndex: 'metric',
            key: 'metric',
            render: (text) => <Text strong>{text}</Text>,
          },
          {
            title: 'Baseline',
            dataIndex: 'baseline',
            key: 'baseline',
            align: 'right',
          },
          {
            title: 'Compared',
            dataIndex: 'compared',
            key: 'compared',
            align: 'right',
          },
          {
            title: 'Change',
            key: 'changeDisplay',
            align: 'right',
            render: (_, record) => (
              <Space>
                {getChangeIcon(parseFloat(record.change))}
                <Text
                  style={{
                    color: parseFloat(record.change) > 0 
                      ? '#52c41a' 
                      : parseFloat(record.change) < 0 
                      ? '#ff4d4f' 
                      : '#999'
                  }}
                >
                  {parseFloat(record.change) > 0 ? '+' : ''}{record.change}
                </Text>
              </Space>
            ),
          },
          {
            title: 'Change %',
            key: 'changePercent',
            align: 'right',
            render: (_, record) => {
              const percent = parseFloat(record.changePercent);
              return (
                <Tag color={percent > 0 ? 'success' : percent < 0 ? 'error' : 'default'}>
                  {percent > 0 ? '+' : ''}{record.changePercent}%
                </Tag>
              );
            },
          },
        ]}
      />

      {/* Visual Progress Bars */}
      <Divider>Visual Comparison</Divider>
      <Space direction="vertical" size="middle" style={{ width: '100%' }}>
        {metricsData.map((metric) => {
          const maxValue = Math.max(parseFloat(metric.baseline), parseFloat(metric.compared));
          const baselinePercent = maxValue > 0 ? (parseFloat(metric.baseline) / maxValue) * 100 : 0;
          const comparedPercent = maxValue > 0 ? (parseFloat(metric.compared) / maxValue) * 100 : 0;
          
          return (
            <Card key={metric.key} size="small">
              <Text strong className="block mb-2">{metric.metric}</Text>
              <Row gutter={8}>
                <Col span={12}>
                  <Text type="secondary" className="text-xs">Baseline: {metric.baseline}</Text>
                  <Progress percent={baselinePercent} showInfo={false} strokeColor="#1890ff" />
                </Col>
                <Col span={12}>
                  <Text type="secondary" className="text-xs">Compared: {metric.compared}</Text>
                  <Progress 
                    percent={comparedPercent} 
                    showInfo={false} 
                    strokeColor={parseFloat(metric.change) >= 0 ? '#52c41a' : '#ff4d4f'}
                  />
                </Col>
              </Row>
            </Card>
          );
        })}
      </Space>

      {/* Clinical Notes */}
      {comparison.clinicalNotes && (
        <>
          <Divider>Clinical Notes</Divider>
          <Card size="small" className="bg-gray-50">
            <Paragraph className="mb-0">{comparison.clinicalNotes}</Paragraph>
          </Card>
        </>
      )}

      {/* Metadata */}
      <Divider>Details</Divider>
      <Descriptions size="small" column={1}>
        <Descriptions.Item label="Compared By">
          {comparison.comparedBy?.email || 'Unknown'}
        </Descriptions.Item>
        <Descriptions.Item label="Created">
          {new Date(comparison.createdAt).toLocaleString()}
        </Descriptions.Item>
        <Descriptions.Item label="Updated">
          {new Date(comparison.updatedAt).toLocaleString()}
        </Descriptions.Item>
      </Descriptions>
    </Drawer>
  );
};

export default ComparisonDetailDrawer;
