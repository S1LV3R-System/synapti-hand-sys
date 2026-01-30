# HandPose Deployment Scripts

Production-ready deployment scripts for unified single-port architecture.

---

## 1. SSL Certificate Setup

**File**: `scripts/setup-ssl.sh`

```bash
#!/bin/bash
# ============================================================================
# HandPose SSL Certificate Setup (Let's Encrypt)
# ============================================================================

set -e

# Configuration
DOMAIN="handpose.com"
DOMAIN_WWW="www.handpose.com"
EMAIL="admin@handpose.com"
WEBROOT="/var/www/certbot"

echo "🔐 Setting up SSL certificate for $DOMAIN..."

# Check if running as root
if [[ $EUID -ne 0 ]]; then
   echo "❌ This script must be run as root (use sudo)"
   exit 1
fi

# Install Certbot if not already installed
if ! command -v certbot &> /dev/null; then
    echo "📦 Installing Certbot..."
    apt-get update
    apt-get install -y certbot python3-certbot-nginx
fi

# Create webroot directory
mkdir -p $WEBROOT

# Obtain certificate
echo "📜 Obtaining SSL certificate..."
certbot certonly \
    --webroot \
    -w $WEBROOT \
    -d $DOMAIN \
    -d $DOMAIN_WWW \
    --email $EMAIL \
    --agree-tos \
    --no-eff-email \
    --non-interactive

# Test renewal
echo "🔄 Testing certificate renewal..."
certbot renew --dry-run

# Setup auto-renewal cron job
if ! crontab -l | grep -q "certbot renew"; then
    echo "⏰ Setting up auto-renewal cron job..."
    (crontab -l 2>/dev/null; echo "0 0 * * * certbot renew --quiet --post-hook 'systemctl reload nginx'") | crontab -
fi

echo "✅ SSL certificate installed successfully"
echo "📍 Certificate location: /etc/letsencrypt/live/$DOMAIN/"
echo "🔄 Auto-renewal configured (daily at midnight)"
```

---

## 2. Nginx Deployment

**File**: `scripts/deploy-nginx.sh`

```bash
#!/bin/bash
# ============================================================================
# HandPose Nginx Configuration Deployment
# ============================================================================

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
NGINX_CONFIG="$PROJECT_ROOT/claudedocs/NGINX_PRODUCTION_CONFIG.conf"
NGINX_AVAILABLE="/etc/nginx/sites-available/handpose.conf"
NGINX_ENABLED="/etc/nginx/sites-enabled/handpose.conf"

echo "🔧 Deploying Nginx configuration for HandPose..."

# Check if running as root
if [[ $EUID -ne 0 ]]; then
   echo "❌ This script must be run as root (use sudo)"
   exit 1
fi

# Check if Nginx is installed
if ! command -v nginx &> /dev/null; then
    echo "❌ Nginx is not installed. Installing..."
    apt-get update
    apt-get install -y nginx
fi

# Backup existing configuration if it exists
if [ -f "$NGINX_AVAILABLE" ]; then
    echo "📦 Backing up existing configuration..."
    cp "$NGINX_AVAILABLE" "$NGINX_AVAILABLE.backup.$(date +%Y%m%d_%H%M%S)"
fi

# Copy new configuration
echo "📄 Installing new Nginx configuration..."
cp "$NGINX_CONFIG" "$NGINX_AVAILABLE"

# Create symbolic link to sites-enabled
echo "🔗 Enabling site..."
ln -sf "$NGINX_AVAILABLE" "$NGINX_ENABLED"

# Remove default Nginx site if it exists
if [ -f "/etc/nginx/sites-enabled/default" ]; then
    echo "🗑️  Removing default Nginx site..."
    rm -f /etc/nginx/sites-enabled/default
fi

# Test configuration
echo "✅ Testing Nginx configuration..."
nginx -t

# Reload Nginx
echo "🔄 Reloading Nginx..."
systemctl reload nginx

# Enable Nginx to start on boot
systemctl enable nginx

echo "✅ Nginx deployed successfully"
echo "🌐 Configuration: $NGINX_AVAILABLE"
echo "📊 Status: systemctl status nginx"
echo "📋 Logs: tail -f /var/log/nginx/handpose-access.log"
```

