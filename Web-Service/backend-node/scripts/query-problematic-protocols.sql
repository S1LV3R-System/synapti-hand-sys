-- ============================================================================
-- Query Problematic Protocols
-- Run this to see exactly which protocols can't be deleted and why
-- ============================================================================

-- Usage:
--   cd Web-Service/backend-node
--   sqlite3 prisma/data/handpose.db < scripts/query-problematic-protocols.sql

.mode column
.headers on
.width 36 30 10 15 30

SELECT '===================================================================' as '';
SELECT 'PROTOCOLS WITH RECORDINGS (Cannot Hard Delete)' as '';
SELECT '===================================================================' as '';

SELECT
  p.id,
  p.name,
  p.is_active as 'Active',
  COUNT(r.id) as 'Recordings',
  u.email as 'Creator'
FROM protocols p
LEFT JOIN recording_sessions r ON r.protocol_id = p.id
LEFT JOIN users u ON p.created_by_id = u.id
WHERE p.deleted_at IS NULL
GROUP BY p.id
HAVING COUNT(r.id) > 0
ORDER BY COUNT(r.id) DESC;

SELECT '' as '';
SELECT '===================================================================' as '';
SELECT 'PROTOCOLS WITHOUT RECORDINGS (Can Hard Delete)' as '';
SELECT '===================================================================' as '';

SELECT
  p.id,
  p.name,
  p.is_active as 'Active',
  COUNT(r.id) as 'Recordings',
  u.email as 'Creator'
FROM protocols p
LEFT JOIN recording_sessions r ON r.protocol_id = p.id
LEFT JOIN users u ON p.created_by_id = u.id
WHERE p.deleted_at IS NULL
GROUP BY p.id
HAVING COUNT(r.id) = 0
ORDER BY p.name;

SELECT '' as '';
SELECT '===================================================================' as '';
SELECT 'SOFT-DELETED PROTOCOLS (Already Deleted)' as '';
SELECT '===================================================================' as '';

SELECT
  p.id,
  p.name,
  datetime(p.deleted_at) as 'Deleted At',
  COUNT(r.id) as 'Recordings',
  u.email as 'Creator'
FROM protocols p
LEFT JOIN recording_sessions r ON r.protocol_id = p.id
LEFT JOIN users u ON p.created_by_id = u.id
WHERE p.deleted_at IS NOT NULL
GROUP BY p.id
ORDER BY p.deleted_at DESC;

SELECT '' as '';
SELECT '===================================================================' as '';
SELECT 'SUMMARY STATISTICS' as '';
SELECT '===================================================================' as '';

SELECT
  COUNT(DISTINCT CASE WHEN deleted_at IS NULL THEN id END) as 'Active Protocols',
  COUNT(DISTINCT CASE WHEN deleted_at IS NULL AND id IN (
    SELECT DISTINCT protocol_id FROM recording_sessions WHERE protocol_id IS NOT NULL
  ) THEN id END) as 'With Recordings',
  COUNT(DISTINCT CASE WHEN deleted_at IS NULL AND id NOT IN (
    SELECT DISTINCT protocol_id FROM recording_sessions WHERE protocol_id IS NOT NULL
  ) THEN id END) as 'Without Recordings',
  COUNT(DISTINCT CASE WHEN deleted_at IS NOT NULL THEN id END) as 'Soft Deleted'
FROM protocols;
