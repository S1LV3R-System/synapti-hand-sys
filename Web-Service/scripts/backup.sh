#!/bin/sh
# Production Backup Script for HandPose Single Container
# Backs up SQLite database, Redis data, and uploads
# Retention: 7 days rolling backups

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

print_info() {
    echo -e "${BLUE}[$(date '+%Y-%m-%d %H:%M:%S')] ℹ $1${NC}"
}

print_success() {
    echo -e "${GREEN}[$(date '+%Y-%m-%d %H:%M:%S')] ✓ $1${NC}"
}

print_error() {
    echo -e "${RED}[$(date '+%Y-%m-%d %H:%M:%S')] ✗ $1${NC}"
}

print_warning() {
    echo -e "${YELLOW}[$(date '+%Y-%m-%d %H:%M:%S')] ⚠ $1${NC}"
}

# Configuration
BACKUP_DIR="/app/backups"
DATA_DIR="/app/data"
UPLOADS_DIR="/app/uploads"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_NAME="handpose_backup_${TIMESTAMP}"
RETENTION_DAYS=7

# Create backup directory structure
mkdir -p "${BACKUP_DIR}/${BACKUP_NAME}"

print_info "Starting backup: ${BACKUP_NAME}"

# ============================================================================
# 1. Backup SQLite Database
# ============================================================================
print_info "Backing up SQLite database..."

if [ -f "${DATA_DIR}/handpose.db" ]; then
    # Use SQLite's backup command for atomic backup
    sqlite3 "${DATA_DIR}/handpose.db" ".backup '${BACKUP_DIR}/${BACKUP_NAME}/handpose.db'"
    
    # Verify backup integrity
    if sqlite3 "${BACKUP_DIR}/${BACKUP_NAME}/handpose.db" "PRAGMA integrity_check;" > /dev/null 2>&1; then
        BACKUP_SIZE=$(du -sh "${BACKUP_DIR}/${BACKUP_NAME}/handpose.db" | cut -f1)
        print_success "Database backup complete (${BACKUP_SIZE})"
    else
        print_error "Database backup verification failed!"
        exit 1
    fi
else
    print_warning "No database file found at ${DATA_DIR}/handpose.db"
fi

# ============================================================================
# 2. Backup Redis Data (AOF + RDB)
# ============================================================================
print_info "Backing up Redis data..."

# Trigger Redis BGSAVE (background save)
redis-cli -h 127.0.0.1 -p 6379 BGSAVE > /dev/null 2>&1 || true

# Wait for BGSAVE to complete (max 30 seconds)
for i in $(seq 1 30); do
    if redis-cli -h 127.0.0.1 -p 6379 LASTSAVE > /dev/null 2>&1; then
        break
    fi
    sleep 1
done

# Copy Redis persistence files
mkdir -p "${BACKUP_DIR}/${BACKUP_NAME}/redis"

if [ -f "${DATA_DIR}/dump.rdb" ]; then
    cp "${DATA_DIR}/dump.rdb" "${BACKUP_DIR}/${BACKUP_NAME}/redis/"
    print_success "Redis RDB backup complete"
fi

if [ -f "${DATA_DIR}/appendonly.aof" ]; then
    cp "${DATA_DIR}/appendonly.aof"* "${BACKUP_DIR}/${BACKUP_NAME}/redis/" 2>/dev/null || true
    print_success "Redis AOF backup complete"
fi

# ============================================================================
# 3. Backup Upload Files
# ============================================================================
print_info "Backing up upload files..."

