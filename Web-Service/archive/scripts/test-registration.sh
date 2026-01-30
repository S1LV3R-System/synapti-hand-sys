#!/bin/bash

# ============================================================================
# SynaptiHand Registration Testing Script
# ============================================================================

set -e

echo "🧪 SynaptiHand Registration Testing"
echo "===================================="
echo ""

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Configuration
API_URL="${API_URL:-https://app.synaptihand.com}"
TEST_EMAIL="test-$(date +%s)@example.com"
TEST_PHONE="+9198$(date +%s | tail -c 9)"

echo "📝 Configuration:"
echo "   API URL: $API_URL"
echo "   Test Email: $TEST_EMAIL"
echo ""

# Step 1: Test SMTP Connection
echo "📧 Step 1: Testing SMTP Connection..."
echo "======================================="

docker exec handpose-single sh -c 'cat > /app/test-smtp-check.js << '"'"'EOF'"'"'
const nodemailer = require("nodemailer");

const transporter = nodemailer.createTransport({
  host: "smtp.hostinger.com",
  port: 465,
  secure: true,
  auth: {
    user: "system@synaptihand.com",
    pass: "Silverline@12345"
  }
});

transporter.verify((error, success) => {
  if (error) {
    console.error("❌ SMTP Connection Failed:", error.message);
    process.exit(1);
  } else {
    console.log("✅ SMTP Connection Successful");
    process.exit(0);
  }
});
EOF'

if docker exec handpose-single sh -c 'cd /app && node test-smtp-check.js' 2>/dev/null; then
    echo -e "${GREEN}✅ SMTP connection successful${NC}"
else
    echo -e "${RED}❌ SMTP connection failed${NC}"
    echo ""
    echo "⚠️  Email verification codes will not be sent!"
    echo "   Check SMTP credentials in docker-compose-single-container.yml"
    echo ""
fi

echo ""

# Step 2: Test Backend Health
echo "🏥 Step 2: Testing Backend Health..."
echo "====================================="

HEALTH_RESPONSE=$(curl -s "$API_URL/api/health" || echo "FAILED")

if echo "$HEALTH_RESPONSE" | grep -q '"status":"ok"'; then
    echo -e "${GREEN}✅ Backend is healthy${NC}"
    echo "   Response: $HEALTH_RESPONSE"
else
    echo -e "${RED}❌ Backend health check failed${NC}"
    echo "   Response: $HEALTH_RESPONSE"
    exit 1
fi

echo ""

# Step 3: Test User Registration
echo "👤 Step 3: Testing User Registration..."
echo "========================================="

REGISTER_PAYLOAD=$(cat <<EOF
{
  "email": "$TEST_EMAIL",
  "password": "Test123!@",
  "firstName": "Test",
  "lastName": "User",
  "birthDate": "1990-01-01",
  "phoneNumber": "$TEST_PHONE",
  "institute": "Test Institute",
  "department": "Testing Department",
  "userType": "Researcher"
}
EOF
)

echo "📤 Sending registration request..."
echo "   Email: $TEST_EMAIL"
echo ""

REGISTER_RESPONSE=$(curl -s -X POST "$API_URL/api/auth/register" \
  -H "Content-Type: application/json" \
  -d "$REGISTER_PAYLOAD")

echo "📥 Response:"
echo "$REGISTER_RESPONSE" | jq '.' 2>/dev/null || echo "$REGISTER_RESPONSE"
echo ""

# Check if registration was successful
if echo "$REGISTER_RESPONSE" | grep -q '"success":true'; then
    echo -e "${GREEN}✅ Registration successful!${NC}"

    # Extract user ID
    USER_ID=$(echo "$REGISTER_RESPONSE" | jq -r '.data.user.id' 2>/dev/null || echo "")

    if [ ! -z "$USER_ID" ] && [ "$USER_ID" != "null" ]; then
        echo "   User ID: $USER_ID"
        echo ""

        # Step 4: Verify Database Records
        echo "🗄️  Step 4: Verifying Database Records..."
        echo "=========================================="

        # Check User-Main table
        echo "📊 Checking User-Main table..."
        docker exec handpose-single npx prisma db execute --stdin <<SQL
SELECT
  "User_ID",
  auth_user_id,
  email,
  first_name,
  last_name,
  birth_date,
  phone_number,
  "Institute",
  "Department",
  "Verification_status",
  "Approval_status",
  LEFT(passwordHash, 20) as hash_preview
