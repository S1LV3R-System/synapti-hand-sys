# Protocol Movement System - Implementation Checklist

## Phase 1: Foundation & Schema (Week 1-2)

### Data Types
- [ ] Create `types/protocol.types.ts` with all movement type definitions
  - [ ] Hand, Posture, MovementType enums
  - [ ] 6 movement config types (WristRotation, FingerTapping, etc.)
  - [ ] ProtocolMovement interface with discriminated union
  - [ ] ProtocolConfiguration interface
  - [ ] Protocol model type

### Validation Schemas
- [ ] Create `schemas/protocol.validation.ts`
  - [ ] Base enums (hand, posture)
  - [ ] 6 movement-specific config schemas
  - [ ] Discriminated union movementSchema
  - [ ] protocolConfigurationSchema
  - [ ] protocolSchema (full protocol)
  - [ ] Helper functions (validateProtocol, createDefaultMovement)
  
### Database
- [ ] Review Protocol model in Prisma schema
  - [ ] Verify configuration field supports JSON
  - [ ] Check createdById relationship
  - [ ] Verify soft delete fields
- [ ] Plan migration if schema changes needed
  - [ ] Create migration for any new fields
  - [ ] Test data migration script

### Type Exports
- [ ] Export all types from `types/protocol.types.ts`
- [ ] Export all schemas from `schemas/protocol.validation.ts`
- [ ] Add to barrel exports (`index.ts`)

---

## Phase 2: Backend API (Week 2-3)

### Protocol Endpoints
- [ ] Create `routes/protocols.routes.ts`
  - [ ] POST /protocols (create)
  - [ ] GET /protocols (list)
  - [ ] GET /protocols/:id (get single)
  - [ ] PUT /protocols/:id (update)
  - [ ] DELETE /protocols/:id (soft delete)

### Protocol Service
- [ ] Create `services/protocolsService.ts`
  - [ ] createProtocol(data)
  - [ ] getProtocol(id)
  - [ ] listProtocols(filters)
  - [ ] updateProtocol(id, data)
  - [ ] deleteProtocol(id, hard)
  - [ ] getConfiguration(protocol) - parse JSON

### Protocol Controller
- [ ] Create `controllers/protocolController.ts`
  - [ ] Implement all 5 endpoint handlers
  - [ ] Error handling
  - [ ] Response formatting

### Validation Middleware
- [ ] Create/update validation middleware
  - [ ] Zod schema validation
  - [ ] Error response formatting
  - [ ] Type coercion handling

### Route Integration
- [ ] Add route to main `index.ts`
- [ ] Verify authentication middleware
- [ ] Test endpoint responses

---

## Phase 3: Analysis Algorithms (Week 3-4)

### Analyzer Infrastructure
- [ ] Create `services/analyzers/` directory
- [ ] Create analyzer interface/base class
  - [ ] Common metrics structure
  - [ ] Error handling
  - [ ] Logging

### 6 Analyzer Functions

#### WristRotationAnalyzer
- [ ] Create `analyzers/wristRotationAnalyzer.ts`
  - [ ] Input: SignalProcessingResult + ProtocolMovement
  - [ ] Calculate rotation angles
  - [ ] FFT analysis for frequency
  - [ ] Smoothness calculation
  - [ ] Output: WristRotationMetrics

#### FingerTappingAnalyzer
- [ ] Create `analyzers/fingerTappingAnalyzer.ts`
  - [ ] Detect tap events
  - [ ] Calculate inter-tap intervals
  - [ ] Frequency analysis
  - [ ] Finger independence metrics
  - [ ] Bilateral coordination (if applicable)
  - [ ] Output: FingerTappingMetrics

#### FingersBendingAnalyzer
- [ ] Create `analyzers/fingersBendingAnalyzer.ts`
  - [ ] Joint angle calculation
  - [ ] ROM per finger
  - [ ] Bending smoothness
  - [ ] Asymmetry analysis
  - [ ] Output: FingersBendingMetrics

#### ApertureClosureAnalyzer
- [ ] Create `analyzers/apertureClosureAnalyzer.ts`
  - [ ] Hand span distance
  - [ ] Aperture transitions
  - [ ] Closure timing
  - [ ] Stability metrics
  - [ ] Output: ApertureClosureMetrics

