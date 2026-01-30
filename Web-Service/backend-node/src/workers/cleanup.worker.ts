/**
 * Automated Cleanup Worker
 *
 * Permanently deletes soft-deleted records older than 15 days
 * Runs daily at 2 AM
 */

import prisma from '../lib/prisma';
import cron from 'node-cron';
import { exec } from 'child_process';
import { promisify } from 'util';
import { gcsService } from '../services/gcs.service';

const execAsync = promisify(exec);


// Configuration from environment variables
const CLEANUP_ENABLED = process.env.CLEANUP_ENABLED !== 'false';
const CLEANUP_RETENTION_DAYS = parseInt(process.env.CLEANUP_RETENTION_DAYS || '15', 10);
const CLEANUP_CRON = process.env.CLEANUP_CRON || '0 0 2 * * *';

interface CleanupStats {
  protocols: number;
  patients: number;
  users: number;
  projects: number;
  recordings: number;
  total: number;
}

/**
 * Calculate the cutoff date based on retention days
 */
function getRetentionCutoffDate(): Date {
  const date = new Date();
  date.setDate(date.getDate() - CLEANUP_RETENTION_DAYS);
  return date;
}

/**
 * Create a backup before cleanup
 */
async function createBackupBeforeCleanup(): Promise<boolean> {
  console.log('📦 Creating backup before cleanup...');
  try {
    await execAsync('npx tsx scripts/backup-database.ts --label "pre-cleanup"');
    console.log('✅ Backup completed successfully\n');
    return true;
  } catch (error) {
    console.error('⚠️  Backup failed:', error);
    console.error('   Continuing with cleanup anyway (non-critical error)\n');
    return false;
  }
}

/**
 * Permanently delete soft-deleted records older than 15 days
 */
async function cleanupSoftDeletedRecords(): Promise<CleanupStats> {
  const cutoffDate = getRetentionCutoffDate();
  const stats: CleanupStats = {
    protocols: 0,
    patients: 0,
    users: 0,
    projects: 0,
    recordings: 0,
    total: 0
  };

  console.log(`\n${'='.repeat(70)}`);
  console.log(`🧹 Automated Cleanup Started: ${new Date().toISOString()}`);
  console.log(`📅 Retention Period: ${CLEANUP_RETENTION_DAYS} days`);
  console.log(`📅 Deleting records soft-deleted before: ${cutoffDate.toISOString()}`);
  console.log('='.repeat(70));

  // Create backup before cleanup
  await createBackupBeforeCleanup();

  try {
    // Delete in correct order to respect foreign keys
    // First, get recordings to delete so we can clean up their GCS files
    console.log('\n🗑️  Cleaning up Recording Sessions and GCS files...');
    const recordingsToDelete = await prisma.experimentSession.findMany({
      where: { deletedAt: { lte: cutoffDate } },
      select: {
        id: true,
        videoDataPath: true,
        rawKeypointDataPath: true,
        analyzedXlsxPath: true,
        reportPdfPath: true,
      }
    });

    // Delete GCS files for each recording
    let gcsFilesDeleted = 0;
    let gcsFilesFailed = 0;
    for (const recording of recordingsToDelete) {
      const paths = [
        recording.videoDataPath,
        recording.rawKeypointDataPath,
        recording.analyzedXlsxPath,
        recording.reportPdfPath,
      ].filter(Boolean) as string[];

      for (const gcsPath of paths) {
        try {
          await gcsService.deleteFile(gcsPath);
          gcsFilesDeleted++;
        } catch (err) {
          console.warn(`   ⚠️  Failed to delete GCS file: ${gcsPath}`);
          gcsFilesFailed++;
        }
      }

      // Also try to delete Result-Output folder for this recording
      try {
        const resultFiles = await gcsService.listFiles(`Result-Output/${recording.id}`);
        for (const resultFile of resultFiles) {
          try {
            await gcsService.deleteFile(resultFile);
            gcsFilesDeleted++;
          } catch (err) {
            gcsFilesFailed++;
          }
        }
      } catch (err) {
        // Ignore - folder may not exist
      }
    }
    console.log(`   📁 GCS files: ${gcsFilesDeleted} deleted, ${gcsFilesFailed} failed`);

    // Now delete the database records
    const deletedRecordings = await prisma.experimentSession.deleteMany({
      where: { deletedAt: { lte: cutoffDate } }
    });
    stats.recordings = deletedRecordings.count;
    console.log(`   ✅ Deleted ${deletedRecordings.count} recording(s)`);

    console.log('\n🗑️  Cleaning up Protocols...');
    const deletedProtocols = await prisma.protocol.deleteMany({
      where: { deletedAt: { lte: cutoffDate } }
    });
    stats.protocols = deletedProtocols.count;
    console.log(`   ✅ Deleted ${deletedProtocols.count} protocol(s)`);

    console.log('\n🗑️  Cleaning up Patients...');
    const deletedPatients = await prisma.patient.deleteMany({
      where: { deletedAt: { lte: cutoffDate } }
    });
    stats.patients = deletedPatients.count;
    console.log(`   ✅ Deleted ${deletedPatients.count} patient(s)`);

    console.log('\n🗑️  Cleaning up Projects...');
    const deletedProjects = await prisma.project.deleteMany({
      where: { deletedAt: { lte: cutoffDate } }
    });
    stats.projects = deletedProjects.count;
    console.log(`   ✅ Deleted ${deletedProjects.count} project(s)`);

    console.log('\n🗑️  Cleaning up Users...');
    const deletedUsers = await prisma.user.deleteMany({
      where: { deletedAt: { lte: cutoffDate } }
    });
    stats.users = deletedUsers.count;
    console.log(`   ✅ Deleted ${deletedUsers.count} user(s)`);

    stats.total = stats.protocols + stats.patients + stats.users + stats.projects + stats.recordings;

    console.log(`\n${'='.repeat(70)}`);
    console.log('📊 Cleanup Summary:');
    console.log('='.repeat(70));
    console.log(`   Recordings:  ${stats.recordings}`);
    console.log(`   Protocols:   ${stats.protocols}`);
    console.log(`   Patients:    ${stats.patients}`);
    console.log(`   Projects:    ${stats.projects}`);
    console.log(`   Users:       ${stats.users}`);
    console.log(`   ─────────────────────────`);
    console.log(`   Total:       ${stats.total}`);
    console.log('='.repeat(70));
    console.log(`✅ Cleanup Completed: ${new Date().toISOString()}\n`);

    if (stats.total > 0) {
      await prisma.auditLog.create({
        data: {
          userId: null,
          action: 'SYSTEM_CLEANUP',
          resource: 'system',
          resourceId: null,
          details: JSON.stringify({
            stats,
            retentionDays: CLEANUP_RETENTION_DAYS,
            cleanupDate: new Date().toISOString(),
            cutoffDate: cutoffDate.toISOString()
          }),
          status: 'success'
        }
      });
    }

    return stats;
  } catch (error) {
    console.error('\n❌ Cleanup Error:', error);
    await prisma.auditLog.create({
      data: {
        userId: null,
        action: 'SYSTEM_CLEANUP',
        resource: 'system',
        resourceId: null,
        details: JSON.stringify({
          error: error instanceof Error ? error.message : 'Unknown error',
          cleanupDate: new Date().toISOString()
        }),
        status: 'failure'
      }
    }).catch(console.error);
    throw error;
  }
}

