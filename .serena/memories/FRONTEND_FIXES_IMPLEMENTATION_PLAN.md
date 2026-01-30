# Frontend Fixes Implementation Plan

**Created:** 2026-01-21  
**Status:** In Progress

## Completed Fixes ✅

### 1. Role-Based Access Matrix Correction
**File:** `Web-Service/frontend/src/utils/permissions.ts`

**Changes Made:**
- Added `patientPermissions` export with proper CRUD permissions
- Updated `recordingPermissions.canUpload` to allow researchers and admins (not just clinicians)
- Updated `recordingPermissions.canEdit` to allow researchers
- Updated `recordingPermissions.canDelete` to allow researchers

**Result:** Frontend now matches backend permissions truth

### 2. Comparison Modal Verification
**File:** `Web-Service/frontend/src/pages/comparisons/CreateComparisonModal.tsx`

**Analysis:**
- Component IS functional (uses `useRecordings` hook for real data)
- "Placeholder" comment (line 96) is misleading - refers to simplified metric calculation logic
- No changes needed - component is 100% functional

**Result:** No placeholder data found - component works correctly

## Pending Fixes 📋

### 3. Email Functionality Implementation (MEDIUM PRIORITY)
**File:** `Web-Service/frontend/src/pages/admin/UserManagement/UserListTable.tsx:147`

**Current State:**
```typescript
{
  key: 'email',
  label: 'Send Email',
  icon: <MailOutlined />,
  disabled: true, // TODO: Implement email functionality
}
```

**Implementation Plan:**
1. Add backend endpoint: `POST /api/admin/users/:id/send-email`
2. Create `adminService.sendEmail(userId, { subject, body })`
3. Add email compose modal in UserListTable
4. Enable menu item and wire up to modal
5. Add email templates for common scenarios (welcome, rejection, info request)

**Backend Requirement:**
- Email service integration (NodeMailer or similar)
- Email templates
- Rate limiting to prevent abuse

### 4. Video Placeholder Image (LOW PRIORITY)
**File:** `Web-Service/frontend/src/pages/recordings/RecordingDetail.tsx:81`

**Current:**
```typescript
<video poster="/video-placeholder.png" />
```

**Solution:**
1. Create placeholder image (1920x1080 recommended)
2. Add to `public/` directory
3. Or use inline SVG/data URI for self-contained solution

**Recommended Implementation:**
```typescript
// Inline SVG placeholder (no external file needed)
const videoPlaceholder = `data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='1920' height='1080'%3E%3Crect fill='%23f0f0f0' width='1920' height='1080'/%3E%3Ctext x='50%25' y='50%25' text-anchor='middle' fill='%23999' font-size='48' font-family='Arial'%3ELoading Video...%3C/text%3E%3C/svg%3E`;

<video poster={videoPlaceholder} />
```

### 5. Backend Role Enforcement (HIGH PRIORITY - SECURITY)
**Files:**
- `Web-Service/backend-node/src/routes/recordings.routes.ts`
- `Web-Service/backend-node/src/routes/patient.routes.ts`
- `Web-Service/backend-node/src/controllers/recordings.controller.ts`
- `Web-Service/backend-node/src/controllers/patient.controller.ts`

**Security Gaps Identified:**
1. **Recording Upload**: No role check (any authenticated user can upload)
2. **Patient Creation**: No role check (any project member can create)

**Fix Strategy:**

**Option A: Add Middleware (Recommended)**
```typescript
// recordings.routes.ts
router.post(
  '/',
  authMiddleware,
  requireRole([UserRole.ADMIN, UserRole.CLINICIAN, UserRole.RESEARCHER]),
  validate(createRecordingSchema),
  createRecording
);

// patient.routes.ts
router.post(
  '/project/:projectId',
  authMiddleware,
  requireRole([UserRole.ADMIN, UserRole.CLINICIAN, UserRole.RESEARCHER]),
  createPatient
);
```

**Option B: Controller-Level Check**
```typescript
// recordings.controller.ts - createRecording
const userRole = req.user!.role;
if (![UserRole.ADMIN, UserRole.CLINICIAN, UserRole.RESEARCHER].includes(userRole)) {
  return res.status(403).json({
    success: false,
    message: 'Only admins, clinicians, and researchers can create recordings'
  });
}
```

