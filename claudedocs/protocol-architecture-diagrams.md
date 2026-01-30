# Protocol Movement System - Architecture Diagrams

## 1. Data Flow: Protocol Creation → Recording → Analysis

```mermaid
graph TD
    A["Clinician Creates Protocol"] -->|React Form| B["Protocol Editor Component"]
    B -->|Validates with Zod| C{Valid?}
    C -->|No| B
    C -->|Yes| D["POST /api/protocols"]
    D -->|Save to DB| E["Protocol Model<br/>configuration: JSON"]
    E -->|Returns Protocol ID| F["Protocol Template Created"]
    
    F -->|Clinician assigns| G["Recording Session"]
    G -->|Select hand/posture/etc| H["Android App Records"]
    H -->|Upload with protocolId| I["POST /api/mobile/upload"]
    
    I -->|Extract Protocol| J["Parse Protocol.configuration"]
    J -->|Get movements array| K["For Each Movement:<br/>Extract movementType & config"]
    K -->|Route to algorithm| L["Movement-Specific<br/>Analysis Engine"]
    
    L -->|Wrist Rotation| L1["Calculate rotation range,<br/>tremor frequency, smoothness"]
    L -->|Finger Tapping| L2["Calculate tap frequency,<br/>regularity, coordination"]
    L -->|Fingers Bending| L3["Calculate ROM per finger,<br/>asymmetry"]
    L -->|Aperture-Closure| L4["Calculate aperture distance,<br/>closure time, stability"]
    L -->|Object Hold| L5["Calculate grip stability,<br/>tremor during hold"]
    
    L1 -->|Aggregate| M["ClinicalAnalysis.movementAnalysis<br/>mov_uuid: {metrics}"]
    L2 -->|Aggregate| M
    L3 -->|Aggregate| M
    L4 -->|Aggregate| M
    L5 -->|Aggregate| M
    
    M -->|Combined with| N["Overall Metrics<br/>tremor, ROM, smoothness"]
    N -->|Store in DB| O["ClinicalAnalysis Complete"]
    O -->|Clinician reviews| P["Clinician Dashboard"]
```

---

## 2. Component Hierarchy & Data Flow

```mermaid
graph TD
    A["ProtocolEditor<br/>(useForm Hook)"] -->|manages form state| B["ProtocolBasicForm<br/>Name, Description"]
    A -->|manages movements array| C["MovementsSection"]
    A -->|manages overall settings| D["OverallSettingsSection<br/>Reps, Metrics, Guidelines"]
    
    C -->|renders list| E["MovementsList"]
    E -->|each movement| F["MovementItem<br/>(collapsible card)"]
    F -->|edit trigger| G["MovementEditor<br/>(nested form)"]
    
    G -->|basic settings| G1["BasicSettingsForm<br/>Hand, Posture, Duration, Reps"]
    G -->|movement type selection| G2["MovementTypeSelector<br/>Dropdown with descriptions"]
    G -->|conditional rendering| G3["SubMovementSelector<br/>(polymorphic)"]
    G -->|instructions| G4["InstructionsEditor<br/>Textarea"]
    
    G2 -->|onTypeChange| H{Movement Type?}
    H -->|wrist_rotation| H1["WristRotationSelector<br/>Radio: 4 options"]
    H -->|finger_tapping| H2["FingerTappingSelector<br/>Checkboxes + Dropdowns"]
    H -->|fingers_bending| H3["FingersBendingSelector<br/>Radio: 2 options"]
    H -->|aperture_closure| H4["ApertureClosure Selector<br/>Checkboxes: 2 categories"]
    H -->|object_hold| H5["ObjectHoldSelector<br/>Radio: 2 options"]
    H -->|freestyle| H6["Freestyle<br/>(No config)"]
    
    H1 -->|update form state| G
    H2 -->|update form state| G
    H3 -->|update form state| G
    H4 -->|update form state| G
    H5 -->|update form state| G
    H6 -->|update form state| G
    
    A -->|Zod validation| I["protocolConfigurationSchema"]
    I -->|discriminated union| J{Type matches config?}
    J -->|Valid| K["Enable Save"]
    J -->|Invalid| L["Show Errors"]
    
    K -->|Click Save| M["POST /api/protocols"]
    M -->|Success| N["Protocol Saved"]
```

---

## 3. Movement Type Decision Tree

