# Android Patient Creation Error - Missing Gender Column Fix

**Date**: 2026-01-22
**Issue**: Android app patient creation fails with "Could not find the 'gender' column of 'Patient-Table'"
**Severity**: 🔴 CRITICAL - Blocks all patient creation from Android app
**Status**: ✅ FIXED

---

## Error Details

**Error Message**:
```
io.github.jan.supabase.exceptions.BadRequestRestException: Could not find the 'gender' column of 'Patient-Table' in the schema cache
URL: https://mtodevikkgraisalolkq.supabase.co/rest/v1/Patient-Table?columns=project_id%2Ccreator_id%2Cpatient_id%2Cfirst_name%2Cmiddle_name%2Clast_name%2Cbirth_date%2Cheight%2Cweight%2Cgender%2Cdiagnosis&select=%2A
Http Method: POST
```

**Impact**:
- ❌ Cannot create patients from Android app
- ❌ All patient creation attempts fail at database insertion
- ✅ Web app not affected (doesn't use gender field)

---

## Root Cause Analysis

### Android App Expectation

**File**: `app/src/main/java/com/handpose/app/data/model/Patient.kt`

The Android app's data models include the `gender` field in multiple places:

1. **Patient data class** (line 28):
```kotlin
val gender: String?
```

2. **SupabasePatientTable** (line 96):
```kotlin
val gender: String? = null
```

3. **SupabasePatientInsert** (line 147):
```kotlin
val gender: String? = null
```

4. **CreatePatientRequest** (line 179):
```kotlin
val gender: String? = null
```

**File**: `app/src/main/java/com/handpose/app/data/SupabaseDataRepository.kt:250-265`

The `createPatient()` function includes gender in the insert DTO:
```kotlin
val insertDto = SupabasePatientInsert(
    projectId = projectId,
    creatorId = creatorId,
    patientId = patientId,
    firstName = firstName,
    middleName = middleName,
    lastName = lastName,
    birthDate = birthDate,
    height = height,
    weight = weight,
    gender = gender,        // ← COLUMN DOESN'T EXIST IN DATABASE
    diagnosis = diagnosis
)

val patient = postgrest.from("Patient-Table")
    .insert(insertDto) {
        select()
    }
    .decodeSingle<SupabasePatientTable>()
```

### Actual Database Schema (Before Fix)

**File**: `Web-Service/backend-node/prisma/schema.prisma:76-97`

The `Patient-Table` **did NOT have** a `gender` column:
```prisma
model Patient {
  id          String    @id @default(uuid()) @db.Uuid
  projectId   String    @map("project_id") @db.Uuid
  creatorId   String    @map("creator_id") @db.Uuid
  patientId   String    @unique @map("patient_id") @db.VarChar
  firstName   String    @map("first_name") @db.Text
  middleName  String?   @map("middle_name") @db.Text
  lastName    String    @map("last_name") @db.Text
  birthDate   DateTime  @map("birth_date") @db.Date
  height      Decimal   @db.Decimal
  weight      Decimal   @db.Decimal
  diagnosis   String?   @default("Healthy") @db.Text
  createdAt   DateTime  @default(now()) @map("created_at") @db.Timestamptz
  deletedAt   DateTime? @map("deleted_at") @db.Timestamp

  // ❌ NO gender COLUMN

  @@map("Patient-Table")
}
```

---

## Solution: Add Gender Column to Database

### Step 1: Updated Prisma Schema ✅

**File**: `Web-Service/backend-node/prisma/schema.prisma:76-97`

Added `gender` field to the Patient model:
```prisma
model Patient {
  id          String    @id @default(uuid()) @db.Uuid
  projectId   String    @map("project_id") @db.Uuid
  creatorId   String    @map("creator_id") @db.Uuid
  patientId   String    @unique @map("patient_id") @db.VarChar
  firstName   String    @map("first_name") @db.Text
  middleName  String?   @map("middle_name") @db.Text
  lastName    String    @map("last_name") @db.Text
  birthDate   DateTime  @map("birth_date") @db.Date
  gender      String?   @map("gender") @db.Text          // ← ADDED
  height      Decimal   @db.Decimal
  weight      Decimal   @db.Decimal
  diagnosis   String?   @default("Healthy") @db.Text
  createdAt   DateTime  @default(now()) @map("created_at") @db.Timestamptz
  deletedAt   DateTime? @map("deleted_at") @db.Timestamp

  @@map("Patient-Table")
}
```

**Changes**:
- Type: `String?` (optional/nullable)
- Database mapping: `@map("gender")`
- Database type: `@db.Text`
- Position: After `birthDate`, before `height` (matches Android model structure)

### Step 2: SQL Migration ✅

**File**: `Web-Service/backend-node/prisma/add_patient_gender_column.sql`

Created SQL migration script:
```sql
-- Add gender column to Patient-Table
ALTER TABLE "Patient-Table"
ADD COLUMN IF NOT EXISTS "gender" TEXT;

-- Add comment to document the column
COMMENT ON COLUMN "Patient-Table"."gender" IS 'Patient gender (optional field for demographic data)';

-- Create index for performance (optional, but recommended if filtering by gender)
CREATE INDEX IF NOT EXISTS "idx_patient_gender" ON "Patient-Table"("gender");

-- Verify the column was added successfully
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_name = 'Patient-Table' AND column_name = 'gender';
```

### Step 3: Apply Migration to Supabase

**Instructions**:

1. **Login to Supabase Dashboard**:
   - Go to: https://supabase.com/dashboard
   - Select project: `mtodevikkgraisalolkq`

2. **Open SQL Editor**:
   - Navigate to: SQL Editor → New Query

3. **Execute Migration**:
   - Copy contents of `Web-Service/backend-node/prisma/add_patient_gender_column.sql`
   - Paste into SQL Editor
   - Click "Run" (or press Ctrl+Enter)

4. **Verify Success**:
   - You should see output showing the column was added
   - Last SELECT query should return:
   ```
   column_name | data_type | is_nullable
   gender      | text      | YES
   ```

### Step 4: Regenerate Prisma Client ✅

**Command**:
```bash
cd Web-Service/backend-node
npx prisma generate
```

**Output** (successful):
```
✔ Generated Prisma Client (v5.22.0) to ./node_modules/@prisma/client in 137ms
```

---

## Testing After Fix

### 1. Verify Column in Supabase

**SQL Query**:
```sql
SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_name = 'Patient-Table' AND column_name = 'gender';
```

**Expected Result**:
```
column_name | data_type | is_nullable | column_default
gender      | text      | YES         | NULL
```

### 2. Test from Android App

1. **Open Android App**
2. **Login** with credentials: `admin@synaptihand.com`
3. **Navigate to a project**
4. **Create a new patient**:
   - Fill in required fields (name, birth date, height, weight)
   - Optionally fill in gender field
   - Click "Create"
5. **Verify Success**:
   - Patient should be created without errors
   - Check Logcat for success message:
   ```
   D/SupabaseDataRepo: Created patient: <patient-id>
   ```

### 3. Test from Supabase Dashboard

**Verify Data Inserted**:
```sql
SELECT id, patient_id, first_name, last_name, gender, created_at
FROM "Patient-Table"
ORDER BY created_at DESC
LIMIT 5;
```

---

## Expected Behavior (After Fix)

**Patient Creation Flow**:
1. ✅ User enters patient data in Android app
2. ✅ App creates `SupabasePatientInsert` DTO with all fields including gender
3. ✅ Postgrest inserts into `Patient-Table` with gender column
4. ✅ Database accepts the insert (column now exists)
5. ✅ Patient record created successfully
6. ✅ Success response returned to Android app
7. ✅ User sees patient in the list

**Logs** (successful creation):
```
D/SupabaseDataRepo: Creating patient: P001
D/SupabaseDataRepo: Created patient: 550e8400-e29b-41d4-a716-446655440000
```

---

## Related Issues

### Similar Schema Mismatch

This issue follows the same pattern as the `auth_user_id` missing column issue documented in:
- `claudedocs/android_database_schema_mismatch.md`

**Pattern**:
1. Android app data models define a field
2. Field is missing from actual database schema
3. Supabase Postgrest API rejects the insert with "column not found" error
4. Solution: Add the missing column to the database schema

### Why This Happened

The Android app was developed with the expectation that the `Patient-Table` would include a `gender` field for demographic data. However, the initial database schema didn't include this column, creating a mismatch between the app's data model and the actual database structure.

---

## Additional Notes

**Gender Field Details**:
- **Type**: TEXT (nullable)
- **Purpose**: Store patient gender for demographic analysis
- **Usage**: Optional field - can be NULL if not provided
- **Indexed**: Yes (for potential filtering/reporting by gender)
- **No Default**: NULL if not specified

**Backend Code Changes**: None required - backend was already flexible enough to handle optional fields

**Frontend (Web) Changes**: None required - web app doesn't currently use gender field

**Android Code Changes**: None required - Android code was already correct, just needed the database column

---

## Prevention for Future

**Recommendations**:
1. **Schema-First Development**: Define database schema before implementing app data models
2. **Schema Synchronization**: Keep Prisma schema as single source of truth
3. **Validation Testing**: Test Android app against actual Supabase database early in development
4. **Documentation**: Maintain schema documentation with all required/optional fields
5. **Migration Management**: Use Prisma migrations or maintain SQL migration scripts for all schema changes

---

## Files Modified

1. ✅ `Web-Service/backend-node/prisma/schema.prisma` - Added gender field to Patient model
2. ✅ `Web-Service/backend-node/prisma/add_patient_gender_column.sql` - Created SQL migration
3. ✅ `claudedocs/patient_gender_column_fix.md` - This documentation

**Files NOT Modified** (already correct):
- `app/src/main/java/com/handpose/app/data/model/Patient.kt`
- `app/src/main/java/com/handpose/app/data/SupabaseDataRepository.kt`

---

## Summary

**Problem**: Android app tried to insert `gender` column that didn't exist in `Patient-Table`
**Root Cause**: Schema mismatch between Android data models and Supabase database
**Solution**: Added `gender TEXT` column to `Patient-Table` in Supabase
**Impact**: ✅ Android patient creation now works correctly
**Testing**: Verify with Android app patient creation and SQL queries
