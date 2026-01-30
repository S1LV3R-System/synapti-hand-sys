#!/bin/sh
set -e

echo "🚀 HandPose Platform Starting..."
echo "================================"

# Check if database exists
if [ ! -f "/app/data/handpose.db" ]; then
    echo "📦 Database not found. Initializing..."

    # Run migrations
    echo "🔄 Running database migrations..."
    npx prisma migrate deploy

    # Seed database with default admin
    echo "🌱 Seeding database with default admin user..."
    node -e "
    const { PrismaClient } = require('@prisma/client');
    const bcrypt = require('bcrypt');
    const prisma = new PrismaClient();

    async function seed() {
        try {
            const hashedPassword = await bcrypt.hash('Admin123!', 10);
            await prisma.user.create({
                data: {
                    email: 'admin@handpose.com',
                    passwordHash: hashedPassword,
                    fullName: 'HandPose Admin',
                    firstName: 'HandPose',
                    lastName: 'Admin',
                    role: 'admin',
                    isApproved: true,
                    isActive: true
                }
            });
            console.log('✅ Default admin user created');
            console.log('   Email: admin@handpose.com');
            console.log('   Password: Admin123!');
        } catch (error) {
            console.log('⚠️  Admin user may already exist');
        } finally {
            await prisma.\$disconnect();
        }
    }
    seed();
    "

    echo "✅ Database initialization complete"
else
    echo "✅ Database found, skipping initialization"
fi

echo ""
echo "🌐 Starting HandPose Server..."
echo "  Port: ${PORT:-5000}"
echo "  Host: ${HOST:-0.0.0.0}"
echo ""

# Start the application
exec "$@"
