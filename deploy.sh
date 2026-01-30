#!/bin/bash

# ═══════════════════════════════════════════════════════════════════════════════
# HandPose/SynaptiHand - Unified Deployment Mode Switch
# ═══════════════════════════════════════════════════════════════════════════════
#
# Single command to switch between Development and Production modes for:
# - Web-Service (Frontend + Backend)
# - Android Application
#
# Usage:
#   ./deploy.sh dev      - Start local development environment
#   ./deploy.sh prod     - Deploy production Docker container
#   ./deploy.sh status   - Show current deployment status
#   ./deploy.sh android  - Build Android APK for current mode
#   ./deploy.sh stop     - Stop all running services
#
# ═══════════════════════════════════════════════════════════════════════════════

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m' # No Color

# Paths
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
WEB_SERVICE_DIR="$SCRIPT_DIR/Web-Service"
ANDROID_DIR="$SCRIPT_DIR/android"
MODE_FILE="$SCRIPT_DIR/.deploy-mode"

# ═══════════════════════════════════════════════════════════════════════════════
# Utility Functions
# ═══════════════════════════════════════════════════════════════════════════════

print_header() {
    echo ""
    echo -e "${CYAN}═══════════════════════════════════════════════════════════════${NC}"
    echo -e "${CYAN}  $1${NC}"
    echo -e "${CYAN}═══════════════════════════════════════════════════════════════${NC}"
    echo ""
}

print_success() {
    echo -e "${GREEN}✓ $1${NC}"
}

print_error() {
    echo -e "${RED}✗ $1${NC}"
}

print_info() {
    echo -e "${BLUE}ℹ $1${NC}"
}

print_warning() {
    echo -e "${YELLOW}⚠ $1${NC}"
}

# Get local IP address for Android connection
get_local_ip() {
    # Try multiple methods to get local IP
    local ip=""

    # Method 1: hostname -I (Linux)
    if command -v hostname &> /dev/null; then
        ip=$(hostname -I 2>/dev/null | awk '{print $1}')
    fi

    # Method 2: ip route (Linux)
    if [ -z "$ip" ] && command -v ip &> /dev/null; then
        ip=$(ip route get 1.1.1.1 2>/dev/null | awk '{print $7}' | head -1)
    fi

    # Method 3: ifconfig (macOS/Linux)
    if [ -z "$ip" ] && command -v ifconfig &> /dev/null; then
        ip=$(ifconfig 2>/dev/null | grep -Eo 'inet (addr:)?([0-9]*\.){3}[0-9]*' | grep -Eo '([0-9]*\.){3}[0-9]*' | grep -v '127.0.0.1' | head -1)
    fi

    # Fallback
    if [ -z "$ip" ]; then
        ip="192.168.0.145"
    fi

    echo "$ip"
}

# Check if Docker is running
is_docker_running() {
    docker ps -q --filter "name=handpose-single" 2>/dev/null | grep -q .
}

# Check if local dev servers are running
is_dev_running() {
    lsof -ti:5000 &>/dev/null || lsof -ti:5001 &>/dev/null || lsof -ti:3000 &>/dev/null
}

# Get current mode
get_current_mode() {
    if [ -f "$MODE_FILE" ]; then
        cat "$MODE_FILE"
    else
        echo "unknown"
    fi
}

# Save current mode
save_mode() {
    echo "$1" > "$MODE_FILE"
}

# ═══════════════════════════════════════════════════════════════════════════════
# Stop Functions
# ═══════════════════════════════════════════════════════════════════════════════

stop_docker() {
    print_info "Stopping Docker container..."
    cd "$WEB_SERVICE_DIR"
    docker compose -f docker-compose-single-container.yml down 2>/dev/null || true
    print_success "Docker stopped"
}

stop_dev_servers() {
    print_info "Stopping local development servers..."

    # Kill processes on development ports
    lsof -ti:5000 | xargs kill -9 2>/dev/null || true
    lsof -ti:5001 | xargs kill -9 2>/dev/null || true
    lsof -ti:3000 | xargs kill -9 2>/dev/null || true

    print_success "Local servers stopped"
}

stop_all() {
    print_header "Stopping All Services"
    stop_docker
    stop_dev_servers
    rm -f "$MODE_FILE"
    print_success "All services stopped"
}

# ═══════════════════════════════════════════════════════════════════════════════
# Development Mode
# ═══════════════════════════════════════════════════════════════════════════════

