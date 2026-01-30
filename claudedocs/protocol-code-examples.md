# Protocol Movement System - Implementation Code Examples

## 1. TypeScript Type Definitions

### 1.1 Movement Types (frontend + backend)

```typescript
// types/protocol.types.ts

export type Hand = 'left' | 'right' | 'both';
export type Posture = 'pronation' | 'supination' | 'neutral';

export type MovementType = 
  | 'wrist_rotation'
  | 'finger_tapping'
  | 'fingers_bending'
  | 'aperture_closure'
  | 'object_hold'
  | 'freestyle';

// ─────────── Wrist Rotation ───────────
export type WristRotationSubMovement = 
  | 'rotation_in_out'
  | 'rotation_out_in'
  | 'rotation_in'
  | 'rotation_out';

export interface WristRotationConfig {
  subMovement: WristRotationSubMovement;
}

// ─────────── Finger Tapping ───────────
export type Finger = 'thumb' | 'index' | 'middle' | 'ring' | 'little';
export type UnilateralMode = 'tap_slowly' | 'tap_fast';
export type BilateralPattern = 'alternating' | 'synchronous';

export interface FingerTappingConfig {
  fingers: Finger[];
  unilateral: UnilateralMode;
  bilateral: BilateralPattern;
}

// ─────────── Fingers Bending ───────────
export type FingersBendingSubMovement = 'unilateral' | 'bilateral';

export interface FingersBendingConfig {
  subMovement: FingersBendingSubMovement;
}

// ─────────── Aperture-Closure ───────────
export type ApertureCategory = 'aperture' | 'closure' | 'aperture_closure';
export type HandCategory = 'unilateral' | 'bilateral';

export interface ApertureClosureConfig {
  apertureCategory: ApertureCategory;
  handCategory: HandCategory;
}

// ─────────── Object Hold ───────────
export type ObjectHoldSubMovement = 'open_palm' | 'closed_grasp';

export interface ObjectHoldConfig {
  subMovement: ObjectHoldSubMovement;
}

// ─────────── Freestyle ───────────
export type FreestyleConfig = Record<string, never>;

// ─────────── Union Type ───────────
export type MovementConfig = 
  | WristRotationConfig
  | FingerTappingConfig
  | FingersBendingConfig
  | ApertureClosureConfig
  | ObjectHoldConfig
  | FreestyleConfig;

// ─────────── Protocol Movement ───────────
export interface ProtocolMovement {
  id: string; // UUID
  order: number;
  movementType: MovementType;
  
  // Global movement settings
  hand: Hand;
  posture: Posture;
  duration: number; // seconds
  repetitions: number;
  instructions: string;
  
  // Type-specific configuration
  config: MovementConfig;
}

// ─────────── Protocol Configuration ───────────
export interface ProtocolConfiguration {
  movements: ProtocolMovement[];
  overallRepetitions: number;
  requiredMetrics: string[];
  clinicalGuidelines?: string;
}

// ─────────── API Types ───────────
export interface Protocol {
  id: string;
  name: string;
  description?: string;
  version: string;
  configuration: ProtocolConfiguration;
  indicatedFor?: string;
  contraindications?: string;
  createdById: string;
  isPublic: boolean;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
  deletedAt?: Date;
}

export type CreateProtocolInput = Omit<
  Protocol,
  'id' | 'createdById' | 'createdAt' | 'updatedAt' | 'deletedAt'
>;

export type UpdateProtocolInput = Partial<Omit<
  Protocol,
  'id' | 'createdById' | 'createdAt' | 'updatedAt' | 'deletedAt'
>>;
```

---

## 2. Zod Validation Schemas

### 2.1 Complete Validation Schema

