import React, { useEffect, useState } from 'react';
import {
  Modal,
  Form,
  Input,
  Switch,
  Button,
  Space,
  Divider,
  Card,
  Typography,
  Row,
  Col,
  InputNumber,
  message,
} from 'antd';
import {
  PlusOutlined,
} from '@ant-design/icons';
import { useCreateProtocol, useUpdateProtocol } from '../../hooks/useProtocols';
import type { Protocol, CreateProtocolInput } from '../../types/api.types';
import type {
  EnhancedProtocolMovement,
  EnhancedProtocolConfiguration,
  AnalysisOutputsConfig
} from '../../types/protocol-movements.types';
import {
  createNewMovement,
  MovementType,
  Hand,
  Posture,
  getDefaultConfig,
  DEFAULT_ANALYSIS_OUTPUTS_CONFIG
} from '../../types/protocol-movements.types';
import { MovementEditor, AnalysisOutputsSelector } from '../../components/protocols';

const { TextArea } = Input;
const { Title, Text } = Typography;

interface ProtocolFormModalProps {
  open: boolean;
  protocol: Protocol | null;
  onClose: () => void;
  onSuccess: () => void;
}

interface FormValues {
  name: string;
  description?: string;
  version: string;
  indicatedFor?: string;
  contraindications?: string;
  isPublic: boolean;
  isActive: boolean;
  instructions?: string;
  clinicalGuidelines?: string;
  requiredMetrics: string[];
  overallRepetitions?: number;
}

