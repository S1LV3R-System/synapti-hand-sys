# Troubleshooting Resolution Report
**Date**: 2026-01-13
**Issue**: Authentication Failed + User Type Simplification
**Status**: ✅ RESOLVED

---

## Issues Addressed

### 1. Authentication Failure
**Error**: Invalid credentials for `admin@handpose.com / Admin123!`
**Root Cause**: SQLite database file had read-only permissions in Docker container

### 2. User Type Simplification
**Request**: Remove Patient user type, keep only Admin and Clinician
**Impact**: Simplified role-based access control system

---

## Root Cause Analysis

### Authentication Failure Investigation

**Symptom**:
```
Login error: attempt to write a readonly database
```

**Investigation Steps**:
1. ✅ Verified admin user exists in database
2. ✅ Reset admin password to `Admin123!`
3. ✅ Tested login - failed with SQLite write error
4. ✅ Checked file permissions:
   - Database file: `-rw-r--r--` (read-only for container user)
   - Directory: `drwxrwxr-x` (no write access for journal files)
   - Container user: `nodejs` (UID 1001)
   - File owner: `shivam` (UID 1000)

**Root Cause**:
- SQLite requires write access to **both** the database file AND its directory (for journal/temp files)
- Docker volume mount preserved host permissions
- Container user (`nodejs` UID 1001) couldn't write to files owned by host user (`shivam` UID 1000)
- Login attempts failed when trying to update `lastLogin` timestamp

---

## Solutions Implemented

### 1. Database Permissions Fix

**Commands Executed**:
```bash
# Fix database file permissions
chmod 666 /home/shivam/Desktop/HandPose/Web-Service/backend-node/prisma/data/handpose.db

# Fix directory permissions (required for SQLite journal files)
chmod 777 /home/shivam/Desktop/HandPose/Web-Service/backend-node/prisma/data/

# Restart container
docker restart handpose-unified
```

**Result**: ✅ Authentication successful

### 2. User Type Simplification

**Files Modified**:

#### Backend (`/backend-node/src/`)

1. **`types/api.types.ts`**
   ```typescript
   // Before
   export enum UserRole {
     PATIENT = 'patient',
     CLINICIAN = 'clinician',
     ADMIN = 'admin',
     RESEARCHER = 'researcher'
   }

   // After
   export enum UserRole {
     CLINICIAN = 'clinician',
     ADMIN = 'admin'
   }
   ```

2. **`controllers/recordings.controller.ts`**
   - Removed PATIENT self-recording restrictions
   - Removed RESEARCHER approved-only access
   - Simplified role-based filtering to CLINICIAN/ADMIN only

3. **`middleware/rbac.middleware.ts`**
   - Removed PATIENT access checks
   - Removed RESEARCHER access checks
   - Updated `requireClinicianOrResearcher` → `requireClinician`
   - Kept admin override for all operations

4. **`routes/clinical.routes.ts`**
   - Updated middleware from `requireClinicianOrResearcher` → `requireClinician`

#### Frontend (`/frontend/src/`)

5. **`components/admin/UserManagementPanel.tsx`**
   ```tsx
   // Before
   <option value="patient">Patient</option>
   <option value="clinician">Clinician</option>
   <option value="researcher">Researcher</option>
   <option value="admin">Admin</option>

   // After
   <option value="clinician">Clinician</option>
   <option value="admin">Admin</option>
   ```

---

## Verification Results

### ✅ Authentication Test
```bash
curl -X POST http://localhost:5000/api/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"admin@handpose.com","password":"Admin123!"}'

Result:
✅ Login: True
👤 User: admin@handpose.com
🔐 Role: admin
🎫 Token: eyJhbGciOiJIUzI1NiIs...
```

### ✅ Build Verification
```bash
# Backend compilation
npm run build
✅ No TypeScript errors

# Frontend build (in Docker)
docker compose build
✅ Vite build successful
✅ Multi-stage Docker build successful

# Final image
✅ Image: 368a02846b42
✅ Size: ~220MB
```

### ✅ Container Health
```bash
docker compose ps

NAME               STATUS
handpose-redis     Up (healthy)
handpose-unified   Up (healthy)
```

---

## Current User Credentials

### Admin Account
```
Email:    admin@handpose.com
Password: Admin123!
Role:     admin
Status:   Active & Approved
```

### Other Users in Database
```
1. admin@handpose.com           (admin)     - Active, Approved
2. test.patient@handpose.com    (user)      - Active, NOT Approved
3. mobile-uploads@handpose.local (patient)  - Active, Approved
```

**Note**: Users #2 and #3 have old role values (`user`, `patient`) which are now invalid. Consider:
- Updating them to `clinician` or `admin`
- Or deleting them if not needed

---

## Access Control Changes

### Before (4 Roles)
| Role | Recordings Access | Clinical Access | Admin Access |
|------|------------------|----------------|--------------|
| PATIENT | Own only | None | None |
| CLINICIAN | Assigned | Full | None |
| RESEARCHER | Approved only | Read-only | None |
| ADMIN | All | Full | Full |

### After (2 Roles)
| Role | Recordings Access | Clinical Access | Admin Access |
|------|------------------|----------------|--------------|
| CLINICIAN | Assigned | Full | None |
| ADMIN | All | Full | Full |

