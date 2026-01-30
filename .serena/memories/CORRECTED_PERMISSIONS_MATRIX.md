# Corrected Role-Based Access Matrix

**Analysis Date:** 2026-01-21  
**Source:** Backend code analysis (controllers + routes)

## True Backend Permissions (Verified from Code)

| Feature | Admin | Clinician | Researcher | Patient |
|---------|-------|-----------|------------|---------|
| **User Management** | ✅ | ❌ | ❌ | ❌ |
| **Audit Logs** | ✅ | ❌ | ❌ | ❌ |
| **Patient Management** | ✅ | ✅ | ✅ | ❌ |
| **Recording Upload** | ✅ | ✅ | ✅ | ❌ |
| **Protocol Creation** | ✅ | ❌ | ✅ | ❌ |
| **Protocol Viewing** | ✅ | ✅ (public only) | ✅ (all) | ❌ |
| **Comparisons** | ✅ | ❌ | ✅ | ❌ |
| **Clinical Analysis** | ✅ | ✅ | ✅ | ❌ |

## Frontend permissions.ts Issues Found

### ❌ WRONG: Recording Upload Permissions
**Current (permissions.ts:108-112):**
```typescript
canUpload: (user: User | null | undefined) => {
  if (!user) return false;
  return isClinician(user);  // WRONG - too restrictive
}
```

**Backend Reality (recordings.controller.ts:40-120):**
- Route: `POST /api/recordings` with `authMiddleware` only
- No role restrictions in controller
- Comment says "Clinicians can create recordings" but NO enforcement
- ANY authenticated user can upload

**Fix:**
```typescript
canUpload: (user: User | null | undefined) => {
  if (!user) return false;
  return isAdmin(user) || isClinician(user) || isResearcher(user);
}
```

### ❌ MISSING: Patient Management Permissions
**Current:** No `patientPermissions` export in permissions.ts

**Backend Reality (patient.controller.ts:210-350):**
- Route: `POST /patients/project/:projectId` with `authMiddleware` only
- Access check: Project creator OR project member
- NO role restrictions - any project member can create patients

**Fix:** Add new export
```typescript
export const patientPermissions = {
  canCreate: (user: User | null | undefined) => {
    if (!user) return false;
    // Any authenticated user who is a project member
    return isAdmin(user) || isClinician(user) || isResearcher(user);
  },
  canEdit: (user: User | null | undefined) => {
    if (!user) return false;
    return isAdmin(user) || isClinician(user) || isResearcher(user);
  },
  canDelete: (user: User | null | undefined) => {
    if (!user) return false;
    return isAdmin(user) || isClinician(user) || isResearcher(user);
  },
  canView: (user: User | null | undefined) => {
    if (!user) return false;
    return isAdmin(user) || isClinician(user) || isResearcher(user);
  }
};
```

## Backend Permission Enforcement Gaps

### ⚠️ Security Issue: No Role Check on Recording Upload
**File:** `Web-Service/backend-node/src/controllers/recordings.controller.ts:40-120`

**Current:**
- NO role validation
- Comment says "Clinicians can create recordings" but not enforced

**Recommendation:**
Add role check in controller OR add `requireRole([UserRole.CLINICIAN, UserRole.RESEARCHER, UserRole.ADMIN])` middleware to route.

### ⚠️ Security Issue: No Role Check on Patient Creation
**File:** `Web-Service/backend-node/src/controllers/patient.controller.ts:280-350`

**Current:**
- Only checks project membership
- NO role validation
- Any project member (including patients if they were members) could create patients

**Recommendation:**
Add role check to exclude PATIENT role from creating patients.

## Corrected Matrix Explanation

### Patient Management (Admin ✅ | Clinician ✅ | Researcher ✅)
**Why All Roles:**
- Backend only checks project membership, not role
- Clinicians manage patients clinically
- Researchers add patients to studies
- Admins have full access

### Recording Upload (Admin ✅ | Clinician ✅ | Researcher ✅)
**Why All Roles:**
- Backend has NO role restrictions (security gap!)
- Clinicians upload clinical recordings
- Researchers upload experimental data
- Admins have full access

**Note:** Frontend currently blocks researchers from uploading, creating user confusion.

### Protocol Viewing (Clinician: public only)
**Current Behavior:**
- Admin-created public protocols: visible to everyone
- Researcher-created protocols: visible only to creator + admins
- Clinicians see ONLY admin-created public protocols

**This is CORRECT** - clinicians are consumers of protocols, not creators.

## Action Items

1. **Fix permissions.ts** - Update recording and patient permissions
2. **Add backend role checks** - Enforce role restrictions in controllers
3. **Update frontend components** - Allow researchers to upload recordings
4. **Update documentation** - Reflect true permissions in CLAUDE.md
5. **Add E2E tests** - Verify role-based access enforcement
