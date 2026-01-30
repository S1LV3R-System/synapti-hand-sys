#!/bin/bash
# ================================================================
# EXMO Motion Studio - Docker Build and Run Script
# Hand Kinematic Analysis System
# ================================================================
#
# This script manages the Hand Kinematic Analysis System deployment
# using Docker Compose (preferred) or direct Docker commands.
#
# Usage:
#   ./Handposehealth_docker.sh [command]
#
# Commands:
#   up        - Start services (default)
#   down      - Stop services
#   restart   - Restart services
#   build     - Build Docker image
#   logs      - View container logs
#   shell     - Open shell in container
#   status    - Show container status
#   clean     - Remove container and image
#
# Environment:
#   Copy .env.example to .env and customize values

set -e

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
BLUE='\033[0;34m'
NC='\033[0m'

# Configuration defaults (can be overridden by .env)
IMAGE_NAME="handpose-health"
CONTAINER_NAME="${CONTAINER_NAME:-handpose-health}"

print_header() {
    echo -e "${BLUE}"
    echo "================================================================"
    echo "  EXMO Motion Studio - Hand Kinematic Analysis System"
    echo "================================================================"
    echo -e "${NC}"
}

print_success() { echo -e "${GREEN}✓ $1${NC}"; }
print_warning() { echo -e "${YELLOW}⚠ $1${NC}"; }
print_error() { echo -e "${RED}✗ $1${NC}"; }
print_info() { echo -e "${BLUE}ℹ $1${NC}"; }

check_docker() {
    if ! command -v docker &> /dev/null; then
        print_error "Docker is not installed. Please install Docker first."
        exit 1
    fi
}

check_compose() {
    if docker compose version &> /dev/null; then
        COMPOSE_CMD="docker compose"
    elif command -v docker-compose &> /dev/null; then
        COMPOSE_CMD="docker-compose"
    else
        print_warning "Docker Compose not available, using direct Docker commands"
        COMPOSE_CMD=""
    fi
}

load_env() {
    if [ -f .env ]; then
        export $(grep -v '^#' .env | xargs)
        print_info "Loaded configuration from .env"
    elif [ -f .env.example ]; then
        print_warning "No .env file found. Using defaults from .env.example"
        print_info "Run: cp .env.example .env"
    fi
}

check_gcs_key() {
    local key_dir="${GCS_KEY_DIR:-./key}"
    local key_file="${GCS_KEY_FILE:-coral-shoreline-435307-k0-0d200fc43406.json}"
    if [ ! -f "${key_dir}/${key_file}" ]; then
        print_warning "GCS credentials not found at ${key_dir}/${key_file}"
        print_warning "Video upload/download will not work without credentials"
        echo ""
    fi
}

create_directories() {
    local data_dir="${DATA_DIR:-./data}"
    mkdir -p "$data_dir"/{logs,temp,results}
    print_success "Data directories created at $data_dir"
}

# ================================================================
# Commands
# ================================================================

cmd_up() {
    print_header
    check_gcs_key
    create_directories

    if [ -n "$COMPOSE_CMD" ]; then
        echo "Starting services with Docker Compose..."
        $COMPOSE_CMD up -d

        echo ""
        print_info "Waiting for services to start..."
        sleep 10

        # Health check
        local retries=0
        local max_retries=6
        while [ $retries -lt $max_retries ]; do
            if $COMPOSE_CMD exec -T handpose curl -sf http://localhost:19283/handpose/api/health > /dev/null 2>&1; then
                break
            fi
            retries=$((retries + 1))
            sleep 5
        done

        if [ $retries -eq $max_retries ]; then
            print_warning "Health check not responding yet, but container is running"
            echo "Check logs: $COMPOSE_CMD logs"
        else
            print_success "Services are healthy and running!"
        fi
    else
        # Fallback to direct Docker
        run_direct_docker
    fi

    print_urls
}

cmd_down() {
    print_header
    echo "Stopping services..."

    if [ -n "$COMPOSE_CMD" ]; then
        $COMPOSE_CMD down
    else
        docker stop "$CONTAINER_NAME" 2>/dev/null || true
        docker rm "$CONTAINER_NAME" 2>/dev/null || true
    fi

    print_success "Services stopped"
}

cmd_restart() {
    print_header
    echo "Restarting services..."

    if [ -n "$COMPOSE_CMD" ]; then
        $COMPOSE_CMD restart
        sleep 10
        if $COMPOSE_CMD exec -T handpose curl -sf http://localhost:19283/handpose/api/health > /dev/null 2>&1; then
            print_success "Services are healthy"
        fi
    else
        docker restart "$CONTAINER_NAME"
    fi

    print_urls
}

cmd_build() {
    print_header
    echo "Building Docker image..."
    check_gcs_key

    if [ -n "$COMPOSE_CMD" ]; then
        $COMPOSE_CMD build
    else
        docker build -t "$IMAGE_NAME:${IMAGE_TAG:-latest}" .
    fi

    print_success "Docker image built successfully"
}

cmd_logs() {
    if [ -n "$COMPOSE_CMD" ]; then
        $COMPOSE_CMD logs -f
    else
        docker logs -f "$CONTAINER_NAME"
    fi
}

cmd_shell() {
    if [ -n "$COMPOSE_CMD" ]; then
        $COMPOSE_CMD exec handpose bash
    else
        docker exec -it "$CONTAINER_NAME" bash
    fi
}

