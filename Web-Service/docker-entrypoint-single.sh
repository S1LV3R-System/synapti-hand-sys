#!/bin/sh
set -e

echo "🚀 SynaptiHand Starting..."
echo "📦 Supabase PostgreSQL Backend"
echo "================================"

# Wait a moment for the container to stabilize
sleep 2

# Function to wait for PostgreSQL (Supabase)
wait_for_postgres() {
    echo "⏳ Waiting for Supabase PostgreSQL to be ready..."
    max_attempts=30
    attempt=0

    # Extract host from DATABASE_URL
    # Format: postgresql://user:pass@host:port/database
    DB_HOST=$(echo "$DATABASE_URL" | sed -n 's/.*@\([^:]*\):.*/\1/p')
    DB_PORT=$(echo "$DATABASE_URL" | sed -n 's/.*:\([0-9]*\)\/.*/\1/p')

    echo "   Checking connection to: $DB_HOST:$DB_PORT"

    while [ $attempt -lt $max_attempts ]; do
        # Try a simple TCP connection check
        if nc -z -w5 "$DB_HOST" "$DB_PORT" 2>/dev/null; then
            echo "✅ Supabase PostgreSQL is reachable!"
            return 0
        fi
        attempt=$((attempt + 1))
        echo "   Attempt $attempt/$max_attempts - Supabase not reachable yet..."
        sleep 2
    done

    echo "⚠️  Could not verify Supabase connection, proceeding anyway..."
    return 0
}

# Wait for PostgreSQL
wait_for_postgres

# Generate Prisma client (required for schema to work)
echo "🔄 Generating Prisma client..."
cd /app && npx prisma generate
echo "✅ Prisma client ready"

# Skip schema push - Supabase schema is managed manually with RLS
echo "ℹ️  Using existing Supabase schema (RLS enabled)"

echo ""
echo "🌐 Starting Services via Supervisord..."
echo "  - Redis Cache (internal port 6379)"
echo "  - SynaptiHand App (port 5000)"
echo "  - Supabase PostgreSQL (external cloud)"
echo ""

# Start supervisord to manage processes
exec /usr/bin/supervisord -c /etc/supervisord.conf
