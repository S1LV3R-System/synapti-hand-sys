import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcrypt';
import { createClient } from '@supabase/supabase-js';

const prisma = new PrismaClient();
const SALT_ROUNDS = 10;

// Initialize Supabase Admin client for seeding
const supabaseUrl = process.env.SUPABASE_URL || '';
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const supabaseAdmin = (supabaseUrl && supabaseServiceRoleKey)
  ? createClient(supabaseUrl, supabaseServiceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false }
    })
  : null;

/**
 * Create a user in both Supabase Auth and User-Main table
 */
async function createDualUser(userData: {
  email: string;
  password: string;
  userType: string;
  firstName: string;
  lastName: string;
  birthDate: Date;
  phoneNumber: string;
  institute: string;
  department: string;
  verificationStatus: boolean;
  approvalStatus: boolean;
  middleName?: string;
}) {
  let authUserId: string | null = null;

  // Create Supabase Auth user if available
  if (supabaseAdmin) {
    try {
      const { data: authData, error } = await supabaseAdmin.auth.admin.createUser({
        email: userData.email,
        password: userData.password,
        email_confirm: userData.verificationStatus, // Verified users = confirmed
        user_metadata: {
          user_type: userData.userType,
          first_name: userData.firstName,
          last_name: userData.lastName,
        }
      });

      if (error) {
        console.warn(`  ⚠️ Supabase Auth user creation failed for ${userData.email}:`, error.message);
      } else {
        authUserId = authData.user?.id || null;
        console.log(`  ✅ Created Supabase Auth user: ${authUserId}`);
      }
    } catch (error) {
      console.warn(`  ⚠️ Supabase Auth error for ${userData.email}:`, error);
    }
  }

  // Create User-Main record
  const passwordHash = await bcrypt.hash(userData.password, SALT_ROUNDS);
  const user = await prisma.user.create({
    data: {
      email: userData.email,
      passwordHash,
      userType: userData.userType,
      firstName: userData.firstName,
      middleName: userData.middleName || '',
      lastName: userData.lastName,
      birthDate: userData.birthDate,
      phoneNumber: userData.phoneNumber,
      institute: userData.institute,
      department: userData.department,
      authUserId,  // Link to Supabase Auth
      verificationStatus: userData.verificationStatus,
      approvalStatus: userData.approvalStatus,
      verifiedAt: userData.verificationStatus ? new Date() : null,
      approvedAt: userData.approvalStatus ? new Date() : null,
    },
  });

  return user;
}

