# ViewModel Refactoring Migration Checklist

## Overview

This checklist guides you through migrating existing ViewModels to use the new base classes.

**Estimated time per ViewModel:**
- Simple (< 150 lines): 30-45 minutes
- Medium (150-300 lines): 1-2 hours
- Complex (> 300 lines): 2-4 hours

---

## Phase 1: Preparation

### Prerequisites
- [ ] Review base classes documentation
  - [ ] Read `BaseViewModel.kt`
  - [ ] Read `BaseEntityViewModel.kt`
  - [ ] Understand `LoadingState` sealed class
- [ ] Review example refactorings
  - [ ] `RecordingDetailViewModelRefactored.kt`
  - [ ] `ProjectViewModelRefactored.kt`
- [ ] Set up testing environment
  - [ ] Ensure all existing tests pass
  - [ ] Create test branch for refactoring

---

## Phase 2: RecordingDetailViewModel (Pilot)

**Target:** `RecordingDetailViewModel.kt` (147 lines → ~90 lines)
**Base class:** `BaseViewModel<RecordingDetailUiState>`
**Estimated time:** 45 minutes

### Steps

- [ ] **Step 1:** Update UiState
  ```kotlin
  - [ ] Add `override val loadingState: LoadingState`
  - [ ] Add `override val errorMessage: String?`
  - [ ] Remove `val isLoading: Boolean`
  - [ ] Implement `copyWith()` method
  ```

- [ ] **Step 2:** Update ViewModel class
  ```kotlin
  - [ ] Change `ViewModel()` to `BaseViewModel<RecordingDetailUiState>()`
  - [ ] Add `override val initialState = RecordingDetailUiState()`
  - [ ] Remove manual StateFlow initialization
  - [ ] Remove `clearError()` method (inherited)
  ```

- [ ] **Step 3:** Refactor `loadRecordingFiles()`
  ```kotlin
  - [ ] Replace try-catch with `executeWithLoading()`
  - [ ] Move success logic to onSuccess callback
  - [ ] Remove manual loading state transitions
  ```

- [ ] **Step 4:** Update UI layer
  ```kotlin
  - [ ] Replace `uiState.isLoading` with `uiState.loadingState is LoadingState.Loading`
  - [ ] Use when expression for LoadingState
  - [ ] Update error display to use LoadingState.Error
  ```

- [ ] **Step 5:** Test
  ```kotlin
  - [ ] Run existing unit tests
  - [ ] Manual UI testing
  - [ ] Verify all states work (loading, success, error)
  - [ ] Verify clearError() still works
  ```

- [ ] **Step 6:** Commit
  ```
  git add .
  git commit -m "refactor: Migrate RecordingDetailViewModel to BaseViewModel

  - Reduces boilerplate by 39% (57 lines)
  - Uses LoadingState sealed class for type safety
  - Inherits error handling from BaseViewModel
  "
  ```

---

## Phase 3: ProjectViewModel

**Target:** `ProjectViewModel.kt` (215 lines → ~140 lines)
**Base class:** `BaseListViewModel<Project>`
**Estimated time:** 1.5 hours

### Steps

- [ ] **Step 1:** Update UiState
  ```kotlin
  - [ ] Add `override val loadingState: LoadingState`
  - [ ] Add `override val errorMessage: String?`
  - [ ] Add `override val isRefreshing: Boolean`
  - [ ] Remove `val isLoading: Boolean`
  - [ ] Implement `copyWith()` method
  ```

- [ ] **Step 2:** Update ViewModel class
  ```kotlin
  - [ ] Change `ViewModel()` to `BaseListViewModel<Project>()`
  - [ ] Add `override val initialState = ProjectsUiState()`
  - [ ] Remove manual StateFlow initialization
  ```

- [ ] **Step 3:** Implement abstract methods
  ```kotlin
  - [ ] Implement `loadListData()` - return repository.fetchProjects()
  ```

- [ ] **Step 4:** Refactor load/refresh methods
  ```kotlin
  - [ ] Remove `loadProjects()` - use inherited `loadList()`
  - [ ] Remove `refreshProjects()` - use inherited `refreshList()`
  - [ ] Update `init` block to call `loadList()`
  ```

- [ ] **Step 5:** Update CRUD operations
  ```kotlin
  - [ ] Replace `viewModelScope.launch` with `launchInViewModel`
  - [ ] Use `setError()` instead of manual state updates
  - [ ] Call `loadList()` after successful create/update/delete
  ```

- [ ] **Step 6:** Update UI layer
  ```kotlin
  - [ ] Replace `loadProjects()` calls with `loadList()`
  - [ ] Replace `refreshProjects()` calls with `refreshList()`
  - [ ] Update loading state checks
  ```

- [ ] **Step 7:** Test
  ```kotlin
  - [ ] Run existing unit tests
  - [ ] Test load, refresh, create, update, delete
  - [ ] Verify pull-to-refresh works
  - [ ] Verify error states
  ```

- [ ] **Step 8:** Commit
  ```
  git add .
  git commit -m "refactor: Migrate ProjectViewModel to BaseListViewModel

  - Reduces boilerplate by 35% (75 lines)
  - Unified load/refresh logic in base class
  - Improved type safety with LoadingState
  "
  ```

