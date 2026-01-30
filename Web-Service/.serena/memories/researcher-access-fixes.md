# Researcher Access Control Fixes - Status

## Fixes Applied to Source Code ✅
1. **CSP Cloudflare Challenge Scripts** - DONE
   - File: backend-node/src/index.ts (lines 40-52)
   - Added: `'https://app.synaptihand.com/cdn-cgi'` to scriptSrc and connectSrc
   - Reason: Researcher dashboard blocked by CSP on Cloudflare challenge platform

2. **Navigation - Protocols Link** - DONE
   - File: frontend/src/layouts/MainLayout.tsx (line 35)
   - Changed: `isClinicianOrAdmin(user)` → `isResearcherOrAdmin(user)`
   - Reason: Researcher users couldn't see Protocols page in navigation

3. **Researcher Dashboard** - INVESTIGATED
   - File: frontend/src/pages/UserDashboard.tsx
   - Status: Code is correct, backend allows researcher access
   - Backend verified: /projects and /patients endpoints work for researchers

## Pending Actions
- [x] Apply fixes to source code
- [x] Apply fixes to running containers (hot-patch)
  - ✅ CSP Cloudflare Challenge scripts fixed
  - ✅ Container restarted
  - ⚠️ Frontend navigation fix requires rebuild
- [ ] Rebuild Docker image (when explicitly asked)
- [ ] Push to Docker Hub (when explicitly asked)
- [ ] Deploy to production (when explicitly asked)

## Android Upload Issue - COMPLETELY FIXED ✅
### Issue #1: GCS Credentials Missing ✅ FIXED
- **Root Cause**: `/app/secrets/gcs-service-account.json` missing from container
- **Fix Applied**: Copied credentials to Web-Service/secrets/ and mounted to container
- **Status**: ✅ Container restarted, credentials verified in container
- **Verification**: API health check passing

### Issue #2: screenRecording Field Not Accepted ✅ FIXED & DEPLOYED
- **Root Cause**: Android app sends `screenRecording` field but backend only accepted: video, keypoints, metadata
- **Error**: `MulterError: Unexpected field 'screenRecording'`
- **Code Fixes Applied**: 
  - ✅ Added `screenRecording` to mobileUploadMiddleware
  - ✅ Updated uploadMobileRecording to handle screenRecording file
  - ✅ Added GCS upload for screenRecording (Uploads-mp4/{sessionId}/screenRecording.mp4)
  - ✅ Updated database record with screenRecording path
  - ✅ Updated response to include screenRecording in files object
- **Status**: ✅ DEPLOYED TO PRODUCTION
- **Verification**: New image deployed, GCS initialized, API responding

### Enhancement: User Information Tracking ✅ DEPLOYED
- **Added Logging**: 
  - ✅ Session ID and Patient ID logged on upload request
  - ✅ Patient name and ID included in success response
  - ✅ File sizes logged (MB/KB) for each upload
  - ✅ GCS paths logged for debugging
  - ✅ Success message includes patient info: `Patient: {firstName} {lastName} ({patientId})`
- **Response Enhancement**:
  - ✅ Added `userInfo` object to response with patientId, patientName, uploadedBy
- **Status**: ✅ DEPLOYED & ACTIVE

## Hot-Patch Strategy
Will apply fixes to running container using sed commands:
1. Update CSP in running container
2. Update navigation JS in running container
3. Restart services to apply changes
4. Test researcher access

## Container Details
- Container Name: synaptihand-app
- Port: 5000
- Image: shivamsilver/silver-box:synaptihand-app