async function main() {
  console.log('🌱 Starting database seeding...');
  console.log('📦 Database: Supabase PostgreSQL');

  // Check if admin user already exists
  const existingAdmin = await prisma.user.findFirst({
    where: { email: 'admin@synaptihand.com' },
  });

  let admin = existingAdmin;

  if (!existingAdmin) {
    console.log('Creating default admin user...');

    // Create default admin user in both Supabase Auth and User-Main
    admin = await createDualUser({
      email: 'admin@synaptihand.com',
      password: 'Admin123!@',
      userType: 'Admin',
      firstName: 'System',
      lastName: 'Administrator',
      birthDate: new Date('1990-01-01'),
      phoneNumber: '+1234567890',
      institute: 'SynaptiHand',
      department: 'Administration',
      verificationStatus: true,
      approvalStatus: true,
    });

    console.log('✅ Created default admin user:');
    console.log('   Email: admin@synaptihand.com');
    console.log('   Password: Admin123!@');
    console.log('   Type: Admin');
    if (admin.authUserId) {
      console.log(`   Supabase Auth ID: ${admin.authUserId}`);
    }
    console.log('');
    console.log('⚠️  IMPORTANT: Change this password after first login!');

    // Create audit log for admin creation
    await prisma.auditLog.create({
      data: {
        userId: admin.id,
        action: 'user.seed',
        resource: 'user',
        resourceId: admin.id,
        details: JSON.stringify({
          message: 'Initial admin user profile created via database seed',
          database: 'Supabase PostgreSQL',
          timestamp: new Date().toISOString(),
        }),
        ipAddress: '127.0.0.1',
        userAgent: 'Database Seed Script',
        status: 'success',
      },
    });
  } else {
    console.log('ℹ️  Admin user already exists, skipping admin creation');
  }

  // Create a sample protocol for testing
  const protocol = await prisma.protocol.create({
    data: {
      protocolName: 'Standard Hand Assessment',
      protocolDescription: 'Basic hand mobility and tremor assessment protocol for general clinical use.',
      creatorId: admin.id,
      protocolInformation: [
        {
          movements: [
            { name: 'finger_tap', duration: 30, repetitions: 10, description: 'Tap index finger to thumb' },
            { name: 'hand_open_close', duration: 30, repetitions: 10, description: 'Open and close hand fully' },
            { name: 'wrist_rotation', duration: 30, repetitions: 5, description: 'Rotate wrist clockwise and counterclockwise' },
            { name: 'rest_position', duration: 60, repetitions: 1, description: 'Hold hand at rest for tremor assessment' },
          ],
          requiredMetrics: ['tremor_frequency', 'tremor_amplitude', 'sparc', 'ldljv'],
          instructions: 'Patient should be seated comfortably with forearm supported. Ensure good lighting and camera visibility of the hand.',
          clinicalGuidelines: 'Compare results against baseline measurements. Look for asymmetry between hands.',
        }
      ],
      private: false,
    },
  });

  console.log('✅ Created sample protocol:');
  console.log(`   Name: ${protocol.protocolName}`);

  // Create test users for E2E tests
  console.log('');
  console.log('🧪 Creating test users for E2E tests...');

  let createdCount = 0;

  // Create test admin if doesn't exist
  const existingTestAdmin = await prisma.user.findUnique({ where: { email: 'admin@test.com' } });
  if (!existingTestAdmin) {
    await createDualUser({
      email: 'admin@test.com',
      password: 'password123',
      userType: 'Admin',
      firstName: 'Test',
      lastName: 'Admin',
      birthDate: new Date('1990-01-01'),
      phoneNumber: '+1111111111',
      institute: 'Test Institute',
      department: 'Testing',
      verificationStatus: true,
      approvalStatus: true,
    });
    createdCount++;
  }

  // Create test clinician if doesn't exist
  const existingTestClinician = await prisma.user.findUnique({ where: { email: 'clinician@test.com' } });
  if (!existingTestClinician) {
    await createDualUser({
      email: 'clinician@test.com',
      password: 'password123',
      userType: 'Clinician',
      firstName: 'Test',
      lastName: 'Clinician',
      birthDate: new Date('1990-01-01'),
      phoneNumber: '+2222222222',
      institute: 'Test Institute',
      department: 'Clinical',
      verificationStatus: true,
      approvalStatus: true,
    });
    createdCount++;
  }

  // Create test researcher if doesn't exist
  const existingTestResearcher = await prisma.user.findUnique({ where: { email: 'researcher@test.com' } });
  if (!existingTestResearcher) {
    await createDualUser({
      email: 'researcher@test.com',
      password: 'password123',
      userType: 'Researcher',
      firstName: 'Test',
      lastName: 'Researcher',
      birthDate: new Date('1990-01-01'),
      phoneNumber: '+3333333333',
      institute: 'Test Institute',
      department: 'Research',
      verificationStatus: true,
      approvalStatus: true,
    });
    createdCount++;
  }

  if (createdCount > 0) {
    console.log(`✅ Created ${createdCount} test user(s):`);
    console.log('   Admin: admin@test.com / password123');
    console.log('   Clinician: clinician@test.com / password123');
    console.log('   Researcher: researcher@test.com / password123');
  } else {
    console.log('ℹ️  Test users already exist, skipping creation');
  }

  console.log('');
  console.log('✅ Database seeding completed successfully');
  console.log('');
  console.log('📊 Summary:');
  console.log('   - 4 user profiles created (1 admin + 3 test users)');
  console.log('   - 1 audit log entry created');
  console.log('   - 1 sample protocol created');
}

main()
  .catch((e) => {
    console.error('❌ Error during database seeding:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
