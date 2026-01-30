import React from 'react';
import { Radio, Space, Typography } from 'antd';
import type { FingersBendingConfig } from '../../types/protocol-movements.types';
import { BENDING_MODE_LABELS } from '../../types/protocol-movements.types';

const { Text } = Typography;

interface FingersBendingSelectorProps {
  config: FingersBendingConfig;
  onChange: (config: FingersBendingConfig) => void;
}

export const FingersBendingSelector: React.FC<FingersBendingSelectorProps> = ({
  config,
  onChange
}) => {
  return (
    <div className="p-2 bg-gray-50 rounded-md">
      <Text type="secondary" className="text-xs mb-2 block">Bending Mode</Text>
      <Radio.Group
        value={config.mode}
        onChange={(e) => onChange({ ...config, mode: e.target.value })}
      >
        <Space direction="vertical">
          {Object.entries(BENDING_MODE_LABELS).map(([value, label]) => (
            <Radio key={value} value={value}>
              {label}
            </Radio>
          ))}
        </Space>
      </Radio.Group>
    </div>
  );
};

export default FingersBendingSelector;