---

## 3. Docker Production Build

**File**: `scripts/build-production.sh`

```bash
#!/bin/bash
# ============================================================================
# HandPose Production Docker Build
# ============================================================================

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")/Web-Service"
IMAGE_NAME="handpose-platform"
VERSION="${1:-latest}"

echo "🏗️  Building HandPose production Docker image..."

# Check if Docker is installed
if ! command -v docker &> /dev/null; then
    echo "❌ Docker is not installed. Please install Docker first."
    exit 1
fi

# Navigate to project root
cd "$PROJECT_ROOT"

# Build frontend
echo "📦 Building frontend..."
cd frontend
npm ci --only=production
npm run build
cd ..

# Build backend
echo "📦 Building backend..."
cd backend-node
npm ci --only=production
npm run build
cd ..

# Build Docker image
echo "🐳 Building Docker image..."
docker build \
    -t "$IMAGE_NAME:$VERSION" \
    -t "$IMAGE_NAME:latest" \
    -f Dockerfile \
    .

# Show image size
echo "📊 Image size:"
docker images "$IMAGE_NAME" | grep -E "latest|$VERSION"

# Run security scan
echo "🔍 Running security scan..."
if command -v trivy &> /dev/null; then
    trivy image "$IMAGE_NAME:$VERSION"
else
    echo "⚠️  Trivy not installed. Skipping security scan."
    echo "   Install with: wget -qO - https://aquasecurity.github.io/trivy-repo/deb/public.key | sudo apt-key add - && echo 'deb https://aquasecurity.github.io/trivy-repo/deb $(lsb_release -sc) main' | sudo tee /etc/apt/sources.list.d/trivy.list && sudo apt-get update && sudo apt-get install trivy"
fi

echo "✅ Docker image built successfully"
echo "📦 Image: $IMAGE_NAME:$VERSION"
echo "🚀 Run with: docker run -p 5000:5000 $IMAGE_NAME:$VERSION"
```

---

## 4. Complete Production Deployment

**File**: `scripts/deploy-production.sh`