start_dev() {
    print_header "Starting DEVELOPMENT Mode"

    local LOCAL_IP=$(get_local_ip)

    # Check if Docker is running - DON'T stop it unless user explicitly requests
    if is_docker_running; then
        print_warning "Docker container is running on port 5000"
        print_info "Dev mode will use Docker as the backend instead of local servers"
        print_info "To use local servers instead, run: ./deploy.sh stop && ./deploy.sh dev"
        echo ""

        save_mode "dev"

        echo -e "${BOLD}Web Access:${NC}"
        echo -e "  Local:   ${GREEN}http://localhost:5000${NC}"
        echo -e "  Network: ${GREEN}http://$LOCAL_IP:5000${NC}"
        echo ""
        echo -e "${BOLD}Android Configuration:${NC}"
        echo -e "  Mode:    ${YELLOW}Local Network${NC}"
        echo -e "  Server:  ${GREEN}http://$LOCAL_IP:5000${NC}"
        echo ""

        # Offer to build Android
        read -p "Build Android Debug APK now? [Y/n] " -n 1 -r
        echo
        if [[ $REPLY =~ ^[Yy]$ ]] || [[ -z $REPLY ]]; then
            build_android "debug"
        fi
        return 0
    fi

    # Only stop dev servers (not Docker)
    stop_dev_servers

    print_info "Local IP detected: ${BOLD}$LOCAL_IP${NC}"
    echo ""

    # Start development servers
    print_info "Starting local development servers..."

    # Start in background using absolute paths
    print_info "Starting backend on port 5001..."
    (cd "$WEB_SERVICE_DIR/backend-node" && npm run dev > /tmp/handpose-backend.log 2>&1) &
    BACKEND_PID=$!

    print_info "Starting frontend on port 3000..."
    (cd "$WEB_SERVICE_DIR/frontend" && npm run dev > /tmp/handpose-frontend.log 2>&1) &
    FRONTEND_PID=$!

    print_info "Starting proxy gateway on port 5000..."
    (cd "$WEB_SERVICE_DIR" && npm run proxy > /tmp/handpose-proxy.log 2>&1) &
    PROXY_PID=$!

    # Wait for services to start
    sleep 3

    save_mode "dev"

    echo ""
    print_success "Development mode started!"
    echo ""
    echo -e "${BOLD}Web Access:${NC}"
    echo -e "  Local:   ${GREEN}http://localhost:5000${NC}"
    echo -e "  Network: ${GREEN}http://$LOCAL_IP:5000${NC}"
    echo ""
    echo -e "${BOLD}Android Configuration:${NC}"
    echo -e "  Mode:    ${YELLOW}Local Network${NC}"
    echo -e "  Server:  ${GREEN}http://$LOCAL_IP:5000${NC}"
    echo ""
    echo -e "${BOLD}Logs:${NC}"
    echo "  Backend:  tail -f /tmp/handpose-backend.log"
    echo "  Frontend: tail -f /tmp/handpose-frontend.log"
    echo "  Proxy:    tail -f /tmp/handpose-proxy.log"
    echo ""

    # Offer to build Android
    read -p "Build Android Debug APK now? [Y/n] " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]] || [[ -z $REPLY ]]; then
        build_android "debug"
    fi
}

# ═══════════════════════════════════════════════════════════════════════════════
# Production Mode
# ═══════════════════════════════════════════════════════════════════════════════

