import React, { useState, useEffect } from 'react';
import {
  Modal,
  Form,
  Select,
  Input,
  Button,
  Space,
  Card,
  Typography,
  Divider,
  Alert,
  Spin,
  message,
  Row,
  Col,
  Radio,
} from 'antd';
import {
  SwapOutlined,
  UserOutlined,
  CalendarOutlined,
} from '@ant-design/icons';
import { useRecordings } from '../../hooks/useRecordings';
import { useCreateComparison } from '../../hooks/useClinical';
import type { RecordingSession, CreateComparisonInput } from '../../types/api.types';

const { TextArea } = Input;
const { Title, Text } = Typography;
const { Option } = Select;

interface CreateComparisonModalProps {
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export const CreateComparisonModal: React.FC<CreateComparisonModalProps> = ({
  open,
  onClose,
  onSuccess,
}) => {
  const [form] = Form.useForm();
  const [selectedBaseline, setSelectedBaseline] = useState<RecordingSession | null>(null);
  const [selectedCompared, setSelectedCompared] = useState<RecordingSession | null>(null);

  const { data: recordingsData, isLoading: loadingRecordings } = useRecordings({
    status: 'analyzed',
    limit: 100,
  });

  const createComparison = useCreateComparison();

  const recordings = recordingsData?.data || [];

  useEffect(() => {
    if (!open) {
      form.resetFields();
      setSelectedBaseline(null);
      setSelectedCompared(null);
    }
  }, [open, form]);

  const handleBaselineChange = (recordingId: string) => {
    const recording = recordings.find(r => r.id === recordingId);
    setSelectedBaseline(recording || null);
    // Reset compared if same patient is required
    const comparisonType = form.getFieldValue('comparisonType');
    if (comparisonType === 'longitudinal' && selectedCompared?.patientId !== recording?.patientId) {
      form.setFieldValue('comparedRecordingId', undefined);
      setSelectedCompared(null);
    }
  };

  const handleComparedChange = (recordingId: string) => {
    const recording = recordings.find(r => r.id === recordingId);
    setSelectedCompared(recording || null);
  };

  const getFilteredComparedRecordings = () => {
    const comparisonType = form.getFieldValue('comparisonType');
    
    // Filter out the baseline recording
    let filtered = recordings.filter(r => r.id !== selectedBaseline?.id);
    
    // For longitudinal comparisons, must be same patient
    if (comparisonType === 'longitudinal' && selectedBaseline) {
      filtered = filtered.filter(r => r.patientId === selectedBaseline.patientId);
    }
    
    return filtered;
  };

  const calculateMetricDifferences = () => {
    // In a real implementation, this would calculate actual metric differences
    // For now, return placeholder data
    const baselineAnalysis = selectedBaseline?.analyses?.[0];
    const comparedAnalysis = selectedCompared?.analyses?.[0];

    if (!baselineAnalysis || !comparedAnalysis) {
      return {
        tremor_frequency: {
          baseline: baselineAnalysis?.tremorFrequency || 0,
          compared: comparedAnalysis?.tremorFrequency || 0,
          change: 0,
          changePercent: 0,
        },
      };
    }

    const calcDiff = (baseline: number | undefined, compared: number | undefined) => {
      const b = baseline || 0;
      const c = compared || 0;
      const change = c - b;
      const changePercent = b !== 0 ? (change / b) * 100 : 0;
      return { baseline: b, compared: c, change, changePercent };
    };

    return {
      tremor_frequency: calcDiff(baselineAnalysis.tremorFrequency, comparedAnalysis.tremorFrequency),
      tremor_amplitude: calcDiff(baselineAnalysis.tremorAmplitude, comparedAnalysis.tremorAmplitude),
      sparc: calcDiff(baselineAnalysis.sparc, comparedAnalysis.sparc),
      overall_score: calcDiff(baselineAnalysis.overallScore, comparedAnalysis.overallScore),
    };
  };

  const handleSubmit = async (values: any) => {
    if (!selectedBaseline || !selectedCompared) {
      message.error('Please select both recordings');
      return;
    }

    const metricDifferences = calculateMetricDifferences();

    const data: CreateComparisonInput = {
      baselineRecordingId: selectedBaseline.id,
      comparedRecordingId: selectedCompared.id,
      comparisonType: values.comparisonType,
      metricDifferences: JSON.stringify(metricDifferences),
      overallChange: values.overallChange,
      changeScore: values.changeScore,
      clinicalNotes: values.clinicalNotes,
    };

    try {
      await createComparison.mutateAsync(data);
      message.success('Comparison created successfully');
      onSuccess();
    } catch (error: any) {
      message.error(error.response?.data?.message || 'Failed to create comparison');
    }
  };

  const renderRecordingOption = (recording: RecordingSession) => {
    const patient = recording.patient;
    return (
      <Option key={recording.id} value={recording.id}>
        <Space>
          <UserOutlined />
          <span>{patient?.firstName} {patient?.lastName}</span>
          <Text type="secondary">•</Text>
          <CalendarOutlined />
          <Text type="secondary">
            {new Date(recording.recordingDate).toLocaleDateString()}
          </Text>
        </Space>
      </Option>
    );
  };

  return (
    <Modal
      title={
        <Space>
          <SwapOutlined />
          Create Comparison
        </Space>
      }
      open={open}
      onCancel={onClose}
      width={700}
      footer={null}
      destroyOnClose
    >
      <Spin spinning={loadingRecordings}>
        <Form
          form={form}
          layout="vertical"
          onFinish={handleSubmit}
          initialValues={{
            comparisonType: 'longitudinal',
          }}
        >
          {/* Comparison Type */}
          <Form.Item
            name="comparisonType"
            label="Comparison Type"
            rules={[{ required: true }]}
          >
            <Radio.Group
              onChange={() => {
                form.setFieldValue('comparedRecordingId', undefined);
                setSelectedCompared(null);
              }}
            >
              <Radio.Button value="longitudinal">Longitudinal</Radio.Button>
              <Radio.Button value="bilateral">Bilateral</Radio.Button>
              <Radio.Button value="treatment_response">Treatment Response</Radio.Button>
            </Radio.Group>
          </Form.Item>

          <Alert
            type="info"
            className="mb-4"
            message={
              form.getFieldValue('comparisonType') === 'longitudinal'
                ? 'Longitudinal: Compare the same patient over time'
                : form.getFieldValue('comparisonType') === 'bilateral'
                ? 'Bilateral: Compare left vs right hand'
                : 'Treatment Response: Compare pre/post treatment'
            }
          />

          <Divider />

          {/* Recording Selection */}
          <Row gutter={16}>
            <Col span={12}>
              <Card size="small" className="bg-blue-50">
                <Title level={5} className="!mb-2">Baseline Recording</Title>
                <Form.Item
                  name="baselineRecordingId"
                  rules={[{ required: true, message: 'Select baseline recording' }]}
                >
                  <Select
                    placeholder="Select baseline recording"
                    showSearch
                    filterOption={(input, option) =>
                      (option?.children as any)?.props?.children
                        ?.toString()
                        .toLowerCase()
                        .includes(input.toLowerCase())
                    }
                    onChange={handleBaselineChange}
                  >
                    {recordings.map(renderRecordingOption)}
                  </Select>
                </Form.Item>
                {selectedBaseline && (
                  <div className="text-sm text-gray-600">
                    <div>Protocol: {selectedBaseline.protocol?.name || 'None'}</div>
                    <div>Status: {selectedBaseline.status}</div>
                  </div>
                )}
              </Card>
            </Col>
            <Col span={12}>
              <Card size="small" className="bg-green-50">
                <Title level={5} className="!mb-2">Compared Recording</Title>
                <Form.Item
                  name="comparedRecordingId"
                  rules={[{ required: true, message: 'Select compared recording' }]}
                >
                  <Select
                    placeholder="Select compared recording"
                    showSearch
                    disabled={!selectedBaseline}
                    filterOption={(input, option) =>
                      (option?.children as any)?.props?.children
                        ?.toString()
                        .toLowerCase()
                        .includes(input.toLowerCase())
                    }
                    onChange={handleComparedChange}
                  >
                    {getFilteredComparedRecordings().map(renderRecordingOption)}
                  </Select>
                </Form.Item>
                {selectedCompared && (
                  <div className="text-sm text-gray-600">
                    <div>Protocol: {selectedCompared.protocol?.name || 'None'}</div>
                    <div>Status: {selectedCompared.status}</div>
                  </div>
                )}
              </Card>
            </Col>
          </Row>

          <Divider />

          {/* Assessment */}
          <Title level={5}>Assessment</Title>
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item
                name="overallChange"
                label="Overall Change"
                rules={[{ required: true }]}
              >
                <Select placeholder="Select overall change">
                  <Option value="improved">
                    <Text type="success">Improved</Text>
                  </Option>
                  <Option value="stable">Stable</Option>
                  <Option value="declined">
                    <Text type="danger">Declined</Text>
                  </Option>
                </Select>
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item
                name="changeScore"
                label="Change Score (-100 to +100)"
              >
                <Input
                  type="number"
                  min={-100}
                  max={100}
                  placeholder="e.g., 15.5"
                />
              </Form.Item>
            </Col>
          </Row>

          <Form.Item
            name="clinicalNotes"
            label="Clinical Notes"
          >
            <TextArea
              rows={3}
              placeholder="Enter clinical observations and notes..."
            />
          </Form.Item>

          {/* Actions */}
          <Divider />
          <div className="flex justify-end gap-2">
            <Button onClick={onClose}>Cancel</Button>
            <Button
              type="primary"
              htmlType="submit"
              loading={createComparison.isPending}
              disabled={!selectedBaseline || !selectedCompared}
            >
              Create Comparison
            </Button>
          </div>
        </Form>
      </Spin>
    </Modal>
  );
};

export default CreateComparisonModal;