#### ObjectHoldAnalyzer
- [ ] Create `analyzers/objectHoldAnalyzer.ts`
  - [ ] Grip stability
  - [ ] Contact point analysis
  - [ ] Tremor during hold
  - [ ] Position stability
  - [ ] Output: ObjectHoldMetrics

#### FreestyleAnalyzer
- [ ] Create `analyzers/freestyleAnalyzer.ts`
  - [ ] General hand stability
  - [ ] Overall ROM
  - [ ] Tremor metrics
  - [ ] Output: FreestyleMetrics

### Analysis Orchestration
- [ ] Create `services/clinicalAnalysisService.ts`
  - [ ] analyzeRecording(recordingId, protocolId)
  - [ ] Load protocol configuration
  - [ ] Loop through movements
  - [ ] Route to appropriate analyzer
  - [ ] Aggregate results
  - [ ] Store in ClinicalAnalysis
  - [ ] Error handling per movement

### Clinical Analysis Endpoint
- [ ] Create `routes/clinical.routes.ts`
  - [ ] POST /clinical/analyze
- [ ] Create controller handler
- [ ] Test analysis flow

### Test Fixtures
- [ ] Create sample protocols for testing
- [ ] Create sample signal data
- [ ] Create expected analysis outputs

---

## Phase 4: Frontend Components (Week 3-4)

### State Management
- [ ] Review Redux setup for protocols
- [ ] Create Redux actions (if needed):
  - [ ] setProtocol
  - [ ] setProtocols
  - [ ] setLoading

### Hook Integration
- [ ] Create `hooks/useProtocol.ts`
  - [ ] useProtocol(protocolId)
  - [ ] useCreateProtocol()
  - [ ] useUpdateProtocol(protocolId)

### Form Components

#### ProtocolEditor (Main Container)
- [ ] Create `components/ProtocolEditor.tsx`
  - [ ] useForm hook setup
  - [ ] Zod resolver integration
  - [ ] Form state management
  - [ ] Submit handler
  - [ ] Load existing protocol
  - [ ] Auto-save to localStorage (draft)

#### BasicForm
- [ ] Create `components/ProtocolBasicForm.tsx`
  - [ ] Name input
  - [ ] Description textarea
  - [ ] Indicated for input
  - [ ] Contraindications input
  - [ ] Is public checkbox

#### MovementsList
- [ ] Create `components/MovementsList.tsx`
  - [ ] Render movement cards
  - [ ] Drag-and-drop reordering
  - [ ] Edit/delete actions
  - [ ] Add movement button

#### MovementItem
- [ ] Create `components/MovementItem.tsx`
  - [ ] Collapsible card
  - [ ] Movement summary
  - [ ] Edit trigger
  - [ ] Delete trigger
  - [ ] Validation error indicator

#### MovementEditor (Nested Form)
- [ ] Create `components/MovementEditor.tsx`
  - [ ] Hand selector (radio buttons)
  - [ ] Posture selector (radio buttons)
  - [ ] Movement type selector
  - [ ] Sub-movement selector
  - [ ] Duration input
  - [ ] Repetitions input
  - [ ] Instructions textarea
  - [ ] Delete button

#### BasicSettings
- [ ] Create `components/BasicSettings.tsx`
  - [ ] Hand selector
  - [ ] Posture selector
  - [ ] Duration input
  - [ ] Repetitions input

#### MovementTypeSelector
- [ ] Create `components/MovementTypeSelector.tsx`
  - [ ] Dropdown with 6 options
  - [ ] Descriptions/tooltips
  - [ ] onChange handler resets config
  - [ ] Validation display

### Sub-Movement Selectors (6 components)

#### WristRotationSelector
- [ ] Create `components/subMovements/WristRotationSelector.tsx`
  - [ ] Radio buttons for 4 directions
  - [ ] Validation

#### FingerTappingSelector
- [ ] Create `components/subMovements/FingerTappingSelector.tsx`
  - [ ] Checkboxes for 5 fingers
  - [ ] Dropdown for unilateral mode
  - [ ] Dropdown for bilateral mode
  - [ ] Min 1 finger validation

#### FingersBendingSelector
- [ ] Create `components/subMovements/FingersBendingSelector.tsx`
  - [ ] Radio buttons for 2 options
  - [ ] Validation

#### ApertureClosureSelector
- [ ] Create `components/subMovements/ApertureClosureSelector.tsx`
  - [ ] Checkboxes for aperture category (3 options)
  - [ ] Checkboxes for hand category (2 options)
  - [ ] Validation: 1 from each category

