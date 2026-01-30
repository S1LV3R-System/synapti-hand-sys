#!/bin/sh
# Production Restore Script for HandPose Single Container
# Restores SQLite database, Redis data, and uploads from backup

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

# Check if backup name provided
if [ -z "$1" ]; then
    print_error "Usage: $0 <backup_name>"
    print_info "Available backups:"
    ls -lh "${BACKUP_DIR}" | grep "handpose_backup_" | awk '{print "  - " $9}'
    exit 1
fi

BACKUP_NAME="$1"
BACKUP_PATH="${BACKUP_DIR}/${BACKUP_NAME}"

# Check if backup is compressed
if [ -f "${BACKUP_PATH}.tar.gz" ]; then
    print_info "Extracting compressed backup..."
    cd "${BACKUP_DIR}"
    tar -xzf "${BACKUP_NAME}.tar.gz"
    BACKUP_PATH="${BACKUP_DIR}/${BACKUP_NAME}"
fi

# Verify backup exists
if [ ! -d "${BACKUP_PATH}" ]; then
    print_error "Backup not found: ${BACKUP_PATH}"
    exit 1
fi

# Show backup metadata
if [ -f "${BACKUP_PATH}/metadata.json" ]; then
    print_info "Backup Metadata:"
    cat "${BACKUP_PATH}/metadata.json"
    echo ""
fi

# Confirmation prompt
print_warning "⚠️  WARNING: This will OVERWRITE current data!"
print_warning "Current database and files will be replaced with backup from:"
print_warning "${BACKUP_NAME}"
echo ""
read -p "Continue with restore? (yes/NO): " CONFIRM

if [ "$CONFIRM" != "yes" ]; then
    print_info "Restore cancelled"
    exit 0
fi

# ============================================================================
# 1. Stop services before restore
# ============================================================================
print_info "Stopping services for safe restore..."
supervisorctl stop handpose redis 2>/dev/null || true
sleep 5

# ============================================================================
# 2. Backup current data (just in case)
# ============================================================================
print_info "Creating safety backup of current data..."
SAFETY_BACKUP="${BACKUP_DIR}/pre_restore_$(date +%Y%m%d_%H%M%S)"
mkdir -p "${SAFETY_BACKUP}"

if [ -f "${DATA_DIR}/handpose.db" ]; then
    cp "${DATA_DIR}/handpose.db" "${SAFETY_BACKUP}/"
fi

if [ -d "${UPLOADS_DIR}" ]; then
    cp -r "${UPLOADS_DIR}" "${SAFETY_BACKUP}/"
fi

print_success "Safety backup created: ${SAFETY_BACKUP}"

# ============================================================================
# 3. Restore SQLite Database
# ============================================================================
if [ -f "${BACKUP_PATH}/handpose.db" ]; then
    print_info "Restoring database..."
    
    # Verify backup integrity
    if sqlite3 "${BACKUP_PATH}/handpose.db" "PRAGMA integrity_check;" > /dev/null 2>&1; then
        cp "${BACKUP_PATH}/handpose.db" "${DATA_DIR}/handpose.db"
        chown nodejs:nodejs "${DATA_DIR}/handpose.db"
        chmod 644 "${DATA_DIR}/handpose.db"
        print_success "Database restored successfully"
    else
        print_error "Backup database integrity check failed!"
        exit 1
    fi
else
    print_warning "No database backup found"
fi

# ============================================================================
# 4. Restore Redis Data
# ============================================================================
if [ -d "${BACKUP_PATH}/redis" ]; then
    print_info "Restoring Redis data..."
    
    # Clear existing Redis files
    rm -f "${DATA_DIR}/dump.rdb" "${DATA_DIR}/appendonly.aof"* 2>/dev/null || true
    
    # Copy Redis backup files
    cp "${BACKUP_PATH}/redis/"* "${DATA_DIR}/" 2>/dev/null || true
    chown -R nodejs:nodejs "${DATA_DIR}/"
    
    print_success "Redis data restored"
else
    print_warning "No Redis backup found"
fi

# ============================================================================
# 5. Restore Upload Files
# ============================================================================
if [ -d "${BACKUP_PATH}/uploads" ]; then
    print_info "Restoring upload files..."
    
    # Clear existing uploads
    rm -rf "${UPLOADS_DIR}"
    mkdir -p "${UPLOADS_DIR}"
    
    # Copy uploads
    cp -r "${BACKUP_PATH}/uploads/"* "${UPLOADS_DIR}/" 2>/dev/null || true
    chown -R nodejs:nodejs "${UPLOADS_DIR}"
    
    UPLOADS_COUNT=$(find "${UPLOADS_DIR}" -type f | wc -l)
    print_success "Upload files restored (${UPLOADS_COUNT} files)"
else
    print_warning "No uploads backup found"
fi

# ============================================================================
# 6. Restart services
# ============================================================================
print_info "Restarting services..."
supervisorctl start redis
sleep 5
supervisorctl start handpose
sleep 5

# Verify services are running
if supervisorctl status redis | grep -q RUNNING && supervisorctl status handpose | grep -q RUNNING; then
    print_success "Services restarted successfully"
else
    print_error "Service restart failed! Check supervisord logs."
    exit 1
fi

# ============================================================================
# 7. Verify restore
# ============================================================================
print_info "Verifying restore..."

# Check database
if sqlite3 "${DATA_DIR}/handpose.db" "SELECT COUNT(*) FROM User;" > /dev/null 2>&1; then
    USER_COUNT=$(sqlite3 "${DATA_DIR}/handpose.db" "SELECT COUNT(*) FROM User;")
    print_success "Database verification passed (${USER_COUNT} users)"
else
    print_error "Database verification failed!"
fi

# Check Redis
if redis-cli -h 127.0.0.1 -p 6379 PING > /dev/null 2>&1; then
    print_success "Redis verification passed"
else
    print_warning "Redis verification failed"
fi

# ============================================================================
# 8. Cleanup
# ============================================================================
if [ -d "${BACKUP_DIR}/${BACKUP_NAME}" ] && [ -f "${BACKUP_DIR}/${BACKUP_NAME}.tar.gz" ]; then
    rm -rf "${BACKUP_DIR}/${BACKUP_NAME}"
    print_info "Cleaned up extracted backup files"
fi

# ============================================================================
# Summary
# ============================================================================
print_info "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
print_success "Restore completed successfully!"
print_info "Restored from: ${BACKUP_NAME}"
print_info "Safety backup: ${SAFETY_BACKUP}"
print_info "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

exit 0
