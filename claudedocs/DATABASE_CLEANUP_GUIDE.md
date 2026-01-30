# Database Cleanup Guide - "Failed to delete X protocol(s)" Error

## Problem Summary

You encountered: **"Failed to delete 4 protocol(s)"** error when trying to bulk delete protocols from the frontend.

### Root Cause Analysis

After comprehensive database inspection, I found that **your database has NO integrity issues**. The "Failed to delete" error is happening due to **business logic constraints**, not database corruption.

## Why Protocols Can't Be Deleted

According to the backend logic (`Web-Service/backend-node/src/controllers/protocols.controller.ts:349-430`), protocols can fail to delete for these reasons:

### 1. **Protocol Has Associated Recordings** (Most Common)
- **Rule**: Protocols with recordings can ONLY be soft-deleted
- **Check**: Backend counts `recordings` for each protocol
- **Error Message**: "Cannot permanently delete protocol with existing recordings. Use soft delete instead."

### 2. **Permission Denied**
- **Rule**: Only protocol creator OR admin can delete
- **Check**: `userRole !== 'admin' && existing.createdById !== userId`

### 3. **Protocol Already Deleted**
- **Rule**: Can't delete if `deletedAt` is already set
- **Check**: `existing.deletedAt !== null`

## Database Inspection Results

I created and ran a comprehensive inspection script. Results:

```
✅ No integrity issues found!

Statistics:
  📊 Soft-deleted protocols: 0
  📊 Soft-deleted patients: 0
  📊 Soft-deleted users: 0
  📊 Soft-deleted projects: 0

Checked for:
  ✅ Protocols with invalid user references
  ✅ Patients with invalid project/creator references
  ✅ Users with duplicate emails
  ✅ Projects with invalid owner references
  ✅ Recordings with invalid references
  ✅ All foreign key integrity
```

## Solution: Find Which Protocols Have Recordings

To see exactly which protocols can't be deleted, run this:

### Option 1: Using Prisma Studio (Visual)

```bash
cd Web-Service/backend-node
npx prisma studio
```

1. Open `protocols` table
2. For each protocol you want to delete, click it
3. Scroll down to "Relationships" section
4. Check if `recordings` has any entries
5. If YES → Can only soft-delete
6. If NO → Can hard-delete

### Option 2: Using SQL Query

```bash
cd Web-Service/backend-node
npx tsx scripts/inspect-and-cleanup-db.ts --inspect
```

This will show you exactly which protocols have recordings.

### Option 3: Direct SQL (Advanced)

```bash
cd Web-Service/backend-node
sqlite3 prisma/data/handpose.db
```

```sql
-- See all protocols with their recording counts
SELECT
  p.id,
  p.name,
  p.is_active,
  COUNT(r.id) as recording_count
FROM protocols p
LEFT JOIN recording_sessions r ON r.protocol_id = p.id
GROUP BY p.id
ORDER BY recording_count DESC;
```

## How to Delete Protocols Properly

### Scenario 1: Protocol HAS Recordings

**You CANNOT hard-delete these protocols.** Instead, use soft-delete:

**Frontend UI**: The delete button will automatically soft-delete
**Backend API**: Send `{ hard: false }` or omit `hard` parameter

```bash
# API Example
curl -X DELETE http://localhost:5000/api/protocols/{id} \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"hard": false}'
```

**What soft-delete does**:
- Sets `deletedAt` timestamp
- Protocol is hidden from lists by default
- Data is preserved for audit trails
- Can be restored if needed

### Scenario 2: Protocol HAS NO Recordings

You can hard-delete (permanently remove):

```bash
# API Example
curl -X DELETE http://localhost:5000/api/protocols/{id} \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"hard": true}'
```

### Scenario 3: Bulk Delete from Frontend

The frontend bulk delete (lines 134-162 in `ProtocolsList.tsx`) tries to delete each protocol one by one:

```typescript
for (const id of selectedRowKeys) {
  try {
    await deleteProtocol.mutateAsync({ id: id as string });
    successCount++;
  } catch {
    failCount++; // This increments for protocols with recordings
  }
}

if (failCount > 0) {
  message.warning(`Failed to delete ${failCount} protocol(s)`); // ← Your error message
}
```

**Solution**: Only select protocols without recordings for bulk delete.

## Clean Up Database (If Needed)

Even though your database has no integrity issues, I created a comprehensive cleanup script for you:

### Safe Inspection (Read-Only)

```bash
cd Web-Service/backend-node
npx tsx scripts/inspect-and-cleanup-db.ts --inspect
```

This checks for:
- Invalid foreign key references
- Orphaned records
- Duplicate entries
- Soft-deleted records with active relationships

### Cleanup Problematic Entries (If Any Found)

```bash
cd Web-Service/backend-node
npx tsx scripts/inspect-and-cleanup-db.ts --cleanup
```

This will:
- Delete records with invalid references
- Clean up orphaned sessions
- Remove duplicate entries
- Fix cascading issues

**⚠️ SAFETY**: Script uses 3-second delay before cleanup and shows exactly what will be deleted

### Nuclear Option (DANGER - Last Resort)