```bash
#!/bin/bash
# ============================================================================
# HandPose Full Production Deployment
# ============================================================================

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
DEPLOY_USER="handpose"
DEPLOY_DIR="/opt/handpose"
ENV_FILE="$DEPLOY_DIR/.env"

echo "🚀 Starting HandPose production deployment..."

# Check if running as root
if [[ $EUID -ne 0 ]]; then
   echo "❌ This script must be run as root (use sudo)"
   exit 1
fi

# ============================================================================
# 1. System Prerequisites
# ============================================================================
echo "📦 Installing system prerequisites..."

apt-get update
apt-get install -y \
    curl \
    git \
    nginx \
    ufw \
    certbot \
    python3-certbot-nginx

# Install Docker if not present
if ! command -v docker &> /dev/null; then
    echo "🐳 Installing Docker..."
    curl -fsSL https://get.docker.com -o get-docker.sh
    sh get-docker.sh
    rm get-docker.sh
fi

# Install Docker Compose
if ! command -v docker-compose &> /dev/null; then
    echo "📦 Installing Docker Compose..."
    curl -L "https://github.com/docker/compose/releases/latest/download/docker-compose-$(uname -s)-$(uname -m)" -o /usr/local/bin/docker-compose
    chmod +x /usr/local/bin/docker-compose
fi

# ============================================================================
# 2. Create Deployment User
# ============================================================================
if ! id "$DEPLOY_USER" &>/dev/null; then
    echo "👤 Creating deployment user: $DEPLOY_USER"
    useradd -m -s /bin/bash $DEPLOY_USER
    usermod -aG docker $DEPLOY_USER
fi

# ============================================================================
# 3. Setup Deployment Directory
# ============================================================================
echo "📁 Setting up deployment directory..."

mkdir -p $DEPLOY_DIR
mkdir -p $DEPLOY_DIR/data
mkdir -p $DEPLOY_DIR/uploads
mkdir -p $DEPLOY_DIR/logs

# Copy project files
echo "📋 Copying project files..."
rsync -av --exclude 'node_modules' --exclude 'dist' --exclude '.git' \
    "$PROJECT_ROOT/Web-Service/" "$DEPLOY_DIR/"

# Set ownership
chown -R $DEPLOY_USER:$DEPLOY_USER $DEPLOY_DIR

# ============================================================================
# 4. Environment Configuration
# ============================================================================
echo "⚙️  Configuring environment variables..."

if [ ! -f "$ENV_FILE" ]; then
    cat > "$ENV_FILE" <<EOF
# HandPose Production Environment
NODE_ENV=production
PORT=5000
HOST=0.0.0.0

# Database
DATABASE_URL=file:/app/data/handpose.db

# JWT (CHANGE THIS!)
JWT_SECRET=$(openssl rand -base64 32)
JWT_EXPIRES_IN=7d

# Redis
REDIS_URL=redis://redis:6379

# Storage
STORAGE_TYPE=local
LOCAL_STORAGE_PATH=/app/local-storage

# Logging
LOG_LEVEL=info
EOF

    echo "⚠️  Environment file created: $ENV_FILE"
    echo "⚠️  PLEASE REVIEW AND UPDATE JWT_SECRET AND OTHER SECRETS!"
    chown $DEPLOY_USER:$DEPLOY_USER "$ENV_FILE"
    chmod 600 "$ENV_FILE"
fi

# ============================================================================
# 5. Firewall Configuration
# ============================================================================
echo "🔥 Configuring firewall..."

ufw --force enable
ufw default deny incoming
ufw default allow outgoing
ufw allow ssh
ufw allow http
ufw allow https
ufw status

# ============================================================================
# 6. SSL Certificate
# ============================================================================
echo "🔐 Setting up SSL certificate..."

if [ ! -f "/etc/letsencrypt/live/handpose.com/fullchain.pem" ]; then
    read -p "Enter domain name: " DOMAIN
    read -p "Enter email for SSL certificate: " EMAIL

    certbot certonly \
        --standalone \
        -d "$DOMAIN" \
        -d "www.$DOMAIN" \
        --email "$EMAIL" \
        --agree-tos \
        --no-eff-email \
        --non-interactive

    # Setup auto-renewal
    (crontab -l 2>/dev/null; echo "0 0 * * * certbot renew --quiet --post-hook 'systemctl reload nginx'") | crontab -
else
    echo "✅ SSL certificate already exists"
fi

# ============================================================================
# 7. Deploy Nginx
# ============================================================================
echo "🔧 Deploying Nginx configuration..."

bash "$SCRIPT_DIR/deploy-nginx.sh"

# ============================================================================
# 8. Build Docker Images
# ============================================================================
echo "🐳 Building Docker images..."

cd $DEPLOY_DIR
sudo -u $DEPLOY_USER docker-compose build

# ============================================================================
# 9. Start Services
# ============================================================================
echo "🚀 Starting services..."

cd $DEPLOY_DIR
sudo -u $DEPLOY_USER docker-compose up -d

# Wait for services to start
sleep 10

# ============================================================================
# 10. Health Check
# ============================================================================
echo "🏥 Running health check..."

MAX_RETRIES=30
RETRY_COUNT=0

while [ $RETRY_COUNT -lt $MAX_RETRIES ]; do
    if curl -f http://localhost:5000/api/health > /dev/null 2>&1; then
        echo "✅ Health check passed"
        break
    fi

    echo "⏳ Waiting for server to start... ($((RETRY_COUNT + 1))/$MAX_RETRIES)"
    sleep 2
    RETRY_COUNT=$((RETRY_COUNT + 1))
done

if [ $RETRY_COUNT -eq $MAX_RETRIES ]; then
    echo "❌ Health check failed after $MAX_RETRIES attempts"
    echo "📋 Check logs: docker-compose -f $DEPLOY_DIR/docker-compose.yml logs"
    exit 1
fi

# ============================================================================
# 11. Setup Monitoring
# ============================================================================
echo "📊 Setting up monitoring..."

# Create systemd service for monitoring
cat > /etc/systemd/system/handpose-monitor.service <<EOF
[Unit]
Description=HandPose Health Monitor
After=network.target

[Service]
Type=simple
User=$DEPLOY_USER
WorkingDirectory=$DEPLOY_DIR
ExecStart=/bin/bash -c 'while true; do curl -f http://localhost:5000/api/health || echo "Health check failed at \$(date)" >> $DEPLOY_DIR/logs/health.log; sleep 60; done'
Restart=always

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable handpose-monitor
systemctl start handpose-monitor

# ============================================================================
# 12. Setup Backup Cron Job
# ============================================================================
echo "💾 Setting up automated backups..."

cat > /etc/cron.daily/handpose-backup <<'EOF'
#!/bin/bash
BACKUP_DIR="/backup/handpose"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
mkdir -p $BACKUP_DIR

# Backup database
docker exec handpose-app sqlite3 /app/data/handpose.db ".backup /app/data/handpose-${TIMESTAMP}.db"
docker cp handpose-app:/app/data/handpose-${TIMESTAMP}.db ${BACKUP_DIR}/

# Delete old backups (keep last 7 days)
find ${BACKUP_DIR} -name "handpose-*.db" -mtime +7 -delete

echo "Backup completed: handpose-${TIMESTAMP}.db"
EOF

chmod +x /etc/cron.daily/handpose-backup

# ============================================================================
# Deployment Complete
# ============================================================================

echo ""
echo "================================================================"
echo "🎉 HandPose Deployment Complete!"
echo "================================================================"
echo ""
echo "📊 Server Status:"
echo "   Docker: docker-compose -f $DEPLOY_DIR/docker-compose.yml ps"
echo "   Logs:   docker-compose -f $DEPLOY_DIR/docker-compose.yml logs -f"
echo "   Health: curl http://localhost:5000/api/health"
echo ""
echo "🌐 URLs:"
echo "   Frontend: https://$(hostname -f)/"
echo "   API:      https://$(hostname -f)/api"
echo "   Health:   https://$(hostname -f)/api/health"
echo ""
echo "📁 Directories:"
echo "   Deploy:   $DEPLOY_DIR"
echo "   Data:     $DEPLOY_DIR/data"
echo "   Uploads:  $DEPLOY_DIR/uploads"
echo "   Logs:     $DEPLOY_DIR/logs"
echo ""
echo "🔧 Management Commands:"
echo "   Start:    cd $DEPLOY_DIR && docker-compose up -d"
echo "   Stop:     cd $DEPLOY_DIR && docker-compose down"
echo "   Restart:  cd $DEPLOY_DIR && docker-compose restart"
echo "   Rebuild:  cd $DEPLOY_DIR && docker-compose up -d --build"
echo ""
echo "⚠️  IMPORTANT: Review and update $ENV_FILE with production secrets!"
echo ""
echo "================================================================"
```