```
Select Movement Type
│
├─ Wrist Rotation
│  ├─ Sub-Movement (required)
│  │  ├─ Rotation In-Out
│  │  ├─ Rotation Out-In
│  │  ├─ Rotation In
│  │  └─ Rotation Out
│  └─ Analysis: rotation_range, tremor_during_rotation, smoothness
│
├─ Finger Tapping
│  ├─ Finger Selection (required, min 1)
│  │  ├─ ☐ Thumb
│  │  ├─ ☐ Index
│  │  ├─ ☐ Middle
│  │  ├─ ☐ Ring
│  │  └─ ☐ Little
│  ├─ Unilateral Mode (required)
│  │  ├─ Tap Slowly
│  │  └─ Tap Fast
│  ├─ Bilateral Mode (required)
│  │  ├─ Alternating
│  │  └─ Synchronous
│  └─ Analysis: tap_frequency, regularity, finger_independence, bilateral_coordination
│
├─ Fingers Bending
│  ├─ Sub-Movement (required)
│  │  ├─ Unilateral Hand
│  │  └─ Bilateral Hand
│  └─ Analysis: ROM_per_finger, bending_smoothness, asymmetry
│
├─ Aperture-Closure
│  ├─ Aperture Category (required, select 1)
│  │  ├─ ☐ Aperture
│  │  ├─ ☐ Closure
│  │  └─ ☐ Aperture-Closure
│  ├─ Hand Category (required, select 1)
│  │  ├─ ☐ Unilateral
│  │  └─ ☐ Bilateral
│  ├─ Validation: Must have 1 from each category
│  └─ Analysis: max_aperture, closure_time, aperture_smoothness, stability
│
├─ Object Hold
│  ├─ Sub-Movement (required)
│  │  ├─ Open Palm
│  │  └─ Closed Grasp
│  └─ Analysis: grip_stability, grip_force_estimate, position_stability
│
└─ Freestyle
   ├─ No sub-movements
   └─ Analysis: general_hand_stability, tremor, ROM
```

---

## 4. Validation Flow for Complex Types

```mermaid
graph TD
    A["ProtocolMovement Submitted"] -->|Zod Check| B{movementType?}
    
    B -->|wrist_rotation| B1["Validate WristRotationConfig"]
    B1 -->|subMovement ∈ [4 options]| B1A{Valid?}
    B1A -->|Yes| SUCCESS1["✓ Pass"]
    B1A -->|No| FAIL1["✗ Invalid sub-movement"]
    
    B -->|finger_tapping| B2["Validate FingerTappingConfig"]
    B2 -->|fingers.length ≥ 1| B2A{Check 1}
    B2A -->|✓| B2B{unilateral ∈ enum}
    B2B -->|✓| B2C{bilateral ∈ enum}
    B2C -->|✓| SUCCESS2["✓ Pass"]
    B2C -->|✗| FAIL2["✗ Invalid bilateral"]
    
    B -->|aperture_closure| B3["Validate ApertureClosureConfig"]
    B3 -->|apertureCategory ∈ enum| B3A{Check 1}
    B3A -->|✓| B3B{handCategory ∈ enum}
    B3B -->|✓| SUCCESS3["✓ Pass"]
    B3B -->|✗| FAIL3["✗ Invalid hand category"]
    
    B -->|freestyle| B4["Validate FreestyleConfig"]
    B4 -->|config = {}| SUCCESS4["✓ Pass"]
    
    SUCCESS1 --> COMPLETE["Movement Valid"]
    SUCCESS2 --> COMPLETE
    SUCCESS3 --> COMPLETE
    SUCCESS4 --> COMPLETE
    
    FAIL1 --> ERROR["Show Error to User"]
    FAIL2 --> ERROR
    FAIL3 --> ERROR
```

---

## 5. Database Schema Visualization

