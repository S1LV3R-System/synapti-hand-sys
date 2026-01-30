#!/bin/bash
# ============================================================================
# SynaptiHand - Unified Management Script
# ============================================================================
# This script consolidates all Web-Service operations into a single interface:
# - Development (local dev servers)
# - Production (Docker deployment)
# - Testing (health, API, E2E)
# - Database (setup, migrations, backup)
# - System (status, logs, cleanup)
#
# Usage: ./synaptihand.sh [command] [options]
# Run: ./synaptihand.sh help
# ============================================================================

set -e

# ============================================================================
# CONFIGURATION
# ============================================================================

# Colors
readonly RED='\033[0;31m'
readonly GREEN='\033[0;32m'
readonly YELLOW='\033[1;33m'
readonly BLUE='\033[0;34m'
readonly MAGENTA='\033[0;35m'
readonly CYAN='\033[0;36m'
readonly NC='\033[0m'

# Paths
readonly SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
readonly BACKEND_DIR="$SCRIPT_DIR/backend-node"
readonly FRONTEND_DIR="$SCRIPT_DIR/frontend"
readonly COMPOSE_FILE="docker-compose-single-container.yml"
readonly CONTAINER_NAME="handpose-single"

# URLs
readonly LOCAL_URL="http://localhost:5000"
readonly PROD_URL="https://app.synaptihand.com"

# Test counters
TESTS_PASSED=0
TESTS_FAILED=0

# ============================================================================
# UTILITY FUNCTIONS
# ============================================================================

log_info() { echo -e "${BLUE}▶ $1${NC}"; }
log_success() { echo -e "${GREEN}✓ $1${NC}"; }
log_error() { echo -e "${RED}✗ $1${NC}"; }
log_warn() { echo -e "${YELLOW}⚠ $1${NC}"; }

header() {
    echo ""
    echo -e "${CYAN}════════════════════════════════════════════════════════════${NC}"
    echo -e "${CYAN}  $1${NC}"
    echo -e "${CYAN}════════════════════════════════════════════════════════════${NC}"
    echo ""
}

check_command() {
    if ! command -v "$1" &> /dev/null; then
        log_error "$1 is not installed"
        return 1
    fi
    return 0
}

check_docker() {
    if ! check_command docker; then
        log_error "Docker is required but not installed"
        exit 1
    fi
}

check_node() {
    if ! check_command node; then
        log_error "Node.js is required but not installed"
        exit 1
    fi

    local node_version=$(node -v | cut -d'v' -f2 | cut -d'.' -f1)
    if [ "$node_version" -lt 18 ]; then
        log_error "Node.js 18+ required (found: $(node -v))"
        exit 1
    fi
}

wait_for_service() {
    local url=$1
    local max_attempts=${2:-30}
    local attempt=0

    log_info "Waiting for service at $url..."

    while [ $attempt -lt $max_attempts ]; do
        if curl -sf "$url" > /dev/null 2>&1; then
            log_success "Service is ready!"
            return 0
        fi
        attempt=$((attempt + 1))
        sleep 2
    done

    log_warn "Service may still be starting"
    return 1
}

# ============================================================================
# SETUP COMMANDS
# ============================================================================

cmd_setup() {
    header "SynaptiHand Setup"

    check_node

    log_info "Installing root dependencies..."
    npm install

    # Backend setup
    log_info "Setting up backend..."
    cd "$BACKEND_DIR"

    if [ ! -f .env ]; then
        log_info "Creating backend .env file..."
        cat > .env << 'EOF'
NODE_ENV=development
PORT=5001
HOST=0.0.0.0
DATABASE_URL=postgresql://postgres.mtodevikkgraisalolkq:3hcJF9Obfzu0ef95@aws-1-ap-south-1.pooler.supabase.com:5432/postgres
JWT_SECRET=$(openssl rand -base64 32)
JWT_EXPIRES_IN=7d
REDIS_HOST=localhost
REDIS_PORT=6379
CORS_ORIGIN=http://localhost:3000,http://localhost:5000
GCS_BUCKET_NAME=handpose-system
ENABLE_MOCK_STORAGE=true
EOF
        log_success "Created backend .env"
    else
        log_warn "Backend .env already exists"
    fi

    npm install
    npx prisma generate
    log_success "Backend setup complete"

    # Frontend setup
    log_info "Setting up frontend..."
    cd "$FRONTEND_DIR"

    if [ ! -f .env ]; then
        log_info "Creating frontend .env file..."
        cat > .env << 'EOF'
VITE_API_URL=http://localhost:5000/api
EOF
        log_success "Created frontend .env"
    else
        log_warn "Frontend .env already exists"
    fi

    npm install
    log_success "Frontend setup complete"

    cd "$SCRIPT_DIR"

    echo ""
    log_success "Setup complete!"
    echo ""
    echo "Next steps:"
    echo "  ${GREEN}Development:${NC} ./synaptihand.sh dev"
    echo "  ${GREEN}Production:${NC}  ./synaptihand.sh prod up"
    echo "  ${GREEN}Testing:${NC}     ./synaptihand.sh test"
    echo ""
}