```typescript
// schemas/protocol.validation.ts

import { z } from 'zod';
import { v4 as uuid } from 'uuid';

// ─────────── Base Enums ───────────
const handSchema = z.enum(['left', 'right', 'both']);
const postureSchema = z.enum(['pronation', 'supination', 'neutral']);

// ─────────── Movement-Specific Schemas ───────────

const wristRotationConfigSchema = z.object({
  subMovement: z.enum(['rotation_in_out', 'rotation_out_in', 'rotation_in', 'rotation_out'])
});

const fingerTappingConfigSchema = z.object({
  fingers: z.array(z.enum(['thumb', 'index', 'middle', 'ring', 'little']))
    .min(1, { message: 'Select at least one finger' })
    .max(5, { message: 'Cannot exceed 5 fingers' }),
  unilateral: z.enum(['tap_slowly', 'tap_fast']),
  bilateral: z.enum(['alternating', 'synchronous'])
});

const fingersBendingConfigSchema = z.object({
  subMovement: z.enum(['unilateral', 'bilateral'])
});

const apertureClosureConfigSchema = z.object({
  apertureCategory: z.enum(['aperture', 'closure', 'aperture_closure']),
  handCategory: z.enum(['unilateral', 'bilateral'])
});

const objectHoldConfigSchema = z.object({
  subMovement: z.enum(['open_palm', 'closed_grasp'])
});

const freestyleConfigSchema = z.object({}).strict(); // No properties allowed

// ─────────── Base Movement Schema ───────────
const baseMovementSchema = z.object({
  id: z.string().uuid('Invalid UUID format'),
  order: z.number().int('Order must be integer').min(0, 'Order cannot be negative'),
  movementType: z.enum([
    'wrist_rotation',
    'finger_tapping',
    'fingers_bending',
    'aperture_closure',
    'object_hold',
    'freestyle'
  ]),
  hand: handSchema,
  posture: postureSchema,
  duration: z.number()
    .int('Duration must be whole number')
    .min(5, 'Minimum 5 seconds')
    .max(300, 'Maximum 5 minutes'),
  repetitions: z.number()
    .int('Repetitions must be whole number')
    .min(1, 'At least 1 repetition')
    .max(100, 'Maximum 100 repetitions'),
  instructions: z.string()
    .min(1, 'Instructions required')
    .max(1000, 'Instructions too long (max 1000 chars)')
});

// ─────────── Discriminated Union ───────────
export const movementSchema = z.discriminatedUnion('movementType', [
  baseMovementSchema.extend({
    movementType: z.literal('wrist_rotation'),
    config: wristRotationConfigSchema
  }),
  baseMovementSchema.extend({
    movementType: z.literal('finger_tapping'),
    config: fingerTappingConfigSchema
  }),
  baseMovementSchema.extend({
    movementType: z.literal('fingers_bending'),
    config: fingersBendingConfigSchema
  }),
  baseMovementSchema.extend({
    movementType: z.literal('aperture_closure'),
    config: apertureClosureConfigSchema
  }),
  baseMovementSchema.extend({
    movementType: z.literal('object_hold'),
    config: objectHoldConfigSchema
  }),
  baseMovementSchema.extend({
    movementType: z.literal('freestyle'),
    config: freestyleConfigSchema
  })
]);

// ─────────── Protocol Configuration Schema ───────────
export const protocolConfigurationSchema = z.object({
  movements: z.array(movementSchema)
    .min(1, 'At least one movement required')
    .max(20, 'Maximum 20 movements per protocol'),
  overallRepetitions: z.number()
    .int('Must be whole number')
    .min(1, 'At least 1 repetition')
    .max(20, 'Maximum 20 repetitions'),
  requiredMetrics: z.array(z.string()).optional(),
  clinicalGuidelines: z.string().optional()
});

// ─────────── Protocol Schema ───────────
export const protocolSchema = z.object({
  name: z.string().min(1, 'Protocol name required').max(100),
  description: z.string().max(500).optional(),
  version: z.string().default('1.0'),
  configuration: protocolConfigurationSchema,
  indicatedFor: z.string().optional(),
  contraindications: z.string().optional(),
  isPublic: z.boolean().default(false),
  isActive: z.boolean().default(true)
});

export type ProtocolInput = z.infer<typeof protocolSchema>;
export type ProtocolConfiguration = z.infer<typeof protocolConfigurationSchema>;
export type ProtocolMovement = z.infer<typeof movementSchema>;

// ─────────── Helpers ───────────
export const validateProtocol = (data: unknown) => {
  return protocolSchema.parseAsync(data);
};

export const createDefaultMovement = (type: MovementType): ProtocolMovement => {
  const baseMovement = {
    id: uuid(),
    order: 0,
    movementType: type,
    hand: 'right' as const,
    posture: 'neutral' as const,
    duration: 30,
    repetitions: 5,
    instructions: ''
  };

  const configMap: Record<MovementType, MovementConfig> = {
    wrist_rotation: { subMovement: 'rotation_in_out' },
    finger_tapping: { fingers: ['index'], unilateral: 'tap_slowly', bilateral: 'alternating' },
    fingers_bending: { subMovement: 'unilateral' },
    aperture_closure: { apertureCategory: 'aperture', handCategory: 'unilateral' },
    object_hold: { subMovement: 'open_palm' },
    freestyle: {}
  };

  return {
    ...baseMovement,
    config: configMap[type]
  };
};
```

