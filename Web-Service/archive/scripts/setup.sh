#!/bin/bash

# HandPose Web-Service Setup Script
# This script sets up the complete development environment

set -e  # Exit on error

echo "========================================="
echo "HandPose Web-Service Setup"
echo "========================================="
echo ""

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Check prerequisites
echo "Checking prerequisites..."

# Check Node.js
if ! command -v node &> /dev/null; then
    echo -e "${RED}Error: Node.js is not installed${NC}"
    echo "Please install Node.js 18+ from https://nodejs.org/"
    exit 1
fi

NODE_VERSION=$(node -v | cut -d'v' -f2 | cut -d'.' -f1)
if [ "$NODE_VERSION" -lt 18 ]; then
    echo -e "${RED}Error: Node.js version must be 18 or higher${NC}"
    echo "Current version: $(node -v)"
    exit 1
fi

echo -e "${GREEN}✓ Node.js $(node -v)${NC}"

# Check npm
if ! command -v npm &> /dev/null; then
    echo -e "${RED}Error: npm is not installed${NC}"
    exit 1
fi

echo -e "${GREEN}✓ npm $(npm -v)${NC}"

# Check PostgreSQL
if ! command -v psql &> /dev/null; then
    echo -e "${YELLOW}Warning: PostgreSQL command-line tools not found${NC}"
    echo "Please ensure PostgreSQL is installed and running"
fi

echo ""
echo "========================================="
echo "Step 1: Setting up Backend"
echo "========================================="

cd backend-node

# Create .env file if it doesn't exist
if [ ! -f .env ]; then
    echo "Creating .env file..."
    cat > .env << EOF
NODE_ENV=development
PORT=5000
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/handpose
JWT_SECRET=$(openssl rand -base64 32)
JWT_EXPIRES_IN=7d
CORS_ORIGIN=http://localhost:4856
EOF
    echo -e "${GREEN}✓ Created .env file${NC}"
else
    echo -e "${YELLOW}✓ .env file already exists${NC}"
fi

# Install dependencies
echo "Installing backend dependencies..."
npm install

echo -e "${GREEN}✓ Backend dependencies installed${NC}"

# Generate Prisma client
echo "Generating Prisma client..."
npx prisma generate

# Run migrations
echo "Running database migrations..."
npx prisma migrate dev --name init || echo -e "${YELLOW}Warning: Migration failed. Make sure PostgreSQL is running and DATABASE_URL is correct${NC}"

echo -e "${GREEN}✓ Backend setup complete${NC}"

cd ..

echo ""
echo "========================================="
echo "Step 2: Setting up Frontend"
echo "========================================="

cd frontend

# Create .env file if it doesn't exist
if [ ! -f .env ]; then
    echo "Creating .env file..."
    cat > .env << EOF
VITE_API_BASE_URL=http://localhost:4856/api
EOF
    echo -e "${GREEN}✓ Created .env file${NC}"
else
    echo -e "${YELLOW}✓ .env file already exists${NC}"
fi

# Install dependencies
echo "Installing frontend dependencies..."
npm install

echo -e "${GREEN}✓ Frontend dependencies installed${NC}"

cd ..

echo ""
echo "========================================="
echo "Setup Complete!"
echo "========================================="
echo ""
echo "To start the application:"
echo ""
echo "  ${GREEN}Option 1: Start services separately${NC}"
echo "    Terminal 1: cd backend && npm run dev"
echo "    Terminal 2: cd frontend && npm run dev"
echo ""
echo "  ${GREEN}Option 2: Start with Nginx (port 4856)${NC}"
echo "    npm run dev:all"
echo ""
echo "Then open: ${GREEN}http://localhost:4856${NC}"
echo ""
echo "Default admin credentials:"
echo "  Email: admin@handpose.com"
echo "  Password: Admin123!"
echo ""
echo "========================================="