#### ObjectHoldSelector
- [ ] Create `components/subMovements/ObjectHoldSelector.tsx`
  - [ ] Radio buttons for 2 options
  - [ ] Validation

#### FreestyleSelector
- [ ] Create `components/subMovements/FreestyleSelector.tsx`
  - [ ] Empty component (nothing to configure)

### OverallSettings
- [ ] Create `components/OverallSettingsForm.tsx`
  - [ ] Overall repetitions input
  - [ ] Required metrics multi-select
  - [ ] Clinical guidelines textarea

### InstructionsEditor
- [ ] Create `components/InstructionsEditor.tsx`
  - [ ] Textarea component
  - [ ] Character counter
  - [ ] Validation

### FormActions
- [ ] Create `components/FormActions.tsx`
  - [ ] Save button
  - [ ] Cancel button
  - [ ] Preview button
  - [ ] Loading state

### Service Integration
- [ ] Update `services/protocols.service.ts`
  - [ ] Verify API methods match backend
  - [ ] Add error handling
  - [ ] Add request/response logging

### Testing
- [ ] Unit tests for ProtocolEditor
  - [ ] Form initialization
  - [ ] Form submission
  - [ ] Validation errors
- [ ] Unit tests for each SubMovementSelector
  - [ ] Rendering correct UI
  - [ ] Validation logic
  - [ ] onChange handlers
- [ ] E2E tests for full protocol creation workflow

---

## Phase 5: Integration & Testing (Week 4-5)

### Database
- [ ] Run migrations
- [ ] Verify schema changes
- [ ] Test data migration (if needed)

### Integration Tests

#### Frontend-Backend
- [ ] Test protocol creation flow end-to-end
- [ ] Test protocol update
- [ ] Test protocol deletion
- [ ] Test form validation with API errors

#### Analysis
- [ ] Test recording upload with protocol
- [ ] Test analysis execution
- [ ] Verify movement-specific metrics stored
- [ ] Test with each movement type

### E2E Tests (Playwright)
- [ ] `tests/e2e/protocol-creation.spec.ts`
  - [ ] Create protocol with all 6 movement types
  - [ ] Test drag-and-drop reordering
  - [ ] Test form validation
  - [ ] Test save and load
  
- [ ] `tests/e2e/protocol-analysis.spec.ts`
  - [ ] Upload recording with protocol
  - [ ] Verify analysis completion
  - [ ] Check movement-specific metrics in results

### Performance Tests
- [ ] Zod schema validation performance
- [ ] Form submission time
- [ ] Large protocol handling (20 movements max)
- [ ] Analysis execution time per movement

### Security Tests
- [ ] Protocol access control (user can only see own)
- [ ] Public protocols properly marked
- [ ] Soft delete verification
- [ ] SQL injection resistance (Prisma handles)
- [ ] XSS prevention in instructions field

### Documentation
- [ ] API documentation (OpenAPI/Swagger)
- [ ] Frontend component storybook stories
- [ ] Backend analysis algorithm documentation
- [ ] Type definition documentation

### Handoff
- [ ] Code review
- [ ] Documentation review
- [ ] Update project README
- [ ] Create migration guide (if applicable)
- [ ] Create troubleshooting guide

---

## Testing Commands

```bash
# Backend
npm run test:unit          # Unit tests
npm run test:integration  # Integration tests
npm run build             # TypeScript compilation

# Frontend
npm run test              # Jest tests
npm run test:watch       # Watch mode
npm run test:coverage    # Coverage report
npm run lint             # ESLint

# E2E
npm run test:e2e         # Run all E2E tests
npm run test:e2e:ui      # UI mode
npm run test:e2e:headed  # Visible browser
npm run test:e2e:report  # HTML report
```

---

## File Structure After Completion