```
┌─────────────────────────────────────────────────────────┐
│                    Protocol (Table)                      │
├─────────────────────────────────────────────────────────┤
│ id: UUID (PK)                                            │
│ name: String                                             │
│ description: String (nullable)                           │
│ version: String                                          │
│ configuration: JSON String                              │
│                                                          │
│ ┌──────── configuration JSON Structure ─────────────┐   │
│ │ {                                                  │   │
│ │   "movements": [                                  │   │
│ │     {                                             │   │
│ │       "id": "mov_uuid",                          │   │
│ │       "movementType": "wrist_rotation",          │   │
│ │       "hand": "right",                           │   │
│ │       "posture": "neutral",                      │   │
│ │       "duration": 30,                            │   │
│ │       "repetitions": 5,                          │   │
│ │       "instructions": "...",                     │   │
│ │       "config": {                                │   │
│ │         "subMovement": "rotation_in_out"        │   │
│ │       }                                           │   │
│ │     },                                            │   │
│ │     ... more movements                           │   │
│ │   ],                                              │   │
│ │   "overallRepetitions": 3,                       │   │
│ │   "requiredMetrics": [...],                      │   │
│ │   "clinicalGuidelines": "..."                    │   │
│ │ }                                                 │   │
│ └──────────────────────────────────────────────────┘   │
│                                                          │
│ indicatedFor: String (nullable)                         │
│ contraindications: String (nullable)                    │
│ createdById: UUID (FK → User)                           │
│ isPublic: Boolean                                       │
│ isActive: Boolean                                       │
│ createdAt: DateTime                                     │
│ updatedAt: DateTime                                     │
│ deletedAt: DateTime (nullable, soft delete)             │
└─────────────────────────────────────────────────────────┘
```

---

## 6. Recording → Analysis Pipeline

```mermaid
graph TD
    A["RecordingSession<br/>protocolId = UUID"] -->|Fetch| B["Protocol<br/>configuration = JSON"]
    B -->|Parse JSON| C["MovementsArray<br/>[{type, hand, posture, config}]"]
    
    C -->|Loop| D["For Each Movement"]
    D -->|Extract metadata| E["Movement Context<br/>type, hand, posture, duration, config"]
    E -->|Extract video range| F["Get timestamps:<br/>start, end, duration"]
    
    F -->|Route by type| G{Analysis Algorithm}
    
    G -->|wrist_rotation| G1["WristRotationAnalyzer"]
    G1 -->|Input: wrist landmarks| G1A["Extract rotation angles"]
    G1A -->|Calculate| G1B["range, frequency, tremor"]
    G1B -->|Output| G1C["{<br/>rotationRange: 85°,<br/>dominantFrequency: 4.2Hz,<br/>tremorAmplitude: 2.1mm<br/>}"]
    
    G -->|finger_tapping| G2["FingerTappingAnalyzer"]
    G2 -->|Input: finger landmarks + timing| G2A["Detect tap events"]
    G2A -->|Analyze| G2B["inter-tap intervals, finger independence"]
    G2B -->|Output| G2C["{<br/>tapFrequency: 3.5Hz,<br/>regularity: 0.92,<br/>fingerIndependence: 0.88<br/>}"]
    
    G -->|fingers_bending| G3["FingersBendingAnalyzer"]
    G -->|aperture_closure| G4["ApertureClosure Analyzer"]
    G -->|object_hold| G5["ObjectHoldAnalyzer"]
    
    G1C -->|Collect| H["MovementAnalysis Results"]
    G2C -->|Collect| H
    
    H -->|Store per-movement| I["ClinicalAnalysis<br/>movementAnalysis: {<br/>  'mov_uuid': {...},<br/>  'mov_uuid2': {...}<br/>}"]
    
    I -->|Aggregate| J["Overall Metrics<br/>tremor, ROM, smoothness"]
    J -->|Save| K["Database Complete"]
```

---

## 7. Frontend Form State Management

```mermaid
graph TD
    A["useForm Hook<br/>(React Hook Form)"] -->|Register| B["Form State<br/>{<br/>  movements: [],<br/>  overallRepetitions: 3,<br/>  requiredMetrics: []<br/>}"]
    
    B -->|User adds movement| C["Add Movement Button"]
    C -->|Append new item| D["movements: [..., newMovement]"]
    
    D -->|User selects type| E["MovementTypeSelector<br/>onChange"]
    E -->|Update field| F["movements[i].movementType"]
    F -->|Trigger re-render| G["SubMovementSelector<br/>Shows appropriate UI"]
    
    G -->|User configures| H["movements[i].config = {...}"]
    
    B -->|Validate entire form| I["Zod Validator<br/>protocolConfigurationSchema"]
    I -->|Check all movements| J{All Valid?}
    J -->|Yes| K["Enable Save Button"]
    J -->|No| L["Show Field Errors<br/>inline with form"]
    
    K -->|Click Save| M["API Call<br/>POST /api/protocols"]
    M -->|Success| N["Redirect to<br/>Protocol Details"]
    M -->|Error| O["Show Toast Error"]
```

