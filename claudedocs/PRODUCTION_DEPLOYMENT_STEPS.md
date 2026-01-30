# Production Deployment - Quick Fix Guide

## CRITICAL: Production API Errors - Immediate Fix Required

**Estimated Time:** 5 minutes
**Downtime:** None (rolling restart)
**Risk Level:** Low (environment variable change only)

---

## Pre-Deployment Checklist

- [ ] Current production DATABASE_URL backed up
- [ ] Maintenance window communicated (if needed)
- [ ] Access to production server/container verified
- [ ] Rollback plan prepared

---

## Deployment Steps

### Step 1: Identify Production Environment

**Question:** Where is the backend running?

A) Docker container
B) PM2/Node process
C) Systemd service
D) Cloud platform (AWS, GCP, Azure)

### Step 2: Access Production Environment

#### Option A: Docker Container

```bash
# List running containers
docker ps | grep handpose

# Access container
docker exec -it <container-name> /bin/sh

# Or check docker-compose
docker-compose ps
```

#### Option B: SSH to Server

```bash
ssh user@app.synaptihand.com
cd /path/to/backend
```

### Step 3: Update DATABASE_URL

#### Method 1: Environment Variable (Recommended)

**Docker Compose:**
```bash
# Edit docker-compose.yml
nano docker-compose.yml

# Find backend service environment section
services:
  backend:
    environment:
      - DATABASE_URL=postgresql://postgres.mtodevikkgraisalolkq:3hcJF9Obfzu0ef95@aws-1-ap-south-1.pooler.supabase.com:6543/postgres?pgbouncer=true
```

**Docker Run:**
```bash
docker stop handpose-backend

docker run -d \
  --name handpose-backend \
  -e DATABASE_URL="postgresql://postgres.mtodevikkgraisalolkq:3hcJF9Obfzu0ef95@aws-1-ap-south-1.pooler.supabase.com:6543/postgres?pgbouncer=true" \
  [other-options] \
  handpose-backend:latest
```

**PM2 Ecosystem:**
```bash
# Edit ecosystem.config.js
nano ecosystem.config.js

# Update env section
env: {
  DATABASE_URL: "postgresql://postgres.mtodevikkgraisalolkq:3hcJF9Obfzu0ef95@aws-1-ap-south-1.pooler.supabase.com:6543/postgres?pgbouncer=true"
}
```

#### Method 2: .env File

```bash
# Access production server/container
cd /app  # or your backend directory

# Backup current .env
cp .env .env.backup

# Edit .env
nano .env

# Find DATABASE_URL line and change:
# FROM:
DATABASE_URL=postgresql://postgres.mtodevikkgraisalolkq:3hcJF9Obfzu0ef95@aws-1-ap-south-1.pooler.supabase.com:5432/postgres

# TO:
DATABASE_URL=postgresql://postgres.mtodevikkgraisalolkq:3hcJF9Obfzu0ef95@aws-1-ap-south-1.pooler.supabase.com:6543/postgres?pgbouncer=true

# Save and exit (Ctrl+X, Y, Enter)
```

### Step 4: Restart Backend Service

#### Docker:
```bash
docker restart handpose-backend

# Or with docker-compose:
docker-compose restart backend

# Or rebuild if needed:
docker-compose down
docker-compose up -d --build
```

#### PM2:
```bash
pm2 restart synaptihand-backend

# Or reload for zero downtime:
pm2 reload synaptihand-backend
```

#### Systemd:
```bash
systemctl restart synaptihand-backend
systemctl status synaptihand-backend
```

#### Node Process:
```bash
# Find process
ps aux | grep node

# Kill and restart
pkill -f "node.*index.js"
NODE_ENV=production node dist/index.js &
```

### Step 5: Verify Deployment

#### Test API Endpoints:
```bash
# Health check
curl https://app.synaptihand.com/api/system/health

# Previously failing endpoints
curl https://app.synaptihand.com/api/stats
curl https://app.synaptihand.com/api/projects
curl https://app.synaptihand.com/api/patients
curl https://app.synaptihand.com/api/invitations/me
curl https://app.synaptihand.com/api/stats/comparison
```

#### Expected Results:
- ✅ HTTP 200 status codes
- ✅ Response times <1 second (down from 2-5 seconds)
- ✅ No "MaxClientsInSessionMode" errors in logs
- ✅ Valid JSON responses

#### Check Logs:
```bash
# Docker
docker logs -f handpose-backend | grep -i "error\|connection"

# PM2
pm2 logs synaptihand-backend

# Systemd
journalctl -u synaptihand-backend -f
```