---

## 3. React Component Examples

### 3.1 ProtocolEditor Main Component

```typescript
// components/ProtocolEditor.tsx

import React, { useState } from 'react';
import { useForm, FormProvider } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { protocolSchema, type ProtocolInput, createDefaultMovement } from '@/schemas/protocol.validation';
import { Button, Card, Space, Spin, message } from 'antd';
import { PlusOutlined } from '@ant-design/icons';
import { MovementsList } from './MovementsList';
import { ProtocolBasicForm } from './ProtocolBasicForm';
import { OverallSettingsForm } from './OverallSettingsForm';
import { protocolsService } from '@/services/protocols.service';

interface ProtocolEditorProps {
  protocolId?: string;
  onSuccess?: (protocolId: string) => void;
}

export const ProtocolEditor: React.FC<ProtocolEditorProps> = ({
  protocolId,
  onSuccess
}) => {
  const [isLoading, setIsLoading] = useState(false);

  // Initialize form with default values or load existing protocol
  const methods = useForm<ProtocolInput>({
    resolver: zodResolver(protocolSchema),
    defaultValues: {
      name: '',
      description: '',
      version: '1.0',
      configuration: {
        movements: [],
        overallRepetitions: 1,
        requiredMetrics: []
      },
      isPublic: false,
      isActive: true
    }
  });

  const { handleSubmit, watch, setValue, formState: { errors } } = methods;

  // Load existing protocol if editing
  React.useEffect(() => {
    if (protocolId) {
      setIsLoading(true);
      protocolsService.getProtocol(protocolId)
        .then(protocol => {
          // Populate form with existing data
          methods.reset({
            name: protocol.name,
            description: protocol.description,
            version: protocol.version,
            configuration: protocol.configuration,
            indicatedFor: protocol.indicatedFor,
            contraindications: protocol.contraindications,
            isPublic: protocol.isPublic,
            isActive: protocol.isActive
          });
        })
        .catch(err => {
          message.error('Failed to load protocol');
          console.error(err);
        })
        .finally(() => setIsLoading(false));
    }
  }, [protocolId]);

  const movements = watch('configuration.movements') || [];

  const handleAddMovement = () => {
    const newMovement = createDefaultMovement('freestyle');
    setValue('configuration.movements', [...movements, newMovement]);
  };

  const handleRemoveMovement = (index: number) => {
    setValue('configuration.movements', movements.filter((_, i) => i !== index));
  };

  const handleReorderMovements = (newOrder: typeof movements) => {
    const reordered = newOrder.map((movement, i) => ({ ...movement, order: i }));
    setValue('configuration.movements', reordered);
  };

  const onSubmit = async (data: ProtocolInput) => {
    try {
      setIsLoading(true);

      if (protocolId) {
        await protocolsService.updateProtocol(protocolId, data);
        message.success('Protocol updated successfully');
      } else {
        const result = await protocolsService.createProtocol(data);
        message.success('Protocol created successfully');
        onSuccess?.(result.id);
      }
    } catch (error) {
      message.error('Failed to save protocol');
      console.error(error);
    } finally {
      setIsLoading(false);
    }
  };

  if (isLoading && protocolId) {
    return <Spin />;
  }

  return (
    <FormProvider {...methods}>
      <form onSubmit={handleSubmit(onSubmit)}>
        <Space direction="vertical" style={{ width: '100%' }} size="large">
          {/* Basic Protocol Info */}
          <Card title="Protocol Information">
            <ProtocolBasicForm />
          </Card>

          {/* Movements */}
          <Card title="Movements">
            <Space direction="vertical" style={{ width: '100%' }} size="middle">
              {movements.length > 0 && (
                <MovementsList
                  movements={movements}
                  onRemove={handleRemoveMovement}
                  onReorder={handleReorderMovements}
                />
              )}
              <Button
                type="dashed"
                block
                icon={<PlusOutlined />}
                onClick={handleAddMovement}
              >
                Add Movement
              </Button>
            </Space>
          </Card>

          {/* Overall Settings */}
          <Card title="Overall Settings">
            <OverallSettingsForm />
          </Card>

          {/* Actions */}
          <Space style={{ justifyContent: 'flex-end', width: '100%' }}>
            <Button onClick={() => methods.reset()}>Clear</Button>
            <Button type="primary" htmlType="submit" loading={isLoading}>
              {protocolId ? 'Update Protocol' : 'Create Protocol'}
            </Button>
          </Space>
        </Space>
      </form>
    </FormProvider>
  );
};
```