FROM "User-Main"
WHERE email = '$TEST_EMAIL';
SQL

        echo ""
        echo "📊 Checking Supabase Auth table..."
        docker exec handpose-single npx prisma db execute --stdin <<SQL
SELECT
  id,
  email,
  email_confirmed_at,
  created_at
FROM auth.users
WHERE email = '$TEST_EMAIL';
SQL

        echo ""
        echo -e "${GREEN}✅ Database verification complete${NC}"
    fi
else
    echo -e "${RED}❌ Registration failed!${NC}"

    # Check for specific error messages
    if echo "$REGISTER_RESPONSE" | grep -q "already exists"; then
        echo ""
        echo "⚠️  User with this email already exists"
        echo "   This might be an orphaned record from previous test"
        echo ""
        echo "   To clean up:"
        echo "   docker exec handpose-single npx prisma db execute --stdin <<EOF"
        echo "   DELETE FROM \\\"User-Main\\\" WHERE email LIKE 'test-%@example.com';"
        echo "   EOF"
    fi

    if echo "$REGISTER_RESPONSE" | grep -q "Authentication service error"; then
        echo ""
        echo "⚠️  Supabase Auth creation failed"
        echo "   Check SUPABASE_SERVICE_ROLE_KEY in docker-compose"
    fi

    if echo "$REGISTER_RESPONSE" | grep -q "SMTP\|email"; then
        echo ""
        echo "⚠️  Email service issue (SMTP authentication failed)"
        echo "   Registration may succeed but verification email not sent"
    fi

    exit 1
fi

echo ""

# Step 5: Check for Supabase Magic Link Email
echo "📧 Step 5: Email Verification Check..."
echo "======================================="
echo ""
echo "⚠️  IMPORTANT: Check your email inbox for $TEST_EMAIL"
echo ""
echo "✅ Expected behavior:"
echo "   - Custom 6-digit verification code email (from system@synaptihand.com)"
echo "   - Subject: 'Email Verification Code' or similar"
echo ""
echo "❌ Wrong behavior (indicates Supabase config issue):"
echo "   - Magic link email from Supabase"
echo "   - Email contains: http://localhost:3000/#access_token=..."
echo "   - Subject: 'Confirm your signup' or 'Verify your email'"
echo ""
echo "If you receive the magic link email, you MUST configure Supabase dashboard:"
echo "   1. Go to: https://supabase.com/dashboard/project/mtodevikkgraisalolkq/auth/providers"
echo "   2. Click 'Email' provider"
echo "   3. Turn OFF 'Confirm email' setting"
echo "   4. Save changes"
echo ""

# Step 6: Test Login (Should Fail - Email Not Verified)
echo "🔐 Step 6: Testing Login (Should Fail)..."
echo "=========================================="

LOGIN_PAYLOAD=$(cat <<EOF
{
  "email": "$TEST_EMAIL",
  "password": "Test123!@"
}
EOF
)

LOGIN_RESPONSE=$(curl -s -X POST "$API_URL/api/auth/login" \
  -H "Content-Type: application/json" \
  -d "$LOGIN_PAYLOAD")

echo "📥 Response:"
echo "$LOGIN_RESPONSE" | jq '.' 2>/dev/null || echo "$LOGIN_RESPONSE"
echo ""

if echo "$LOGIN_RESPONSE" | grep -q "email"; then
    echo -e "${GREEN}✅ Correct behavior: Login blocked (email not verified)${NC}"
elif echo "$LOGIN_RESPONSE" | grep -q "pending approval"; then
    echo -e "${GREEN}✅ Correct behavior: Login blocked (pending approval)${NC}"
else
    echo -e "${YELLOW}⚠️  Unexpected login response${NC}"
fi

echo ""

# Summary
echo "📊 Test Summary"
echo "==============="
echo ""
echo "Registration Test: ${GREEN}COMPLETE${NC}"
echo "Test Email: $TEST_EMAIL"
echo ""
echo "Next Steps:"
echo "1. Check your email for verification code"
echo "2. If you received magic link instead, configure Supabase dashboard"
echo "3. Use the verification code to verify the account"
echo "4. Admin must approve the account before login"
echo ""
echo "To clean up test user:"
echo "docker exec handpose-single npx prisma db execute --stdin <<EOF"
echo "DELETE FROM \\\"User-Main\\\" WHERE email = '$TEST_EMAIL';"
echo "EOF"
echo ""
