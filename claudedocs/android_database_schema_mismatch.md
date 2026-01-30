# Android Database Schema Mismatch - auth_user_id Missing

**Date**: 2026-01-21
**Issue**: Android app login fails with "column User-Main.auth_user_id does not exist"
**Severity**: 🔴 CRITICAL - Blocks all Android app authentication

---

## Error Details

**Error Message**:
```
io.github.jan.supabase.exceptions.BadRequestRestException: column User-Main.auth_user_id does not exist
URL: https://mtodevikkgraisalolkq.supabase.co/rest/v1/User-Main?auth_user_id=eq.112accc1-b1f8-4bf9-91f2-f62f77eaf710&select=%2A
```

**Authentication Flow**:
1. ✅ Supabase Auth successful → JWT token issued for `admin@synaptihand.com`
2. ✅ Auth user ID retrieved: `112accc1-b1f8-4bf9-91f2-f62f77eaf710`
3. ❌ Database query fails → `auth_user_id` column doesn't exist in `User-Main` table
4. ❌ Login rejected → "User profile not found"

---

## Root Cause Analysis

### Android App Expectation

**File**: `app/src/main/java/com/handpose/app/data/model/User.kt:113-114`

The `SupabaseUserMain` data class expects:
```kotlin
@SerialName("auth_user_id")
val authUserId: String? = null
```

**File**: `app/src/main/java/com/handpose/app/auth/SupabaseAuthRepository.kt:270-285`

The `fetchUserProfile()` function queries by `auth_user_id`:
```kotlin
private suspend fun fetchUserProfile(authUserId: String): SupabaseUserMain? {
    return try {
        val result = postgrest.from("User-Main")
            .select(columns = Columns.ALL) {
                filter {
                    eq("auth_user_id", authUserId)  // ← COLUMN DOESN'T EXIST
                }
            }
            .decodeSingleOrNull<SupabaseUserMain>()
        result
    } catch (e: Exception) {
        Log.e(TAG, "Failed to fetch user profile", e)
        null
    }
}
```

### Actual Database Schema

**File**: `Web-Service/backend-node/prisma/schema.prisma:19-46`

The `User-Main` table **does NOT have** an `auth_user_id` column:
```prisma
model User {
  id                  String    @id @default(uuid()) @map("User_ID") @db.Uuid
  userType            String    @default("Clinician") @map("user_type") @db.Text
  firstName           String    @default("") @map("first_name") @db.VarChar
  middleName          String?   @default("") @map("middle__name") @db.VarChar
  lastName            String    @map("last_name") @db.VarChar
  birthDate           DateTime  @map("birth_date") @db.Date
  email               String    @unique @db.Text
  phoneNumber         String    @unique @map("phone_number") @db.Text
  institute           String    @map("Institute") @db.Text
  department          String    @map("Department") @db.Text
  verificationStatus  Boolean   @default(false) @map("Verification_status")
  approvalStatus      Boolean   @default(false) @map("Approval_status")
  createdAt           DateTime  @default(now()) @map("created_at") @db.Timestamptz
  deletedAt           DateTime? @map("deleted_at") @db.Timestamp
  approvedAt          DateTime? @map("Approved_at") @db.Timestamp
  rejectedAt          DateTime? @map("Rejected_at") @db.Timestamp
  verifiedAt          DateTime? @map("Verified_at") @db.Timestamp
  passwordHash        String    @map("passwordHash") @db.Text

  // ❌ NO auth_user_id COLUMN

  @@map("User-Main")
}
```

---

## Solution Options

### Option 1: Add `auth_user_id` Column to Database (RECOMMENDED)

This is the proper solution for integrating Supabase Auth with your User-Main table.

**Benefits**:
- Properly links Supabase Auth users to your User-Main profiles
- Matches the Android app's existing code expectations
- Enables dual authentication (Supabase Auth for Android, JWT for Web)

**Implementation Steps**:

#### 1.1 Update Prisma Schema

Add `auth_user_id` to the User model:

**File**: `Web-Service/backend-node/prisma/schema.prisma`

```prisma
model User {
  id                  String    @id @default(uuid()) @map("User_ID") @db.Uuid
  authUserId          String?   @unique @map("auth_user_id") @db.Uuid  // ← ADD THIS
  userType            String    @default("Clinician") @map("user_type") @db.Text
  firstName           String    @default("") @map("first_name") @db.VarChar
  // ... rest of fields ...

  @@map("User-Main")
}
```

#### 1.2 Create Migration

```bash
cd Web-Service/backend-node
npx prisma migrate dev --name add_auth_user_id_column
```

This will generate SQL like:
```sql
ALTER TABLE "User-Main"
ADD COLUMN "auth_user_id" UUID UNIQUE;
```

#### 1.3 Update Supabase Database

Apply the migration to your Supabase database:

```bash
npx prisma migrate deploy
```

Or manually in Supabase SQL Editor:
```sql
ALTER TABLE "User-Main"
ADD COLUMN "auth_user_id" UUID UNIQUE;

-- Create index for performance
CREATE INDEX idx_user_main_auth_user_id ON "User-Main"("auth_user_id");
```

#### 1.4 Populate Existing Users

If you have existing users that need Supabase Auth accounts:

**Option A**: Create Supabase Auth users for existing users
```sql
-- You'll need to create Supabase Auth users via their API
-- Then update User-Main with their auth_user_id
UPDATE "User-Main"
SET "auth_user_id" = '<supabase-auth-id>'
WHERE "email" = 'admin@synaptihand.com';
```

