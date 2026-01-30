#!/usr/bin/env tsx
/**
 * Find Problematic Protocols Script
 *
 * This script identifies exactly which protocols are failing to delete and why.
 *
 * Usage:
 *   cd Web-Service/backend-node
 *   npx tsx scripts/find-problematic-protocols.ts
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('═══════════════════════════════════════════════════════');
  console.log('🔍 FINDING PROBLEMATIC PROTOCOLS');
  console.log('═══════════════════════════════════════════════════════\n');

  // Get all protocols with recording counts
  const allProtocols = await prisma.protocol.findMany({
    where: { deletedAt: null },
    include: {
      createdBy: { select: { email: true, id: true } },
      _count: {
        select: { recordings: true }
      }
    },
    orderBy: { createdAt: 'desc' }
  });

  // Categorize protocols
  const withRecordings = allProtocols.filter(p => p._count.recordings > 0);
  const withoutRecordings = allProtocols.filter(p => p._count.recordings === 0);

  // Soft-deleted protocols
  const softDeleted = await prisma.protocol.findMany({
    where: { deletedAt: { not: null } },
    include: {
      createdBy: { select: { email: true, id: true } },
      _count: {
        select: { recordings: true }
      }
    },
    orderBy: { deletedAt: 'desc' }
  });

  // Display results
  console.log('📊 SUMMARY');
  console.log('─'.repeat(70));
  console.log(`Total Active Protocols: ${allProtocols.length}`);
  console.log(`  ✅ Can Hard Delete:  ${withoutRecordings.length} (no recordings)`);
  console.log(`  ⚠️  Can ONLY Soft Delete: ${withRecordings.length} (have recordings)`);
  console.log(`  🗑️  Already Soft Deleted: ${softDeleted.length}`);
  console.log('');

  if (withRecordings.length > 0) {
    console.log('⚠️  PROTOCOLS WITH RECORDINGS (Cannot Hard Delete)');
    console.log('═'.repeat(70));
    console.log('These protocols have associated recordings and can ONLY be soft-deleted:\n');

    withRecordings.forEach((protocol, index) => {
      console.log(`${index + 1}. Protocol: "${protocol.name}"`);
      console.log(`   ID: ${protocol.id}`);
      console.log(`   Created By: ${protocol.createdBy.email}`);
      console.log(`   Recordings: ${protocol._count.recordings}`);
      console.log(`   Status: ${protocol.isActive ? 'Active' : 'Inactive'}`);
      console.log(`   Visibility: ${protocol.isPublic ? 'Public' : 'Private'}`);
      console.log(`   ❌ Cannot hard-delete (has ${protocol._count.recordings} recording(s))`);
      console.log(`   ✅ Can soft-delete (sets deletedAt timestamp)`);
      console.log('');
    });

    console.log('\n💡 To soft-delete these protocols:');
    console.log('   1. Frontend: Click delete button (auto-soft-deletes)');
    console.log('   2. API: DELETE /api/protocols/{id} (omit "hard" or set to false)');
    console.log('   3. Direct: UPDATE protocols SET deleted_at = CURRENT_TIMESTAMP WHERE id = ?');
    console.log('');
  }

  if (withoutRecordings.length > 0) {
    console.log('✅ PROTOCOLS WITHOUT RECORDINGS (Can Hard Delete)');
    console.log('═'.repeat(70));
    console.log('These protocols can be permanently deleted:\n');

    withoutRecordings.forEach((protocol, index) => {
      console.log(`${index + 1}. Protocol: "${protocol.name}"`);
      console.log(`   ID: ${protocol.id}`);
      console.log(`   Created By: ${protocol.createdBy.email}`);
      console.log(`   Status: ${protocol.isActive ? 'Active' : 'Inactive'}`);
      console.log(`   ✅ Can hard-delete (no recordings)`);
      console.log('');
    });
  }

  if (softDeleted.length > 0) {
    console.log('\n🗑️  SOFT-DELETED PROTOCOLS');
    console.log('═'.repeat(70));
    console.log('These protocols are already soft-deleted:\n');

    softDeleted.forEach((protocol, index) => {
      console.log(`${index + 1}. Protocol: "${protocol.name}"`);
      console.log(`   ID: ${protocol.id}`);
      console.log(`   Deleted At: ${protocol.deletedAt}`);
      console.log(`   Recordings: ${protocol._count.recordings}`);
      console.log('');
    });
  }

  // Check for specific issues
  console.log('\n🔍 CHECKING FOR SPECIFIC ISSUES');
  console.log('═'.repeat(70));

  // Check for invalid creator references
  const invalidCreatorProtocols = await prisma.$queryRaw<any[]>`
    SELECT p.id, p.name, p.created_by_id
    FROM protocols p
    LEFT JOIN users u ON p.created_by_id = u.id
    WHERE u.id IS NULL AND p.deleted_at IS NULL
  `;

  if (invalidCreatorProtocols.length > 0) {
    console.log('\n❌ INTEGRITY ISSUE: Protocols with invalid creator references');
    invalidCreatorProtocols.forEach(p => {
      console.log(`   - Protocol "${p.name}" (ID: ${p.id})`);
      console.log(`     Invalid creator_id: ${p.created_by_id}`);
    });
    console.log('\n   Fix: Run cleanup script');
    console.log('   npx tsx scripts/inspect-and-cleanup-db.ts --cleanup\n');
  } else {
    console.log('✅ All protocols have valid creator references');
  }

  // Generate delete commands for hard-deletable protocols
  if (withoutRecordings.length > 0) {
    console.log('\n📝 SAFE DELETE COMMANDS');
    console.log('═'.repeat(70));
    console.log('Run these to permanently delete protocols without recordings:\n');

    console.log('-- SQL Commands:');
    withoutRecordings.forEach(p => {
      console.log(`DELETE FROM protocols WHERE id = '${p.id}'; -- ${p.name}`);
    });

    console.log('\n-- OR via API:');
    withoutRecordings.forEach(p => {
      console.log(`curl -X DELETE http://localhost:5000/api/protocols/${p.id} \\`);
      console.log(`  -H "Authorization: Bearer YOUR_TOKEN" \\`);
      console.log(`  -H "Content-Type: application/json" \\`);
      console.log(`  -d '{"hard": true}'  # ${p.name}\n`);
    });
  }

  console.log('\n═══════════════════════════════════════════════════════');
  console.log('✨ ANALYSIS COMPLETE');
  console.log('═══════════════════════════════════════════════════════\n');
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