### Step 6: Monitor for 30 Minutes

- [ ] All API endpoints responding (HTTP 200)
- [ ] Response times <1 second
- [ ] No connection errors in logs
- [ ] No user complaints
- [ ] Supabase connection count stable

---

## Quick Reference

### Old Configuration (BROKEN)
```bash
DATABASE_URL=postgresql://postgres.mtodevikkgraisalolkq:3hcJF9Obfzu0ef95@aws-1-ap-south-1.pooler.supabase.com:5432/postgres
```
- Port 5432 (Session mode)
- Max ~20 connections
- HTTP 500 errors under load

### New Configuration (FIXED)
```bash
DATABASE_URL=postgresql://postgres.mtodevikkgraisalolkq:3hcJF9Obfzu0ef95@aws-1-ap-south-1.pooler.supabase.com:6543/postgres?pgbouncer=true
```
- Port 6543 (Transaction mode)
- Supports 100+ connections
- Fast, stable responses

### What Changed?
1. Port: `5432` → `6543`
2. Added parameter: `?pgbouncer=true`

---

## Rollback Plan

If issues occur after deployment:

### Step 1: Restore Previous DATABASE_URL
```bash
# Restore from backup
cp .env.backup .env

# Or manually change back to port 5432
DATABASE_URL=postgresql://postgres.mtodevikkgraisalolkq:3hcJF9Obfzu0ef95@aws-1-ap-south-1.pooler.supabase.com:5432/postgres
```

### Step 2: Restart Service
```bash
docker restart handpose-backend
# or appropriate restart command for your setup
```

### Step 3: Verify Rollback
```bash
curl https://app.synaptihand.com/api/system/health
```

**Note:** Rollback will restore previous behavior (HTTP 500 errors under load), so only rollback if new config causes different issues.

---

## Troubleshooting

### Issue: Backend won't start after change

**Check logs:**
```bash
docker logs handpose-backend
# Look for connection errors
```

**Verify DATABASE_URL:**
```bash
docker exec handpose-backend printenv DATABASE_URL
```

**Common causes:**
- Typo in connection string
- Missing `?pgbouncer=true` parameter
- Incorrect port number

### Issue: Still getting HTTP 500 errors

**Wait 2-3 minutes** for connection pool to fully reset

**Force connection pool clear:**
```bash
docker restart handpose-backend
sleep 10
curl https://app.synaptihand.com/api/stats
```

**Check if change was applied:**
```bash
docker exec handpose-backend cat /app/.env | grep DATABASE_URL
```

### Issue: "prepared statement" errors

**Solution:** Ensure `?pgbouncer=true` parameter is present in DATABASE_URL

### Issue: Cannot connect to database

**Test direct connection:**
```bash
psql "postgresql://postgres.mtodevikkgraisalolkq:3hcJF9Obfzu0ef95@aws-1-ap-south-1.pooler.supabase.com:6543/postgres"
```

**Verify Supabase pooler is accessible:**
- Check Supabase dashboard for pooler status
- Verify network connectivity from production server
- Confirm credentials haven't changed

---

## Post-Deployment Tasks

### Immediate (After Verification)

- [ ] Document deployment time and results
- [ ] Update team on successful deployment
- [ ] Remove maintenance notice (if any)
- [ ] Archive this guide with deployment notes

### Short-term (Next 24 hours)

- [ ] Monitor Supabase connection metrics
- [ ] Set up alerts for connection pool exhaustion
- [ ] Review error logs for any new issues
- [ ] Performance comparison report

### Long-term (Next Week)

- [ ] Add connection pool monitoring dashboard
- [ ] Implement Redis caching
- [ ] Load testing under realistic traffic
- [ ] Document lessons learned

---

## Contact & Support

**If deployment fails:**
1. Check troubleshooting section above
2. Review backend logs for specific errors
3. Verify DATABASE_URL format is exact
4. Consider rollback if critical issue

**Expected Improvements:**
- Response times: 90% faster (from 2-5s to <500ms)
- Error rate: 0% (from ~40% HTTP 500 errors)
- Concurrent capacity: 5x increase (from ~20 to 100+ connections)

---

## Success Criteria

Deployment is successful when:
- ✅ All API endpoints return HTTP 200
- ✅ Response times consistently <1 second
- ✅ No "MaxClientsInSessionMode" errors in logs
- ✅ Supabase dashboard shows stable connection count
- ✅ No user reports of errors
- ✅ System stable for 30+ minutes

**DEPLOY NOW:** This is a critical fix for production stability.