### 3.2 MovementTypeSelector Component

```typescript
// components/MovementTypeSelector.tsx

import React from 'react';
import { useFormContext, Controller } from 'react-hook-form';
import { Select, Form, Tooltip } from 'antd';
import { MovementType } from '@/types/protocol.types';

const MOVEMENT_DESCRIPTIONS: Record<MovementType, string> = {
  wrist_rotation: 'Rotating the wrist in specified directions',
  finger_tapping: 'Tapping selected fingers with specified rhythm',
  fingers_bending: 'Flexing and extending fingers',
  aperture_closure: 'Opening and closing hand at specified pace',
  object_hold: 'Holding an object with specified grip',
  freestyle: 'Free hand movement without specific constraints'
};

interface MovementTypeSelectorProps {
  movementIndex: number;
}

export const MovementTypeSelector: React.FC<MovementTypeSelectorProps> = ({
  movementIndex
}) => {
  const { control, watch, setValue } = useFormContext();
  
  const currentType = watch(`configuration.movements.${movementIndex}.movementType`);

  const handleTypeChange = (newType: MovementType) => {
    // Reset config when type changes
    const configDefaults: Record<MovementType, any> = {
      wrist_rotation: { subMovement: 'rotation_in_out' },
      finger_tapping: { fingers: [], unilateral: 'tap_slowly', bilateral: 'alternating' },
      fingers_bending: { subMovement: 'unilateral' },
      aperture_closure: { apertureCategory: 'aperture', handCategory: 'unilateral' },
      object_hold: { subMovement: 'open_palm' },
      freestyle: {}
    };

    setValue(`configuration.movements.${movementIndex}.config`, configDefaults[newType]);
  };

  return (
    <Controller
      name={`configuration.movements.${movementIndex}.movementType`}
      control={control}
      render={({ field, fieldState: { error } }) => (
        <Form.Item
          label="Movement Type"
          validateStatus={error ? 'error' : ''}
          help={error?.message}
        >
          <Select
            {...field}
            placeholder="Select movement type"
            onChange={handleTypeChange}
            options={[
              {
                label: (
                  <Tooltip title={MOVEMENT_DESCRIPTIONS.wrist_rotation}>
                    Wrist Rotation
                  </Tooltip>
                ),
                value: 'wrist_rotation'
              },
              {
                label: (
                  <Tooltip title={MOVEMENT_DESCRIPTIONS.finger_tapping}>
                    Finger Tapping
                  </Tooltip>
                ),
                value: 'finger_tapping'
              },
              {
                label: (
                  <Tooltip title={MOVEMENT_DESCRIPTIONS.fingers_bending}>
                    Fingers Bending
                  </Tooltip>
                ),
                value: 'fingers_bending'
              },
              {
                label: (
                  <Tooltip title={MOVEMENT_DESCRIPTIONS.aperture_closure}>
                    Aperture-Closure
                  </Tooltip>
                ),
                value: 'aperture_closure'
              },
              {
                label: (
                  <Tooltip title={MOVEMENT_DESCRIPTIONS.object_hold}>
                    Object Hold
                  </Tooltip>
                ),
                value: 'object_hold'
              },
              {
                label: (
                  <Tooltip title={MOVEMENT_DESCRIPTIONS.freestyle}>
                    Freestyle
                  </Tooltip>
                ),
                value: 'freestyle'
              }
            ]}
          />
        </Form.Item>
      )}
    />
  );
};
```