```
backend-node/
├─ src/
│  ├─ types/
│  │  └─ protocol.types.ts ✅
│  ├─ schemas/
│  │  └─ protocol.validation.ts ✅
│  ├─ services/
│  │  ├─ protocolsService.ts ✅
│  │  └─ analyzers/
│  │     ├─ wristRotationAnalyzer.ts ✅
│  │     ├─ fingerTappingAnalyzer.ts ✅
│  │     ├─ fingersBendingAnalyzer.ts ✅
│  │     ├─ apertureClosureAnalyzer.ts ✅
│  │     ├─ objectHoldAnalyzer.ts ✅
│  │     ├─ freestyleAnalyzer.ts ✅
│  │     └─ clinicalAnalysisService.ts ✅
│  ├─ controllers/
│  │  ├─ protocolController.ts ✅
│  │  └─ clinicalController.ts ✅
│  └─ routes/
│     ├─ protocols.routes.ts ✅
│     └─ clinical.routes.ts ✅

frontend/
├─ src/
│  ├─ types/
│  │  └─ protocol.types.ts (synced) ✅
│  ├─ schemas/
│  │  └─ protocol.validation.ts (synced) ✅
│  ├─ components/
│  │  ├─ ProtocolEditor.tsx ✅
│  │  ├─ ProtocolBasicForm.tsx ✅
│  │  ├─ MovementsList.tsx ✅
│  │  ├─ MovementItem.tsx ✅
│  │  ├─ MovementEditor.tsx ✅
│  │  ├─ BasicSettings.tsx ✅
│  │  ├─ MovementTypeSelector.tsx ✅
│  │  ├─ InstructionsEditor.tsx ✅
│  │  ├─ OverallSettingsForm.tsx ✅
│  │  ├─ FormActions.tsx ✅
│  │  └─ subMovements/
│  │     ├─ WristRotationSelector.tsx ✅
│  │     ├─ FingerTappingSelector.tsx ✅
│  │     ├─ FingersBendingSelector.tsx ✅
│  │     ├─ ApertureClosureSelector.tsx ✅
│  │     ├─ ObjectHoldSelector.tsx ✅
│  │     └─ FreestyleSelector.tsx ✅
│  ├─ hooks/
│  │  └─ useProtocol.ts ✅
│  └─ services/
│     └─ protocols.service.ts (updated) ✅

tests/
├─ e2e/
│  ├─ protocol-creation.spec.ts ✅
│  └─ protocol-analysis.spec.ts ✅
└─ unit/
   ├─ components/
   │  └─ ProtocolEditor.test.tsx ✅
   └─ services/
      └─ protocolsService.test.ts ✅
```

---

## Verification Checklist

Once implementation is complete:

- [ ] All TypeScript compiles without errors
- [ ] All unit tests pass
- [ ] All integration tests pass
- [ ] All E2E tests pass
- [ ] No console errors/warnings
- [ ] Zod validation working correctly
- [ ] Form submission successful
- [ ] Protocol saved to database correctly
- [ ] Analysis runs successfully
- [ ] Movement-specific metrics stored
- [ ] Frontend loads saved protocol correctly
- [ ] Drag-and-drop reordering works
- [ ] All 6 movement type UIs render correctly
- [ ] Validation errors display properly
- [ ] API responses match contracts
- [ ] Database migrations successful
- [ ] No security vulnerabilities
- [ ] Performance acceptable
- [ ] Code review completed
- [ ] Documentation complete

---

## Common Issues & Solutions

### Issue: "config does not match movementType"
**Cause:** User changed movement type but config wasn't reset
**Solution:** MovementTypeSelector.onChange handler resets config to defaults

### Issue: "fingers array is empty"
**Cause:** Finger Tapping requires at least 1 finger selected
**Solution:** Zod schema validates min 1, show error message

### Issue: "Analysis fails on movement X"
**Cause:** Specific movement analyzer threw error
**Solution:** Error caught in orchestration service, stored in ClinicalAnalysis with error message

### Issue: "Form state out of sync"
**Cause:** Multiple sources of truth for form state
**Solution:** Use React Hook Form with single source of truth

### Issue: "Type mismatch in config"
**Cause:** Passing wrong config to movement type
**Solution:** Discriminated union TypeScript error catches at compile time

---

## Rollback Plan

If implementation encounters critical issues:

1. **Revert database**: Keep old Protocol model fields, add new fields alongside
2. **Feature flag**: Hide protocol UI behind feature flag during rollout
3. **Gradual rollout**: Enable for specific users first
4. **Data migration**: Reversible script to migrate between old/new format
5. **Keep backward compatibility**: Support both old and new config formats

---

## Deployment Checklist

Before deploying to production:

- [ ] Database migrations tested
- [ ] All tests passing
- [ ] Code review approved
- [ ] Security review completed
- [ ] Performance testing successful
- [ ] Error monitoring configured
- [ ] Rollback plan documented
- [ ] Team trained on new UI
- [ ] Documentation updated
- [ ] Feature flag prepared
- [ ] Health checks passing
