import React from 'react';
import type {
  MovementConfig,
  WristRotationConfig,
  FingerTappingConfig,
  FingersBendingConfig,
  ApertureClosureConfig,
  ObjectHoldConfig,
  FreestyleConfig
} from '../../types/protocol-movements.types';
import { MovementType } from '../../types/protocol-movements.types';
import { WristRotationSelector } from './WristRotationSelector';
import { FingerTappingSelector } from './FingerTappingSelector';
import { FingersBendingSelector } from './FingersBendingSelector';
import { ApertureClosureSelector } from './ApertureClosureSelector';
import { ObjectHoldSelector } from './ObjectHoldSelector';
import { FreestyleSelector } from './FreestyleSelector';

interface MovementConfigSelectorProps {
  movementType: MovementType;
  config: MovementConfig;
  onChange: (config: MovementConfig) => void;
}

export const MovementConfigSelector: React.FC<MovementConfigSelectorProps> = ({
  movementType,
  config,
  onChange
}) => {
  switch (movementType) {
    case MovementType.WRIST_ROTATION:
      return (
        <WristRotationSelector
          config={config as WristRotationConfig}
          onChange={onChange}
        />
      );
    case MovementType.FINGER_TAPPING:
      return (
        <FingerTappingSelector
          config={config as FingerTappingConfig}
          onChange={onChange}
        />
      );
    case MovementType.FINGERS_BENDING:
      return (
        <FingersBendingSelector
          config={config as FingersBendingConfig}
          onChange={onChange}
        />
      );
    case MovementType.APERTURE_CLOSURE:
      return (
        <ApertureClosureSelector
          config={config as ApertureClosureConfig}
          onChange={onChange}
        />
      );
    case MovementType.OBJECT_HOLD:
      return (
        <ObjectHoldSelector
          config={config as ObjectHoldConfig}
          onChange={onChange}
        />
      );
    case MovementType.FREESTYLE:
      return (
        <FreestyleSelector
          config={config as FreestyleConfig}
          onChange={onChange}
        />
      );
    default:
      return null;
  }
};

export default MovementConfigSelector;
