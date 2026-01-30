# Protocol Movement System Redesign

## Overview

Redesigning the clinical protocol movement configuration system to support:
- Hierarchical movement selection with conditional sub-movements
- Multiple movement types (Wrist Rotation, Finger Tapping, etc.)
- Type-specific mandatory validations
- Hand and posture selection (globally applied to all movements in protocol)
- Detailed clinical instructions per movement
- Overall protocol-level repetition tracking

---

## 1. Data Model Design

### 1.1 Movement Type Hierarchy

```
Movement Configuration (per movement in protocol)
├── Hand Selection (applies to movement)
│   └── Left | Right | Both Hands
├── Posture (applies to movement)
│   └── Pronation | Supination | Neutral
├── Movement Type (determines available sub-movements)
│   ├── Wrist Rotation
│   │   └── Sub-Movement (required, select 1)
│   │       ├── Rotation In-Out
│   │       ├── Rotation Out-In
│   │       ├── Rotation In
│   │       └── Rotation Out
│   ├── Finger Tapping
│   │   ├── Finger Selection (checkboxes, required)
│   │   │   ├── Thumb
│   │   │   ├── Index
│   │   │   ├── Middle
│   │   │   ├── Ring
│   │   │   └── Little
│   │   ├── Unilateral Mode (required)
│   │   └── Bilateral Mode (required)
│   ├── Fingers Bending
│   │   └── Sub-Movement (required, select 1)
│   │       ├── Unilateral Hand
│   │       └── Bilateral Hand
│   ├── Aperture-Closure
│   │   ├── Aperture Category (required, select 1)
│   │   │   ├── Aperture
│   │   │   ├── Closure
│   │   │   └── Aperture-Closure
│   │   ├── Hand Category (required, select 1)
│   │   │   ├── Unilateral
│   │   │   └── Bilateral
│   │   └── Validation: Must select 1 from each category
│   ├── Object Hold
│   │   └── Sub-Movement (required, select 1)
│   │       ├── Open Palm
│   │       └── Closed Grasp
│   └── Freestyle
│       └── No sub-movements
├── Instructions (text, per movement)
├── Duration (seconds)
└── Repetitions (for this specific movement)
```

### 1.2 Protocol-Level Metadata

```
Protocol
├── Name
├── Description
├── Version
├── Movements Array (each movement as defined above)
├── Overall Repetition Count (protocol-wide)
├── Clinical Guidelines
├── Indicated For (conditions)
└── Contraindications
```

---

## 2. Database Schema Updates

### 2.1 Current Protocol Schema (Prisma)

```typescript
model Protocol {
  // ... existing fields ...
  configuration String  // JSON string containing movements array
}
```

### 2.2 Updated Configuration Structure (JSON)

```typescript
// Protocol.configuration stored as JSON string
{
  "movements": [
    {
      "id": "mov_uuid",
      "order": 0,
      "movementType": "wrist_rotation" | "finger_tapping" | "fingers_bending" | "aperture_closure" | "object_hold" | "freestyle",
      
      // Global settings for this movement
      "hand": "left" | "right" | "both",
      "posture": "pronation" | "supination" | "neutral",
      "duration": 30, // seconds
      "repetitions": 10,
      "instructions": "Patient should perform...",
      
      // Type-specific configuration
      "config": {
        // For wrist_rotation
        "subMovement": "rotation_in_out" | "rotation_out_in" | "rotation_in" | "rotation_out",
        
        // For finger_tapping
        "fingers": ["thumb", "index", "middle", "ring", "little"],
        "unilateral": "tap_slowly" | "tap_fast",
        "bilateral": "alternating" | "synchronous",
        
        // For fingers_bending
        "subMovement": "unilateral" | "bilateral",
        
        // For aperture_closure
        "apertureCategory": "aperture" | "closure" | "aperture_closure",
        "handCategory": "unilateral" | "bilateral",
        
        // For object_hold
        "subMovement": "open_palm" | "closed_grasp",
        
        // For freestyle (empty)
      }
    }
  ],
  "overallRepetitions": 3, // How many times to repeat entire protocol
  "requiredMetrics": ["tremor_frequency", "amplitude"],
  "clinicalGuidelines": "Interpretation guidelines..."
}
```