---

## 5. Database Backup

**File**: `scripts/backup-database.sh`

```bash
#!/bin/bash
# ============================================================================
# HandPose Database Backup Script
# ============================================================================

set -e

BACKUP_DIR="${BACKUP_DIR:-/backup/handpose}"
CONTAINER_NAME="handpose-app"
RETENTION_DAYS="${RETENTION_DAYS:-7}"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_FILE="handpose-${TIMESTAMP}.db"

echo "💾 Starting HandPose database backup..."

# Create backup directory
mkdir -p "$BACKUP_DIR"

# Backup database from container
echo "📦 Creating backup: $BACKUP_FILE"
docker exec "$CONTAINER_NAME" sqlite3 /app/data/handpose.db ".backup /app/data/$BACKUP_FILE"

# Copy backup to host
echo "📋 Copying backup to host..."
docker cp "$CONTAINER_NAME:/app/data/$BACKUP_FILE" "$BACKUP_DIR/"

# Cleanup backup from container
docker exec "$CONTAINER_NAME" rm "/app/data/$BACKUP_FILE"

# Compress backup
echo "🗜️  Compressing backup..."
gzip "$BACKUP_DIR/$BACKUP_FILE"

# Delete old backups
echo "🗑️  Cleaning old backups (keeping last $RETENTION_DAYS days)..."
find "$BACKUP_DIR" -name "handpose-*.db.gz" -mtime +$RETENTION_DAYS -delete

# Calculate backup size
BACKUP_SIZE=$(du -h "$BACKUP_DIR/$BACKUP_FILE.gz" | cut -f1)

echo "✅ Backup completed successfully"
echo "📍 Location: $BACKUP_DIR/$BACKUP_FILE.gz"
echo "📊 Size: $BACKUP_SIZE"
echo "📅 Retention: $RETENTION_DAYS days"
```

