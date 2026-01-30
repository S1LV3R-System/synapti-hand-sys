#!/bin/bash
# ============================================================================
# SynaptiHand - Unified Test Script
# ============================================================================
# Usage: ./test.sh [command] [options]
#
# Commands:
#   health    - Quick health check (default)
#   api       - Test all API endpoints
#   auth      - Test authentication flow
#   prod      - Test production server
#   e2e       - Run Playwright E2E tests
#   all       - Run all tests
# ============================================================================

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# Configuration
LOCAL_URL="http://localhost:5000"
PROD_URL="https://app.synaptihand.com"
BASE_URL="${TEST_URL:-$LOCAL_URL}"

# Counters
TESTS_PASSED=0
TESTS_FAILED=0

# Helper functions
log_info() { echo -e "${BLUE}▶ $1${NC}"; }
log_success() { echo -e "${GREEN}✓ $1${NC}"; TESTS_PASSED=$((TESTS_PASSED + 1)); }
log_error() { echo -e "${RED}✗ $1${NC}"; TESTS_FAILED=$((TESTS_FAILED + 1)); }
log_warn() { echo -e "${YELLOW}⚠ $1${NC}"; }

header() {
    echo -e "\n${BLUE}════════════════════════════════════════════════════════════${NC}"
    echo -e "${BLUE}  $1${NC}"
    echo -e "${BLUE}════════════════════════════════════════════════════════════${NC}\n"
}

test_endpoint() {
    local name=$1
    local url=$2
    local expected=${3:-200}

    local status=$(curl -s -o /dev/null -w "%{http_code}" "$url" 2>/dev/null || echo "000")

    if [ "$status" = "$expected" ]; then
        log_success "$name (HTTP $status)"
        return 0
    else
        log_error "$name (HTTP $status, expected $expected)"
        return 1
    fi
}

test_json_endpoint() {
    local name=$1
    local url=$2
    local field=$3
    local expected=$4

    local response=$(curl -s "$url" 2>/dev/null)
    local value=$(echo "$response" | jq -r "$field" 2>/dev/null)

    if [ "$value" = "$expected" ]; then
        log_success "$name ($field=$value)"
        return 0
    else
        log_error "$name ($field=$value, expected $expected)"
        return 1
    fi
}

summary() {
    echo ""
    echo -e "${BLUE}════════════════════════════════════════════════════════════${NC}"
    echo -e "  Tests Passed: ${GREEN}$TESTS_PASSED${NC}"
    echo -e "  Tests Failed: ${RED}$TESTS_FAILED${NC}"
    echo -e "${BLUE}════════════════════════════════════════════════════════════${NC}"

    [ $TESTS_FAILED -eq 0 ] && return 0 || return 1
}

# Test Commands
cmd_health() {
    header "Health Check - $BASE_URL"

    test_endpoint "API Health" "$BASE_URL/api/health"
    test_json_endpoint "Health Status" "$BASE_URL/api/health" ".status" "ok"
    test_endpoint "Frontend" "$BASE_URL/"

    summary
}

cmd_api() {
    header "API Tests - $BASE_URL"

    # Health
    test_endpoint "Health Endpoint" "$BASE_URL/api/health"

    # Auth endpoints (should return 400 without body, not 404)
    test_endpoint "Login Endpoint Exists" "$BASE_URL/api/auth/login" "400"
    test_endpoint "Register Endpoint Exists" "$BASE_URL/api/auth/register" "400"

    # Protected endpoints (should return 401 without auth)
    test_endpoint "Projects (Unauthorized)" "$BASE_URL/api/projects" "401"
    test_endpoint "Patients (Unauthorized)" "$BASE_URL/api/patients" "401"
    test_endpoint "Protocols (Unauthorized)" "$BASE_URL/api/protocols" "401"
    test_endpoint "Recordings (Unauthorized)" "$BASE_URL/api/recordings" "401"

    # Admin endpoints
    test_endpoint "Admin Users (Unauthorized)" "$BASE_URL/api/admin/users" "401"

    summary
}

cmd_auth() {
    header "Authentication Tests - $BASE_URL"

    # Test login with invalid credentials
    local login_response=$(curl -s -X POST "$BASE_URL/api/auth/login" \
        -H "Content-Type: application/json" \
        -d '{"email":"invalid@test.com","password":"wrong"}' 2>/dev/null)

    local login_success=$(echo "$login_response" | jq -r '.success' 2>/dev/null)
    if [ "$login_success" = "false" ]; then
        log_success "Invalid login rejected"
    else
        log_error "Invalid login not rejected"
    fi

    # Test registration validation
    local reg_response=$(curl -s -X POST "$BASE_URL/api/auth/register" \
        -H "Content-Type: application/json" \
        -d '{"email":"bad-email"}' 2>/dev/null)

    local reg_success=$(echo "$reg_response" | jq -r '.success' 2>/dev/null)
    if [ "$reg_success" = "false" ]; then
        log_success "Invalid registration rejected"
    else
        log_error "Invalid registration not rejected"
    fi

    summary
}

cmd_prod() {
    header "Production Server Tests - $PROD_URL"
    BASE_URL="$PROD_URL"

    test_endpoint "Health Endpoint" "$PROD_URL/api/health"
    test_json_endpoint "Health Status" "$PROD_URL/api/health" ".status" "ok"
    test_endpoint "Frontend Loads" "$PROD_URL/"
    test_endpoint "Login Page" "$PROD_URL/login"
    test_endpoint "Register Page" "$PROD_URL/register"

    # SSL check
    local ssl_status=$(curl -s -o /dev/null -w "%{http_code}" "http://app.synaptihand.com" 2>/dev/null || echo "000")
    if [ "$ssl_status" = "301" ] || [ "$ssl_status" = "302" ]; then
        log_success "HTTP redirects to HTTPS"
    else
        log_warn "HTTP redirect check inconclusive (status: $ssl_status)"
    fi

    summary
}

cmd_e2e() {
    header "E2E Tests (Playwright)"

    if [ ! -d "e2e" ]; then
        log_error "E2E directory not found"
        exit 1
    fi

    log_info "Running Playwright tests..."
    npx playwright test "$@"
}

cmd_all() {
    header "Running All Tests"

    cmd_health
    cmd_api
    cmd_auth

    echo ""
    log_info "Skipping E2E tests (run './test.sh e2e' separately)"

    summary
}

cmd_help() {
    echo "SynaptiHand Test Script"
    echo ""
    echo "Usage: ./test.sh [command] [options]"
    echo ""
    echo "Commands:"
    echo "  health    Quick health check (default)"
    echo "  api       Test all API endpoints"
    echo "  auth      Test authentication flow"
    echo "  prod      Test production server"
    echo "  e2e       Run Playwright E2E tests"
    echo "  all       Run all tests (except e2e)"
    echo "  help      Show this help"
    echo ""
    echo "Environment:"
    echo "  TEST_URL  Override base URL (default: http://localhost:5000)"
    echo ""
    echo "Examples:"
    echo "  ./test.sh                    # Quick health check"
    echo "  ./test.sh api                # Test API endpoints"
    echo "  ./test.sh prod               # Test production"
    echo "  TEST_URL=http://localhost:5001 ./test.sh api"
}

# Main
case "${1:-health}" in
    health)   cmd_health ;;
    api)      cmd_api ;;
    auth)     cmd_auth ;;
    prod)     cmd_prod ;;
    e2e)      shift; cmd_e2e "$@" ;;
    all)      cmd_all ;;
    help|-h|--help) cmd_help ;;
    *)
        log_error "Unknown command: $1"
        cmd_help
        exit 1
        ;;
esac