### 2.3 TypeScript Types

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

// Wrist Rotation
export type WristRotationSubMovement = 
  | 'rotation_in_out'
  | 'rotation_out_in'
  | 'rotation_in'
  | 'rotation_out';

export interface WristRotationConfig {
  subMovement: WristRotationSubMovement;
}

// Finger Tapping
export type Finger = 'thumb' | 'index' | 'middle' | 'ring' | 'little';
export type TappingMode = 'tap_slowly' | 'tap_fast';
export type TappingPattern = 'alternating' | 'synchronous';

export interface FingerTappingConfig {
  fingers: Finger[];
  unilateral: TappingMode;
  bilateral: TappingPattern;
}

// Fingers Bending
export type FingersBendingSubMovement = 'unilateral' | 'bilateral';

export interface FingersBendingConfig {
  subMovement: FingersBendingSubMovement;
}

// Aperture-Closure
export type ApertureCategory = 'aperture' | 'closure' | 'aperture_closure';
export type HandCategory = 'unilateral' | 'bilateral';

export interface ApertureClosure Config {
  apertureCategory: ApertureCategory;
  handCategory: HandCategory;
}

// Object Hold
export type ObjectHoldSubMovement = 'open_palm' | 'closed_grasp';

export interface ObjectHoldConfig {
  subMovement: ObjectHoldSubMovement;
}

// Union type for all movement configs
export type MovementConfig = 
  | WristRotationConfig
  | FingerTappingConfig
  | FingersBendingConfig
  | ApertureClos ureConfig
  | ObjectHoldConfig
  | Record<string, never>; // Freestyle has no config