# ============================================================================
# DEVELOPMENT COMMANDS
# ============================================================================

cmd_dev() {
    header "Starting Development Environment"

    check_node

    log_info "Starting backend, frontend, and proxy..."
    echo ""
    echo "  Backend:  http://localhost:5001"
    echo "  Frontend: http://localhost:3000"
    echo "  Gateway:  http://localhost:5000"
    echo ""

    npm run dev:all
}

cmd_dev_backend() {
    header "Starting Backend Only"
    check_node
    cd "$BACKEND_DIR"
    npm run dev
}

cmd_dev_frontend() {
    header "Starting Frontend Only"
    check_node
    cd "$FRONTEND_DIR"
    npm run dev
}

# ============================================================================
# PRODUCTION COMMANDS
# ============================================================================

cmd_prod_up() {
    header "Starting Production Container"
    check_docker

    log_info "Building and starting container..."
    docker compose -f "$COMPOSE_FILE" up -d --build

    wait_for_service "$LOCAL_URL/api/health" 30

    echo ""
    echo -e "  ${GREEN}Local:${NC}      $LOCAL_URL"
    echo -e "  ${GREEN}Health:${NC}     $LOCAL_URL/api/health"
    echo -e "  ${GREEN}Production:${NC} $PROD_URL"
    echo ""
}

cmd_prod_down() {
    header "Stopping Production Container"
    check_docker
    docker compose -f "$COMPOSE_FILE" down
    log_success "Container stopped"
}

cmd_prod_restart() {
    header "Restarting Production Container"
    check_docker
    docker compose -f "$COMPOSE_FILE" restart
    log_success "Container restarted"
}

cmd_prod_rebuild() {
    header "Rebuilding Production Container"
    check_docker

    log_info "Stopping existing container..."
    docker compose -f "$COMPOSE_FILE" down 2>/dev/null || true

    log_info "Building fresh image..."
    docker compose -f "$COMPOSE_FILE" build --no-cache

    log_info "Starting container..."
    docker compose -f "$COMPOSE_FILE" up -d

    log_success "Rebuild complete"
}

cmd_prod_logs() {
    check_docker
    local lines=${1:-100}
    docker logs -f --tail "$lines" "$CONTAINER_NAME"
}

cmd_prod_shell() {
    check_docker
    docker exec -it "$CONTAINER_NAME" /bin/sh
}

# ============================================================================
# DATABASE COMMANDS
# ============================================================================

cmd_db_migrate() {
    header "Running Database Migrations"
    check_node
    cd "$BACKEND_DIR"
    npx prisma migrate dev
    log_success "Migrations complete"
}

cmd_db_generate() {
    header "Generating Prisma Client"
    check_node
    cd "$BACKEND_DIR"
    npx prisma generate
    log_success "Prisma client generated"
}

cmd_db_studio() {
    header "Opening Prisma Studio"
    check_node
    cd "$BACKEND_DIR"
    npx prisma studio
}

cmd_db_seed() {
    header "Seeding Database"
    check_node
    cd "$BACKEND_DIR"
    npm run seed
    log_success "Database seeded"
}

cmd_db_backup() {
    header "Creating Database Backup"
    check_node
    cd "$BACKEND_DIR"
    npm run backup
    log_success "Backup created"
}

cmd_db_reset() {
    header "Resetting Database (DESTRUCTIVE)"
    log_warn "This will DELETE all data!"
    read -p "Are you sure? (type 'yes'): " confirm

    if [ "$confirm" != "yes" ]; then
        log_info "Cancelled"
        return
    fi

    check_node
    cd "$BACKEND_DIR"
    npx prisma migrate reset --force
    log_success "Database reset complete"
}

# ============================================================================
# TEST COMMANDS
# ============================================================================