---

## Phase 4: PatientsViewModel

**Target:** `PatientsViewModel.kt` (294 lines → ~200 lines)
**Base class:** `BaseListViewModel<Patient>` or custom
**Estimated time:** 2 hours

### Complexity Notes
- Has custom error sanitization logic
- Multiple load methods (loadAll, loadByProject)
- Consider: Add sanitization to base class or keep custom

### Steps

- [ ] **Step 1:** Decide on approach
  ```
  Option A: BaseListViewModel + custom error handling
  Option B: Custom BaseViewModel extension
  - [ ] Choose approach based on reusability
  ```

- [ ] **Step 2:** Update UiState
  ```kotlin
  - [ ] Follow same pattern as ProjectViewModel
  ```

- [ ] **Step 3:** Implement base class
  ```kotlin
  - [ ] Implement `loadListData()` for default load
  - [ ] Keep custom `loadPatientsForProject()` if needed
  ```

- [ ] **Step 4:** Migrate error sanitization
  ```kotlin
  - [ ] Decide: Move to base class or keep in ViewModel
  - [ ] If keeping: wrap setError() with sanitization
  ```

- [ ] **Step 5:** Update UI layer

- [ ] **Step 6:** Test thoroughly (security-critical)
  ```kotlin
  - [ ] Test error message sanitization
  - [ ] Test all load scenarios
  - [ ] Verify no sensitive data leakage
  ```

- [ ] **Step 7:** Commit

---

## Phase 5: PatientViewModel (Most Complex)

**Target:** `PatientViewModel.kt` (521 lines → ~340 lines)
**Base class:** Composite (may need custom base)
**Estimated time:** 3-4 hours

### Complexity Notes
- Manages TWO UiStates (list + detail)
- Has CRUD operations
- Complex form validation
- Consider: Split into two ViewModels

### Decision Point

- [ ] **Option A:** Single ViewModel with custom state
  - Pros: Matches current architecture
  - Cons: Still complex

- [ ] **Option B:** Split into two ViewModels
  - `PatientsListViewModel` - List + search + CRUD
  - `PatientDetailViewModel` - Single patient + recordings
  - Pros: Clear separation, each uses appropriate base class
  - Cons: Requires navigation changes

### Steps (Option A: Single ViewModel)

- [ ] **Step 1:** Create composite UiState
  ```kotlin
  data class PatientCompositeState(
      val listState: PatientsUiState,
      val detailState: PatientDetailUiState,
      override val loadingState: LoadingState,
      override val errorMessage: String?
  ) : BaseUiState
  ```

- [ ] **Step 2:** Extend BaseViewModel
  ```kotlin
  class PatientViewModel : BaseViewModel<PatientCompositeState>()
  ```

- [ ] **Step 3:** Migrate list operations
  ```kotlin
  - [ ] Use executeWithLoading for loadPatients()
  - [ ] Use executeWithLoading for refreshPatients()
  ```

- [ ] **Step 4:** Migrate detail operations
  ```kotlin
  - [ ] Use executeWithLoading for loadPatientDetail()
  - [ ] Use executeWithLoading for loadPatientRecordings()
  ```

- [ ] **Step 5:** Keep CRUD and validation as-is
  ```kotlin
  - [ ] These are domain-specific, no base class help
  ```

- [ ] **Step 6:** Update UI layer

- [ ] **Step 7:** Test extensively

- [ ] **Step 8:** Commit

### Steps (Option B: Split ViewModels)

- [ ] **Step 1:** Create `PatientsListViewModel`
  ```kotlin
  class PatientsListViewModel : BaseSearchableListViewModel<Patient>()
  - [ ] Implement filterItems()
  - [ ] Implement loadListData()
  - [ ] Move CRUD operations here
  ```

- [ ] **Step 2:** Create `PatientDetailViewModel`
  ```kotlin
  class PatientDetailViewModel : BaseEntityViewModel<Patient>()
  - [ ] Implement loadEntityData()
  - [ ] Add recordings loading
  ```

- [ ] **Step 3:** Update navigation
  ```kotlin
  - [ ] Update routes to use separate ViewModels
  - [ ] Pass patient ID to detail screen
  ```

- [ ] **Step 4:** Update UI layer

- [ ] **Step 5:** Test

- [ ] **Step 6:** Commit

---

## Phase 6: Verification

### Code Quality Checks

- [ ] **Compilation**
  ```bash
  ./gradlew assembleDebug
  ```

- [ ] **Unit Tests**
  ```bash
  ./gradlew test
  ```

- [ ] **UI Tests**
  ```bash
  ./gradlew connectedAndroidTest
  ```

- [ ] **Lint**
  ```bash
  ./gradlew lint
  ```

### Manual Testing Checklist

For each migrated ViewModel:

- [ ] **Loading State**
  - [ ] Loading indicator shows during data fetch
  - [ ] Loading indicator hides on success
  - [ ] Loading indicator hides on error

