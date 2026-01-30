#!/usr/bin/env tsx
/**
 * Database Inspection and Cleanup Script
 *
 * This script helps identify and clean up problematic entries in the database
 * that prevent deletion of protocols, patients, users, and projects.
 *
 * Usage:
 *   npx tsx scripts/inspect-and-cleanup-db.ts --inspect     # Inspect only
 *   npx tsx scripts/inspect-and-cleanup-db.ts --cleanup     # Cleanup problematic entries
 *   npx tsx scripts/inspect-and-cleanup-db.ts --hard-reset  # DANGER: Reset entire database
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

interface IssueReport {
  table: string;
  issueType: string;
  count: number;
  details: any[];
}

const issues: IssueReport[] = [];

// ============================================================================
// INSPECTION FUNCTIONS
// ============================================================================

async function inspectProtocols() {
  console.log('\n🔍 Inspecting Protocols...');

  // Check for protocols with invalid createdById references
  const protocolsWithInvalidUser = await prisma.$queryRaw<any[]>`
    SELECT p.id, p.name, p.created_by_id, p.deleted_at
    FROM protocols p
    LEFT JOIN users u ON p.created_by_id = u.id
    WHERE u.id IS NULL
  `;

  if (protocolsWithInvalidUser.length > 0) {
    issues.push({
      table: 'protocols',
      issueType: 'INVALID_USER_REFERENCE',
      count: protocolsWithInvalidUser.length,
      details: protocolsWithInvalidUser
    });
    console.log(`  ❌ Found ${protocolsWithInvalidUser.length} protocols with invalid createdById references`);
    protocolsWithInvalidUser.forEach((p: any) => {
      console.log(`     - Protocol ID: ${p.id}, Name: ${p.name}, Invalid User ID: ${p.created_by_id}`);
    });
  }

  // Check for protocols with recordings that prevent deletion
  const protocolsWithRecordings = await prisma.protocol.findMany({
    where: {
      deletedAt: null,
    },
    select: {
      id: true,
      name: true,
      _count: {
        select: { recordings: true }
      }
    }
  });

  const protocolsWithActiveRecordings = protocolsWithRecordings.filter(p => p._count.recordings > 0);
  if (protocolsWithActiveRecordings.length > 0) {
    console.log(`  ℹ️  Found ${protocolsWithActiveRecordings.length} protocols with recordings (can only be soft-deleted)`);
    protocolsWithActiveRecordings.forEach((p: any) => {
      console.log(`     - Protocol ID: ${p.id}, Name: ${p.name}, Recordings: ${p._count.recordings}`);
    });
  }

  // Check for soft-deleted protocols
  const softDeletedProtocols = await prisma.protocol.count({
    where: { deletedAt: { not: null } }
  });
  console.log(`  📊 Soft-deleted protocols: ${softDeletedProtocols}`);

  return protocolsWithInvalidUser.length;
}

async function inspectPatients() {
  console.log('\n🔍 Inspecting Patients...');

  // Check for patients with invalid project references
  const patientsWithInvalidProject = await prisma.$queryRaw<any[]>`
    SELECT p.id, p.patient_id, p.patient_name, p.project_id
    FROM patients p
    LEFT JOIN projects pr ON p.project_id = pr.id
    WHERE pr.id IS NULL
  `;

  if (patientsWithInvalidProject.length > 0) {
    issues.push({
      table: 'patients',
      issueType: 'INVALID_PROJECT_REFERENCE',
      count: patientsWithInvalidProject.length,
      details: patientsWithInvalidProject
    });
    console.log(`  ❌ Found ${patientsWithInvalidProject.length} patients with invalid projectId references`);
    patientsWithInvalidProject.forEach((p: any) => {
      console.log(`     - Patient ID: ${p.id}, Name: ${p.patient_name}, Invalid Project ID: ${p.project_id}`);
    });
  }

  // Check for patients with invalid createdBy references
  const patientsWithInvalidCreator = await prisma.$queryRaw<any[]>`
    SELECT p.id, p.patient_id, p.patient_name, p.created_by_id
    FROM patients p
    LEFT JOIN users u ON p.created_by_id = u.id
    WHERE u.id IS NULL
  `;

  if (patientsWithInvalidCreator.length > 0) {
    issues.push({
      table: 'patients',
      issueType: 'INVALID_CREATOR_REFERENCE',
      count: patientsWithInvalidCreator.length,
      details: patientsWithInvalidCreator
    });
    console.log(`  ❌ Found ${patientsWithInvalidCreator.length} patients with invalid createdById references`);
    patientsWithInvalidCreator.forEach((p: any) => {
      console.log(`     - Patient ID: ${p.id}, Name: ${p.patient_name}, Invalid User ID: ${p.created_by_id}`);
    });
  }

  // Check for duplicate patientId values
  const duplicatePatientIds = await prisma.$queryRaw<any[]>`
    SELECT patient_id, COUNT(*) as count
    FROM patients
    WHERE deleted_at IS NULL
    GROUP BY patient_id
    HAVING COUNT(*) > 1
  `;

  if (duplicatePatientIds.length > 0) {
    issues.push({
      table: 'patients',
      issueType: 'DUPLICATE_PATIENT_ID',
      count: duplicatePatientIds.length,
      details: duplicatePatientIds
    });
    console.log(`  ⚠️  Found ${duplicatePatientIds.length} duplicate patientId values`);
    duplicatePatientIds.forEach((d: any) => {
      console.log(`     - Patient ID: ${d.patient_id}, Count: ${d.count}`);
    });
  }

  // Check for soft-deleted patients
  const softDeletedPatients = await prisma.patient.count({
    where: { deletedAt: { not: null } }
  });
  console.log(`  📊 Soft-deleted patients: ${softDeletedPatients}`);

  return patientsWithInvalidProject.length + patientsWithInvalidCreator.length;
}

async function inspectUsers() {
  console.log('\n🔍 Inspecting Users...');

  // Check for users with orphaned sessions
  const usersWithOrphanedSessions = await prisma.$queryRaw<any[]>`
    SELECT u.id, u.email, u.deleted_at, COUNT(s.id) as session_count
    FROM users u
    LEFT JOIN sessions s ON u.id = s.user_id
    WHERE u.deleted_at IS NOT NULL AND s.id IS NOT NULL
    GROUP BY u.id
  `;

  if (usersWithOrphanedSessions.length > 0) {
    issues.push({
      table: 'users',
      issueType: 'ORPHANED_SESSIONS',
      count: usersWithOrphanedSessions.length,
      details: usersWithOrphanedSessions
    });
    console.log(`  ⚠️  Found ${usersWithOrphanedSessions.length} deleted users with active sessions`);
  }

  // Check for duplicate emails
  const duplicateEmails = await prisma.$queryRaw<any[]>`
    SELECT email, COUNT(*) as count
    FROM users
    WHERE deleted_at IS NULL
    GROUP BY email
    HAVING COUNT(*) > 1
  `;

  if (duplicateEmails.length > 0) {
    issues.push({
      table: 'users',
      issueType: 'DUPLICATE_EMAIL',
      count: duplicateEmails.length,
      details: duplicateEmails
    });
    console.log(`  ❌ Found ${duplicateEmails.length} duplicate email addresses`);
    duplicateEmails.forEach((d: any) => {
      console.log(`     - Email: ${d.email}, Count: ${d.count}`);
    });
  }

  // Check for users without proper approval status
  const usersWithNullApproval = await prisma.user.count({
    where: {
      isApproved: null,
      deletedAt: null
    }
  });
  console.log(`  ℹ️  Users pending approval: ${usersWithNullApproval}`);

  // Check for soft-deleted users
  const softDeletedUsers = await prisma.user.count({
    where: { deletedAt: { not: null } }
  });
  console.log(`  📊 Soft-deleted users: ${softDeletedUsers}`);

  return duplicateEmails.length;
}

async function inspectProjects() {
  console.log('\n🔍 Inspecting Projects...');

  // Check for projects with invalid owner references
  const projectsWithInvalidOwner = await prisma.$queryRaw<any[]>`
    SELECT p.id, p.name, p.owner_id
    FROM projects p
    LEFT JOIN users u ON p.owner_id = u.id
    WHERE u.id IS NULL
  `;

  if (projectsWithInvalidOwner.length > 0) {
    issues.push({
      table: 'projects',
      issueType: 'INVALID_OWNER_REFERENCE',
      count: projectsWithInvalidOwner.length,
      details: projectsWithInvalidOwner
    });
    console.log(`  ❌ Found ${projectsWithInvalidOwner.length} projects with invalid ownerId references`);
    projectsWithInvalidOwner.forEach((p: any) => {
      console.log(`     - Project ID: ${p.id}, Name: ${p.name}, Invalid Owner ID: ${p.owner_id}`);
    });
  }

  // Check for projects with patients
  const projectsWithPatients = await prisma.project.findMany({
    where: { deletedAt: null },
    select: {
      id: true,
      name: true,
      _count: {
        select: {
          patients: true,
          recordings: true,
          members: true
        }
      }
    }
  });

  const projectsWithDependencies = projectsWithPatients.filter(
    p => p._count.patients > 0 || p._count.recordings > 0 || p._count.members > 0
  );

  if (projectsWithDependencies.length > 0) {
    console.log(`  ℹ️  Found ${projectsWithDependencies.length} projects with dependencies (can only be soft-deleted)`);
    projectsWithDependencies.forEach((p: any) => {
      console.log(`     - Project: ${p.name}, Patients: ${p._count.patients}, Recordings: ${p._count.recordings}, Members: ${p._count.members}`);
    });
  }

  // Check for soft-deleted projects
  const softDeletedProjects = await prisma.project.count({
    where: { deletedAt: { not: null } }
  });
  console.log(`  📊 Soft-deleted projects: ${softDeletedProjects}`);

  return projectsWithInvalidOwner.length;
}

async function inspectRecordings() {
  console.log('\n🔍 Inspecting Recordings...');

  // Check for recordings with invalid references
  const recordingsWithInvalidRefs = await prisma.$queryRaw<any[]>`
    SELECT
      r.id,
      r.patient_model_id,
      r.project_id,
      r.protocol_id,
      CASE WHEN p.id IS NULL AND r.patient_model_id IS NOT NULL THEN 1 ELSE 0 END as invalid_patient,
      CASE WHEN pr.id IS NULL AND r.project_id IS NOT NULL THEN 1 ELSE 0 END as invalid_project,
      CASE WHEN pt.id IS NULL AND r.protocol_id IS NOT NULL THEN 1 ELSE 0 END as invalid_protocol
    FROM recording_sessions r
    LEFT JOIN patients p ON r.patient_model_id = p.id
    LEFT JOIN projects pr ON r.project_id = pr.id
    LEFT JOIN protocols pt ON r.protocol_id = pt.id
    WHERE (p.id IS NULL AND r.patient_model_id IS NOT NULL)
       OR (pr.id IS NULL AND r.project_id IS NOT NULL)
       OR (pt.id IS NULL AND r.protocol_id IS NOT NULL)
  `;

  if (recordingsWithInvalidRefs.length > 0) {
    issues.push({
      table: 'recording_sessions',
      issueType: 'INVALID_REFERENCES',
      count: recordingsWithInvalidRefs.length,
      details: recordingsWithInvalidRefs
    });
    console.log(`  ❌ Found ${recordingsWithInvalidRefs.length} recordings with invalid references`);
    recordingsWithInvalidRefs.forEach((r: any) => {
      const invalids = [];
      if (r.invalid_patient) invalids.push('Patient');
      if (r.invalid_project) invalids.push('Project');
      if (r.invalid_protocol) invalids.push('Protocol');
      console.log(`     - Recording ID: ${r.id}, Invalid: ${invalids.join(', ')}`);
    });
  }

  return recordingsWithInvalidRefs.length;
}

// ============================================================================
// CLEANUP FUNCTIONS
// ============================================================================

async function cleanupProtocols() {
  console.log('\n🧹 Cleaning up Protocols...');

  // Delete protocols with invalid user references
  const protocolsToDelete = await prisma.$queryRaw<any[]>`
    SELECT p.id
    FROM protocols p
    LEFT JOIN users u ON p.created_by_id = u.id
    WHERE u.id IS NULL
  `;

  if (protocolsToDelete.length > 0) {
    console.log(`  🗑️  Deleting ${protocolsToDelete.length} protocols with invalid references...`);
    for (const p of protocolsToDelete) {
      await prisma.protocol.delete({ where: { id: p.id } });
      console.log(`     ✓ Deleted protocol ${p.id}`);
    }
  }
}

async function cleanupPatients() {
  console.log('\n🧹 Cleaning up Patients...');

  // Delete patients with invalid project references
  const patientsWithInvalidProject = await prisma.$queryRaw<any[]>`
    SELECT p.id
    FROM patients p
    LEFT JOIN projects pr ON p.project_id = pr.id
    WHERE pr.id IS NULL
  `;

  if (patientsWithInvalidProject.length > 0) {
    console.log(`  🗑️  Deleting ${patientsWithInvalidProject.length} patients with invalid project references...`);
    for (const p of patientsWithInvalidProject) {
      await prisma.patient.delete({ where: { id: p.id } });
      console.log(`     ✓ Deleted patient ${p.id}`);
    }
  }

  // Delete patients with invalid creator references
  const patientsWithInvalidCreator = await prisma.$queryRaw<any[]>`
    SELECT p.id
    FROM patients p
    LEFT JOIN users u ON p.created_by_id = u.id
    WHERE u.id IS NULL
  `;

  if (patientsWithInvalidCreator.length > 0) {
    console.log(`  🗑️  Deleting ${patientsWithInvalidCreator.length} patients with invalid creator references...`);
    for (const p of patientsWithInvalidCreator) {
      await prisma.patient.delete({ where: { id: p.id } });
      console.log(`     ✓ Deleted patient ${p.id}`);
    }
  }
}

async function cleanupUsers() {
  console.log('\n🧹 Cleaning up Users...');

  // Clean up sessions for deleted users
  const deletedUserSessions = await prisma.$queryRaw<any[]>`
    SELECT s.id
    FROM sessions s
    JOIN users u ON s.user_id = u.id
    WHERE u.deleted_at IS NOT NULL
  `;

  if (deletedUserSessions.length > 0) {
    console.log(`  🗑️  Deleting ${deletedUserSessions.length} sessions for deleted users...`);
    for (const s of deletedUserSessions) {
      await prisma.session.delete({ where: { id: s.id } });
    }
  }
}

async function cleanupProjects() {
  console.log('\n🧹 Cleaning up Projects...');

  // Delete projects with invalid owner references
  const projectsWithInvalidOwner = await prisma.$queryRaw<any[]>`
    SELECT p.id
    FROM projects p
    LEFT JOIN users u ON p.owner_id = u.id
    WHERE u.id IS NULL
  `;

  if (projectsWithInvalidOwner.length > 0) {
    console.log(`  🗑️  Deleting ${projectsWithInvalidOwner.length} projects with invalid owner references...`);
    for (const p of projectsWithInvalidOwner) {
      // First delete dependent records due to CASCADE
      await prisma.project.delete({ where: { id: p.id } });
      console.log(`     ✓ Deleted project ${p.id}`);
    }
  }
}

async function cleanupRecordings() {
  console.log('\n🧹 Cleaning up Recordings...');

  // Delete recordings with invalid references
  const recordingsToDelete = await prisma.$queryRaw<any[]>`
    SELECT r.id
    FROM recording_sessions r
    LEFT JOIN patients p ON r.patient_model_id = p.id
    LEFT JOIN projects pr ON r.project_id = pr.id
    LEFT JOIN protocols pt ON r.protocol_id = pt.id
    WHERE (p.id IS NULL AND r.patient_model_id IS NOT NULL)
       OR (pr.id IS NULL AND r.project_id IS NOT NULL)
       OR (pt.id IS NULL AND r.protocol_id IS NOT NULL)
  `;

  if (recordingsToDelete.length > 0) {
    console.log(`  🗑️  Deleting ${recordingsToDelete.length} recordings with invalid references...`);
    for (const r of recordingsToDelete) {
      await prisma.recordingSession.delete({ where: { id: r.id } });
      console.log(`     ✓ Deleted recording ${r.id}`);
    }
  }
}

// ============================================================================
// MAIN EXECUTION
// ============================================================================

async function inspect() {
  console.log('═══════════════════════════════════════════════════════');
  console.log('🔍 DATABASE INSPECTION REPORT');
  console.log('═══════════════════════════════════════════════════════');

  let totalIssues = 0;

  totalIssues += await inspectProtocols();
  totalIssues += await inspectPatients();
  totalIssues += await inspectUsers();
  totalIssues += await inspectProjects();
  totalIssues += await inspectRecordings();

  console.log('\n═══════════════════════════════════════════════════════');
  console.log('📊 SUMMARY');
  console.log('═══════════════════════════════════════════════════════');

  if (issues.length > 0) {
    console.log(`\n❌ Found ${issues.length} types of issues affecting ${totalIssues} records:\n`);
    issues.forEach(issue => {
      console.log(`  - ${issue.table}: ${issue.issueType} (${issue.count} records)`);
    });
    console.log('\n💡 Run with --cleanup flag to fix these issues');
  } else {
    console.log('\n✅ No integrity issues found!');
  }

  console.log('\n');
}

async function cleanup() {
  console.log('═══════════════════════════════════════════════════════');
  console.log('🧹 DATABASE CLEANUP');
  console.log('═══════════════════════════════════════════════════════');
  console.log('\n⚠️  WARNING: This will permanently delete problematic records!');
  console.log('⚠️  Make sure you have a backup before proceeding.\n');

  // Run inspection first
  await inspect();

  if (issues.length === 0) {
    console.log('✅ No cleanup needed!');
    return;
  }

  console.log('\n🔧 Starting cleanup in 3 seconds...');
  await new Promise(resolve => setTimeout(resolve, 3000));

  await cleanupRecordings();  // Clean recordings first (they reference others)
  await cleanupPatients();    // Then patients
  await cleanupProtocols();   // Then protocols
  await cleanupUsers();       // Then users
  await cleanupProjects();    // Finally projects

  console.log('\n═══════════════════════════════════════════════════════');
  console.log('✅ CLEANUP COMPLETE');
  console.log('═══════════════════════════════════════════════════════');
  console.log('\n💡 Run --inspect again to verify all issues are resolved\n');
}

async function hardReset() {
  console.log('═══════════════════════════════════════════════════════');
  console.log('💣 HARD RESET - DANGER ZONE');
  console.log('═══════════════════════════════════════════════════════');
  console.log('\n⚠️  ⚠️  ⚠️  WARNING ⚠️  ⚠️  ⚠️');
  console.log('This will DELETE ALL DATA from the database!');
  console.log('This action CANNOT be undone!');
  console.log('\nAborting in 5 seconds... Press Ctrl+C to cancel.');

  await new Promise(resolve => setTimeout(resolve, 5000));

  console.log('\n🗑️  Deleting all data...\n');

  // Delete in reverse dependency order
  await prisma.emailVerification.deleteMany();
  await prisma.apiKey.deleteMany();
  await prisma.adminNote.deleteMany();
  await prisma.recordingComparison.deleteMany();
  await prisma.report.deleteMany();
  await prisma.clinicalAnnotation.deleteMany();
  await prisma.clinicalAnalysis.deleteMany();
  await prisma.signalProcessingResult.deleteMany();
  await prisma.recordingSession.deleteMany();
  await prisma.protocol.deleteMany();
  await prisma.patient.deleteMany();
  await prisma.projectInvitation.deleteMany();
  await prisma.projectMember.deleteMany();
  await prisma.project.deleteMany();
  await prisma.auditLog.deleteMany();
  await prisma.session.deleteMany();
  await prisma.user.deleteMany();

  console.log('✅ All data deleted!');
  console.log('💡 Run: npx prisma migrate reset --skip-seed');
  console.log('   Or: npm run seed  (to create admin user)\n');
}

// ============================================================================
// CLI
// ============================================================================

async function main() {
  const args = process.argv.slice(2);

  if (args.includes('--help') || args.length === 0) {
    console.log(`
Database Inspection and Cleanup Tool

Usage:
  npx tsx scripts/inspect-and-cleanup-db.ts [OPTIONS]

Options:
  --inspect      Inspect database for integrity issues (default)
  --cleanup      Fix integrity issues by deleting problematic records
  --hard-reset   DANGER: Delete ALL data from database
  --help         Show this help message

Examples:
  npx tsx scripts/inspect-and-cleanup-db.ts --inspect
  npx tsx scripts/inspect-and-cleanup-db.ts --cleanup
    `);
    return;
  }

  try {
    if (args.includes('--hard-reset')) {
      await hardReset();
    } else if (args.includes('--cleanup')) {
      await cleanup();
    } else {
      await inspect();
    }
  } catch (error) {
    console.error('\n❌ Error:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main();
