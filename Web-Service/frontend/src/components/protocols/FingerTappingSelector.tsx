import React from 'react';
import { Radio, Checkbox, Space, Typography, Row, Col } from 'antd';
import type { FingerTappingConfig } from '../../types/protocol-movements.types';
import { TAPPING_MODE_LABELS } from '../../types/protocol-movements.types';

const { Text } = Typography;

interface FingerTappingSelectorProps {
  config: FingerTappingConfig;
  onChange: (config: FingerTappingConfig) => void;
}

const FINGER_LABELS: Record<keyof FingerTappingConfig['fingers'], string> = {
  thumb: 'Thumb',
  index: 'Index',
  middle: 'Middle',
  ring: 'Ring',
  pinky: 'Pinky'
};

export const FingerTappingSelector: React.FC<FingerTappingSelectorProps> = ({
  config,
  onChange
}) => {
  const handleFingerChange = (finger: keyof FingerTappingConfig['fingers'], checked: boolean) => {
    onChange({
      ...config,
      fingers: {
        ...config.fingers,
        [finger]: checked
      }
    });
  };

  return (
    <div className="p-2 bg-gray-50 rounded-md">
      <Row gutter={16}>
        <Col span={12}>
          <Text type="secondary" className="text-xs mb-2 block">Mode</Text>
          <Radio.Group
            value={config.mode}
            onChange={(e) => onChange({ ...config, mode: e.target.value })}
          >
            <Space direction="vertical">
              {Object.entries(TAPPING_MODE_LABELS).map(([value, label]) => (
                <Radio key={value} value={value}>
                  {label}
                </Radio>
              ))}
            </Space>
          </Radio.Group>
        </Col>
        <Col span={12}>
          <Text type="secondary" className="text-xs mb-2 block">Fingers</Text>
          <Space direction="vertical">
            {(Object.keys(config.fingers) as Array<keyof FingerTappingConfig['fingers']>).map(
              (finger) => (
                <Checkbox
                  key={finger}
                  checked={config.fingers[finger]}
                  onChange={(e) => handleFingerChange(finger, e.target.checked)}
                >
                  {FINGER_LABELS[finger]}
                </Checkbox>
              )
            )}
          </Space>
        </Col>
      </Row>
    </div>
  );
};

export default FingerTappingSelector;