```bash
cd Web-Service/backend-node
npx tsx scripts/inspect-and-cleanup-db.ts --hard-reset
```

**⚠️ WARNING**: This deletes ALL data from the database! Use only if database is completely corrupted.

## Recommended Actions

Based on your error message "Failed to delete 4 protocol(s)", here's what to do:

### Step 1: Identify Which Protocols Failed

```bash
cd Web-Service/backend-node
sqlite3 prisma/data/handpose.db
```

```sql
SELECT
  p.id,
  p.name,
  p.created_by_id,
  COUNT(r.id) as recording_count,
  u.email as creator_email
FROM protocols p
LEFT JOIN recording_sessions r ON r.protocol_id = p.id
LEFT JOIN users u ON p.created_by_id = u.id
GROUP BY p.id
HAVING recording_count > 0
ORDER BY recording_count DESC;
```

This shows you which protocols have recordings (these can't be hard-deleted).

### Step 2: Decision Tree

For each of the 4 failed protocols:

**Option A: Keep the Protocol** (Recommended if it has recordings)
- Leave it as is
- Mark as inactive if you don't want to use it: Update `is_active = false`

**Option B: Soft Delete** (Safe, reversible)
- Frontend UI: Click delete (it auto-soft-deletes)
- Or manually: `UPDATE protocols SET deleted_at = CURRENT_TIMESTAMP WHERE id = ?`

**Option C: Delete Recordings First, Then Protocol** (Dangerous)
1. Delete all associated recordings
2. Then hard-delete the protocol
3. ⚠️ **WARNING**: This destroys patient data permanently!

### Step 3: Prevent Future Issues

**For Patients, Users, Projects** (you mentioned these have problems too):

```bash
# Run full inspection
cd Web-Service/backend-node
npx tsx scripts/inspect-and-cleanup-db.ts --inspect
```

If it finds issues (unlikely based on my inspection), run:

```bash
npx tsx scripts/inspect-and-cleanup-db.ts --cleanup
```

## Understanding Soft vs Hard Delete

### Soft Delete (Default, Safe)
```
deletedAt: null        → deletedAt: "2026-01-16T..."
isActive: true         → unchanged
Data: Preserved        → Can be restored
Frontend: Hidden       → Not shown in lists by default
```

**Use When**:
- Protocol has recordings
- You might need the data later
- For compliance/audit trails

### Hard Delete (Permanent)
```
Record: Exists → Record: GONE FOREVER
```

**Use When**:
- Protocol has NO recordings
- You're absolutely sure
- Testing/development cleanup

## API Endpoints for Manual Cleanup

If you want to manually clean up via API:

```bash
# List protocols with filters
GET /api/protocols?isActive=true&page=1&limit=10

# Soft delete (safe)
DELETE /api/protocols/{id}
Body: { "hard": false }

# Hard delete (permanent - only works if no recordings)
DELETE /api/protocols/{id}
Body: { "hard": true }

# Update protocol (e.g., deactivate)
PUT /api/protocols/{id}
Body: { "isActive": false }
```

## Troubleshooting Common Issues

### Issue: "Failed to delete protocol" But Database Looks Clean

**Cause**: Protocol has recordings
**Solution**: Use soft-delete or delete recordings first

### Issue: "Protocol not found"

**Cause**: Already soft-deleted (`deletedAt` is set)
**Solution**: Check `deleted_at` column in database

### Issue: "Permission denied"

**Cause**: You're not the creator and not an admin
**Solution**: Login as admin or protocol creator

### Issue: Bulk delete partially succeeds

**Cause**: Mix of protocols with/without recordings
**Solution**: Query recording counts first, only select delete-able protocols

## Database Backup (Before Any Cleanup)

Always backup before cleanup:

```bash
cd Web-Service/backend-node
cp prisma/data/handpose.db prisma/data/handpose.db.backup-$(date +%Y%m%d-%H%M%S)
```

To restore:
```bash
cp prisma/data/handpose.db.backup-YYYYMMDD-HHMMSS prisma/data/handpose.db
```

## Summary

1. **Your database is healthy** - No integrity issues found
2. **The error is expected behavior** - Protocols with recordings can't be hard-deleted
3. **Solution**: Use soft-delete for protocols with recordings
4. **For other tables**: Run inspection script to find any issues

## Quick Commands Reference

```bash
# Inspect database (safe, read-only)
npx tsx scripts/inspect-and-cleanup-db.ts --inspect

# Clean up issues (if any found)
npx tsx scripts/inspect-and-cleanup-db.ts --cleanup

# Visual database browser
npx prisma studio

# Direct SQL access
sqlite3 prisma/data/handpose.db

# Backup database
cp prisma/data/handpose.db prisma/data/handpose.db.backup

# See protocol recording counts
sqlite3 prisma/data/handpose.db "SELECT p.name, COUNT(r.id) as recordings FROM protocols p LEFT JOIN recording_sessions r ON r.protocol_id = p.id GROUP BY p.id;"
```

## Need More Help?

The inspection script (`scripts/inspect-and-cleanup-db.ts`) provides detailed reporting. Run it and share the output if you need further assistance.