export function startCleanupCronJob() {
  if (!CLEANUP_ENABLED) {
    console.log('⏸️  Automated cleanup is DISABLED (CLEANUP_ENABLED=false)\n');
    return;
  }

  console.log('⏰ Scheduling automated cleanup cron job...');
  console.log(`   Schedule: ${CLEANUP_CRON}`);
  console.log(`   Retention: ${CLEANUP_RETENTION_DAYS} days`);
  console.log(`   Timezone: UTC`);
  console.log(`   Action: Delete soft-deleted records older than ${CLEANUP_RETENTION_DAYS} days\n`);

  cron.schedule(CLEANUP_CRON, async () => {
    try {
      await cleanupSoftDeletedRecords();
    } catch (error) {
      console.error('Scheduled cleanup failed:', error);
    }
  }, {
    scheduled: true,
    timezone: 'UTC'
  });

  console.log('✅ Cleanup cron job scheduled successfully\n');
}

export async function runCleanupNow(): Promise<CleanupStats> {
  return await cleanupSoftDeletedRecords();
}

export async function previewCleanup() {
  const cutoffDate = getRetentionCutoffDate();

  const protocols = await prisma.protocol.count({ where: { deletedAt: { lte: cutoffDate } } });
  const patients = await prisma.patient.count({ where: { deletedAt: { lte: cutoffDate } } });
  const users = await prisma.user.count({ where: { deletedAt: { lte: cutoffDate } } });
  const projects = await prisma.project.count({ where: { deletedAt: { lte: cutoffDate } } });
  const recordings = await prisma.experimentSession.count({ where: { deletedAt: { lte: cutoffDate } } });

  return {
    protocols,
    patients,
    users,
    projects,
    recordings,
    total: protocols + patients + users + projects + recordings,
    retentionDays: CLEANUP_RETENTION_DAYS,
    cutoffDate
  };
}

if (process.env.NODE_ENV !== 'test') {
  startCleanupCronJob();
}