---

## 8. Movement Type → Analysis Algorithm Mapping

```
Protocol Creation (Frontend)          →    Recording Analysis (Backend)
─────────────────────────────────────────────────────────────────────

Wrist Rotation                         →    WristRotationAnalyzer
├─ Config: rotationDir                    ├─ Input: Wrist joint landmarks (9)
├─ Hand: left|right|both              ├─ Calculate: angles, velocity
└─ Posture: pronation|supination      └─ Output: range, tremor, smoothness
  │ neutral                             

Finger Tapping                         →    FingerTappingAnalyzer
├─ Config: fingers[], mode, pattern      ├─ Input: Selected finger landmarks
├─ Hand: left|right|both              ├─ Detect: tap events, timing
└─ Posture: ...                       └─ Output: frequency, regularity

Fingers Bending                        →    FingersBendingAnalyzer
├─ Config: unilateral|bilateral          ├─ Input: MCP/PIP joint angles
├─ Hand: ...                          ├─ Calculate: ROM per finger
└─ Posture: ...                       └─ Output: ROM, smoothness, asymmetry

Aperture-Closure                       →    Aperture ClosureAnalyzer
├─ Config: aperture type, hand type      ├─ Input: Hand span, palm angle
├─ Hand: ...                          ├─ Measure: distance, timing
└─ Posture: ...                       └─ Output: aperture, closure time, stability

Object Hold                            →    ObjectHoldAnalyzer
├─ Config: grip type                     ├─ Input: Contact points, hand position
├─ Hand: ...                          ├─ Assess: grip quality, stability
└─ Posture: ...                       └─ Output: stability, tremor, pressure estimate

Freestyle                              →    GeneralHandAnalyzer
├─ Config: {} (none)                     ├─ Input: All hand landmarks
├─ Hand: ...                          ├─ Analyze: general motion
└─ Posture: ...                       └─ Output: ROM, tremor, smoothness
```

---

## 9. Validation Rules Summary

| Movement Type | Mandatory Fields | Validation Rules |
|---|---|---|
| **Wrist Rotation** | `subMovement` | 1 of 4 options |
| **Finger Tapping** | `fingers`, `unilateral`, `bilateral` | min 1 finger, valid modes |
| **Fingers Bending** | `subMovement` | 1 of 2 options |
| **Aperture-Closure** | `apertureCategory`, `handCategory` | 1 from each category (2 total) |
| **Object Hold** | `subMovement` | 1 of 2 options |
| **Freestyle** | (none) | config = {} |

**Global for all movements:**
- `hand`: required, 1 of 3
- `posture`: required, 1 of 3
- `duration`: required, 5-300 seconds
- `repetitions`: required, 1-100
- `instructions`: required, 1-1000 chars

---

## 10. Error Handling Strategy

```mermaid
graph TD
    A["User Submit Protocol"] -->|Validate| B["Zod Schema Check"]
    
    B -->|Field Error| C["Field has wrong type"]
    C -->|Display| C1["Show red border<br/>+ error message<br/>below field"]
    
    B -->|Validation Error| D["Value invalid<br/>for movement type"]
    D -->|Display| D1["Toast notification:<br/>Finger Tapping requires<br/>at least 1 finger"]
    
    B -->|Parse Error| E["JSON structure wrong"]
    E -->|Log| E1["Log to Sentry"]
    E -->|Display| E2["Toast: Protocol structure error"]
    
    B -->|All Valid| F["Enable Save"]
    F -->|POST| G{API Response}
    
    G -->|Success| H["Toast: Protocol saved"]
    G -->|400 Bad Request| I["Display API error<br/>+ suggest fix"]
    G -->|500 Server Error| J["Log error<br/>+ show generic message"]
```

---

## Summary

This architecture provides:

1. **Type Safety**: Discriminated unions prevent config/type mismatches
2. **Flexibility**: Movement-specific configs and analysis algorithms
3. **Scalability**: Easy to add new movement types
4. **Validation**: Multi-level validation (client-side + server-side)
5. **Clinical Clarity**: Each movement has specific, meaningful metrics
6. **Data Integrity**: Protocol templates stored as immutable snapshots
