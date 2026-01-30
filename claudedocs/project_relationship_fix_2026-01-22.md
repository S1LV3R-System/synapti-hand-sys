# Project-Experiment-Session Relationship Fix

**Date**: 2026-01-22
**Issue**: Android app crashes when fetching/deleting projects with error "Could not find a relationship between 'Project-Table' and 'Experiment-Session'"
**Severity**: 🔴 CRITICAL - Blocks project detail view and deletion
**Status**: ✅ FIXED

---

## Error Details

**Error Message**:
```
io.github.jan.supabase.exceptions.BadRequestRestException: Could not find a relationship between 'Project-Table' and 'Experiment-Session' in the schema cache
(Searched for a foreign key relationship between 'Project-Table' and 'Experiment-Session' in the schema 'public', but no matches were found.)

URL: https://mtodevikkgraisalolkq.supabase.co/rest/v1/Project-Table?project_id=eq.5ec97168-880d-42b2-bdc7-b827372668f3&select=%2A%2C%22Patient-Table%22%28count%29%2C%22Experiment-Session%22%28count%29
```

**Impact**:
- ❌ Cannot view project details in Android app
- ❌ Project deletion appears to fail (actually it's the post-delete fetch that fails)
- ❌ Project list with recording counts fails
- ✅ Backend delete operations work fine (soft delete only)

---

## Root Cause Analysis

### Database Schema Relationship Chain

The relationship between Projects and Experiment-Sessions is **INDIRECT** through Patient:

```
Project (project_id)
   ↓ FK: patient.project_id
Patient (id, project_id)
   ↓ FK: session.patientId
Experiment-Session (session_id, patientId)
```

**Prisma Schema Verification**:

**Project Model** (schema.prisma:54-70):
```prisma
model Project {
  id                 String    @id @default(uuid()) @map("project_id") @db.Uuid
  // ... other fields ...

  // Relationships
  patients           Patient[]           // ✅ Has relationship to Patient
  protocols          Protocol[]
  // ❌ NO RELATIONSHIP to ExperimentSession

  @@map("Project-Table")
}
```

**ExperimentSession Model** (schema.prisma:127-154):
```prisma
model ExperimentSession {
  id                  String    @id @default(uuid()) @map("session_id") @db.Uuid
  patientId           String    @map("Patient") @db.Uuid
  // ... other fields ...

  // Relationships
  patient             Patient   @relation(fields: [patientId], references: [id])
  // ❌ NO RELATIONSHIP to Project

  @@map("Experiment-Session")
}
```

### Android App's Invalid Query

**File**: `android/app/src/main/java/com/handpose/app/data/SupabaseDataRepository.kt:64-72`

**Before Fix**:
```kotlin
suspend fun getProject(id: String): Result<Project> {
    val project = postgrest.from("Project-Table")
        .select(columns = Columns.raw("""
            *,
            "Patient-Table"(count),
            "Experiment-Session"(count)    // ❌ INVALID - No FK exists!
        """.trimIndent())) {
            filter {
                eq("project_id", id)
            }
        }
    // ...
}
```

This query tries to join directly from `Project-Table` to `Experiment-Session`, which **fails** because there's no foreign key relationship.

### Why Patient Queries Work

**File**: `SupabaseDataRepository.kt:203-209`

```kotlin
val patient = postgrest.from("Patient-Table")
    .select(columns = Columns.raw("""
        *,
        "Experiment-Session"(count)    // ✅ VALID - FK exists!
    """.trimIndent()))
```

This works because `Patient-Table` **has a direct FK relationship** with `Experiment-Session` via the `Patient` FK column.

---

## Solution: Remove Invalid Join

### Changes Applied

#### 1. SupabaseDataRepository.kt - Remove Invalid Join ✅

**File**: `android/app/src/main/java/com/handpose/app/data/SupabaseDataRepository.kt:64-72`

**Before**:
```kotlin
val project = postgrest.from("Project-Table")
    .select(columns = Columns.raw("""
        *,
        "Patient-Table"(count),
        "Experiment-Session"(count)    // ❌ REMOVED
    """.trimIndent()))
```

**After**:
```kotlin
val project = postgrest.from("Project-Table")
    .select(columns = Columns.raw("""
        *,
        "Patient-Table"(count)         // ✅ Valid join remains
    """.trimIndent()))
```

#### 2. Project.kt - Remove experimentSessions Field ✅

**File**: `android/app/src/main/java/com/handpose/app/data/model/Project.kt:86-112`

**Before**:
```kotlin
@Serializable
data class SupabaseProjectTable(
    // ... other fields ...
    @SerialName("Patient-Table")
    val patients: List<CountResult>? = null,
    @SerialName("Experiment-Session")
    val experimentSessions: List<CountResult>? = null  // ❌ REMOVED
) {
    fun toProject(): Project = Project(
        // ... other fields ...
        count = ProjectCount(
            patients = patients?.firstOrNull()?.count ?: 0,
            recordings = experimentSessions?.firstOrNull()?.count ?: 0  // ❌ REMOVED
        ),
        // ...
    )
}
```

**After**:
```kotlin
@Serializable
data class SupabaseProjectTable(
    // ... other fields ...
    @SerialName("Patient-Table")
    val patients: List<CountResult>? = null
) {
    fun toProject(): Project = Project(
        // ... other fields ...
        count = ProjectCount(
            patients = patients?.firstOrNull()?.count ?: 0,
            recordings = 0  // ✅ No longer fetched at project level
        ),
        // ...
    )
}
```

---

## Alternative Solutions Considered

### Option A: Remove Recording Count ✅ CHOSEN
- **Pros**: Simple, fast fix; no schema changes needed
- **Cons**: Recording count not shown in project view
- **Decision**: Accepted - recording counts are available in patient detail views

### Option B: Add project_id to Experiment-Session ❌ REJECTED
- **Pros**: Would enable direct join
- **Cons**: Creates redundant data (violates normalization); requires schema migration
- **Decision**: Rejected - unnecessary denormalization

### Option C: Calculate via Complex Query ❌ REJECTED
- **Pros**: Shows accurate recording count
- **Cons**: Complex nested query; performance impact; requires backend support
- **Decision**: Rejected - not worth the complexity for a count

---

## Backend Delete Operations Analysis

### Project Deletion

**File**: `Web-Service/backend-node/src/controllers/project.controller.ts:330-355`

```kotlin
export const deleteProject = async (req: AuthRequest, res: Response) => {
    // Soft delete the project
    const deletedProject = await prisma.project.update({
      where: { id },
      data: { deletedAt: new Date() },
    });
}
```

**Status**: ✅ Works correctly - Soft delete only, no cascade issues

### Patient Deletion

**File**: `Web-Service/backend-node/src/controllers/patient.controller.ts:610-648`

```kotlin
export const deletePatient = async (req: AuthRequest, res: Response) => {
    // Soft delete the patient
    const deletedPatient = await prisma.patient.update({
      where: { id },
      data: { deletedAt: new Date() },
    });
}
```

**Status**: ✅ Works correctly - Soft delete only, no cascade issues

**Key Point**: Both delete operations use **soft delete** (setting `deletedAt` timestamp), so there are no cascade deletion constraints to worry about. The error was occurring when trying to **fetch** project details after deletion, not during the delete operation itself.

---

## Testing Verification

### 1. Test Project Fetch

```bash
# Android App
1. Login as admin@synaptihand.com
2. Navigate to Projects screen
3. Click on any project to view details
4. Verify project detail screen loads successfully

# Expected Result Before Fix: ❌ Crash with "Could not find relationship" error
# Expected Result After Fix: ✅ Project details load successfully
```

### 2. Test Project Deletion

```bash
# Android App
1. Navigate to project detail screen
2. Click delete button (if available)
3. Confirm deletion
4. Verify project is removed from list

# Expected Result Before Fix: ❌ Appears to fail (fetch after delete crashes)
# Expected Result After Fix: ✅ Deletion succeeds, navigates back to project list
```

### 3. Test Patient Fetch/Delete

```bash
# Android App
1. Navigate to project → patient list
2. View patient details
3. Verify recording count is shown (if patient has recordings)
4. Test patient deletion if needed

# Expected Result: ✅ Works correctly (Patient → Experiment-Session join is valid)
```

### 4. Verify in Database

```sql
-- Check soft-deleted projects
SELECT project_id, project_name, deleted_at
FROM "Project-Table"
WHERE deleted_at IS NOT NULL
ORDER BY deleted_at DESC
LIMIT 5;

-- Check soft-deleted patients
SELECT id, patient_id, first_name, last_name, deleted_at
FROM "Patient-Table"
WHERE deleted_at IS NOT NULL
ORDER BY deleted_at DESC
LIMIT 5;
```

Expected: Soft-deleted records should have `deleted_at` timestamp set.

---

## Impact Analysis

### What Changed
1. ✅ Android project detail view no longer tries to fetch recording count
2. ✅ Invalid Supabase join removed
3. ✅ `recordings` field in Project model now defaults to 0

### What Didn't Change
1. ✅ Backend delete operations unchanged (working correctly)
2. ✅ Patient → Experiment-Session joins still work (valid FK)
3. ✅ Recording counts still available in patient detail views
4. ✅ Soft delete cleanup job unchanged (15-day retention)

### Performance Impact
- **Positive**: Simpler query → faster project detail load
- **Neutral**: No additional database queries needed
- **Negligible**: Recording count at project level not critical

---

## Architecture Notes

### Relationship Hierarchy

The schema follows proper normalization:

```
User
  ↓ creates
Project
  ↓ contains
Patient
  ↓ has
Experiment-Session
```

**Why No Direct Project → Experiment-Session Relationship?**
- **Normalization**: Sessions belong to patients, not projects
- **Data Integrity**: Moving a patient changes project → sessions automatically
- **Flexibility**: Patients can be reassigned without breaking session links
- **Performance**: No redundant foreign keys to maintain

### When to Query Recording Counts

**Valid Queries**:
1. ✅ Patient detail → Count sessions for this patient
2. ✅ Experiment session list → Show all sessions
3. ❌ Project detail → Count sessions for all patients (requires complex query)

**Recommended Approach for Project Recording Count**:
If needed in the future, use backend API endpoint:
```typescript
GET /api/projects/{id}/recording-count
// Backend performs: SELECT COUNT(*) FROM Experiment-Session
//                    WHERE Patient IN (SELECT id FROM Patient WHERE project_id = ?)
```

---

## Prevention Recommendations

### 1. Schema Documentation
Document all relationship paths in CLAUDE.md:
```markdown
## Database Relationships
- Project → Patient (direct FK)
- Patient → Experiment-Session (direct FK)
- Project → Experiment-Session (indirect via Patient)
```

### 2. Query Validation
Before adding Postgrest joins, verify FK exists:
```sql
SELECT
    tc.constraint_name,
    tc.table_name,
    kcu.column_name,
    ccu.table_name AS foreign_table_name
FROM information_schema.table_constraints AS tc
JOIN information_schema.key_column_usage AS kcu
  ON tc.constraint_name = kcu.constraint_name
WHERE tc.constraint_type = 'FOREIGN KEY';
```

### 3. Test with Actual Data
Always test Android queries against actual Supabase instance before release.

---

## Files Modified

### Modified
1. ✅ `android/app/src/main/java/com/handpose/app/data/SupabaseDataRepository.kt` (Line 68 removed)
2. ✅ `android/app/src/main/java/com/handpose/app/data/model/Project.kt` (Lines 91-92 removed, Line 108 updated)

### Created
1. ✅ `claudedocs/project_relationship_fix_2026-01-22.md` (This documentation)

### No Changes Required
- Backend delete operations (already working correctly)
- Patient queries (valid FK relationships)
- Database schema (no migration needed)

---

## Summary

**Problem**: Android app tried to join `Project-Table` directly to `Experiment-Session`, but no FK exists.

**Root Cause**: Misunderstanding of indirect relationship chain (Project → Patient → Experiment-Session).

**Solution**: Removed invalid join from Android queries; recording count no longer shown at project level.

**Testing**: Verify project detail view loads without crash; deletion works correctly.

**Status**: ✅ **FIXED** - Android app will now work correctly for project fetch and delete operations.

---

**Fix Completed By**: Claude Code (Sonnet 4.5)
**Fix Date**: 2026-01-22
**Methodology**: Relationship analysis, invalid join removal, documentation
**Tools Used**: Sequential thinking, schema analysis, code modification
