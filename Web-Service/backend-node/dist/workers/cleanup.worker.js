"use strict";
/**
 * Automated Cleanup Worker
 *
 * Permanently deletes soft-deleted records older than 15 days
 * Runs daily at 2 AM
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.startCleanupCronJob = startCleanupCronJob;
exports.runCleanupNow = runCleanupNow;
exports.previewCleanup = previewCleanup;
const client_1 = require("@prisma/client");
const schema_compat_1 = require("../utils/schema-compat");
const node_cron_1 = __importDefault(require("node-cron"));
const child_process_1 = require("child_process");
const util_1 = require("util");
const gcs_service_1 = require("../services/gcs.service");
const execAsync = (0, util_1.promisify)(child_process_1.exec);
const basePrisma = new client_1.PrismaClient();
const prisma = (0, schema_compat_1.extendPrismaWithStubs)(basePrisma);
// Configuration from environment variables
const CLEANUP_ENABLED = process.env.CLEANUP_ENABLED !== 'false';
const CLEANUP_RETENTION_DAYS = parseInt(process.env.CLEANUP_RETENTION_DAYS || '15', 10);
const CLEANUP_CRON = process.env.CLEANUP_CRON || '0 0 2 * * *';
/**
 * Calculate the cutoff date based on retention days
 */
function getRetentionCutoffDate() {
    const date = new Date();
    date.setDate(date.getDate() - CLEANUP_RETENTION_DAYS);
    return date;
}
/**
 * Create a backup before cleanup
 */
async function createBackupBeforeCleanup() {
    console.log('📦 Creating backup before cleanup...');
    try {
        await execAsync('npx tsx scripts/backup-database.ts --label "pre-cleanup"');
        console.log('✅ Backup completed successfully\n');
        return true;
    }
    catch (error) {
        console.error('⚠️  Backup failed:', error);
        console.error('   Continuing with cleanup anyway (non-critical error)\n');
        return false;
    }
}
/**
 * Permanently delete soft-deleted records older than 15 days
 */
async function cleanupSoftDeletedRecords() {
    const cutoffDate = getRetentionCutoffDate();
    const stats = {
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
                videoPath: true,
                csvPath: true,
                keypointsPath: true,
                metadataPath: true,
            }
        });
        // Delete GCS files for each recording
        let gcsFilesDeleted = 0;
        let gcsFilesFailed = 0;
        for (const recording of recordingsToDelete) {
            const paths = [
                recording.videoPath,
                recording.csvPath,
                recording.keypointsPath,
                recording.metadataPath,
            ].filter(Boolean);
            for (const gcsPath of paths) {
                try {
                    await gcs_service_1.gcsService.deleteFile(gcsPath);
                    gcsFilesDeleted++;
                }
                catch (err) {
                    console.warn(`   ⚠️  Failed to delete GCS file: ${gcsPath}`);
                    gcsFilesFailed++;
                }
            }
            // Also try to delete Result-Output folder for this recording
            try {
                const resultFiles = await gcs_service_1.gcsService.listFiles(`Result-Output/${recording.id}`);
                for (const resultFile of resultFiles) {
                    try {
                        await gcs_service_1.gcsService.deleteFile(resultFile);
                        gcsFilesDeleted++;
                    }
                    catch (err) {
                        gcsFilesFailed++;
                    }
                }
            }
            catch (err) {
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
    }
    catch (error) {
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
function startCleanupCronJob() {
    if (!CLEANUP_ENABLED) {
        console.log('⏸️  Automated cleanup is DISABLED (CLEANUP_ENABLED=false)\n');
        return;
    }
    console.log('⏰ Scheduling automated cleanup cron job...');
    console.log(`   Schedule: ${CLEANUP_CRON}`);
    console.log(`   Retention: ${CLEANUP_RETENTION_DAYS} days`);
    console.log(`   Timezone: UTC`);
    console.log(`   Action: Delete soft-deleted records older than ${CLEANUP_RETENTION_DAYS} days\n`);
    node_cron_1.default.schedule(CLEANUP_CRON, async () => {
        try {
            await cleanupSoftDeletedRecords();
        }
        catch (error) {
            console.error('Scheduled cleanup failed:', error);
        }
    }, {
        scheduled: true,
        timezone: 'UTC'
    });
    console.log('✅ Cleanup cron job scheduled successfully\n');
}
async function runCleanupNow() {
    return await cleanupSoftDeletedRecords();
}
async function previewCleanup() {
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