### 3.3 SubMovementSelector (Polymorphic)

```typescript
// components/SubMovementSelector.tsx

import React from 'react';
import { useFormContext } from 'react-hook-form';
import { MovementType } from '@/types/protocol.types';
import { WristRotationSelector } from './subMovements/WristRotationSelector';
import { FingerTappingSelector } from './subMovements/FingerTappingSelector';
import { FingersBendingSelector } from './subMovements/FingersBendingSelector';
import { ApertureClosureSelector } from './subMovements/ApertureClosureSelector';
import { ObjectHoldSelector } from './subMovements/ObjectHoldSelector';

interface SubMovementSelectorProps {
  movementIndex: number;
}

export const SubMovementSelector: React.FC<SubMovementSelectorProps> = ({
  movementIndex
}) => {
  const { watch } = useFormContext();
  
  const movementType = watch(
    `configuration.movements.${movementIndex}.movementType`
  ) as MovementType;

  const selectorMap: Record<MovementType, React.ComponentType<any>> = {
    wrist_rotation: WristRotationSelector,
    finger_tapping: FingerTappingSelector,
    fingers_bending: FingersBendingSelector,
    aperture_closure: ApertureClosureSelector,
    object_hold: ObjectHoldSelector,
    freestyle: () => null // No selector for freestyle
  };

  const SelectorComponent = selectorMap[movementType];

  return SelectorComponent ? (
    <SelectorComponent movementIndex={movementIndex} />
  ) : null;
};
```

### 3.4 FingerTappingSelector Example

```typescript
// components/subMovements/FingerTappingSelector.tsx

import React from 'react';
import { useFormContext, Controller } from 'react-hook-form';
import { Checkbox, Select, Form, Space } from 'antd';
import { Finger } from '@/types/protocol.types';

const FINGERS: Array<{ value: Finger; label: string }> = [
  { value: 'thumb', label: 'Thumb' },
  { value: 'index', label: 'Index' },
  { value: 'middle', label: 'Middle' },
  { value: 'ring', label: 'Ring' },
  { value: 'little', label: 'Little' }
];

interface FingerTappingSelectorProps {
  movementIndex: number;
}

export const FingerTappingSelector: React.FC<FingerTappingSelectorProps> = ({
  movementIndex
}) => {
  const { control, watch } = useFormContext();
  
  const selectedFingers = watch(`configuration.movements.${movementIndex}.config.fingers`) || [];

  return (
    <Space direction="vertical" style={{ width: '100%' }}>
      {/* Finger Selection */}
      <Controller
        name={`configuration.movements.${movementIndex}.config.fingers`}
        control={control}
        render={({ field, fieldState: { error } }) => (
          <Form.Item
            label="Fingers (select at least one)"
            validateStatus={error ? 'error' : ''}
            help={error?.message}
          >
            <Checkbox.Group
              options={FINGERS}
              value={selectedFingers}
              onChange={field.onChange}
            />
          </Form.Item>
        )}
      />

      {/* Unilateral Mode */}
      <Controller
        name={`configuration.movements.${movementIndex}.config.unilateral`}
        control={control}
        render={({ field, fieldState: { error } }) => (
          <Form.Item
            label="Unilateral Mode"
            validateStatus={error ? 'error' : ''}
            help={error?.message}
          >
            <Select
              {...field}
              options={[
                { value: 'tap_slowly', label: 'Tap Slowly' },
                { value: 'tap_fast', label: 'Tap Fast' }
              ]}
            />
          </Form.Item>
        )}
      />

      {/* Bilateral Mode */}
      <Controller
        name={`configuration.movements.${movementIndex}.config.bilateral`}
        control={control}
        render={({ field, fieldState: { error } }) => (
          <Form.Item
            label="Bilateral Mode"
            validateStatus={error ? 'error' : ''}
            help={error?.message}
          >
            <Select
              {...field}
              options={[
                { value: 'alternating', label: 'Alternating' },
                { value: 'synchronous', label: 'Synchronous' }
              ]}
            />
          </Form.Item>
        )}
      />
    </Space>
  );
};
```