**Recommended:** Option A (middleware) - cleaner separation of concerns

### 6. Security Hardening (HIGH PRIORITY)

#### 6.1 Rate Limiting
**File:** `Web-Service/backend-node/src/index.ts`

```typescript
import rateLimit from 'express-rate-limit';

// Auth endpoints rate limiter
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // 5 requests per window
  message: 'Too many login attempts, please try again later',
  standardHeaders: true,
  legacyHeaders: false,
});

// Apply to auth routes
app.use('/api/auth/login', authLimiter);
app.use('/api/auth/register', authLimiter);

// General API limiter
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  message: 'Too many requests, please try again later',
});

app.use('/api/', apiLimiter);
```

#### 6.2 File Upload Validation (Server-Side)
**File:** `Web-Service/backend-node/src/controllers/mobile.controller.ts`

```typescript
const ALLOWED_VIDEO_TYPES = ['video/mp4', 'video/webm', 'video/quicktime'];
const ALLOWED_CSV_TYPES = ['text/csv', 'application/vnd.ms-excel'];
const MAX_VIDEO_SIZE = 500 * 1024 * 1024; // 500MB

export const validateFileUpload = (req: AuthRequest, res: Response, next: NextFunction) => {
  const { contentType, contentLength } = req.body;
  
  // Validate file type
  if (!ALLOWED_VIDEO_TYPES.includes(contentType) && !ALLOWED_CSV_TYPES.includes(contentType)) {
    return res.status(400).json({
      success: false,
      message: 'Invalid file type. Only MP4, WebM, QuickTime videos and CSV files are allowed.'
    });
  }
  
  // Validate file size
  if (contentLength > MAX_VIDEO_SIZE) {
    return res.status(400).json({
      success: false,
      message: `File too large. Maximum size is ${MAX_VIDEO_SIZE / 1024 / 1024}MB`
    });
  }
  
  next();
};
```

#### 6.3 HttpOnly Cookies for Tokens (OPTIONAL - Breaking Change)
**Current:** JWT stored in localStorage (XSS risk)
**Better:** HttpOnly cookies (CSRF protection needed)

**Implementation:**
```typescript
// backend: Set cookie instead of returning token
res.cookie('auth_token', token, {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'strict',
  maxAge: 7 * 24 * 60 * 60 * 1000 // 7 days
});

// frontend: Remove localStorage token management
// axios automatically sends cookies
```

**Note:** This requires CSRF protection. Recommend keeping current implementation unless CSRF tokens are added.

### 7. Error Boundaries (MEDIUM PRIORITY)
**Files to Create:**
- `Web-Service/frontend/src/components/ErrorBoundary.tsx`
- `Web-Service/frontend/src/components/RouteErrorBoundary.tsx`

**Implementation:**
```typescript
// ErrorBoundary.tsx
import React, { Component, ErrorInfo, ReactNode } from 'react';
import { Result, Button } from 'antd';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error?: Error;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Error boundary caught:', error, errorInfo);
    // TODO: Send to error tracking service (Sentry)
  }

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      return (
        <Result
          status="error"
          title="Something went wrong"
          subTitle={this.state.error?.message || 'An unexpected error occurred'}
          extra={
            <Button type="primary" onClick={() => window.location.reload()}>
              Reload Page
            </Button>
          }
        />
      );
    }

    return this.props.children;
  }
}

// Usage in App.tsx
<ErrorBoundary>
  <QueryClientProvider client={queryClient}>
    <ConfigProvider theme={antdTheme}>
      <BrowserRouter>
        <Routes>
          {/* routes */}
        </Routes>
      </BrowserRouter>
    </ConfigProvider>
  </QueryClientProvider>
</ErrorBoundary>
```

### 8. E2E Test Suite (HIGH PRIORITY)
**Location:** `Web-Service/e2e/`

**Tests Needed:**
1. **Role-Based Access Tests:**
   - `role-permissions.spec.ts` - Verify each role can/cannot access features
   - Test admin dashboard access (admin only)
   - Test recording upload (clinician, researcher, admin)
   - Test patient creation (clinician, researcher, admin)
   - Test protocol creation (researcher, admin)
   - Test comparisons (researcher, admin)

