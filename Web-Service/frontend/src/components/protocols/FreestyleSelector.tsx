import React from 'react';
import { Typography, Alert } from 'antd';
import type { FreestyleConfig } from '../../types/protocol-movements.types';

const { Text } = Typography;

interface FreestyleSelectorProps {
  config: FreestyleConfig;
  onChange: (config: FreestyleConfig) => void;
}

export const FreestyleSelector: React.FC<FreestyleSelectorProps> = () => {
  return (
    <div className="p-2 bg-gray-50 rounded-md">
      <Alert
        type="info"
        showIcon
        message="Freestyle Movement"
        description={
          <Text type="secondary">
            No additional configuration required. The patient can perform any 
            natural hand movement. Analysis will capture general metrics like 
            overall stability, range of motion, and tremor detection.
          </Text>
        }
      />
    </div>
  );
};

export default FreestyleSelector;