// Movement definition
export interface ProtocolMovement {
  id: string;
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

// Full protocol configuration
export interface ProtocolConfiguration {
  movements: ProtocolMovement[];
  overallRepetitions: number;
  requiredMetrics: string[];
  clinicalGuidelines?: string;
}
```

---

## 3. Validation Schema (Zod)

```typescript
// schemas/protocol.validation.ts

import { z } from 'zod';

const handSchema = z.enum(['left', 'right', 'both']);
const postureSchema = z.enum(['pronation', 'supination', 'neutral']);

const wristRotationConfigSchema = z.object({
  subMovement: z.enum(['rotation_in_out', 'rotation_out_in', 'rotation_in', 'rotation_out'])
});

const fingerTappingConfigSchema = z.object({
  fingers: z.array(z.enum(['thumb', 'index', 'middle', 'ring', 'little']))
    .min(1, 'Select at least one finger'),
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

const freestyleConfigSchema = z.object({});

const baseMovementSchema = z.object({
  id: z.string().uuid(),
  order: z.number().int().min(0),
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
  duration: z.number().int().min(5).max(300),
  repetitions: z.number().int().min(1).max(100),
  instructions: z.string().min(1).max(1000)
});

// Discriminated union for type-safe config validation
export const movementSchema = z.discriminatedUnion('movementType', [
  baseMovementSchema.merge(z.object({
    movementType: z.literal('wrist_rotation'),
    config: wristRotationConfigSchema
  })),
  baseMovementSchema.merge(z.object({
    movementType: z.literal('finger_tapping'),
    config: fingerTappingConfigSchema
  })),
  baseMovementSchema.merge(z.object({
    movementType: z.literal('fingers_bending'),
    config: fingersBendingConfigSchema
  })),
  baseMovementSchema.merge(z.object({
    movementType: z.literal('aperture_closure'),
    config: apertureClosureConfigSchema
  })),
  baseMovementSchema.merge(z.object({
    movementType: z.literal('object_hold'),
    config: objectHoldConfigSchema
  })),
  baseMovementSchema.merge(z.object({
    movementType: z.literal('freestyle'),
    config: freestyleConfigSchema
  }))
]);

export const protocolConfigurationSchema = z.object({
  movements: z.array(movementSchema).min(1, 'At least one movement required'),
  overallRepetitions: z.number().int().min(1).max(20),
  requiredMetrics: z.array(z.string()),
  clinicalGuidelines: z.string().optional()
});

export type ProtocolConfiguration = z.infer<typeof protocolConfigurationSchema>;
export type ProtocolMovement = z.infer<typeof movementSchema>;
```

---

## 4. Frontend Component Architecture

### 4.1 Component Hierarchy

```
ProtocolEditor
├── ProtocolBasicForm
│   ├── NameInput
│   ├── DescriptionInput
│   ├── IndicationsInput
│   └── ContraindicationsInput
├── MovementsSection
│   ├── MovementsList
│   │   └── MovementItem (draggable, collapsible)
│   │       └── MovementEditor
│   │           ├── BasicSettings (hand, posture, duration, reps)
│   │           ├── MovementTypeSelector
│   │           ├── SubMovementSelector (conditional)
│   │           ├── InstructionsEditor
│   │           └── DeleteButton
│   └── AddMovementButton
├── OverallSettingsSection
│   ├── OverallRepetitionsInput
│   ├── RequiredMetricsSelector
│   └── ClinicalGuidelinesEditor
└── FormActions (Save, Cancel, Preview)
```

### 4.2 Component Specifications

#### ProtocolEditor (Main Container)

- Manages form state using React Hook Form
- Integrates with Zod schema for validation
- Handles save/update API calls
- Supports draft persistence (localStorage)

#### MovementTypeSelector

- Dropdown/select component for movement type
- Dynamically shows available sub-movements based on selection
- Resets sub-movement values when type changes
- Shows brief description of each movement type

#### SubMovementSelector (Polymorphic)

- **Wrist Rotation**: Radio buttons for 4 options
- **Finger Tapping**: Multi-select checkboxes for fingers + dropdowns for modes
- **Fingers Bending**: Radio buttons for 2 options
- **Aperture-Closure**: Checkboxes for aperture category + hand category
- **Object Hold**: Radio buttons for 2 options
- **Freestyle**: No sub-selector (disabled/hidden)

#### MovementsList

- Drag-and-drop reordering (using react-beautiful-dnd or react-dnd)
- Collapsible cards showing movement summary
- Edit/delete controls per movement
- Visual indicators for validation errors

---

## 5. UI/UX Layout Specification

### 5.1 Movement Card Layout (New Design)

```
┌─────────────────────────────────────────────────────────────┐
│ [Movement Name] | [Duration: 30s] | [Reps: 10] | ⋮ ☰      │
├─────────────────────────────────────────────────────────────┤
│                                                               │
│ Hand Selection: [Left] [Right] [Both] ◄─ Select one        │
│ Posture: [Pronation] [Supination] [Neutral] ◄─ Select one  │
│                                                               │
│ Movement Type: [Select Movement ▼]                          │
│                                                               │
│ ┌──────── Movement-Specific Config ──────────────────────┐  │
│ │ [Sub-Movement Config - varies by type]                 │  │
│ │ Example for Finger Tapping:                            │  │
│ │   Fingers: ☑ Thumb ☐ Index ☐ Middle ☐ Ring ☐ Little  │  │
│ │   Unilateral Mode: [Select ▼]                          │  │
│ │   Bilateral Mode: [Select ▼]                           │  │
│ └────────────────────────────────────────────────────────┘  │
│                                                               │
│ Instructions:                                                │
│ [Text area: "Patient should..."]                             │
│                                                               │
│ [Delete Movement] [Preview]                                 │
│                                                               │
└─────────────────────────────────────────────────────────────┘
```

### 5.2 Protocol Form Layout

```
┌──────────────────────────────────────────────────────────────┐
│ Protocol Editor                                              │
├──────────────────────────────────────────────────────────────┤
│                                                                │
│ Name: [Input]          Version: [1.0]                        │
│ Description: [Textarea]                                      │
│                                                                │
│ ─ MOVEMENTS SECTION ──────────────────────────────────────── │
│                                                                │
│ [+ Add Movement]                                             │
│                                                                │
│ Movement 1: Wrist Rotation                                   │
│ [Collapsible Card - see layout above]                        │
│                                                                │
│ Movement 2: Finger Tapping                                   │
│ [Collapsible Card]                                           │
│                                                                │
│ ─ OVERALL SETTINGS ───────────────────────────────────────── │
│                                                                │
│ Repeat entire protocol: [5] times                            │
│ Clinical Guidelines: [Textarea]                              │
│ Required Metrics: ☑ Tremor ☑ ROM ☑ Smoothness             │
│                                                                │
│ [Save] [Cancel] [Preview]                                    │
│                                                                │
└──────────────────────────────────────────────────────────────┘
```

---

## 6. Backend Analysis Integration

### 6.1 Analysis Pipeline

When a recording is uploaded with a selected protocol:

```
RecordingSession
├── protocolId → Fetch Protocol
├── Parse protocol.configuration
├── Extract all movements with their properties
│   └── For each movement:
│       ├── Hand selection (determines which landmarks to analyze)
│       ├── Posture (affects baseline/normalization)
│       ├── Movement type (determines analysis algorithm)
│       └── Config (movement-specific parameters)
└── Run analysis algorithms specific to movement type
    └── Store results with movement metadata
```

### 6.2 Movement-Specific Analysis

#### Wrist Rotation Analysis
- **Input**: Wrist landmarks (9), hand landmarks
- **Parameters**: Rotation direction from config
- **Outputs**: 
  - Rotation range (degrees)
  - Rotation smoothness
  - Tremor frequency/amplitude during rotation
  - Asymmetry (if bilateral)

#### Finger Tapping Analysis
- **Input**: Selected finger landmarks + temporal data
- **Parameters**: Finger selection, tapping mode, pattern
- **Outputs**:
  - Tap frequency (Hz)
  - Tap regularity (consistency)
  - Finger independence (if multiple fingers)
  - Inter-tap interval variance
  - Bilateral coordination (if bilateral)

#### Fingers Bending Analysis
- **Input**: Finger MCP/PIP joint angles
- **Parameters**: Unilateral vs bilateral
- **Outputs**:
  - Range of motion (degrees per finger)
  - Bending smoothness
  - Grip strength estimation
  - Asymmetry

#### Aperture-Closure Analysis
- **Input**: Hand opening distance, palm spread angle
- **Parameters**: Aperture type, hand configuration
- **Outputs**:
  - Max aperture distance (mm)
  - Closure time
  - Smoothness of transition
  - Tremor during aperture/closure

#### Object Hold Analysis
- **Input**: Finger contact points, hand stability
- **Parameters**: Object grip type
- **Outputs**:
  - Grip stability (tremor during hold)
  - Grip force estimation
  - Hand position stability

### 6.3 ClinicalAnalysis Model Enhancement

```typescript
// Add to ClinicalAnalysis model
{
  // ... existing fields ...
  
  // Movement-specific results (new)
  movementAnalysis: {
    "mov_uuid": {
      movementType: "wrist_rotation",
      hand: "right",
      posture: "neutral",
      
      metrics: {
        // Wrist rotation specific
        rotationRange: 85,        // degrees
        rotationSmoothness: 0.92, // 0-1
        dominantFrequency: 4.2    // Hz
      },
      
      subMetrics: {
        // Additional movement insights
        qualityScore: 0.85,
        confidence: 0.95,
        anomalies: []
      }
    }
  }
}
```

### 6.4 Backend Endpoint Structure

```typescript
POST /api/clinical/analyze

Request:
{
  recordingSessionId: "string",
  protocolId: "string"
}

Response:
{
  success: boolean,
  data: {
    clinicalAnalysisId: "string",
    overallMetrics: {...},
    movementAnalysis: {
      "mov_uuid": {...}
    },
    timestamp: "ISO string"
  }
}
```

---

## 7. API Contract Examples

### 7.1 Create Protocol Endpoint

```typescript
POST /api/protocols

Request:
{
  name: "Neurological Assessment",
  description: "Standard assessment protocol",
  indicatedFor: "Parkinson's Disease",
  configuration: {
    movements: [
      {
        id: "mov_1",
        order: 0,
        movementType: "wrist_rotation",
        hand: "right",
        posture: "neutral",
        duration: 30,
        repetitions: 5,
        instructions: "Rotate wrist...",
        config: {
          subMovement: "rotation_in_out"
        }
      }
    ],
    overallRepetitions: 3,
    requiredMetrics: ["tremor_frequency", "amplitude"]
  }
}

Response:
{
  success: true,
  data: {
    id: "proto_uuid",
    name: "Neurological Assessment",
    configuration: {...},
    createdAt: "ISO string"
  }
}
```

### 7.2 Get Protocol Endpoint

```typescript
GET /api/protocols/:id

Response:
{
  success: true,
  data: {
    id: "proto_uuid",
    name: "...",
    configuration: {...}
  }
}
```

---

## 8. Implementation Roadmap

### Phase 1: Data Schema & Validation
- [ ] Create TypeScript types
- [ ] Create Zod validation schemas
- [ ] Update Protocol model (if needed)
- [ ] Document protocol configuration structure

### Phase 2: Backend API
- [ ] Create/Update protocol endpoints
- [ ] Implement movement-specific analysis algorithms
- [ ] Create analysis endpoint
- [ ] Add movement metadata to ClinicalAnalysis

### Phase 3: Frontend Components
- [ ] Build ProtocolEditor container
- [ ] Build MovementTypeSelector component
- [ ] Build sub-movement selectors (polymorphic)
- [ ] Build MovementsList with drag-and-drop
- [ ] Integrate React Hook Form

### Phase 4: Integration & Testing
- [ ] E2E testing of protocol creation
- [ ] E2E testing of recording upload with analysis
- [ ] Frontend unit tests for validation
- [ ] Backend analysis algorithm validation

---

## 9. Key Design Decisions

### 9.1 Storing as JSON String (vs separate tables)

**Decision**: Store movements array as JSON string in `Protocol.configuration`

**Rationale**:
- Protocol is a template, not frequently queried for specific movement properties
- Movements are tightly coupled (order, overall repetitions)
- Simpler data model without creating N:M join tables
- Easy to version and snapshot entire protocol

**Tradeoff**:
- Cannot efficiently filter by movement type
- Mitigation: If needed later, can denormalize into separate Movement table

### 9.2 Discriminated Union for Type Safety

**Decision**: Use Zod discriminated unions for type-safe validation

**Rationale**:
- Ensures config matches movement type (compiler-level safety)
- Enables exhaustive type checking in TypeScript
- API clients can safely access type-specific properties

### 9.3 Polymorphic Sub-Movement Component

**Decision**: Single component with conditional rendering based on type

**Rationale**:
- Reduces component duplication
- Ensures consistent validation approach
- Easier to add new movement types

---

## 10. Migration Path (if updating existing protocols)

```typescript
// Migration script to update existing protocols
// Before: configuration was flat
// After: configuration has hierarchical movements

export const migrateProtocolConfiguration = (oldConfig: any): ProtocolConfiguration => {
  // If already new format, return as-is
  if (oldConfig.movements && Array.isArray(oldConfig.movements)) {
    return oldConfig;
  }

  // Otherwise, convert old format to new
  return {
    movements: [
      {
        id: uuid(),
        order: 0,
        movementType: 'freestyle', // Default for unknown types
        hand: 'both',
        posture: 'neutral',
        duration: oldConfig.duration || 30,
        repetitions: oldConfig.repetitions || 1,
        instructions: oldConfig.instructions || '',
        config: {}
      }
    ],
    overallRepetitions: oldConfig.overallRepetitions || 1,
    requiredMetrics: oldConfig.requiredMetrics || [],
    clinicalGuidelines: oldConfig.clinicalGuidelines || ''
  };
};
```

---

## 11. Testing Strategy

### Frontend Testing
- Unit tests for each component
- Zod schema validation tests
- Integration tests for form submission
- E2E tests for full protocol creation workflow

### Backend Testing
- Unit tests for analysis algorithms
- Integration tests for API endpoints
- Performance tests for protocol parsing
- Fixture-based tests with various protocol configurations

---

## Questions & Open Items

1. **Analysis Parallelization**: Should movement-specific analyses run in parallel?
2. **Metrics Storage**: Store per-movement metrics separately or combined?
3. **Protocol Versioning**: Track protocol versions as they're modified?
4. **Permission Model**: Can clinicians create custom protocols?
5. **Mobile App**: How does protocol selection work in Android app?
6. **Analysis Algorithms**: Confirm movement-specific algorithms and their parameters