2. **Frontend Flow Tests:**
   - `recording-upload-flow.spec.ts` - Complete upload workflow
   - `patient-management-flow.spec.ts` - Create → view → edit → delete
   - `protocol-creation-flow.spec.ts` - Full protocol creation
   - `comparison-creation-flow.spec.ts` - Baseline → compared → create

3. **Navigation Tests:**
   - `navigation-links.spec.ts` - Verify no broken links
   - Test all menu items navigate correctly
   - Test role-based menu visibility
   - Test breadcrumbs and back navigation

**Example Test:**
```typescript
// role-permissions.spec.ts
import { test, expect } from '@playwright/test';

test.describe('Role-Based Permissions', () => {
  test('Clinician can upload recordings', async ({ page }) => {
    // Login as clinician
    await page.goto('/login');
    await page.fill('[name="email"]', 'clinician@test.com');
    await page.fill('[name="password"]', 'password123');
    await page.click('button[type="submit"]');

    // Navigate to recording upload
    await page.click('a[href="/recordings/upload"]');
    await expect(page).toHaveURL('/recordings/upload');
    
    // Verify upload form is visible
    await expect(page.locator('form')).toBeVisible();
  });

  test('Researcher can upload recordings', async ({ page }) => {
    await page.goto('/login');
    await page.fill('[name="email"]', 'researcher@test.com');
    await page.fill('[name="password"]', 'password123');
    await page.click('button[type="submit"]');

    await page.click('a[href="/recordings/upload"]');
    await expect(page).toHaveURL('/recordings/upload');
    await expect(page.locator('form')).toBeVisible();
  });

  test('Clinician cannot access comparisons', async ({ page }) => {
    await page.goto('/login');
    await page.fill('[name="email"]', 'clinician@test.com');
    await page.fill('[name="password"]', 'password123');
    await page.click('button[type="submit"]');

    // Should not see comparisons in menu
    await expect(page.locator('a[href="/comparisons"]')).not.toBeVisible();

    // Direct navigation should be blocked
    await page.goto('/comparisons');
    await expect(page.locator('text=Access Denied')).toBeVisible();
  });
});
```

### 9. Frontend Audit (HIGH PRIORITY)
**Tasks:**
1. Find all empty links (`href="#"` or `href=""`)
2. Find all broken navigation
3. Verify all routes in App.tsx have corresponding pages
4. Check for console errors during navigation
5. Verify all forms submit correctly
6. Check all API calls return proper responses

**Audit Script:**
```bash
# Find empty links
grep -r 'href="#"' Web-Service/frontend/src/
grep -r 'href=""' Web-Service/frontend/src/
grep -r 'href="javascript:void(0)"' Web-Service/frontend/src/

# Find TODO/FIXME comments
grep -r "TODO\|FIXME\|HACK\|XXX" Web-Service/frontend/src/ --exclude-dir=node_modules

# Find console.log (should be removed in production)
grep -r "console\.log" Web-Service/frontend/src/ --exclude-dir=node_modules
```

### 10. Documentation Updates
**Files to Update:**
- `Web-Service/CLAUDE.md` - Add corrected permissions matrix
- `Web-Service/frontend/README.md` - Document role-based access
- `claudedocs/FRONTEND_ANALYSIS_COMPREHENSIVE.md` - Update with fixes

## Implementation Order (Priority)

### Phase 1: Security (HIGH)
1. ✅ Fix permissions.ts (COMPLETED)
2. ⏳ Add backend role enforcement (recordings, patients)
3. ⏳ Implement rate limiting
4. ⏳ Add server-side file validation

### Phase 2: Functionality (MEDIUM)
5. ⏳ Implement email functionality
6. ⏳ Add error boundaries
7. ⏳ Add video placeholder image

### Phase 3: Quality Assurance (HIGH)
8. ⏳ Frontend audit (empty links, broken navigation)
9. ⏳ E2E test suite
10. ⏳ Documentation updates

## Next Steps

1. Implement backend role enforcement middleware
2. Add rate limiting to auth endpoints
3. Add file validation middleware
4. Run frontend audit
5. Create E2E tests for role-based access
6. Update documentation

## Blocked Items

- Email functionality: Requires backend email service setup (NodeMailer)
- HttpOnly cookies: Requires CSRF protection implementation (deferred)