if [ -d "${UPLOADS_DIR}" ]; then
    # Use rsync for efficient incremental backup
    rsync -a --delete "${UPLOADS_DIR}/" "${BACKUP_DIR}/${BACKUP_NAME}/uploads/" 2>/dev/null || {
        # Fallback to cp if rsync not available
        cp -r "${UPLOADS_DIR}" "${BACKUP_DIR}/${BACKUP_NAME}/uploads"
    }
    
    UPLOADS_SIZE=$(du -sh "${BACKUP_DIR}/${BACKUP_NAME}/uploads" | cut -f1)
    UPLOADS_COUNT=$(find "${BACKUP_DIR}/${BACKUP_NAME}/uploads" -type f | wc -l)
    print_success "Uploads backup complete (${UPLOADS_COUNT} files, ${UPLOADS_SIZE})"
else
    print_warning "No uploads directory found"
fi

# ============================================================================
# 4. Create Backup Metadata
# ============================================================================
cat > "${BACKUP_DIR}/${BACKUP_NAME}/metadata.json" <<EOF
{
  "backup_timestamp": "${TIMESTAMP}",
  "backup_date": "$(date -Iseconds)",
  "backup_type": "automated",
  "retention_days": ${RETENTION_DAYS},
  "components": {
    "database": $([ -f "${BACKUP_DIR}/${BACKUP_NAME}/handpose.db" ] && echo "true" || echo "false"),
    "redis": $([ -d "${BACKUP_DIR}/${BACKUP_NAME}/redis" ] && echo "true" || echo "false"),
    "uploads": $([ -d "${BACKUP_DIR}/${BACKUP_NAME}/uploads" ] && echo "true" || echo "false")
  },
  "sizes": {
    "database": "$(du -sh "${BACKUP_DIR}/${BACKUP_NAME}/handpose.db" 2>/dev/null | cut -f1 || echo 'N/A')",
    "redis": "$(du -sh "${BACKUP_DIR}/${BACKUP_NAME}/redis" 2>/dev/null | cut -f1 || echo 'N/A')",
    "uploads": "$(du -sh "${BACKUP_DIR}/${BACKUP_NAME}/uploads" 2>/dev/null | cut -f1 || echo 'N/A')",
    "total": "$(du -sh "${BACKUP_DIR}/${BACKUP_NAME}" | cut -f1)"
  }
}
EOF

print_success "Backup metadata created"

# ============================================================================
# 5. Compress Backup (Optional - saves space)
# ============================================================================
print_info "Compressing backup..."

cd "${BACKUP_DIR}"
tar -czf "${BACKUP_NAME}.tar.gz" "${BACKUP_NAME}" 2>/dev/null && {
    rm -rf "${BACKUP_NAME}"
    COMPRESSED_SIZE=$(du -sh "${BACKUP_NAME}.tar.gz" | cut -f1)
    print_success "Backup compressed: ${BACKUP_NAME}.tar.gz (${COMPRESSED_SIZE})"
} || {
    print_warning "Compression failed, keeping uncompressed backup"
}

# ============================================================================
# 6. Cleanup Old Backups (Retention Policy)
# ============================================================================
print_info "Cleaning up old backups (retention: ${RETENTION_DAYS} days)..."

# Find and delete backups older than retention period
find "${BACKUP_DIR}" -name "handpose_backup_*.tar.gz" -mtime +${RETENTION_DAYS} -delete 2>/dev/null || true
find "${BACKUP_DIR}" -type d -name "handpose_backup_*" -mtime +${RETENTION_DAYS} -exec rm -rf {} \; 2>/dev/null || true

REMAINING_BACKUPS=$(find "${BACKUP_DIR}" -name "handpose_backup_*" | wc -l)
print_success "Cleanup complete (${REMAINING_BACKUPS} backups remaining)"

# ============================================================================
# 7. Backup Summary
# ============================================================================
TOTAL_BACKUP_SIZE=$(du -sh "${BACKUP_DIR}" | cut -f1)

print_info "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
print_success "Backup completed successfully!"
print_info "Backup name: ${BACKUP_NAME}"
print_info "Backup location: ${BACKUP_DIR}"
print_info "Total backup storage: ${TOTAL_BACKUP_SIZE}"
print_info "Retention: ${RETENTION_DAYS} days"
print_info "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

exit 0
