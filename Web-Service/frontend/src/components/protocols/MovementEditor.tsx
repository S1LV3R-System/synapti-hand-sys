import React from 'react';
import {
  Card,
  Select,
  InputNumber,
  Input,
  Row,
  Col,
  Button,
  Space,
  Typography
} from 'antd';
import { DeleteOutlined, DragOutlined } from '@ant-design/icons';
import type { EnhancedProtocolMovement, MovementType } from '../../types/protocol-movements.types';
import {
  MOVEMENT_TYPE_LABELS,
  HAND_LABELS,
  POSTURE_LABELS,
  getDefaultConfig
} from '../../types/protocol-movements.types';
import { MovementConfigSelector } from './MovementConfigSelector';

const { TextArea } = Input;
const { Text } = Typography;

interface MovementEditorProps {
  movement: EnhancedProtocolMovement;
  onChange: (movement: EnhancedProtocolMovement) => void;
  onDelete: () => void;
  index: number;
}

export const MovementEditor: React.FC<MovementEditorProps> = ({
  movement,
  onChange,
  onDelete,
  index
}) => {
  const handleMovementTypeChange = (newType: MovementType) => {
    onChange({
      ...movement,
      movementType: newType,
      config: getDefaultConfig(newType)
    });
  };

  return (
    <Card
      size="small"
      className="mb-3"
      title={
        <Space>
          <DragOutlined className="text-gray-400 cursor-move" />
          <Text strong>Movement {index + 1}</Text>
          <Text type="secondary">• {MOVEMENT_TYPE_LABELS[movement.movementType]}</Text>
        </Space>
      }
      extra={
        <Button
          type="text"
          danger
          icon={<DeleteOutlined />}
          onClick={onDelete}
        />
      }
    >
      {/* Row 1: Movement Type, Hand, Posture, Duration, Repetitions - all in one row */}
      <Row gutter={8} className="mb-2">
        <Col span={5}>
          <Text type="secondary" className="text-xs block mb-1">Movement Type</Text>
          <Select
            value={movement.movementType}
            onChange={handleMovementTypeChange}
            style={{ width: '100%' }}
            size="small"
            options={Object.entries(MOVEMENT_TYPE_LABELS).map(([value, label]) => ({
              value,
              label
            }))}
          />
        </Col>
        <Col span={5}>
          <Text type="secondary" className="text-xs block mb-1">Hand</Text>
          <Select
            value={movement.hand}
            onChange={(value) => onChange({ ...movement, hand: value })}
            style={{ width: '100%' }}
            size="small"
            options={Object.entries(HAND_LABELS).map(([value, label]) => ({
              value,
              label
            }))}
          />
        </Col>
        <Col span={5}>
          <Text type="secondary" className="text-xs block mb-1">Posture</Text>
          <Select
            value={movement.posture}
            onChange={(value) => onChange({ ...movement, posture: value })}
            style={{ width: '100%' }}
            size="small"
            options={Object.entries(POSTURE_LABELS).map(([value, label]) => ({
              value,
              label
            }))}
          />
        </Col>
        <Col span={4}>
          <Text type="secondary" className="text-xs block mb-1">Duration (s)</Text>
          <InputNumber
            value={movement.duration}
            onChange={(value) => onChange({ ...movement, duration: value || 30 })}
            min={1}
            max={600}
            size="small"
            style={{ width: '100%' }}
          />
        </Col>
        <Col span={4}>
          <Text type="secondary" className="text-xs block mb-1">Repetitions</Text>
          <InputNumber
            value={movement.repetitions}
            onChange={(value) => onChange({ ...movement, repetitions: value || 1 })}
            min={1}
            max={50}
            size="small"
            style={{ width: '100%' }}
          />
        </Col>
      </Row>

      {/* Row 2: Movement-specific configuration + Instructions side by side */}
      <Row gutter={12}>
        <Col span={12}>
          <Text type="secondary" className="text-xs block mb-1">Movement Configuration</Text>
          <MovementConfigSelector
            movementType={movement.movementType}
            config={movement.config}
            onChange={(config) => onChange({ ...movement, config })}
          />
        </Col>
        <Col span={12}>
          <Text type="secondary" className="text-xs block mb-1">Instructions for Patient</Text>
          <TextArea
            value={movement.instructions}
            onChange={(e) => onChange({ ...movement, instructions: e.target.value })}
            rows={3}
            placeholder="Enter instructions for this movement..."
            style={{ height: '100%' }}
          />
        </Col>
      </Row>
    </Card>
  );
};

export default MovementEditor;