cmd_status() {
    print_header

    if [ -n "$COMPOSE_CMD" ]; then
        $COMPOSE_CMD ps
        echo ""

        if $COMPOSE_CMD exec -T handpose curl -sf http://localhost:19283/handpose/api/health > /dev/null 2>&1; then
            print_success "Health check: OK"
        else
            print_warning "Health check: Not responding"
        fi

        echo ""
        echo "Service Status:"
        $COMPOSE_CMD exec -T handpose supervisorctl -c /etc/supervisor/conf.d/supervisord.conf status 2>/dev/null || \
        $COMPOSE_CMD exec -T handpose ps aux --no-headers | grep -E "(uvicorn|worker)" | awk '{print $11, $12}' || true
    else
        if [ "$(docker ps -q -f name=$CONTAINER_NAME)" ]; then
            print_success "Container is running"
            docker ps -f name=$CONTAINER_NAME --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}"
        else
            print_warning "Container is not running"
        fi
    fi
}

cmd_clean() {
    print_header
    echo "Cleaning up container and image..."

    if [ -n "$COMPOSE_CMD" ]; then
        $COMPOSE_CMD down --rmi local -v 2>/dev/null || true
    else
        docker stop "$CONTAINER_NAME" 2>/dev/null || true
        docker rm "$CONTAINER_NAME" 2>/dev/null || true
        docker rmi "$IMAGE_NAME:${IMAGE_TAG:-latest}" 2>/dev/null || true
    fi

    print_success "Cleanup complete"
}

# ================================================================
# Helpers
# ================================================================

run_direct_docker() {
    # Direct Docker fallback (when compose unavailable)
    local api_port="${API_PORT:-19283}"
    local data_dir="${DATA_DIR:-$(pwd)/data}"
    local key_dir="${GCS_KEY_DIR:-$(pwd)/key}"

    # Remove existing container
    docker rm -f "$CONTAINER_NAME" 2>/dev/null || true

    # Build if needed
    if [ -z "$(docker images -q $IMAGE_NAME:${IMAGE_TAG:-latest})" ]; then
        docker build -t "$IMAGE_NAME:${IMAGE_TAG:-latest}" .
    fi

    docker run -d \
        --name "$CONTAINER_NAME" \
        -p "$api_port:19283" \
        -v "$data_dir:/data" \
        -v "$key_dir:/app/key:ro" \
        -e DATABASE_PATH=/data/handpose.db \
        -e LOG_DIR=/data/logs \
        -e TEMP_DIR=/data/temp \
        -e API_WORKERS="${API_WORKERS:-2}" \
        -e MAX_CONCURRENT_TASKS="${MAX_TASKS:-3}" \
        --restart unless-stopped \
        "$IMAGE_NAME:${IMAGE_TAG:-latest}"
}

print_urls() {
    local api_port="${API_PORT:-19283}"
    echo ""
    echo -e "${GREEN}================================================================${NC}"
    echo -e "${GREEN}  Service URLs${NC}"
    echo -e "${GREEN}================================================================${NC}"
    echo -e "  Frontend:     ${YELLOW}http://localhost:$api_port/handpose/${NC}"
    echo -e "  API Docs:     ${YELLOW}http://localhost:$api_port/handpose/docs${NC}"
    echo -e "  Health:       ${YELLOW}http://localhost:$api_port/handpose/api/health${NC}"
    echo ""
    echo -e "${GREEN}================================================================${NC}"
    echo -e "${GREEN}  Management Commands${NC}"
    echo -e "${GREEN}================================================================${NC}"
    echo -e "  Logs:         ${YELLOW}./Handposehealth_docker.sh logs${NC}"
    echo -e "  Stop:         ${YELLOW}./Handposehealth_docker.sh down${NC}"
    echo -e "  Restart:      ${YELLOW}./Handposehealth_docker.sh restart${NC}"
    echo -e "  Shell:        ${YELLOW}./Handposehealth_docker.sh shell${NC}"
    echo -e "  Status:       ${YELLOW}./Handposehealth_docker.sh status${NC}"
    echo ""
}

show_help() {
    echo "Usage: $0 [command]"
    echo ""
    echo "Commands:"
    echo "  up        Start services (default)"
    echo "  down      Stop services"
    echo "  restart   Restart services"
    echo "  build     Build Docker image"
    echo "  logs      View container logs (follow mode)"
    echo "  shell     Open bash shell in container"
    echo "  status    Show container and service status"
    echo "  clean     Remove container and image"
    echo "  help      Show this help message"
    echo ""
    echo "Environment:"
    echo "  Copy .env.example to .env and customize"
    echo ""
    echo "Examples:"
    echo "  $0                  # Start services"
    echo "  $0 up               # Start services"
    echo "  $0 logs             # Follow logs"
    echo "  $0 down && $0 up    # Full restart"
}

# ================================================================
# Main
# ================================================================

check_docker
check_compose
load_env

case "${1:-up}" in
    up|run|start)
        cmd_up
        ;;
    down|stop)
        cmd_down
        ;;
    restart)
        cmd_restart
        ;;
    build)
        cmd_build
        ;;
    logs)
        cmd_logs
        ;;
    shell|sh|bash)
        cmd_shell
        ;;
    status|ps)
        cmd_status
        ;;
    clean|rm)
        cmd_clean
        ;;
    help|--help|-h)
        show_help
        ;;
    *)
        print_error "Unknown command: $1"
        echo ""
        show_help
        exit 1
        ;;
esac
