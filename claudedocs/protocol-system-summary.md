# Protocol Movement System Redesign - Executive Summary

## Overview

A comprehensive redesign of the SynaptiHand protocol system to support hierarchical, type-specific movement configurations with clinical-grade validation and movement-specific analysis algorithms.

---

## What Changed: Before → After

### Before (Current)
```
Protocol Row Structure:
├─ Row 1: Movement Name | Duration | Repetitions
└─ Row 2: Instructions
```

**Limitations:**
- No hand selection per movement
- No posture configuration
- No sub-movement options
- All movements treated identically
- Limited metadata for analysis backend

### After (Proposed)
```
Protocol Movement Structure:
├─ Hand Selection: Left | Right | Both (global)
├─ Posture: Pronation | Supination | Neutral (global)
├─ Movement Type: [Dropdown with 6 options]
│  ├─ Wrist Rotation → Sub: [4 rotation options]
│  ├─ Finger Tapping → Sub: [5 fingers] + modes
│  ├─ Fingers Bending → Sub: [2 hand configs]
│  ├─ Aperture-Closure → Sub: [2 categories with validation]
│  ├─ Object Hold → Sub: [2 grip types]
│  └─ Freestyle → No sub-movement
├─ Duration & Repetitions
├─ Instructions (per movement)
└─ Overall Protocol Repetitions
```

**Benefits:**
- ✅ Specific configuration per movement type
- ✅ Type-safe validation with discriminated unions
- ✅ Metadata-rich analysis backend
- ✅ Scalable to new movement types
- ✅ Clinical clarity and precision

---

## Data Model Structure

### Key Concept: Movement Configuration as JSON

The protocol's `configuration` field stores a JSON structure:

```json
{
  "movements": [
    {
      "id": "mov_uuid",
      "movementType": "finger_tapping",
      "hand": "right",
      "posture": "neutral",
      "duration": 30,
      "repetitions": 10,
      "instructions": "...",
      "config": {
        "fingers": ["thumb", "index"],
        "unilateral": "tap_slowly",
        "bilateral": "alternating"
      }
    }
  ],
  "overallRepetitions": 3,
  "requiredMetrics": ["tremor", "ROM"]
}
```

### TypeScript Type Safety

Discriminated union ensures `config` matches `movementType`:

```typescript
// Type-safe: movementType determines config shape
type ProtocolMovement = 
  | { movementType: 'wrist_rotation'; config: WristRotationConfig }
  | { movementType: 'finger_tapping'; config: FingerTappingConfig }
  | { movementType: 'fingers_bending'; config: FingersBendingConfig }
  | { movementType: 'aperture_closure'; config: ApertureClosureConfig }
  | { movementType: 'object_hold'; config: ObjectHoldConfig }
  | { movementType: 'freestyle'; config: FreestyleConfig };
```

---

## Movement Types Deep Dive

### 1. Wrist Rotation
**Purpose:** Assess wrist joint mobility and tremor during rotation

**Configuration:**
- Sub-Movement: Select 1 of 4 rotation directions
  - Rotation In-Out
  - Rotation Out-In
  - Rotation In
  - Rotation Out

**Analysis Output:**
- Rotation range (degrees)
- Rotation smoothness (0-1 score)
- Tremor frequency during rotation (Hz)
- Tremor amplitude (mm)

---

### 2. Finger Tapping
**Purpose:** Assess finger independence, tapping frequency, and bilateral coordination

**Configuration:**
- Finger Selection: ☐ Check 1 or more
  - Thumb, Index, Middle, Ring, Little
- Unilateral Mode: Select 1 (required)
  - Tap Slowly
  - Tap Fast
- Bilateral Mode: Select 1 (required)
  - Alternating
  - Synchronous

**Validation Rule:** 
- Minimum 1 finger selected

**Analysis Output:**
- Tap frequency (Hz)
- Tap regularity (consistency score 0-1)
- Finger independence score
- Inter-tap interval variance
- Bilateral coordination metrics

---

### 3. Fingers Bending
**Purpose:** Assess finger flexion/extension range and smoothness

**Configuration:**
- Sub-Movement: Select 1 of 2
  - Unilateral Hand
  - Bilateral Hand

**Analysis Output:**
- Range of motion per finger (degrees)
- Bending smoothness
- Asymmetry between hands (if bilateral)

---

### 4. Aperture-Closure
**Purpose:** Assess hand opening/closing dexterity and control

**Configuration:**
- Aperture Category: Select 1 (required) - **Category A**
  - ☐ Aperture only
  - ☐ Closure only
  - ☐ Aperture-Closure (full cycle)
- Hand Category: Select 1 (required) - **Category B**
  - ☐ Unilateral
  - ☐ Bilateral

**Validation Rule:**
- Must select exactly 1 from Category A AND 1 from Category B
- Example valid combination: Aperture + Unilateral

