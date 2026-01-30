import React from 'react';
import { Radio, Space, Typography, Row, Col } from 'antd';
import type { ApertureClosureConfig } from '../../types/protocol-movements.types';
import {
  APERTURE_TYPE_LABELS,
  HAND_TYPE_LABELS
} from '../../types/protocol-movements.types';

const { Text } = Typography;

interface ApertureClosureSelectorProps {
  config: ApertureClosureConfig;
  onChange: (config: ApertureClosureConfig) => void;
}

export const ApertureClosureSelector: React.FC<ApertureClosureSelectorProps> = ({
  config,
  onChange
}) => {
  return (
    <div className="p-2 bg-gray-50 rounded-md">
      <Row gutter={16}>
        <Col span={12}>
          <Text type="secondary" className="text-xs mb-2 block">Aperture Type</Text>
          <Radio.Group
            value={config.apertureType}
            onChange={(e) => onChange({ ...config, apertureType: e.target.value })}
          >
            <Space direction="vertical">
              {Object.entries(APERTURE_TYPE_LABELS).map(([value, label]) => (
                <Radio key={value} value={value}>
                  {label}
                </Radio>
              ))}
            </Space>
          </Radio.Group>
        </Col>
        <Col span={12}>
          <Text type="secondary" className="text-xs mb-2 block">Hand Type</Text>
          <Radio.Group
            value={config.handType}
            onChange={(e) => onChange({ ...config, handType: e.target.value })}
          >
            <Space direction="vertical">
              {Object.entries(HAND_TYPE_LABELS).map(([value, label]) => (
                <Radio key={value} value={value}>
                  {label}
                </Radio>
              ))}
            </Space>
          </Radio.Group>
        </Col>
      </Row>
    </div>
  );
};

export default ApertureClosureSelector;