test_endpoint() {
    local name=$1
    local url=$2
    local expected=${3:-200}

    local status=$(curl -s -o /dev/null -w "%{http_code}" "$url" 2>/dev/null || echo "000")

    if [ "$status" = "$expected" ]; then
        log_success "$name (HTTP $status)"
        TESTS_PASSED=$((TESTS_PASSED + 1))
        return 0
    else
        log_error "$name (HTTP $status, expected $expected)"
        TESTS_FAILED=$((TESTS_FAILED + 1))
        return 1
    fi
}

test_json_field() {
    local name=$1
    local url=$2
    local field=$3
    local expected=$4

    local response=$(curl -s "$url" 2>/dev/null)
    local value=$(echo "$response" | jq -r "$field" 2>/dev/null)

    if [ "$value" = "$expected" ]; then
        log_success "$name ($field=$value)"
        TESTS_PASSED=$((TESTS_PASSED + 1))
        return 0
    else
        log_error "$name ($field=$value, expected $expected)"
        TESTS_FAILED=$((TESTS_FAILED + 1))
        return 1
    fi
}

test_summary() {
    echo ""
    echo -e "${CYAN}════════════════════════════════════════════════════════════${NC}"
    echo -e "  Tests Passed: ${GREEN}$TESTS_PASSED${NC}"
    echo -e "  Tests Failed: ${RED}$TESTS_FAILED${NC}"
    echo -e "${CYAN}════════════════════════════════════════════════════════════${NC}"
    echo ""

    [ $TESTS_FAILED -eq 0 ] && return 0 || return 1
}

cmd_test_health() {
    header "Health Check"

    local base_url=${1:-$LOCAL_URL}

    test_endpoint "API Health" "$base_url/api/health"
    test_json_field "Health Status" "$base_url/api/health" ".status" "ok"
    test_endpoint "Frontend" "$base_url/"

    test_summary
}

cmd_test_api() {
    header "API Endpoint Tests"

    local base_url=${1:-$LOCAL_URL}

    # Health
    test_endpoint "Health" "$base_url/api/health"

    # Auth endpoints (should return 400 without body)
    test_endpoint "Login Endpoint" "$base_url/api/auth/login" "400"
    test_endpoint "Register Endpoint" "$base_url/api/auth/register" "400"

    # Protected endpoints (should return 401)
    test_endpoint "Projects (Unauthorized)" "$base_url/api/projects" "401"
    test_endpoint "Patients (Unauthorized)" "$base_url/api/patients" "401"
    test_endpoint "Protocols (Unauthorized)" "$base_url/api/protocols" "401"
    test_endpoint "Recordings (Unauthorized)" "$base_url/api/recordings" "401"
    test_endpoint "Admin (Unauthorized)" "$base_url/api/admin/users" "401"

    test_summary
}

cmd_test_e2e() {
    header "E2E Tests (Playwright)"

    if [ ! -d "e2e" ]; then
        log_error "E2E directory not found"
        exit 1
    fi

    log_info "Running Playwright tests..."
    npm run test:e2e "$@"
}

cmd_test_prod() {
    header "Production Server Tests"

    test_endpoint "Production Health" "$PROD_URL/api/health"
    test_json_field "Production Status" "$PROD_URL/api/health" ".status" "ok"
    test_endpoint "Frontend" "$PROD_URL/"
    test_endpoint "Login Page" "$PROD_URL/login"

    # SSL redirect test
    local ssl_status=$(curl -s -o /dev/null -w "%{http_code}" "http://app.synaptihand.com" 2>/dev/null || echo "000")
    if [ "$ssl_status" = "301" ] || [ "$ssl_status" = "302" ]; then
        log_success "HTTP redirects to HTTPS"
        TESTS_PASSED=$((TESTS_PASSED + 1))
    else
        log_warn "HTTP redirect check inconclusive (status: $ssl_status)"
    fi

    test_summary
}

cmd_test_all() {
    header "Running All Tests"

    TESTS_PASSED=0
    TESTS_FAILED=0

    cmd_test_health "$LOCAL_URL"
    cmd_test_api "$LOCAL_URL"

    echo ""
    log_info "E2E tests skipped (run separately with: ./synaptihand.sh test e2e)"

    test_summary
}

# ============================================================================
# SYSTEM COMMANDS
# ============================================================================

cmd_status() {
    header "System Status"

    check_docker

    echo -e "${BLUE}Container:${NC}"
    docker ps --filter "name=$CONTAINER_NAME" --format "  Name: {{.Names}}\n  Status: {{.Status}}\n  Ports: {{.Ports}}" || echo "  Not running"
    echo ""

    echo -e "${BLUE}Health:${NC}"
    local health=$(curl -s "$LOCAL_URL/api/health" 2>/dev/null || echo '{"status":"unreachable"}')
    echo "  $health" | jq . 2>/dev/null || echo "  $health"
    echo ""

    echo -e "${BLUE}Resources:${NC}"
    docker stats --no-stream --format "  CPU: {{.CPUPerc}}\n  Memory: {{.MemUsage}}" "$CONTAINER_NAME" 2>/dev/null || echo "  Container not running"
}