**Analysis Output:**
- Maximum aperture distance (mm)
- Closure duration (seconds)
- Aperture-closure smoothness
- Hand stability during movement
- Tremor metrics

---

### 5. Object Hold
**Purpose:** Assess grip stability and tremor during sustained hold

**Configuration:**
- Sub-Movement: Select 1 of 2
  - Open Palm
  - Closed Grasp

**Analysis Output:**
- Grip stability score
- Tremor during hold (frequency and amplitude)
- Hand position stability
- Estimated grip force

---

### 6. Freestyle
**Purpose:** General hand movement without specific constraints

**Configuration:**
- No sub-movements or specific parameters

**Analysis Output:**
- General hand stability
- Overall tremor metrics
- Range of motion
- Movement smoothness

---

## Frontend Component Architecture

### Component Hierarchy

```
ProtocolEditor (useForm + Zod validation)
├─ ProtocolBasicForm
│  └─ Name, Description, Indications
├─ MovementsSection
│  ├─ MovementsList (drag & drop reordering)
│  │  └─ MovementItem (collapsible card) [repeating]
│  │     └─ MovementEditor
│  │        ├─ BasicSettings (hand, posture, duration, reps)
│  │        ├─ MovementTypeSelector (dropdown)
│  │        ├─ SubMovementSelector (polymorphic - varies by type)
│  │        ├─ InstructionsEditor
│  │        └─ DeleteButton
│  └─ AddMovementButton
└─ OverallSettingsSection
   ├─ Overall Repetitions
   ├─ Required Metrics Selector
   └─ Clinical Guidelines Editor
```

### Key Component: SubMovementSelector

**Polymorphic component** that renders different UI based on `movementType`:

```typescript
<SubMovementSelector movementIndex={0} />

// Renders different components:
// - movementType === 'wrist_rotation' → WristRotationSelector (radio buttons)
// - movementType === 'finger_tapping' → FingerTappingSelector (checkboxes + dropdowns)
// - movementType === 'fingers_bending' → FingersBendingSelector (radio buttons)
// - movementType === 'aperture_closure' → ApertureClosureSelector (checkboxes)
// - movementType === 'object_hold' → ObjectHoldSelector (radio buttons)
// - movementType === 'freestyle' → null (no renderer)
```

---

## Backend Analysis Pipeline

### Flow: Protocol → Recording → Analysis

```
1. Clinician creates Protocol (with movements)
   ↓
2. Patient recording session created with protocolId
   ↓
3. Video + keypoints uploaded to backend
   ↓
4. Backend fetches Protocol and parses configuration
   ↓
5. For each movement:
   - Extract movement metadata (type, hand, posture, config)
   - Route to movement-specific analyzer
   - Analyzer processes video landmarks
   - Store movement-specific metrics
   ↓
6. Aggregate all movement results
   ↓
7. Create ClinicalAnalysis record with:
   - movementAnalysis: { mov_uuid: {metrics}, ... }
   - overallMetrics: {tremor, ROM, smoothness}
```

### ClinicalAnalysis Model Enhancement

```typescript
ClinicalAnalysis {
  // ... existing fields ...
  
  // NEW: Movement-specific analysis
  movementAnalysis: {
    "mov_uuid_1": {
      movementType: "finger_tapping",
      hand: "right",
      posture: "neutral",
      metrics: {
        tapFrequency: 3.5,
        regularity: 0.92,
        fingerIndependence: 0.88,
        lateralCoordination: 0.85
      },
      confidence: 0.95
    },
    "mov_uuid_2": {
      movementType: "wrist_rotation",
      hand: "right",
      posture: "neutral",
      metrics: {
        rotationRange: 85,
        dominantFrequency: 4.2,
        tremorAmplitude: 2.1,
        smoothness: 0.89
      },
      confidence: 0.92
    }
  }
}
```

---

## Validation Strategy

### Frontend (React Hook Form + Zod)

**Discriminated Union Validation:**
```typescript
// Zod ensures config shape matches movementType
const movementSchema = z.discriminatedUnion('movementType', [
  z.object({
    movementType: z.literal('wrist_rotation'),
    config: z.object({ subMovement: z.enum([...]) })
  }),
  z.object({
    movementType: z.literal('finger_tapping'),
    config: z.object({
      fingers: z.array(...).min(1),
      unilateral: z.enum([...]),
      bilateral: z.enum([...])
    })
  }),
  // ... other types
]);
```

**Real-time validation:**
- Show errors inline as user configures
- Disable Save button if invalid
- Type-specific error messages

### Backend (Prisma + Zod)

- Re-validate full protocol configuration on create/update
- Ensure hand/posture selections are valid
- Validate each movement type's config matches schema

---

## API Contracts

### Create Protocol