- [ ] **Success State**
  - [ ] Data displays correctly
  - [ ] Interactions work as expected
  - [ ] Navigation works

- [ ] **Error State**
  - [ ] Error message displays
  - [ ] Error can be cleared
  - [ ] Retry works after error

- [ ] **Refresh**
  - [ ] Pull-to-refresh works
  - [ ] Refresh indicator shows/hides correctly
  - [ ] Data updates after refresh

### Metrics Verification

- [ ] **LOC Reduction**
  ```bash
  # Before migration
  wc -l <ViewModel>.kt

  # After migration
  wc -l <ViewModel>.kt

  # Calculate % reduction
  ```

- [ ] **Expected Reductions:**
  - RecordingDetailViewModel: ~39% (57 lines)
  - ProjectViewModel: ~35% (75 lines)
  - PatientsViewModel: ~32% (94 lines)
  - PatientViewModel: ~35% (181 lines)

---

## Phase 7: Documentation

- [ ] **Update Team Docs**
  - [ ] Add base class usage guide
  - [ ] Update coding standards
  - [ ] Add migration examples

- [ ] **Update README**
  - [ ] Document architecture change
  - [ ] List available base classes
  - [ ] Link to examples

- [ ] **KDoc Comments**
  - [ ] Ensure all base classes have KDoc
  - [ ] Add usage examples in comments
  - [ ] Document abstract methods

---

## Phase 8: Future Prevention

### Lint Rules (Optional)

Create custom lint rule to prevent old patterns:

- [ ] Detect manual `MutableStateFlow` initialization in ViewModels
- [ ] Suggest using base classes
- [ ] Flag missing `clearError()` implementation

### Code Review Checklist

Add to PR template:

- [ ] New ViewModels extend appropriate base class
- [ ] UiState implements BaseUiState
- [ ] No manual loading state management
- [ ] Uses executeWithLoading() for async operations
- [ ] Uses LoadingState sealed class (not boolean flags)

### Team Training

- [ ] Schedule team presentation on base classes
- [ ] Share migration examples
- [ ] Pair programming sessions for first migration

---

## Rollback Plan

If issues arise during migration:

### Quick Rollback
```bash
# Revert to previous commit
git revert HEAD

# Or reset to before migration
git reset --hard <commit-before-migration>
```

### Partial Rollback

If only one ViewModel has issues:

```bash
# Checkout specific file from previous commit
git checkout <commit-hash> -- path/to/ViewModel.kt
```

---

## Success Criteria

Migration is successful when:

- [x] All base classes created and tested
- [ ] At least 2 ViewModels migrated successfully
- [ ] All tests pass
- [ ] UI works identically to before
- [ ] Code review approved
- [ ] Documentation updated
- [ ] Team trained on new patterns

---

## Troubleshooting

### Issue: StateFlow type mismatch

**Symptom:** Compiler error about StateFlow type

**Solution:** Ensure UiState implements BaseUiState and copyWith() returns correct type

```kotlin
override fun copyWith(...): MyUiState {  // Must return MyUiState, not BaseUiState
    return copy(...)
}
```

### Issue: Loading state not updating UI

**Symptom:** UI doesn't show loading indicator

**Solution:** Update Composable to observe LoadingState

```kotlin
// Before
if (uiState.isLoading) { ... }

// After
when (uiState.loadingState) {
    is LoadingState.Loading -> { ... }
    else -> { }
}
```

### Issue: clearError() not working

**Symptom:** Error message persists after clearError()

**Solution:** Verify ViewModel extends BaseViewModel (inherits clearError)

```kotlin
class MyViewModel : BaseViewModel<MyUiState>() { // Correct
    // clearError() automatically available
}
```

### Issue: Custom state needs additional fields

**Symptom:** BaseUiState doesn't have field I need

**Solution:** Add field to your UiState data class

```kotlin
data class MyUiState(
    val customField: String = "",  // Your custom field
    override val loadingState: LoadingState = LoadingState.Idle,
    override val errorMessage: String? = null
) : BaseUiState {
    override fun copyWith(...): MyUiState {
        return copy(loadingState = loadingState, errorMessage = errorMessage)
        // customField preserves its value
    }
}
```

---

## Estimated Timeline

| Phase | Duration | Cumulative |
|-------|----------|------------|
| Preparation | 1 hour | 1 hour |
| RecordingDetailViewModel | 1 hour | 2 hours |
| ProjectViewModel | 2 hours | 4 hours |
| PatientsViewModel | 2 hours | 6 hours |
| PatientViewModel | 4 hours | 10 hours |
| Verification | 2 hours | 12 hours |
| Documentation | 2 hours | 14 hours |
| Training | 2 hours | 16 hours |

**Total estimated time:** 16 hours (2 days)

**Recommended approach:** Spread over 1 week with 2-3 hours/day

---

## Questions?

- Review examples in `RecordingDetailViewModelRefactored.kt`
- Read detailed report in `VIEWMODEL_REFACTORING_REPORT.md`
- Check base class KDoc comments
- Ask team for pair programming support

---

**Last updated:** 2026-01-29
**Version:** 1.0
**Maintainer:** Architecture Team