---

## 4. Backend Analysis Example

### 4.1 Movement-Specific Analyzer

```typescript
// backend/services/analyzers/wristRotationAnalyzer.ts

import { SignalProcessingResult } from '@prisma/client';
import { ProtocolMovement } from '@/types/protocol.types';
import { calculateRotationAngles, calculateFFT } from '@/lib/signal-processing';

export interface WristRotationMetrics {
  rotationRange: number; // degrees
  rotationSmoothness: number; // 0-1
  dominantFrequency: number; // Hz
  tremorAmplitude: number; // mm
  tremorFrequency: number; // Hz
}

export async function analyzeWristRotation(
  signalProcessingResult: SignalProcessingResult,
  movement: ProtocolMovement
): Promise<WristRotationMetrics> {
  // Parse landmarks
  const landmarks = JSON.parse(signalProcessingResult.rawLandmarks);

  // Extract wrist joint data (landmarks 9-13)
  const wristData = landmarks.map((frame: any) => ({
    timestamp: frame.timestamp,
    wrist: frame.landmarks.slice(9, 13)
  }));

  // Calculate rotation angles over time
  const angles = calculateRotationAngles(wristData);

  // Get statistics
  const rotationRange = Math.max(...angles) - Math.min(...angles);
  const smoothness = calculateSmoothness(angles);

  // FFT for frequency analysis
  const fftResult = calculateFFT(angles);
  const dominantFrequency = fftResult.dominantFrequency;
  const tremorAmplitude = fftResult.peakAmplitude;
  const tremorFrequency = fftResult.dominantFrequency;

  return {
    rotationRange,
    rotationSmoothness: smoothness,
    dominantFrequency,
    tremorAmplitude,
    tremorFrequency
  };
}

function calculateSmoothness(signal: number[]): number {
  // Implement smoothness calculation (e.g., SPARC, LDLJV)
  // Returns value between 0 (jerky) and 1 (smooth)
  const derivatives = [];
  for (let i = 1; i < signal.length; i++) {
    derivatives.push(signal[i] - signal[i - 1]);
  }
  
  // SPARC calculation (simplified)
  const mean = derivatives.reduce((a, b) => a + b) / derivatives.length;
  const variance = derivatives.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / derivatives.length;
  
  // Normalize to 0-1 range
  return Math.min(1, Math.exp(-variance));
}
```

### 4.2 Analysis Orchestration