start_prod() {
    print_header "Starting PRODUCTION Mode"

    local LOCAL_IP=$(get_local_ip)

    # Check if Docker is already running
    if is_docker_running; then
        print_success "Docker container already running!"

        save_mode "prod"

        echo ""
        echo -e "${BOLD}Web Access:${NC}"
        echo -e "  Local:      ${GREEN}http://localhost:5000${NC}"
        echo -e "  Network:    ${GREEN}http://$LOCAL_IP:5000${NC}"
        echo -e "  Production: ${GREEN}https://app.synaptihand.com${NC}"
        echo ""
        echo -e "${BOLD}Android Configuration:${NC}"
        echo -e "  Mode:   ${YELLOW}Production${NC}"
        echo -e "  Server: ${GREEN}https://app.synaptihand.com${NC}"
        echo ""
        echo -e "${BOLD}Container:${NC}"
        echo "  Logs:   docker logs -f handpose-single"
        echo "  Shell:  docker exec -it handpose-single /bin/sh"
        echo ""

        # Offer to build Android
        read -p "Build Android Release APK now? [Y/n] " -n 1 -r
        echo
        if [[ $REPLY =~ ^[Yy]$ ]] || [[ -z $REPLY ]]; then
            build_android "release"
        fi
        return 0
    fi

    # Stop local dev servers if running (they would conflict with Docker port)
    stop_dev_servers

    print_info "Building and starting Docker container..."
    cd "$WEB_SERVICE_DIR"

    # Use cached build for speed
    docker compose -f docker-compose-single-container.yml up -d

    # Wait for container to be healthy
    print_info "Waiting for container health check..."
    local max_attempts=30
    local attempt=0

    while [ $attempt -lt $max_attempts ]; do
        if curl -s http://localhost:5000/api/health > /dev/null 2>&1; then
            break
        fi
        sleep 1
        ((attempt++))
    done

    if [ $attempt -eq $max_attempts ]; then
        print_warning "Health check timeout - container may still be starting"
    fi

    save_mode "prod"

    echo ""
    print_success "Production mode started!"
    echo ""
    echo -e "${BOLD}Web Access:${NC}"
    echo -e "  Local:      ${GREEN}http://localhost:5000${NC}"
    echo -e "  Production: ${GREEN}https://app.synaptihand.com${NC}"
    echo ""
    echo -e "${BOLD}Android Configuration:${NC}"
    echo -e "  Mode:   ${YELLOW}Production${NC}"
    echo -e "  Server: ${GREEN}https://app.synaptihand.com${NC}"
    echo ""
    echo -e "${BOLD}Container:${NC}"
    echo "  Logs:   docker logs -f handpose-single"
    echo "  Shell:  docker exec -it handpose-single /bin/sh"
    echo ""

    # Offer to build Android
    read -p "Build Android Release APK now? [Y/n] " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]] || [[ -z $REPLY ]]; then
        build_android "release"
    fi
}

# ═══════════════════════════════════════════════════════════════════════════════
# Android Build
# ═══════════════════════════════════════════════════════════════════════════════

build_android() {
    local build_type="${1:-$(get_current_mode)}"

    # Map mode to build type
    case "$build_type" in
        "dev"|"debug")
            build_type="debug"
            ;;
        "prod"|"release")
            build_type="release"
            ;;
        *)
            print_error "Unknown build type: $build_type"
            print_info "Usage: ./deploy.sh android [debug|release]"
            return 1
            ;;
    esac

    print_header "Building Android ${build_type^} APK"

    cd "$ANDROID_DIR"

    if [ "$build_type" == "debug" ]; then
        print_info "Building Debug APK (LocalNetwork default)..."
        ./gradlew assembleDebug

        local apk_path="app/build/outputs/apk/debug/app-debug.apk"
        if [ -f "$apk_path" ]; then
            print_success "Debug APK built successfully!"
            echo ""
            echo -e "APK Location: ${GREEN}$ANDROID_DIR/$apk_path${NC}"
            echo -e "Default Server: ${YELLOW}http://$(get_local_ip):5000${NC}"
        fi
    else
        print_info "Building Release APK (Production default)..."
        ./gradlew assembleRelease

        local apk_path="app/build/outputs/apk/release/app-release-unsigned.apk"
        if [ -f "$apk_path" ]; then
            print_success "Release APK built successfully!"
            echo ""
            echo -e "APK Location: ${GREEN}$ANDROID_DIR/$apk_path${NC}"
            echo -e "Default Server: ${YELLOW}https://app.synaptihand.com${NC}"
            print_warning "Note: Release APK is unsigned. Sign before distribution."
        fi
    fi
}

# ═══════════════════════════════════════════════════════════════════════════════
# Status
# ═══════════════════════════════════════════════════════════════════════════════

