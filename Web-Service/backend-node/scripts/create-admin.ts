import { PrismaClient } from '@prisma/client';
import { hashPassword } from '../src/utils/password';

const prisma = new PrismaClient();

async function createAdminUser() {
  try {
    console.log('🔍 Checking for existing admin user...');

    const adminEmail = 'admin@synaptihand.com';
    const adminPassword = 'Admin123!';

    // Check if admin exists
    const existingAdmin = await prisma.user.findUnique({
      where: { email: adminEmail }
    });

    if (existingAdmin) {
      console.log('✅ Admin user already exists:', existingAdmin.email);
      console.log('   Role:', existingAdmin.role);
      console.log('   Active:', existingAdmin.isActive);
      console.log('   Approved:', existingAdmin.isApproved);

      // Update admin to ensure correct settings
      const updated = await prisma.user.update({
        where: { id: existingAdmin.id },
        data: {
          role: 'admin',
          isActive: true,
          isApproved: true,
          passwordHash: await hashPassword(adminPassword)
        }
      });

      console.log('🔧 Updated admin user settings');
      console.log('   Email:', adminEmail);
      console.log('   Password:', adminPassword);
      return;
    }

    // Create new admin user
    console.log('📝 Creating new admin user...');

    const passwordHash = await hashPassword(adminPassword);

    const admin = await prisma.user.create({
      data: {
        email: adminEmail,
        passwordHash,
        firstName: 'Admin',
        lastName: 'User',
        fullName: 'Admin User',
        role: 'admin',
        isActive: true,
        isApproved: true,
        hospital: 'SynaptiHand System',
        department: 'Administration'
      }
    });

    console.log('✅ Admin user created successfully!');
    console.log('   Email:', adminEmail);
    console.log('   Password:', adminPassword);
    console.log('   ID:', admin.id);

    // Create audit log
    await prisma.auditLog.create({
      data: {
        userId: admin.id,
        action: 'admin.created',
        resource: 'users',
        details: JSON.stringify({ email: admin.email, method: 'script' })
      }
    });

  } catch (error) {
    console.error('❌ Error creating admin user:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

async function listAllUsers() {
  try {
    console.log('\n📋 Current users in database:');
    console.log('='.repeat(80));

    const users = await prisma.user.findMany({
      select: {
        id: true,
        email: true,
        role: true,
        isActive: true,
        isApproved: true,
        createdAt: true
      },
      orderBy: { createdAt: 'asc' }
    });

    if (users.length === 0) {
      console.log('No users found in database.');
    } else {
      users.forEach((user, index) => {
        console.log(`\n${index + 1}. ${user.email}`);
        console.log(`   Role: ${user.role}`);
        console.log(`   Active: ${user.isActive}`);
        console.log(`   Approved: ${user.isApproved}`);
        console.log(`   Created: ${user.createdAt.toISOString()}`);
      });
    }

    console.log('\n' + '='.repeat(80));
    console.log(`Total users: ${users.length}`);

  } catch (error) {
    console.error('❌ Error listing users:', error);
  } finally {
    await prisma.$disconnect();
  }
}

// Run both functions
async function main() {
  await createAdminUser();
  await listAllUsers();
}

main().catch(console.error);
