#!/usr/bin/env tsx
/**
 * Database Backup Script
 *
 * Creates timestamped backups of the production database.
 * Can be run manually or automatically before cleanup operations.
 *
 * Usage:
 *   npx tsx scripts/backup-database.ts
 *   npx tsx scripts/backup-database.ts --label "before-cleanup"
 */

import { exec } from 'child_process';
import { promisify } from 'util';
import { mkdir, access } from 'fs/promises';
import { join } from 'path';

const execAsync = promisify(exec);

const DATABASE_URL = process.env.DATABASE_URL || 'file:./dev.db';
const BACKUP_DIR = process.env.BACKUP_DIR || join(__dirname, '../../backups');

interface BackupOptions {
  label?: string;
}

async function ensureBackupDirectory(): Promise<void> {
  try {
    await access(BACKUP_DIR);
  } catch {
    console.log(`📁 Creating backup directory: ${BACKUP_DIR}`);
    await mkdir(BACKUP_DIR, { recursive: true });
  }
}

async function backupSQLite(dbPath: string, options: BackupOptions = {}): Promise<string> {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const label = options.label ? `_${options.label}` : '';
  const backupFile = join(BACKUP_DIR, `backup${label}_${timestamp}.db`);

  console.log(`\n${'='.repeat(70)}`);
  console.log('📦 SQLite Database Backup');
  console.log('='.repeat(70));
  console.log(`Source: ${dbPath}`);
  console.log(`Destination: ${backupFile}`);
  console.log(`Timestamp: ${new Date().toISOString()}`);
  console.log('='.repeat(70));

  try {
    await execAsync(`cp "${dbPath}" "${backupFile}"`);
    const { stdout } = await execAsync(`du -h "${backupFile}"`);
    const size = stdout.split('\t')[0];

    console.log(`\n✅ Backup completed successfully`);
    console.log(`   File: ${backupFile}`);
    console.log(`   Size: ${size}`);
    console.log('='.repeat(70) + '\n');

    return backupFile;
  } catch (error) {
    console.error('\n❌ Backup failed:', error);
    throw error;
  }
}

async function backupPostgreSQL(connectionString: string, options: BackupOptions = {}): Promise<string> {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const label = options.label ? `_${options.label}` : '';
  const backupFile = join(BACKUP_DIR, `backup${label}_${timestamp}.sql`);

  console.log(`\n${'='.repeat(70)}`);
  console.log('📦 PostgreSQL Database Backup');
  console.log('='.repeat(70));
  console.log(`Connection: ${connectionString.replace(/:[^:@]+@/, ':****@')}`); // Hide password
  console.log(`Destination: ${backupFile}`);
  console.log(`Timestamp: ${new Date().toISOString()}`);
  console.log('='.repeat(70));

  try {
    await execAsync(`pg_dump "${connectionString}" > "${backupFile}"`);
    const { stdout } = await execAsync(`du -h "${backupFile}"`);
    const size = stdout.split('\t')[0];

    console.log(`\n✅ Backup completed successfully`);
    console.log(`   File: ${backupFile}`);
    console.log(`   Size: ${size}`);
    console.log('='.repeat(70) + '\n');

    return backupFile;
  } catch (error) {
    console.error('\n❌ Backup failed:', error);
    throw error;
  }
}

async function cleanOldBackups(retentionDays: number = 30): Promise<void> {
  console.log(`\n🗑️  Cleaning backups older than ${retentionDays} days...`);

  try {
    // Find backups older than retention period
    const { stdout } = await execAsync(
      `find "${BACKUP_DIR}" -name "backup_*.db" -o -name "backup_*.sql" -mtime +${retentionDays}`
    );

    const oldBackups = stdout.trim().split('\n').filter(Boolean);

    if (oldBackups.length === 0) {
      console.log('   No old backups to clean\n');
      return;
    }

    console.log(`   Found ${oldBackups.length} old backup(s) to remove`);

    for (const backup of oldBackups) {
      await execAsync(`rm "${backup}"`);
      console.log(`   Deleted: ${backup}`);
    }

    console.log(`✅ Cleaned ${oldBackups.length} old backup(s)\n`);
  } catch (error) {
    // If find returns no results, it exits with code 1, which is ok
    if (error && typeof error === 'object' && 'code' in error && error.code === 1) {
      console.log('   No old backups to clean\n');
    } else {
      console.error('Failed to clean old backups:', error);
    }
  }
}

export async function createBackup(options: BackupOptions = {}): Promise<string> {
  await ensureBackupDirectory();

  if (DATABASE_URL.startsWith('file:')) {
    // SQLite
    const dbPath = DATABASE_URL.replace('file:', '');
    const absolutePath = join(__dirname, '../..', dbPath);
    return await backupSQLite(absolutePath, options);
  } else if (DATABASE_URL.startsWith('postgresql://') || DATABASE_URL.startsWith('postgres://')) {
    // PostgreSQL
    return await backupPostgreSQL(DATABASE_URL, options);
  } else {
    throw new Error(`Unsupported database type: ${DATABASE_URL}`);
  }
}

async function main() {
  const args = process.argv.slice(2);
  const labelIndex = args.indexOf('--label');
  const label = labelIndex !== -1 ? args[labelIndex + 1] : undefined;

  const cleanupIndex = args.indexOf('--cleanup');
  const shouldCleanup = cleanupIndex !== -1;
  const retentionDays = cleanupIndex !== -1 && args[cleanupIndex + 1] 
    ? parseInt(args[cleanupIndex + 1], 10) 
    : 30;

  try {
    await createBackup({ label });

    if (shouldCleanup) {
      await cleanOldBackups(retentionDays);
    }
  } catch (error) {
    console.error('Backup script failed:', error);
    process.exit(1);
  }
}

// Run if called directly
if (require.main === module) {
  main();
}
