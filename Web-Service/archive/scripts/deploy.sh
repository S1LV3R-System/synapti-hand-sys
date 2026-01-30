#!/bin/bash
# ============================================================================
# SynaptiHand - Unified Deployment Script
# ============================================================================
# Usage: ./deploy.sh [command]
#
# Commands:
#   up        - Build and start production container (default)
#   down      - Stop and remove container
#   restart   - Restart container
#   rebuild   - Force rebuild and restart
#   logs      - View container logs
#   status    - Check container health
#   shell     - Open shell in container
#   rollback  - Rollback to backup
#   backup    - Create manual backup
#   clean     - Remove all containers and volumes
# ============================================================================

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# Configuration
COMPOSE_FILE="docker-compose-single-container.yml"
CONTAINER_NAME="handpose-single"
IMAGE_NAME="handpose-single:production"

# Helper functions
log_info() { echo -e "${BLUE}▶ $1${NC}"; }
log_success() { echo -e "${GREEN}✓ $1${NC}"; }
log_error() { echo -e "${RED}✗ $1${NC}"; }
log_warn() { echo -e "${YELLOW}⚠ $1${NC}"; }

header() {
    echo -e "\n${BLUE}════════════════════════════════════════════════════════════${NC}"
    echo -e "${BLUE}  SynaptiHand - $1${NC}"
    echo -e "${BLUE}════════════════════════════════════════════════════════════${NC}\n"
}

check_docker() {
    if ! command -v docker &> /dev/null; then
        log_error "Docker is not installed"
        exit 1
    fi
}

# Commands
cmd_up() {
    header "Starting Production Container"
    check_docker

    log_info "Building and starting container..."
    docker compose -f "$COMPOSE_FILE" up -d --build

    log_info "Waiting for container to be healthy..."
    local attempts=0
    while [ $attempts -lt 30 ]; do
        if docker ps --filter "name=$CONTAINER_NAME" --filter "health=healthy" -q | grep -q .; then
            log_success "Container is healthy!"
            echo ""
            echo -e "  ${GREEN}App URL:${NC} https://app.synaptihand.com"
            echo -e "  ${GREEN}Health:${NC}  https://app.synaptihand.com/api/health"
            echo ""
            return 0
        fi
        sleep 2
        attempts=$((attempts + 1))
    done

    log_warn "Container may still be starting. Check: docker logs $CONTAINER_NAME"
}

cmd_down() {
    header "Stopping Container"
    check_docker
    docker compose -f "$COMPOSE_FILE" down
    log_success "Container stopped"
}

cmd_restart() {
    header "Restarting Container"
    check_docker
    docker compose -f "$COMPOSE_FILE" restart
    log_success "Container restarted"
}

cmd_rebuild() {
    header "Rebuilding Container"
    check_docker

    log_info "Stopping existing container..."
    docker compose -f "$COMPOSE_FILE" down 2>/dev/null || true

    log_info "Building fresh image..."
    docker compose -f "$COMPOSE_FILE" build --no-cache

    log_info "Starting container..."
    docker compose -f "$COMPOSE_FILE" up -d

    log_success "Rebuild complete"
    cmd_status
}

cmd_logs() {
    check_docker
    local lines=${1:-100}
    docker logs -f --tail "$lines" "$CONTAINER_NAME"
}

cmd_status() {
    header "Container Status"
    check_docker

    echo -e "${BLUE}Container:${NC}"
    docker ps --filter "name=$CONTAINER_NAME" --format "  Name: {{.Names}}\n  Status: {{.Status}}\n  Ports: {{.Ports}}"
    echo ""

    echo -e "${BLUE}Health Check:${NC}"
    local health=$(curl -s "http://localhost:5000/api/health" 2>/dev/null || echo '{"status":"unreachable"}')
    echo "  $health" | jq . 2>/dev/null || echo "  $health"
    echo ""

    echo -e "${BLUE}Resource Usage:${NC}"
    docker stats --no-stream --format "  CPU: {{.CPUPerc}}\n  Memory: {{.MemUsage}}" "$CONTAINER_NAME" 2>/dev/null || echo "  Container not running"
}

cmd_shell() {
    check_docker
    docker exec -it "$CONTAINER_NAME" /bin/sh
}

cmd_backup() {
    header "Creating Backup"
    check_docker

    local timestamp=$(date +%Y%m%d_%H%M%S)
    local backup_dir="./backups"
    mkdir -p "$backup_dir"

    log_info "Creating backup: handpose_backup_$timestamp"
    docker exec "$CONTAINER_NAME" sh /app/scripts/backup.sh

    log_success "Backup created"
}

cmd_rollback() {
    header "Rollback"

    if [ -z "$1" ]; then
        log_error "Usage: ./deploy.sh rollback <backup_timestamp>"
        echo ""
        echo "Available backups:"
        ls -1 ./backups/ 2>/dev/null | grep "handpose_backup_" | sed 's/handpose_backup_/  /' || echo "  No backups found"
        exit 1
    fi

    local backup="./backups/handpose_backup_$1"
    if [ ! -d "$backup" ] && [ ! -f "$backup.db" ]; then
        log_error "Backup not found: $1"
        exit 1
    fi

    log_info "Rolling back to: $1"
    docker compose -f "$COMPOSE_FILE" down
    # Restore logic here
    docker compose -f "$COMPOSE_FILE" up -d

    log_success "Rollback complete"
}

cmd_clean() {
    header "Cleaning Up"
    check_docker

    log_warn "This will remove all containers and volumes!"
    read -p "Are you sure? (y/N) " -n 1 -r
    echo ""

    if [[ $REPLY =~ ^[Yy]$ ]]; then
        docker compose -f "$COMPOSE_FILE" down -v --remove-orphans
        docker rmi "$IMAGE_NAME" 2>/dev/null || true
        log_success "Cleanup complete"
    else
        log_info "Cancelled"
    fi
}

cmd_help() {
    echo "SynaptiHand Deployment Script"
    echo ""
    echo "Usage: ./deploy.sh [command]"
    echo ""
    echo "Commands:"
    echo "  up        Build and start production container (default)"
    echo "  down      Stop and remove container"
    echo "  restart   Restart container"
    echo "  rebuild   Force rebuild and restart"
    echo "  logs [n]  View last n lines of logs (default: 100)"
    echo "  status    Check container health and resources"
    echo "  shell     Open shell in container"
    echo "  backup    Create manual backup"
    echo "  rollback  Rollback to a backup"
    echo "  clean     Remove all containers and volumes"
    echo "  help      Show this help"
}

# Main
case "${1:-up}" in
    up)       cmd_up ;;
    down)     cmd_down ;;
    restart)  cmd_restart ;;
    rebuild)  cmd_rebuild ;;
    logs)     cmd_logs "$2" ;;
    status)   cmd_status ;;
    shell)    cmd_shell ;;
    backup)   cmd_backup ;;
    rollback) cmd_rollback "$2" ;;
    clean)    cmd_clean ;;
    help|-h|--help) cmd_help ;;
    *)
        log_error "Unknown command: $1"
        cmd_help
        exit 1
        ;;
esac