**Option B**: Update admin user manually
1. Login to Supabase dashboard
2. Go to Authentication → Users
3. Find the user with email `admin@synaptihand.com`
4. Copy their User ID: `112accc1-b1f8-4bf9-91f2-f62f77eaf710`
5. Run SQL:
```sql
UPDATE "User-Main"
SET "auth_user_id" = '112accc1-b1f8-4bf9-91f2-f62f77eaf710'
WHERE "email" = 'admin@synaptihand.com';
```

---

### Option 2: Modify Android App to Query by Email (QUICK FIX)

This is a temporary workaround that changes the Android app instead of the database.

**Benefits**:
- No database changes needed
- Works immediately with existing data

**Drawbacks**:
- Doesn't properly link Supabase Auth to User-Main
- Email must remain unique (already is in your schema)
- Less robust than having a dedicated foreign key

**Implementation**:

**File**: `app/src/main/java/com/handpose/app/auth/SupabaseAuthRepository.kt:270-285`

```kotlin
private suspend fun fetchUserProfile(authUserId: String): SupabaseUserMain? {
    return try {
        // Get email from current Supabase Auth session
        val session = auth.currentSessionOrNull()
        val email = session?.user?.email

        if (email == null) {
            Log.e(TAG, "No email in auth session")
            return null
        }

        Log.d(TAG, "Fetching user profile by email: $email")

        // Query by email instead of auth_user_id
        val result = postgrest.from("User-Main")
            .select(columns = Columns.ALL) {
                filter {
                    eq("email", email)  // ← CHANGE FROM auth_user_id TO email
                }
            }
            .decodeSingleOrNull<SupabaseUserMain>()

        result
    } catch (e: Exception) {
        Log.e(TAG, "Failed to fetch user profile", e)
        null
    }
}
```

**Also remove** `auth_user_id` from the data model:

**File**: `app/src/main/java/com/handpose/app/data/model/User.kt:113-114`

```kotlin
@Serializable
data class SupabaseUserMain(
    @SerialName("User_ID")
    val userId: String,
    val email: String,
    // ... other fields ...
    // REMOVE these two lines:
    // @SerialName("auth_user_id")
    // val authUserId: String? = null
) {
    // ... rest of class
}
```

---

## Recommended Solution: Option 1

**Rationale**:
1. **Proper Architecture**: Links Supabase Auth (used by Android) to User-Main profiles
2. **Future-Proof**: Enables dual authentication systems (Supabase for mobile, JWT for web)
3. **Data Integrity**: Uses foreign key relationship instead of relying on email matching
4. **No Code Changes**: Android app code is already correct, just needs the database column

---

## Testing After Fix

### Option 1 (Database Column Added):

1. **Verify column exists**:
```sql
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name = 'User-Main' AND column_name = 'auth_user_id';
```

2. **Verify admin user has auth_user_id**:
```sql
SELECT "User_ID", "email", "auth_user_id"
FROM "User-Main"
WHERE "email" = 'admin@synaptihand.com';
```

Expected result:
```
User_ID                              | email                    | auth_user_id
-------------------------------------|--------------------------|--------------------------------------
<some-uuid>                          | admin@synaptihand.com    | 112accc1-b1f8-4bf9-91f2-f62f77eaf710
```

3. **Test Android login**:
   - Open Android app
   - Enter credentials: `admin@synaptihand.com` / `<password>`
   - Should successfully authenticate and show projects screen

### Option 2 (Email-based Query):

1. **Rebuild Android APK**:
```bash
cd /home/shivam/Desktop/HandPose/android
./gradlew clean assembleDebug
```

2. **Install and test**:
```bash
./gradlew installDebug
# Open app and test login
```

---

## Expected Behavior (When Fixed)

**Login Flow**:
1. ✅ User enters credentials
2. ✅ Supabase Auth authenticates → returns JWT token
3. ✅ Android app extracts auth user ID (or email)
4. ✅ Query User-Main table by `auth_user_id` (or `email`)
5. ✅ User profile found and returned
6. ✅ Check approval status → approved users proceed
7. ✅ Navigate to Projects screen

**Logs** (successful login):
```
D/AuthViewModel: Attempting login for admin@synaptihand.com
D/SupabaseAuthRepo: Attempting login for admin@synaptihand.com
D/SupabaseAuthRepo: Auth successful, fetching user profile for 112accc1-b1f8-4bf9-91f2-f62f77eaf710
D/SupabaseAuthRepo: User profile found: System Administrator
I/SupabaseAuthRepo: Login successful for admin@synaptihand.com
I/AuthViewModel: Login successful for admin@synaptihand.com
```

---

## Additional Notes

**Current User Data**:
- Email: `admin@synaptihand.com`
- Supabase Auth ID: `112accc1-b1f8-4bf9-91f2-f62f77eaf710`
- User metadata includes: firstName="System", lastName="Administrator", userType="Admin"

**Why This Happened**:
The Android app was developed with the expectation of a Supabase Auth integration that uses `auth_user_id` as a foreign key linking Supabase Auth users to User-Main profiles. However, the database schema was never updated to include this column, causing a mismatch.

**Future Considerations**:
If you go with Option 1 (recommended), you should also update the user registration flow to:
1. Create Supabase Auth user
2. Insert into User-Main with `auth_user_id` set to the new auth user's ID
3. This ensures new users are properly linked from the start