export const ProtocolFormModal: React.FC<ProtocolFormModalProps> = ({
  open,
  protocol,
  onClose,
  onSuccess,
}) => {
  const [form] = Form.useForm<FormValues>();
  const [movements, setMovements] = useState<EnhancedProtocolMovement[]>([]);
  const [analysisOutputs, setAnalysisOutputs] = useState<AnalysisOutputsConfig>(
    { ...DEFAULT_ANALYSIS_OUTPUTS_CONFIG }
  );

  const createProtocol = useCreateProtocol();
  const updateProtocol = useUpdateProtocol();
  
  const isEditing = !!protocol?.id;
  const isLoading = createProtocol.isPending || updateProtocol.isPending;

  // Convert legacy movement format to enhanced format
  const convertLegacyMovement = (legacy: any, index: number): EnhancedProtocolMovement => {
    // If it's already enhanced format, return as-is
    if (legacy.movementType && legacy.hand && legacy.posture) {
      return legacy as EnhancedProtocolMovement;
    }
    
    // Convert legacy format
    return {
      id: `movement-${Date.now()}-${index}`,
      order: index,
      movementType: MovementType.FREESTYLE, // Default for legacy
      hand: Hand.RIGHT,
      posture: Posture.NEUTRAL,
      duration: legacy.duration || 30,
      repetitions: legacy.repetitions || 1,
      instructions: legacy.instructions || legacy.name || '',
      config: getDefaultConfig(MovementType.FREESTYLE)
    };
  };

  useEffect(() => {
    if (open) {
      if (protocol) {
        // Parse configuration if it's a string (for backward compatibility)
        let config: any = {};
        try {
          config = typeof protocol.configuration === 'string'
            ? JSON.parse(protocol.configuration)
            : protocol.configuration || {};
        } catch {
          config = {};
        }

        // Populate form fields - prefer direct fields over config values
        form.setFieldsValue({
          name: protocol.name || protocol.protocolName,
          description: protocol.description || protocol.protocolDescription,
          version: protocol.version || config.version || '1.0',
          indicatedFor: protocol.indicatedFor || config.indicatedFor,
          contraindications: protocol.contraindications || config.contraindications,
          isPublic: protocol.isPublic ?? !protocol.isPrivate,
          isActive: protocol.isActive ?? config.isActive ?? true,
          instructions: protocol.patientInstructions || protocol.instructions || config.instructions || '',
          clinicalGuidelines: protocol.clinicalGuidelines || config.clinicalGuidelines || '',
          requiredMetrics: config.requiredMetrics || [],
          overallRepetitions: protocol.overallRepetitions || config.overallRepetitions || 1,
        });

        // Convert and set movements
        // Priority: protocolInformation (new) > config.movements (legacy)
        const rawMovements = protocol.protocolInformation || config.movements || [];
        const enhancedMovements = rawMovements.map(convertLegacyMovement);
        setMovements(enhancedMovements);

        // Load analysis outputs - priority: direct field > config
        const loadedAnalysisOutputs = protocol.analysisOutputs || config.analysisOutputs;
        setAnalysisOutputs(loadedAnalysisOutputs || { ...DEFAULT_ANALYSIS_OUTPUTS_CONFIG });
      } else {
        form.resetFields();
        setMovements([]);
        setAnalysisOutputs({ ...DEFAULT_ANALYSIS_OUTPUTS_CONFIG });
      }
    }
  }, [open, protocol, form]);

  const handleAddMovement = () => {
    const newMovement = createNewMovement(movements.length);
    setMovements([...movements, newMovement]);
  };

  const handleRemoveMovement = (index: number) => {
    setMovements(movements.filter((_, i) => i !== index));
  };

  const handleMovementChange = (index: number, updatedMovement: EnhancedProtocolMovement) => {
    const updated = [...movements];
    updated[index] = updatedMovement;
    setMovements(updated);
  };

  const handleSubmit = async (values: FormValues) => {
    // Build protocol information array with full movement data
    const protocolInformation = movements.map((m, idx) => ({
      name: `${m.movementType}_${m.hand}_${idx}`,
      duration: m.duration,
      repetitions: m.repetitions,
      instructions: m.instructions,
      order: idx,
      movementType: m.movementType,
      hand: m.hand,
      posture: m.posture,
      config: m.config,
    }));

    // Build legacy configuration for backward compatibility
    const configuration: EnhancedProtocolConfiguration = {
      movements: movements.map((m, idx) => ({ ...m, order: idx })),
      requiredMetrics: values.requiredMetrics || [],
      instructions: values.instructions || '',
      clinicalGuidelines: values.clinicalGuidelines || '',
      overallRepetitions: values.overallRepetitions || 1,
      analysisOutputs: analysisOutputs,
    };

    const data: CreateProtocolInput = {
      // Primary schema fields
      protocolName: values.name,
      protocolDescription: values.description,
      protocolInformation: protocolInformation,
      isPrivate: !values.isPublic,
      // Extended protocol metadata (sent explicitly)
      version: values.version,
      indicatedFor: values.indicatedFor,
      contraindications: values.contraindications,
      isActive: values.isActive,
      // Clinical guidelines (sent explicitly)
      patientInstructions: values.instructions,
      clinicalGuidelines: values.clinicalGuidelines,
      overallRepetitions: values.overallRepetitions || 1,
      // Analysis configuration (sent explicitly) - THIS IS THE KEY FIX
      analysisOutputs: analysisOutputs,
      // Legacy fields for backward compatibility
      name: values.name,
      description: values.description,
      isPublic: values.isPublic,
      configuration: JSON.stringify(configuration),
    };

    try {
      if (isEditing) {
        await updateProtocol.mutateAsync({ id: protocol!.id, data });
        message.success('Protocol updated successfully');
      } else {
        await createProtocol.mutateAsync(data);
        message.success('Protocol created successfully');
      }
      onSuccess();
    } catch (error: any) {
      message.error(error.response?.data?.message || 'Failed to save protocol');
    }
  };

  return (
    <Modal
      title={isEditing ? 'Edit Protocol' : 'Create Protocol'}
      open={open}
      onCancel={onClose}
      width={1000}
      footer={null}
      destroyOnClose
      styles={{ body: { maxHeight: '80vh', overflowY: 'auto' } }}
    >
      <Form
        form={form}
        layout="vertical"
        onFinish={handleSubmit}
        initialValues={{
          version: '1.0',
          isPublic: false,
          isActive: true,
          requiredMetrics: [],
        }}
      >
        {/* Basic Information */}
        <Title level={5}>Basic Information</Title>
        <Row gutter={16}>
          <Col span={16}>
            <Form.Item
              name="name"
              label="Protocol Name"
              rules={[{ required: true, message: 'Please enter protocol name' }]}
            >
              <Input placeholder="e.g., Tremor Assessment Protocol v1" />
            </Form.Item>
          </Col>
          <Col span={8}>
            <Form.Item
              name="version"
              label="Version"
              rules={[{ required: true, message: 'Please enter version' }]}
            >
              <Input placeholder="1.0" />
            </Form.Item>
          </Col>
        </Row>

        <Row gutter={16}>
          <Col span={12}>
            <Form.Item
              name="description"
              label="Description"
            >
              <TextArea
                rows={2}
                placeholder="Brief description of the protocol"
              />
            </Form.Item>
          </Col>
          <Col span={6}>
            <Form.Item
              name="indicatedFor"
              label="Indicated For"
            >
              <TextArea
                rows={2}
                placeholder="e.g., Parkinson's disease"
              />
            </Form.Item>
          </Col>
          <Col span={6}>
            <Form.Item
              name="contraindications"
              label="Contraindications"
            >
              <TextArea
                rows={2}
                placeholder="e.g., Severe arthritis"
              />
            </Form.Item>
          </Col>
        </Row>

        <Divider />

        {/* Movements Configuration */}
        <div className="flex justify-between items-center mb-4">
          <Title level={5} className="!mb-0">Movements</Title>
          <Space>
            <Form.Item
              name="overallRepetitions"
              label="Overall Repetitions"
              className="!mb-0"
              initialValue={1}
            >
              <InputNumber min={1} max={10} style={{ width: 80 }} />
            </Form.Item>
            <Button 
              type="dashed" 
              icon={<PlusOutlined />}
              onClick={handleAddMovement}
            >
              Add Movement
            </Button>
          </Space>
        </div>

        {movements.length === 0 ? (
          <Card className="text-center py-8 mb-4">
            <Text type="secondary">No movements configured. Add movements to define the assessment procedure.</Text>
          </Card>
        ) : (
          <div className="mb-4">
            {movements.map((movement, index) => (
              <MovementEditor
                key={movement.id}
                movement={movement}
                index={index}
                onChange={(updated) => handleMovementChange(index, updated)}
                onDelete={() => handleRemoveMovement(index)}
              />
            ))}
          </div>
        )}

        <Divider />

        {/* Clinical Guidelines */}
        <Title level={5}>Clinical Guidelines</Title>
        <Row gutter={16}>
          <Col span={12}>
            <Form.Item
              name="instructions"
              label="Patient Instructions"
            >
              <TextArea
                rows={2}
                placeholder="Instructions for the patient..."
              />
            </Form.Item>
          </Col>
          <Col span={12}>
            <Form.Item
              name="clinicalGuidelines"
              label="Clinical Interpretation Guidelines"
            >
              <TextArea
                rows={2}
                placeholder="Guidelines for clinicians..."
              />
            </Form.Item>
          </Col>
        </Row>

        <Divider />

        {/* Analysis Outputs Configuration */}
        <AnalysisOutputsSelector
          config={analysisOutputs}
          onChange={setAnalysisOutputs}
        />

        <Divider />

        {/* Settings */}
        <Title level={5}>Settings</Title>
        <Row gutter={16}>
          <Col span={12}>
            <Form.Item
              name="isActive"
              label="Active"
              valuePropName="checked"
            >
              <Switch checkedChildren="Yes" unCheckedChildren="No" />
            </Form.Item>
          </Col>
          <Col span={12}>
            <Form.Item
              name="isPublic"
              label="Public (visible to all users)"
              valuePropName="checked"
            >
              <Switch checkedChildren="Public" unCheckedChildren="Private" />
            </Form.Item>
          </Col>
        </Row>

        {/* Actions */}
        <Divider />
        <div className="flex justify-end gap-2">
          <Button onClick={onClose}>Cancel</Button>
          <Button type="primary" htmlType="submit" loading={isLoading}>
            {isEditing ? 'Update Protocol' : 'Create Protocol'}
          </Button>
        </div>
      </Form>
    </Modal>
  );
};

export default ProtocolFormModal;