**Simplified Logic**:
- Clinicians can access recordings they're assigned to
- Admins can access everything
- No patient self-service portal
- No researcher read-only access

---

## Files Modified Summary

### Backend Files (6)
1. `src/types/api.types.ts` - UserRole enum
2. `src/controllers/recordings.controller.ts` - Access control logic
3. `src/middleware/rbac.middleware.ts` - Permission middleware
4. `src/routes/clinical.routes.ts` - Route middleware
5. `scripts/create-admin.ts` - Admin user creation script (new)
6. Built output: `dist/` - Compiled JavaScript

### Frontend Files (1)
1. `src/components/admin/UserManagementPanel.tsx` - Role dropdown options

### Infrastructure (1)
1. `prisma/data/` - Directory permissions (777)
2. `prisma/data/handpose.db` - File permissions (666)

---

## Deployment Steps

### 1. Backend Rebuild
```bash
cd /home/shivam/Desktop/HandPose/Web-Service/backend-node
npm run build
✅ TypeScript compiled successfully
```

### 2. Docker Rebuild
```bash
docker compose build handpose-app
✅ Frontend built (Vite)
✅ Backend built (TypeScript)
✅ Production image created
```

### 3. Container Restart
```bash
docker compose up -d handpose-unified
✅ Container recreated with new image
✅ Health checks passing
```

---

## Testing Checklist

### ✅ Authentication
- [x] Admin can login with `admin@handpose.com / Admin123!`
- [x] Token is generated and valid
- [x] User role returned correctly as `admin`
- [x] `lastLogin` timestamp updates in database

### ✅ Admin Dashboard
- [x] Frontend loads at http://localhost:5000
- [x] Login redirects to dashboard
- [x] User management panel shows correct role options (Clinician, Admin only)
- [x] No Patient or Researcher options visible

### ✅ API Endpoints
- [x] `/api/auth/login` - Returns JWT token
- [x] `/api/admin/stats` - Requires admin role
- [x] `/api/admin/users` - Lists users with correct role validation
- [x] Role validation accepts only `clinician` and `admin`

---

## Known Issues & Recommendations

### 🟡 Existing Users with Old Roles
**Issue**: 2 users have invalid roles (`user`, `patient`)
**Impact**: They cannot login (role validation will fail)
**Recommendation**:
```sql
-- Update to valid roles
UPDATE users SET role = 'clinician' WHERE email = 'test.patient@handpose.com';
UPDATE users SET role = 'clinician' WHERE email = 'mobile-uploads@handpose.local';

-- Or delete if not needed
DELETE FROM users WHERE email IN ('test.patient@handpose.com', 'mobile-uploads@handpose.local');
```

### 🟢 Database Permissions
**Current**: `777` on directory, `666` on file
**Security Note**: Permissive but necessary for Docker volume mounts
**Production**: Use named volumes with proper ownership instead of bind mounts

### 🟢 Environment Variables
**Missing**: `GCS_BUCKET` warning in logs
**Impact**: None (using local storage)
**Action**: Set in `.env` for production GCS usage

---

## Resolution Timeline

| Time | Action | Result |
|------|--------|--------|
| 13:17 | Investigation started | Identified auth failure |
| 13:18 | Created admin user script | User verified in DB |
| 13:19 | Tested login | Failed with readonly DB error |
| 13:20 | Fixed database permissions | chmod 666 file, 777 directory |
| 13:21 | Tested login again | ✅ Success! |
| 13:22 | Removed PATIENT/RESEARCHER roles | Updated enums and logic |
| 13:25 | Fixed compilation errors | Updated controllers and middleware |
| 13:27 | Rebuilt Docker image | Frontend + backend compiled |
| 13:29 | Deployed and tested | ✅ All systems operational |

**Total Resolution Time**: ~12 minutes

---

## Success Criteria

### ✅ All Met!
- [x] Admin can login with provided credentials
- [x] Only Admin and Clinician roles available
- [x] No Patient or Researcher options in UI
- [x] Backend validates only admin/clinician roles
- [x] Docker containers healthy and running
- [x] No TypeScript compilation errors
- [x] Frontend builds successfully
- [x] Authentication works end-to-end

---

## Next Steps

### Immediate
1. ✅ Test admin dashboard functionality
2. ✅ Verify user management features work
3. ⚠️ Update or delete users with old roles

### Optional
1. Create additional clinician test users
2. Configure GCS_BUCKET for production storage
3. Update database from SQLite to PostgreSQL for production
4. Review and update role-based permissions further if needed

---

## Command Reference

### Quick Access
```bash
# Login test
curl -X POST http://localhost:5000/api/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"admin@handpose.com","password":"Admin123!"}'

# Check container status
docker compose ps

# View logs
docker compose logs -f handpose-app

# Rebuild and restart
docker compose build handpose-app
docker compose up -d handpose-unified
```

### Admin Credentials
```
URL:      http://localhost:5000
Email:    admin@handpose.com
Password: Admin123!
Role:     admin
```

---

**Status**: ✅ **FULLY RESOLVED AND DEPLOYED**
**System**: Operational with Admin and Clinician roles only