---

## 6. Rollback Script

**File**: `scripts/rollback.sh`

```bash
#!/bin/bash
# ============================================================================
# HandPose Rollback Script
# ============================================================================

set -e

DEPLOY_DIR="/opt/handpose"
BACKUP_DIR="/backup/handpose"
CONTAINER_NAME="handpose-app"

echo "⚠️  HandPose Rollback Utility"

# List available backups
echo "📋 Available database backups:"
ls -lh "$BACKUP_DIR"/handpose-*.db.gz | tail -10

# Prompt for backup selection
read -p "Enter backup filename to restore (or 'latest' for most recent): " BACKUP_CHOICE

if [ "$BACKUP_CHOICE" = "latest" ]; then
    BACKUP_FILE=$(ls -t "$BACKUP_DIR"/handpose-*.db.gz | head -1)
else
    BACKUP_FILE="$BACKUP_DIR/$BACKUP_CHOICE"
fi

if [ ! -f "$BACKUP_FILE" ]; then
    echo "❌ Backup file not found: $BACKUP_FILE"
    exit 1
fi

echo "📦 Selected backup: $BACKUP_FILE"
read -p "⚠️  This will REPLACE the current database. Continue? (yes/no): " CONFIRM

if [ "$CONFIRM" != "yes" ]; then
    echo "❌ Rollback cancelled"
    exit 0
fi

# Stop services
echo "⏸️  Stopping services..."
cd "$DEPLOY_DIR"
docker-compose stop

# Decompress backup
echo "🗜️  Decompressing backup..."
TEMP_BACKUP="/tmp/handpose-restore.db"
gunzip -c "$BACKUP_FILE" > "$TEMP_BACKUP"

# Restore database
echo "📥 Restoring database..."
docker cp "$TEMP_BACKUP" "$CONTAINER_NAME:/app/data/handpose.db"

# Cleanup temp file
rm "$TEMP_BACKUP"

# Start services
echo "▶️  Starting services..."
docker-compose up -d

# Wait for health check
sleep 5
if curl -f http://localhost:5000/api/health > /dev/null 2>&1; then
    echo "✅ Rollback completed successfully"
    echo "🏥 Health check passed"
else
    echo "⚠️  Health check failed. Check logs:"
    echo "   docker-compose -f $DEPLOY_DIR/docker-compose.yml logs"
fi
```

---

## 7. Log Rotation Configuration

**File**: `/etc/logrotate.d/handpose`

```
/var/log/nginx/handpose-*.log {
    daily
    missingok
    rotate 14
    compress
    delaycompress
    notifempty
    create 0640 www-data adm
    sharedscripts
    postrotate
        if [ -f /var/run/nginx.pid ]; then
            kill -USR1 `cat /var/run/nginx.pid`
        fi
    endscript
}

/opt/handpose/logs/*.log {
    daily
    missingok
    rotate 7
    compress
    delaycompress
    notifempty
    create 0640 handpose handpose
}
```

---

## Usage Instructions

### Initial Deployment

```bash
# 1. Clone repository
git clone https://github.com/your-org/handpose.git
cd handpose

# 2. Make scripts executable
chmod +x scripts/*.sh

# 3. Run full deployment (as root)
sudo ./scripts/deploy-production.sh
```

### Daily Operations

```bash
# Check status
cd /opt/handpose
docker-compose ps

# View logs
docker-compose logs -f

# Restart services
docker-compose restart

# Update application
git pull
docker-compose up -d --build
```

### Backup & Restore

```bash
# Manual backup
sudo ./scripts/backup-database.sh

# Restore from backup
sudo ./scripts/rollback.sh
```

---

*End of Deployment Scripts*
