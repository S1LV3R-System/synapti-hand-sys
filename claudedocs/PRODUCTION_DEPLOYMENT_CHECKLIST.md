# Production Deployment Checklist - Soft-Delete System

## Overview
This document outlines the steps required to deploy the soft-delete system with 15-day automatic cleanup and admin hard-delete functionality to the production Docker container.

## Changes Made (Backend)

### 1. Dependencies Added
**File**: `backend-node/package.json`
```json
{
  "dependencies": {
    "node-cron": "^3.0.3"
  },
  "devDependencies": {
    "@types/node-cron": "^3.0.11"
  }
}
```

### 2. New Files Created
- `src/workers/cleanup.worker.ts` - Automated cleanup cron job
- `src/controllers/system.controller.ts` - Admin hard-delete endpoints (OVERWRITTEN)
- `src/routes/system.routes.ts` - Updated routes (MODIFIED)

### 3. Modified Files
- `src/index.ts` - Added `startCleanupCronJob()` initialization
- `src/utils/audit.ts` - Added hard-delete audit actions
- `src/routes/system.routes.ts` - Added new endpoints

## Deployment Steps for Production

### Step 1: Verify Current Docker Status
```bash
# Check if container is running
docker ps | grep handpose

# View current logs
docker logs handpose-single --tail 100
```

### Step 2: Backup Production Database
```bash
# Connect to container
docker exec -it handpose-single /bin/sh

# Backup database (if using PostgreSQL)
pg_dump $DATABASE_URL > /backups/backup_$(date +%Y%m%d_%H%M%S).sql

# Or if using SQLite
cp /app/backend-node/prisma/dev.db /backups/backup_$(date +%Y%m%d_%H%M%S).db

# Exit container
exit
```

### Step 3: Update Code in Production
```bash
# Navigate to project directory
cd /home/shivam/Desktop/HandPose/Web-Service

# Ensure all changes are committed (optional but recommended)
git status

# Rebuild and restart Docker container
docker compose -f docker-compose-single-container.yml down
docker compose -f docker-compose-single-container.yml up -d --build
```

### Step 4: Verify Installation
```bash
# Check container logs for cleanup worker initialization
docker logs handpose-single | grep "cleanup"

# Expected output:
# "✅ Cleanup cron job scheduled (daily at 2:00 AM UTC)"

# Check if new dependencies installed
docker exec -it handpose-single npm list node-cron
```

### Step 5: Test New Endpoints

#### Test Soft-Delete Stats
```bash
curl -X GET http://localhost:5000/api/system/soft-deleted/stats \
  -H "Authorization: Bearer YOUR_ADMIN_TOKEN"
```

**Expected Response**:
```json
{
  "success": true,
  "data": {
    "users": 0,
    "projects": 0,
    "patients": 0,
    "protocols": 0,
    "recordings": 0,
    "total": 0
  }
}
```

#### Test Cleanup Preview
```bash
curl -X GET http://localhost:5000/api/system/cleanup/preview \
  -H "Authorization: Bearer YOUR_ADMIN_TOKEN"
```

**Expected Response**:
```json
{
  "success": true,
  "data": {
    "dryRun": true,
    "fifteenDaysAgo": "2025-01-01T00:00:00.000Z",
    "toDelete": {
      "recordings": 0,
      "protocols": 0,
      "patients": 0,
      "projects": 0,
      "users": 0,
      "total": 0
    },
    "message": "This is a preview..."
  }
}
```

#### Test Hard-Delete (on test data only!)
```bash
# First, soft-delete a test protocol
curl -X DELETE http://localhost:5000/api/protocols/TEST_PROTOCOL_ID \
  -H "Authorization: Bearer YOUR_ADMIN_TOKEN"

# Then hard-delete it
curl -X DELETE http://localhost:5000/api/system/protocols/TEST_PROTOCOL_ID/hard-delete \
  -H "Authorization: Bearer YOUR_ADMIN_TOKEN"
```

### Step 6: Verify Cron Job Configuration
```bash
# Check container timezone (should be UTC)
docker exec -it handpose-single date

# Verify cron job will run (check at 02:01 UTC the next day)
docker logs handpose-single | grep "Cleanup"

# Expected output after cron runs:
# "🧹 Running scheduled cleanup..."
# "✅ Cleanup completed: X records deleted"
```

### Step 7: Monitor Audit Logs
```bash
# Query audit logs for cleanup events
curl -X GET http://localhost:5000/api/system/audit-logs \
  -H "Authorization: Bearer YOUR_ADMIN_TOKEN"

# Look for actions like:
# - "system.cleanup"
# - "system.hard_delete_protocol"
# - "system.hard_delete_patient"
# etc.
```

## Environment Variables (Production)

Ensure these are set in `docker-compose-single-container.yml`:

```yaml
environment:
  NODE_ENV: production
  DATABASE_URL: postgresql://user:pass@db:5432/synaptihand
  JWT_SECRET: ${JWT_SECRET}  # Strong secret from .env
  REDIS_URL: redis://redis:6379
  TZ: UTC  # Important for cron job timing
```