```typescript
// backend/services/clinicalAnalysisService.ts

import { protocolsService } from './protocolsService';
import { signalProcessingService } from './signalProcessingService';
import { analyzeWristRotation } from './analyzers/wristRotationAnalyzer';
import { analyzeFingerTapping } from './analyzers/fingerTappingAnalyzer';
// ... import other analyzers

export async function analyzeRecording(
  recordingSessionId: string,
  protocolId: string
): Promise<any> {
  // 1. Load protocol
  const protocol = await protocolsService.getProtocol(protocolId);
  const config = protocol.configuration;

  // 2. Load signal processing result
  const signalResult = await signalProcessingService.getResult(recordingSessionId);

  // 3. Analyze each movement
  const movementAnalysis: Record<string, any> = {};

  for (const movement of config.movements) {
    try {
      let metrics: any;

      switch (movement.movementType) {
        case 'wrist_rotation':
          metrics = await analyzeWristRotation(signalResult, movement);
          break;
        case 'finger_tapping':
          metrics = await analyzeFingerTapping(signalResult, movement);
          break;
        case 'fingers_bending':
          metrics = await analyzeFingersBending(signalResult, movement);
          break;
        case 'aperture_closure':
          metrics = await analyzeApertureClosure(signalResult, movement);
          break;
        case 'object_hold':
          metrics = await analyzeObjectHold(signalResult, movement);
          break;
        case 'freestyle':
          metrics = await analyzeFreestyle(signalResult, movement);
          break;
      }

      movementAnalysis[movement.id] = {
        movementType: movement.movementType,
        hand: movement.hand,
        posture: movement.posture,
        metrics,
        confidence: calculateConfidence(metrics)
      };
    } catch (error) {
      console.error(`Failed to analyze movement ${movement.id}:`, error);
      movementAnalysis[movement.id] = {
        movementType: movement.movementType,
        error: error.message
      };
    }
  }

  // 4. Calculate overall metrics
  const overallMetrics = calculateOverallMetrics(movementAnalysis);

  // 5. Store in database
  const clinicalAnalysis = await prisma.clinicalAnalysis.create({
    data: {
      recordingSessionId,
      analysisVersion: '2.0', // New version with movement-specific analysis
      analysisType: 'comprehensive',
      movementAnalysis: JSON.stringify(movementAnalysis),
      overallScore: overallMetrics.overallScore,
      tremorFrequency: overallMetrics.tremorFrequency,
      tremorAmplitude: overallMetrics.tremorAmplitude,
      sparc: overallMetrics.smoothness,
      confidence: overallMetrics.confidence,
      clinicalSummary: generateSummary(movementAnalysis, overallMetrics)
    }
  });

  return clinicalAnalysis;
}

function calculateConfidence(metrics: any): number {
  // Calculate confidence based on metric quality
  // Return value between 0-1
  return 0.85; // Placeholder
}

function calculateOverallMetrics(movementAnalysis: Record<string, any>): any {
  // Aggregate metrics across all movements
  return {
    overallScore: 0,
    tremorFrequency: 0,
    tremorAmplitude: 0,
    smoothness: 0,
    confidence: 0
  };
}

function generateSummary(
  movementAnalysis: Record<string, any>,
  overallMetrics: any
): string {
  // Generate human-readable clinical summary
  return `Clinical assessment completed. Overall score: ${overallMetrics.overallScore}/100`;
}
```

---

## 5. API Endpoint Example

### 5.1 Create Protocol Endpoint

```typescript
// backend/routes/protocols.routes.ts

import express from 'express';
import { protocolController } from '@/controllers/protocolController';
import { authenticate } from '@/middleware/auth.middleware';
import { validateRequest } from '@/middleware/validation.middleware';
import { protocolSchema } from '@/schemas/protocol.validation';

const router = express.Router();

// Create new protocol
router.post('/',
  authenticate,
  validateRequest(protocolSchema),
  protocolController.create
);

// Get protocol by ID
router.get('/:id',
  authenticate,
  protocolController.getById
);

// List protocols
router.get('/',
  authenticate,
  protocolController.list
);

// Update protocol
router.put('/:id',
  authenticate,
  validateRequest(protocolSchema.partial()),
  protocolController.update
);

// Delete protocol
router.delete('/:id',
  authenticate,
  protocolController.delete
);

export default router;
```

### 5.2 Controller

```typescript
// backend/controllers/protocolController.ts

import { Request, Response } from 'express';
import { protocolsService } from '@/services/protocolsService';

export const protocolController = {
  async create(req: Request, res: Response) {
    try {
      const { user } = req;
      const data = req.body;

      const protocol = await protocolsService.createProtocol({
        ...data,
        createdById: user.id
      });

      res.status(201).json({
        success: true,
        data: protocol
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  },

  async getById(req: Request, res: Response) {
    try {
      const { id } = req.params;

      const protocol = await prisma.protocol.findUnique({
        where: { id }
      });

      if (!protocol) {
        return res.status(404).json({
          success: false,
          error: 'Protocol not found'
        });
      }

      // Parse configuration
      const config = JSON.parse(protocol.configuration);

      res.json({
        success: true,
        data: {
          ...protocol,
          configuration: config
        }
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }
};
```

---

## Summary

This code provides:

1. **Type Safety**: Full TypeScript support with discriminated unions
2. **Validation**: Zod schemas for frontend and backend
3. **React Integration**: React Hook Form with polymorphic components
4. **Analysis**: Movement-specific analyzer functions
5. **API Structure**: RESTful endpoints with proper validation

All components work together to create a robust, type-safe system for protocol management and clinical analysis.
