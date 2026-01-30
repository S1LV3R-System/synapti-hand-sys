#!/bin/sh
# Backup Scheduler - Runs backup every 6 hours
# This runs as a supervisord program and triggers backups periodically

set -e

BACKUP_INTERVAL=21600  # 6 hours in seconds
BACKUP_SCRIPT="/app/scripts/backup.sh"

echo "[$(date)] 🕒 Backup scheduler started (interval: 6 hours)"

# Initial delay to let services stabilize
sleep 300  # Wait 5 minutes after startup

while true; do
    echo "[$(date)] 📦 Triggering automated backup..."
    
    # Run backup script
    if sh "${BACKUP_SCRIPT}"; then
        echo "[$(date)] ✅ Backup completed successfully"
    else
        echo "[$(date)] ❌ Backup failed with exit code $?"
    fi
    
    # Wait for next backup interval
    echo "[$(date)] ⏰ Next backup in 6 hours..."
    sleep ${BACKUP_INTERVAL}
done