```http
POST /api/protocols
Content-Type: application/json
Authorization: Bearer {token}

{
  "name": "Parkinson's Assessment",
  "description": "Standard neurological assessment",
  "configuration": {
    "movements": [
      {
        "id": "mov_1",
        "order": 0,
        "movementType": "finger_tapping",
        "hand": "right",
        "posture": "neutral",
        "duration": 30,
        "repetitions": 5,
        "instructions": "Tap fingers on table at comfortable speed",
        "config": {
          "fingers": ["index", "middle"],
          "unilateral": "tap_fast",
          "bilateral": "alternating"
        }
      }
    ],
    "overallRepetitions": 3,
    "requiredMetrics": ["tremor", "ROM"]
  },
  "indicatedFor": "Parkinson's Disease",
  "isPublic": true
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "id": "proto_uuid",
    "name": "Parkinson's Assessment",
    "configuration": {...},
    "createdAt": "2025-01-16T10:30:00Z"
  }
}
```

### Analyze Recording

```http
POST /api/clinical/analyze
Content-Type: application/json
Authorization: Bearer {token}

{
  "recordingSessionId": "rec_uuid",
  "protocolId": "proto_uuid"
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "clinicalAnalysisId": "analysis_uuid",
    "movementAnalysis": {
      "mov_1": {
        "movementType": "finger_tapping",
        "metrics": {
          "tapFrequency": 3.5,
          "regularity": 0.92,
          "fingerIndependence": 0.88
        }
      }
    },
    "overallMetrics": {
      "tremorFrequency": 4.2,
      "amplitude": 2.1,
      "smoothness": 0.89,
      "overallScore": 78
    }
  }
}
```

---

## Implementation Roadmap

### Phase 1: Foundation (Week 1-2)
- [x] Design data schema
- [ ] Create TypeScript types
- [ ] Create Zod validation schemas
- [ ] Update database (if needed)

### Phase 2: Frontend (Week 2-3)
- [ ] Build ProtocolEditor component
- [ ] Build MovementTypeSelector
- [ ] Build 6 SubMovementSelector variants
- [ ] Integrate React Hook Form
- [ ] Test form validation

### Phase 3: Backend (Week 3-4)
- [ ] Create/update protocol endpoints
- [ ] Implement 6 analyzer functions
- [ ] Create analysis orchestration
- [ ] Implement API endpoint for analysis
- [ ] Add movementAnalysis to ClinicalAnalysis

### Phase 4: Integration & Testing (Week 4-5)
- [ ] E2E protocol creation workflow
- [ ] E2E recording + analysis workflow
- [ ] Frontend unit tests
- [ ] Backend analysis validation
- [ ] Documentation & handoff

---

## Key Design Decisions

### 1. JSON Storage (vs separate tables)
**Why:** Movements are a tightly-coupled array with order, protocol-level settings

**Trade-off:** Cannot efficiently query by specific movement properties
**Mitigation:** If needed, can denormalize into separate Movement table later

### 2. Discriminated Union for Type Safety
**Why:** Ensures config shape matches movement type at compile time

**Benefit:** Prevents runtime errors where wrong config is used with wrong type

### 3. Polymorphic Component Pattern
**Why:** Single SubMovementSelector adapts to movement type

**Benefit:** Easy to add new types, consistent validation, DRY principle

### 4. Movement-Specific Analysis Algorithms
**Why:** Different movements need different analysis approaches

**Benefit:** Clinically accurate metrics, precision analysis per movement type

---

## File Locations

All design documentation saved in `claudedocs/`:

1. **protocol-movement-redesign.md** - Complete specification
2. **protocol-architecture-diagrams.md** - Visual architecture & data flows
3. **protocol-code-examples.md** - Implementation code samples
4. **protocol-system-summary.md** - This document

---

## Key Questions for Review

1. **Movement-Specific Algorithms**: Are the proposed metrics for each movement type clinically correct?
2. **Analysis Parameters**: What are the exact signal processing parameters for each analyzer?
3. **Mobile Integration**: How should Android app handle protocol selection?
4. **Metrics Storage**: Should per-movement metrics be stored separately or in combined analysis?
5. **Protocol Versioning**: Track versions as protocols evolve?
6. **Permission Model**: Can clinicians create custom protocols? Institutional vs public?

---

## Success Metrics

- ✅ Type-safe protocol configuration (zero runtime config/type mismatches)
- ✅ Movement-specific analysis metadata available to backend
- ✅ Easy to add new movement types without breaking existing code
- ✅ All 6 movement types fully configurable and analyzable
- ✅ Zero loss of existing functionality during migration

---

## Summary

This redesign transforms the protocol system from a flat, generic structure into a **hierarchical, type-specific system** with:

- **Clinical Precision**: Movement-specific configurations and analysis
- **Type Safety**: Zod discriminated unions prevent configuration errors
- **Scalability**: Easy to add new movement types
- **Backend Integration**: Rich metadata for accurate clinical analysis
- **User Experience**: Intuitive UI that adapts to movement type selection

The system is ready for implementation following the phased roadmap above.
