# HandPose Unified Architecture - Quick Reference Guide

**Last Updated**: 2026-01-13
**Version**: 1.0

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                         Client Devices                          │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐         │
│  │   Browser    │  │ Android App  │  │    Admin     │         │
│  │ (React SPA)  │  │   (Mobile)   │  │   Portal     │         │
│  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘         │
└─────────┼──────────────────┼──────────────────┼────────────────┘
          │                  │                  │
          └──────────────────┴──────────────────┘
                             │
                    HTTPS (Port 443)
                             │
          ┌──────────────────▼──────────────────┐
          │   Nginx Reverse Proxy (Optional)    │
          │   - SSL Termination                 │
          │   - Rate Limiting                   │
          │   - Static Asset Caching            │
          └──────────────────┬──────────────────┘
                             │
                    HTTP (Port 5000)
                             │
          ┌──────────────────▼──────────────────────────────┐
          │        Express Server (Single Port)             │
          │                                                  │
          │  ┌────────────────────────────────────────────┐ │
          │  │         Request Router                     │ │
          │  │  /api/* → Backend Handlers                 │ │
          │  │  /assets/* → Static Files (Vite build)     │ │
          │  │  /* → index.html (SPA Fallback)            │ │
          │  └────────────────────────────────────────────┘ │
          │                                                  │
          │  ┌────────────────┐  ┌────────────────┐        │
          │  │   API Layer    │  │ Static Assets  │        │
          │  │   (Express)    │  │  (React Build) │        │
          │  └────────┬───────┘  └────────┬───────┘        │
          └───────────┼──────────────────┼─────────────────┘
                      │                  │
         ┌────────────▼────────┐        │
         │  Business Logic     │        │
         │  - Auth (JWT)       │        │
         │  - RBAC             │        │
         │  - File Processing  │        │
         └────────┬────────────┘        │
                  │                     │
     ┌────────────┼─────────────────────┘
     │            │
     ▼            ▼            ▼
┌─────────┐  ┌─────────┐  ┌─────────┐
│ SQLite  │  │  Redis  │  │ Storage │
│ (Prisma)│  │ (Queue) │  │ (Local) │
└─────────┘  └─────────┘  └─────────┘
```

---

## Request Flow Decision Tree

```
Client Request Received
    │
    ├─ Path matches /api/health?
    │   └─ YES → Health Check Handler (200 OK)
    │
    ├─ Path matches /api/*?
    │   └─ YES → API Route Handler
    │       ├─ Authenticate (JWT)
    │       ├─ Authorize (RBAC)
    │       ├─ Execute Business Logic
    │       └─ Return JSON Response
    │
    ├─ Path matches /assets/*?
    │   └─ YES → Static File Middleware
    │       ├─ Cache-Control: max-age=31536000
    │       ├─ Compression (Gzip)
    │       └─ Return Static Asset
    │
    ├─ Path is exactly /?
    │   └─ YES → Serve index.html
    │       └─ Cache-Control: no-cache
    │
    └─ All other paths?
        └─ YES → SPA Fallback
            └─ Serve index.html (React Router handles)
```

---

## Port & URL Structure

### Development Environment

| Service | Port | URL | Purpose |
|---------|------|-----|---------|
| Frontend Dev (Vite) | 3000 | http://localhost:3000 | HMR, Dev Server |
| Backend (Express) | 5000 | http://localhost:5000 | API Endpoints |
| Proxy | - | /api → :5000 | Vite proxies API calls |

**Development Flow**:
1. Developer accesses `http://localhost:3000`
2. Vite serves frontend with HMR
3. API calls to `/api/*` are proxied to `http://localhost:5000`
4. Backend responds to proxied requests

### Production Environment

| Service | Port | URL | Purpose |
|---------|------|-----|---------|
| Nginx (Optional) | 80/443 | https://handpose.com | SSL, Rate Limiting |
| Express (Unified) | 5000 | Internal only | API + Frontend |

**Production Flow**:
1. User accesses `https://handpose.com`
2. Nginx terminates SSL (443 → 5000)
3. Express serves both frontend (HTML/JS/CSS) and API
4. No CORS, no cross-origin issues

---

## File Structure Map

```
/opt/handpose/                       # Production deployment directory
├── backend-node/
│   ├── dist/                        # Compiled TypeScript
│   │   ├── index.js                 # Main server file
│   │   ├── routes/
│   │   ├── controllers/
│   │   └── middleware/
│   ├── public/                      # Frontend build (production)
│   │   ├── index.html
│   │   └── assets/
│   │       ├── index-abc123.js      # Main bundle (hashed)
│   │       ├── vendor-def456.js     # Vendor chunk
│   │       └── styles-ghi789.css    # Styles (hashed)
│   ├── node_modules/
│   ├── prisma/
│   └── package.json
├── data/                            # SQLite database
│   └── handpose.db
├── local-storage/                   # File uploads
│   └── mobile-uploads/
├── logs/                            # Application logs
└── .env                             # Environment configuration
```

---

## Environment Variables Reference

### Backend (.env)

```bash
# Server Configuration
NODE_ENV=production                  # Environment: development|production
PORT=5000                            # Server port
HOST=0.0.0.0                         # Bind address

# Database
DATABASE_URL=file:/app/data/handpose.db

# Authentication
JWT_SECRET=<32-byte-random-string>   # CHANGE IN PRODUCTION!
JWT_EXPIRES_IN=7d                    # Token expiration

# Queue
REDIS_URL=redis://redis:6379         # Redis connection string

# Storage
STORAGE_TYPE=local                   # Storage backend: local|gcs
LOCAL_STORAGE_PATH=/app/local-storage

# Logging
LOG_LEVEL=info                       # Log level: debug|info|warn|error
```

### Frontend (.env.production)

```bash
# API Configuration
VITE_API_BASE_URL=/api               # Relative path (same origin)

# Application
VITE_APP_NAME=HandPose Medical Platform
VITE_APP_VERSION=1.0.0

# Feature Flags
VITE_ENABLE_ANALYTICS=true
```

---

## API Endpoints Overview

### Authentication (`/api/auth/*`)

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| POST | /api/auth/register | No | User registration |
| POST | /api/auth/login | No | User login (returns JWT) |
| GET | /api/auth/me | Yes | Get current user |

### Projects (`/api/projects/*`)

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | /api/projects | Yes | List all projects |
| POST | /api/projects | Yes | Create project |
| GET | /api/projects/:id | Yes | Get project details |
| PUT | /api/projects/:id | Yes | Update project |
| DELETE | /api/projects/:id | Yes | Delete project |

### Patients (`/api/patients/*`)

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | /api/patients | Yes | List patients |
| POST | /api/patients | Yes | Create patient |
| GET | /api/patients/:id | Yes | Get patient details |
| PUT | /api/patients/:id | Yes | Update patient |
| DELETE | /api/patients/:id | Yes | Delete patient |

### Mobile (`/api/mobile/*`)

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| POST | /api/mobile/upload | No | Upload video chunks (Android) |
| POST | /api/mobile/complete | No | Finalize upload session |

### System (`/api/system/*`)

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | /api/health | No | Health check |
| GET | /api/system/metrics | Yes | System metrics |

---

## Docker Commands Cheat Sheet

### Build & Deploy

```bash
# Build production image
docker build -t handpose-platform:latest .

# Build with version tag
docker build -t handpose-platform:v1.2.3 .

# Build with Docker Compose
docker-compose build

# Start all services
docker-compose up -d

# Start with rebuild
docker-compose up -d --build

# Stop all services
docker-compose down

# Restart specific service
docker-compose restart handpose
```

### Monitoring & Debugging

```bash
# View running containers
docker-compose ps

# View logs (all services)
docker-compose logs -f

# View logs (specific service)
docker-compose logs -f handpose

# View last 100 lines
docker-compose logs --tail=100 handpose

# Execute command in container
docker exec -it handpose-app sh

# Check health status
docker inspect handpose-app | grep -A 10 Health
```

### Maintenance

```bash
# Prune unused images
docker image prune -a

# Prune volumes (DANGEROUS!)
docker volume prune

# View disk usage
docker system df

# Clean everything
docker system prune -a --volumes
```

---

## Nginx Commands

```bash
# Test configuration
sudo nginx -t

# Reload without downtime
sudo systemctl reload nginx

# Restart Nginx
sudo systemctl restart nginx

# View status
sudo systemctl status nginx

# Enable on boot
sudo systemctl enable nginx

# View access logs
sudo tail -f /var/log/nginx/handpose-access.log

# View error logs
sudo tail -f /var/log/nginx/handpose-error.log
```

---

## SSL Certificate Management

```bash
# Obtain certificate (first time)
sudo certbot certonly --webroot \
  -w /var/www/certbot \
  -d handpose.com \
  -d www.handpose.com

# Renew certificates
sudo certbot renew

# Test renewal process
sudo certbot renew --dry-run

# List certificates
sudo certbot certificates

# Revoke certificate
sudo certbot revoke --cert-path /etc/letsencrypt/live/handpose.com/fullchain.pem
```

---

## Database Operations

### Backup

```bash
# Manual backup
docker exec handpose-app sqlite3 /app/data/handpose.db ".backup /app/data/backup.db"

# Copy backup to host
docker cp handpose-app:/app/data/backup.db ./backup-$(date +%Y%m%d).db

# Automated backup script
/opt/handpose/scripts/backup-database.sh
```

### Restore

```bash
# Copy backup to container
docker cp backup.db handpose-app:/app/data/handpose.db

# Restart to apply
docker-compose restart handpose
```

### Migrations

```bash
# Run pending migrations
docker exec handpose-app npx prisma migrate deploy

# View migration status
docker exec handpose-app npx prisma migrate status

# Open Prisma Studio (GUI)
docker exec -it handpose-app npx prisma studio
```

---

## Performance Monitoring

### Health Checks

```bash
# Basic health check
curl http://localhost:5000/api/health

# With full response
curl -v http://localhost:5000/api/health

# Check from outside
curl https://handpose.com/api/health
```

### Metrics

```bash
# Container stats (live)
docker stats handpose-app

# Disk usage
docker exec handpose-app du -sh /app/*

# Database size
docker exec handpose-app du -h /app/data/handpose.db

# Process list
docker exec handpose-app ps aux
```

### Log Analysis

```bash
# Count errors in last hour
grep ERROR /var/log/nginx/handpose-error.log | grep "$(date +%d/%b/%Y:%H)" | wc -l

# Top 10 API endpoints by requests
awk '{print $7}' /var/log/nginx/handpose-access.log | grep "^/api" | sort | uniq -c | sort -rn | head -10

# Average response time
awk '{sum+=$10; count++} END {print sum/count}' /var/log/nginx/handpose-access.log
```

---

## Troubleshooting

### Issue: Cannot Connect to Server

**Symptoms**:
- `curl http://localhost:5000/api/health` fails
- Browser shows connection refused

**Diagnosis**:
```bash
# Check if container is running
docker-compose ps

# Check server logs
docker-compose logs handpose

# Check port binding
sudo netstat -tlnp | grep 5000

# Check firewall
sudo ufw status
```

**Solutions**:
1. Restart container: `docker-compose restart handpose`
2. Check .env file for correct PORT
3. Verify Docker network: `docker network ls`
4. Open firewall: `sudo ufw allow 5000/tcp`

### Issue: 404 on Frontend Routes

**Symptoms**:
- Refreshing `/dashboard` returns 404
- Direct navigation to routes fails

**Diagnosis**:
```bash
# Check if index.html exists
docker exec handpose-app ls -la /app/public/

# Check Express routing
docker exec handpose-app grep -A 5 "app.get('\*')" /app/dist/index.js
```

**Solutions**:
1. Verify SPA fallback route is last in Express config
2. Rebuild frontend: `cd frontend && npm run build`
3. Ensure public/ directory has index.html

### Issue: API Requests Return CORS Errors

**Symptoms**:
- Browser console shows CORS error
- Preflight OPTIONS requests fail

**Diagnosis**:
```bash
# Check Origin header
curl -H "Origin: http://example.com" http://localhost:5000/api/health -v
```

**Solutions**:
1. **In production**: Should not happen (same origin)
2. **In development**: Check Vite proxy config
3. Verify frontend uses relative URLs (`/api` not `http://localhost:5000/api`)

### Issue: High Memory Usage

**Symptoms**:
- Docker container uses >1GB RAM
- Server becomes slow

**Diagnosis**:
```bash
# Check container memory
docker stats handpose-app

# Check Node.js heap
docker exec handpose-app node -e "console.log(process.memoryUsage())"
```

**Solutions**:
1. Limit container memory: Add `mem_limit: 1g` to docker-compose.yml
2. Enable Node.js memory limit: `NODE_OPTIONS=--max-old-space-size=512`
3. Investigate memory leaks in application code

---

## Security Checklist

### Pre-Deployment

- [ ] Change JWT_SECRET from default
- [ ] Configure firewall (ports 80, 443 only)
- [ ] Install SSL certificate (Let's Encrypt)
- [ ] Enable HTTPS redirect (Nginx)
- [ ] Configure rate limiting
- [ ] Set secure file permissions (chmod 600 .env)
- [ ] Disable root login (SSH)
- [ ] Enable fail2ban for SSH

### Post-Deployment

- [ ] Test health endpoint
- [ ] Verify SSL certificate (https://www.ssllabs.com/ssltest/)
- [ ] Check security headers (securityheaders.com)
- [ ] Run vulnerability scan (npm audit, docker scan)
- [ ] Test rate limiting
- [ ] Verify backup automation
- [ ] Monitor logs for errors
- [ ] Set up uptime monitoring

### Ongoing Maintenance

- [ ] Weekly: Check disk space (`df -h`)
- [ ] Weekly: Review error logs
- [ ] Monthly: Update dependencies (`npm audit fix`)
- [ ] Monthly: Renew SSL certificate (automated)
- [ ] Quarterly: Database backup test restore
- [ ] Quarterly: Security vulnerability scan

---

## Common Operational Tasks

### Deployment Update

```bash
# 1. Pull latest code
cd /opt/handpose
git pull

# 2. Backup database
./scripts/backup-database.sh

# 3. Rebuild and restart
docker-compose up -d --build

# 4. Verify health
curl http://localhost:5000/api/health

# 5. Monitor logs
docker-compose logs -f
```

### Rollback

```bash
# 1. Stop current version
docker-compose down

# 2. Restore database
./scripts/rollback.sh

# 3. Checkout previous version
git checkout HEAD~1

# 4. Start services
docker-compose up -d

# 5. Verify
curl http://localhost:5000/api/health
```

### Scale for High Traffic

```bash
# 1. Update docker-compose.yml
# Add: replicas: 3 under deploy section

# 2. Configure Nginx upstream with multiple servers
# upstream handpose_backend {
#     server 127.0.0.1:5000;
#     server 127.0.0.1:5001;
#     server 127.0.0.1:5002;
# }

# 3. Restart services
docker-compose up -d --scale handpose=3
```

---

## Performance Benchmarks

### Expected Metrics

| Metric | Target | Production |
|--------|--------|------------|
| API Response Time (avg) | <100ms | 50-80ms |
| API Response Time (p95) | <200ms | 120-150ms |
| Static Asset Load | <50ms | 20-40ms |
| Time to First Byte | <200ms | 100-150ms |
| First Contentful Paint | <1.5s | 1.0-1.2s |
| Largest Contentful Paint | <2.5s | 1.8-2.2s |

### Load Testing

```bash
# Install Apache Bench
sudo apt-get install apache2-utils

# Test API endpoint
ab -n 1000 -c 10 http://localhost:5000/api/health

# Test with authentication
ab -n 1000 -c 10 -H "Authorization: Bearer TOKEN" http://localhost:5000/api/projects
```

---

## Support & Resources

### Documentation

- Architecture Design: `/home/shivam/Desktop/HandPose/claudedocs/UNIFIED_ARCHITECTURE_DESIGN.md`
- Nginx Config: `/home/shivam/Desktop/HandPose/claudedocs/NGINX_PRODUCTION_CONFIG.conf`
- Deployment Scripts: `/home/shivam/Desktop/HandPose/claudedocs/DEPLOYMENT_SCRIPTS.md`
- This Guide: `/home/shivam/Desktop/HandPose/claudedocs/QUICK_REFERENCE_GUIDE.md`

### Logs

- Nginx Access: `/var/log/nginx/handpose-access.log`
- Nginx Error: `/var/log/nginx/handpose-error.log`
- Application: `docker-compose logs handpose`
- Database: `/opt/handpose/data/handpose.db`

### Configuration Files

- Express Server: `/opt/handpose/backend-node/dist/index.js`
- Nginx: `/etc/nginx/sites-available/handpose.conf`
- Environment: `/opt/handpose/.env`
- Docker Compose: `/opt/handpose/docker-compose.yml`

---

*End of Quick Reference Guide*
