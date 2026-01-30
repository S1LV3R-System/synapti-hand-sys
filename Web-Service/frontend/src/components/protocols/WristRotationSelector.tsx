import React from 'react';
import { Radio, Space, Typography } from 'antd';
import type { WristRotationConfig } from '../../types/protocol-movements.types';
import { WRIST_ROTATION_LABELS } from '../../types/protocol-movements.types';

const { Text } = Typography;

interface WristRotationSelectorProps {
  config: WristRotationConfig;
  onChange: (config: WristRotationConfig) => void;
}

export const WristRotationSelector: React.FC<WristRotationSelectorProps> = ({
  config,
  onChange
}) => {
  return (
    <div className="p-2 bg-gray-50 rounded-md">
      <Text type="secondary" className="text-xs mb-2 block">Rotation Direction</Text>
      <Radio.Group
        value={config.direction}
        onChange={(e) => onChange({ ...config, direction: e.target.value })}
      >
        <Space direction="vertical">
          {Object.entries(WRIST_ROTATION_LABELS).map(([value, label]) => (
            <Radio key={value} value={value}>
              {label}
            </Radio>
          ))}
        </Space>
      </Radio.Group>
    </div>
  );
};

export default WristRotationSelector;