show_status() {
    print_header "Deployment Status"

    local current_mode=$(get_current_mode)
    local LOCAL_IP=$(get_local_ip)

    echo -e "${BOLD}Current Mode:${NC} ${CYAN}${current_mode^^}${NC}"
    echo -e "${BOLD}Local IP:${NC} $LOCAL_IP"
    echo ""

    # Check Docker
    echo -e "${BOLD}Docker Container:${NC}"
    if is_docker_running; then
        print_success "Running (handpose-single)"
        docker ps --filter "name=handpose-single" --format "  {{.Status}}"
    else
        echo "  Not running"
    fi
    echo ""

    # Check local servers
    echo -e "${BOLD}Local Dev Servers:${NC}"
    if lsof -ti:5000 &>/dev/null; then
        print_success "Proxy Gateway :5000"
    else
        echo "  Proxy Gateway :5000 - Not running"
    fi
    if lsof -ti:5001 &>/dev/null; then
        print_success "Backend :5001"
    else
        echo "  Backend :5001 - Not running"
    fi
    if lsof -ti:3000 &>/dev/null; then
        print_success "Frontend :3000"
    else
        echo "  Frontend :3000 - Not running"
    fi
    echo ""

    # Health check
    echo -e "${BOLD}Health Check:${NC}"
    if curl -s http://localhost:5000/api/health > /dev/null 2>&1; then
        print_success "API responding at http://localhost:5000"
    else
        print_error "API not responding at http://localhost:5000"
    fi
    echo ""

    # Android APK status
    echo -e "${BOLD}Android APKs:${NC}"
    local debug_apk="$ANDROID_DIR/app/build/outputs/apk/debug/app-debug.apk"
    local release_apk="$ANDROID_DIR/app/build/outputs/apk/release/app-release-unsigned.apk"

    if [ -f "$debug_apk" ]; then
        local debug_date=$(stat -c %y "$debug_apk" 2>/dev/null | cut -d'.' -f1 || stat -f "%Sm" "$debug_apk" 2>/dev/null)
        print_success "Debug APK exists (built: $debug_date)"
    else
        echo "  Debug APK: Not built"
    fi

    if [ -f "$release_apk" ]; then
        local release_date=$(stat -c %y "$release_apk" 2>/dev/null | cut -d'.' -f1 || stat -f "%Sm" "$release_apk" 2>/dev/null)
        print_success "Release APK exists (built: $release_date)"
    else
        echo "  Release APK: Not built"
    fi
    echo ""

    # Connection info
    echo -e "${BOLD}Connection URLs:${NC}"
    if [ "$current_mode" == "dev" ]; then
        echo -e "  Web:     ${GREEN}http://localhost:5000${NC} or ${GREEN}http://$LOCAL_IP:5000${NC}"
        echo -e "  Android: Configure to ${GREEN}http://$LOCAL_IP:5000${NC}"
    elif [ "$current_mode" == "prod" ]; then
        echo -e "  Web:     ${GREEN}http://localhost:5000${NC} (local) or ${GREEN}https://app.synaptihand.com${NC}"
        echo -e "  Android: Default ${GREEN}https://app.synaptihand.com${NC}"
    else
        echo "  Run './deploy.sh dev' or './deploy.sh prod' first"
    fi
}

# ═══════════════════════════════════════════════════════════════════════════════
# Help
# ═══════════════════════════════════════════════════════════════════════════════

show_help() {
    echo ""
    echo -e "${BOLD}HandPose/SynaptiHand - Unified Deployment Script${NC}"
    echo ""
    echo "Usage: ./deploy.sh <command>"
    echo ""
    echo "Commands:"
    echo -e "  ${GREEN}dev${NC}      Start local development environment"
    echo "           - Proxy gateway on :5000"
    echo "           - Backend on :5001, Frontend on :3000"
    echo "           - Android defaults to LocalNetwork"
    echo ""
    echo -e "  ${GREEN}prod${NC}     Deploy production Docker container"
    echo "           - Docker serves everything on :5000"
    echo "           - Android defaults to app.synaptihand.com"
    echo ""
    echo -e "  ${GREEN}status${NC}   Show current deployment status"
    echo "           - Running services, health checks, APK status"
    echo ""
    echo -e "  ${GREEN}android${NC}  Build Android APK"
    echo "           - ./deploy.sh android debug"
    echo "           - ./deploy.sh android release"
    echo ""
    echo -e "  ${GREEN}stop${NC}     Stop all running services"
    echo ""
    echo -e "  ${GREEN}help${NC}     Show this help message"
    echo ""
    echo "Examples:"
    echo "  ./deploy.sh dev           # Start development"
    echo "  ./deploy.sh prod          # Deploy production"
    echo "  ./deploy.sh android debug # Build debug APK"
    echo ""
}

# ═══════════════════════════════════════════════════════════════════════════════
# Main
# ═══════════════════════════════════════════════════════════════════════════════

case "${1:-help}" in
    dev|development)
        start_dev
        ;;
    prod|production)
        start_prod
        ;;
    status)
        show_status
        ;;
    android)
        build_android "${2:-}"
        ;;
    stop)
        stop_all
        ;;
    help|--help|-h)
        show_help
        ;;
    *)
        print_error "Unknown command: $1"
        show_help
        exit 1
        ;;
esac
