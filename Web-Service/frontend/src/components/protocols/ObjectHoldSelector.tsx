import React from 'react';
import { Radio, Space, Typography } from 'antd';
import type { ObjectHoldConfig } from '../../types/protocol-movements.types';
import { GRIP_TYPE_LABELS } from '../../types/protocol-movements.types';

const { Text } = Typography;

interface ObjectHoldSelectorProps {
  config: ObjectHoldConfig;
  onChange: (config: ObjectHoldConfig) => void;
}

export const ObjectHoldSelector: React.FC<ObjectHoldSelectorProps> = ({
  config,
  onChange
}) => {
  return (
    <div className="p-2 bg-gray-50 rounded-md">
      <Text type="secondary" className="text-xs mb-2 block">Grip Type</Text>
      <Radio.Group
        value={config.gripType}
        onChange={(e) => onChange({ ...config, gripType: e.target.value })}
      >
        <Space direction="vertical">
          {Object.entries(GRIP_TYPE_LABELS).map(([value, label]) => (
            <Radio key={value} value={value}>
              {label}
            </Radio>
          ))}
        </Space>
      </Radio.Group>
    </div>
  );
};

export default ObjectHoldSelector;