cmd_clean() {
    header "Cleaning Up"

    check_docker

    log_warn "This will remove all containers, volumes, and images!"
    read -p "Are you sure? (type 'yes'): " confirm

    if [ "$confirm" != "yes" ]; then
        log_info "Cancelled"
        return
    fi

    docker compose -f "$COMPOSE_FILE" down -v --remove-orphans
    docker rmi handpose-single:production 2>/dev/null || true

    log_success "Cleanup complete"
}

# ============================================================================
# HELP & MAIN
# ============================================================================

cmd_help() {
    cat << 'EOF'
SynaptiHand - Unified Management Script

USAGE:
  ./synaptihand.sh [command] [options]

SETUP:
  setup                 Install dependencies and configure environment

DEVELOPMENT:
  dev                   Start all dev services (backend + frontend + proxy)
  dev:backend           Start backend only (port 5001)
  dev:frontend          Start frontend only (port 3000)

PRODUCTION:
  prod up               Build and start production container
  prod down             Stop production container
  prod restart          Restart production container
  prod rebuild          Force rebuild container from scratch
  prod logs [n]         View container logs (last n lines, default 100)
  prod shell            Open shell in production container

DATABASE:
  db migrate            Run database migrations
  db generate           Generate Prisma client
  db studio             Open Prisma Studio (GUI)
  db seed               Seed database with default data
  db backup             Create database backup
  db reset              Reset database (DESTRUCTIVE)

TESTING:
  test health           Quick health check
  test api              Test API endpoints
  test e2e              Run Playwright E2E tests
  test prod             Test production server
  test all              Run all tests (except E2E)

SYSTEM:
  status                Show container status and health
  clean                 Remove all containers and volumes (DESTRUCTIVE)
  help                  Show this help message

EXAMPLES:
  ./synaptihand.sh setup
  ./synaptihand.sh dev
  ./synaptihand.sh prod up
  ./synaptihand.sh test all
  ./synaptihand.sh prod logs 200
  ./synaptihand.sh db migrate

URLS:
  Local:      http://localhost:5000
  Backend:    http://localhost:5001 (dev only)
  Frontend:   http://localhost:3000 (dev only)
  Production: https://app.synaptihand.com

For more information, see CLAUDE.md
EOF
}

# ============================================================================
# COMMAND ROUTER
# ============================================================================

main() {
    case "${1:-help}" in
        # Setup
        setup)              cmd_setup ;;

        # Development
        dev)                cmd_dev ;;
        dev:backend)        cmd_dev_backend ;;
        dev:frontend)       cmd_dev_frontend ;;

        # Production
        prod)
            case "${2:-up}" in
                up)         cmd_prod_up ;;
                down)       cmd_prod_down ;;
                restart)    cmd_prod_restart ;;
                rebuild)    cmd_prod_rebuild ;;
                logs)       cmd_prod_logs "$3" ;;
                shell)      cmd_prod_shell ;;
                *)          log_error "Unknown prod command: $2"; cmd_help; exit 1 ;;
            esac
            ;;

        # Database
        db)
            case "${2:-help}" in
                migrate)    cmd_db_migrate ;;
                generate)   cmd_db_generate ;;
                studio)     cmd_db_studio ;;
                seed)       cmd_db_seed ;;
                backup)     cmd_db_backup ;;
                reset)      cmd_db_reset ;;
                *)          log_error "Unknown db command: $2"; cmd_help; exit 1 ;;
            esac
            ;;

        # Testing
        test)
            case "${2:-health}" in
                health)     cmd_test_health ;;
                api)        cmd_test_api ;;
                e2e)        shift 2; cmd_test_e2e "$@" ;;
                prod)       cmd_test_prod ;;
                all)        cmd_test_all ;;
                *)          log_error "Unknown test command: $2"; cmd_help; exit 1 ;;
            esac
            ;;

        # System
        status)             cmd_status ;;
        clean)              cmd_clean ;;

        # Help
        help|-h|--help)     cmd_help ;;

        *)
            log_error "Unknown command: $1"
            echo ""
            cmd_help
            exit 1
            ;;
    esac
}

# Run main with all arguments
main "$@"