## Rollback Plan

If issues occur:

### Option 1: Quick Rollback (Previous Image)
```bash
# Stop current container
docker compose -f docker-compose-single-container.yml down

# Find previous image
docker images | grep handpose

# Run previous image
docker run -d --name handpose-single-rollback \
  -p 5000:5000 \
  [PREVIOUS_IMAGE_ID]
```

### Option 2: Disable Cleanup Worker Only
If only the cleanup worker causes issues, comment out this line in `src/index.ts`:
```typescript
// startCleanupCronJob();  // Temporarily disabled
```

Then rebuild:
```bash
docker compose -f docker-compose-single-container.yml up -d --build
```

Hard-delete endpoints will still work, but automatic cleanup won't run.

## Monitoring Checklist (Post-Deployment)

- [ ] Container started successfully
- [ ] Cleanup worker initialization message in logs
- [ ] `/api/system/soft-deleted/stats` endpoint responds
- [ ] `/api/system/cleanup/preview` endpoint responds
- [ ] Admin can access hard-delete endpoints
- [ ] Non-admin users get 403 on hard-delete endpoints
- [ ] Audit logs record hard-delete actions
- [ ] Cron job runs at 2:00 AM UTC (wait 24h to verify)
- [ ] No error messages in container logs

## Performance Considerations

### Database Load
The cleanup cron job performs bulk deletes. Monitor database performance:

```sql
-- PostgreSQL: Check long-running queries
SELECT pid, now() - query_start as duration, query 
FROM pg_stat_activity 
WHERE state = 'active' 
ORDER BY duration DESC;
```

### Memory Usage
```bash
# Monitor container memory
docker stats handpose-single --no-stream
```

If cleanup causes memory spikes, consider:
1. Batching deletes (modify `cleanup.worker.ts` to delete in chunks)
2. Running cleanup during low-traffic hours (already set to 2 AM UTC)

## Troubleshooting

### Issue: Cleanup not running
**Check**:
1. Container timezone: `docker exec -it handpose-single date`
2. Logs for cron init: `docker logs handpose-single | grep "Cleanup cron"`
3. Node-cron installed: `docker exec -it handpose-single npm list node-cron`

### Issue: Hard-delete endpoints return 404
**Check**:
1. Routes registered: `docker exec -it handpose-single cat /app/backend-node/dist/routes/system.routes.js`
2. Controllers exist: `docker exec -it handpose-single ls /app/backend-node/dist/controllers/system.controller.js`
3. TypeScript compiled: Verify `dist/` contains updated files

### Issue: Permission denied on hard-delete
**Check**:
1. User role is `admin`: Query database `SELECT role FROM users WHERE id = ?`
2. Admin middleware active: Check `system.routes.ts` has `adminMiddleware`
3. JWT token valid: Decode token to verify role claim

## Security Considerations

### Production Hardening
1. **Rate Limiting**: Add rate limiting to hard-delete endpoints
2. **IP Whitelisting**: Restrict admin endpoints to specific IPs
3. **Audit Alerts**: Set up alerts for hard-delete actions
4. **Backup Policy**: Ensure automated backups before cleanup runs

### Recommended `docker-compose-single-container.yml` Updates
```yaml
services:
  app:
    # ... existing config
    environment:
      # Existing vars
      CLEANUP_ENABLED: true  # Feature flag
      CLEANUP_RETENTION_DAYS: 15  # Configurable retention
      CLEANUP_CRON: "0 0 2 * * *"  # Configurable schedule
```

## Compliance Notes

### Data Retention Policy
- **15-day retention** complies with most "right to be forgotten" regulations
- **Audit logs** provide deletion evidence for compliance audits
- **Admin override** allows emergency data removal for legal requests

### GDPR/HIPAA Considerations
- Soft-delete allows data recovery window (operational safety)
- Hard-delete provides immediate purge for legal compliance
- Audit trail documents all deletion actions (accountability)

## Next Steps

After successful production deployment:

1. **Frontend UI** (optional): Add admin hard-delete buttons to management pages
2. **Monitoring**: Set up alerts for cleanup failures
3. **Documentation**: Update user-facing docs about deletion behavior
4. **Training**: Inform admin users about hard-delete capabilities

## Completion Checklist

- [ ] Dependencies installed (`node-cron`, `@types/node-cron`)
- [ ] Container rebuilt and restarted
- [ ] Cleanup worker initialized
- [ ] All new endpoints tested
- [ ] Audit logging verified
- [ ] Cron job scheduled (verify after 24h)
- [ ] Rollback plan documented
- [ ] Team notified of new features
- [ ] Monitoring configured
- [ ] Documentation updated

---

**Deployment Date**: _________________  
**Deployed By**: _________________  
**Production URL**: https://app.synaptihand.com  
**Verification Status**: ⬜ Pending / ⬜ Verified / ⬜ Issues Found
