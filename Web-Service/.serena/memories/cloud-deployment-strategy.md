# Cloud VM Deployment Strategy

## Overview
This document outlines the deployment strategy for moving SynaptiHand from local development to cloud VM deployment.

## Current State (2026-01-18)
- **Database**: Successfully migrated from SQLite to PostgreSQL 16
- **Architecture**: Two-container deployment (PostgreSQL + Application with embedded Redis)
- **Docker Compose**: `docker-compose-single-container.yml` configured for local development
- **External Port**: PostgreSQL on 5434 (to avoid conflict with local instances)

## Cloud VM Deployment Requirements

### Docker Image Registry Strategy
1. **Build locally or in CI/CD** with proper tagging
2. **Push to container registry** (Docker Hub, GCR, or private registry)
3. **Pull on cloud VM** and deploy with production configuration

### Image Naming Convention
```
# Production images
handpose-single:production
handpose-single:v1.0.0
handpose-single:latest

# Registry format (example with Docker Hub)
<registry>/<namespace>/handpose-single:<tag>
```

### Pre-Deployment Checklist
- [ ] Configure container registry credentials
- [ ] Update docker-compose for cloud deployment (remove port conflicts)
- [ ] Set up environment variables for production
- [ ] Configure SSL/TLS termination
- [ ] Set up proper networking (internal vs external)
- [ ] Configure backup strategy for PostgreSQL data volume
- [ ] Set up monitoring and logging

### Production Docker Compose Changes Needed
1. **PostgreSQL port**: Change from 5434 back to 5432 (no local conflict on cloud VM)
2. **Environment variables**: Use Docker secrets or environment file
3. **Volume mounts**: Use named volumes with proper backup strategy
4. **Resource limits**: Adjust based on VM specifications
5. **Restart policies**: Ensure `unless-stopped` for production

### Deployment Commands (Cloud VM)
```bash
# Pull latest images
docker pull <registry>/handpose-single:production
docker pull postgres:16-alpine

# Start services
docker compose -f docker-compose-single-container.yml up -d

# Verify health
docker ps
curl http://localhost:5000/api/health
```

### Current Container Configuration
| Service | Image | Internal Port | External Port (Dev) | External Port (Prod) |
|---------|-------|---------------|---------------------|----------------------|
| PostgreSQL | postgres:16-alpine | 5432 | 5434 | 5432 |
| Application | handpose-single:production | 5000 | 5000 | 5000 |

### Security Considerations for Cloud
- [ ] Change default PostgreSQL password
- [ ] Rotate JWT secret
- [ ] Update CORS origins for production domain
- [ ] Configure firewall rules
- [ ] Enable HTTPS via reverse proxy (nginx/traefik)

## Registry Information (COMPLETED 2026-01-18)

### Published Images
| Image | Tag | Size | Digest |
|-------|-----|------|--------|
| shivamsilver/silver-box | synaptihand-app | 523MB | sha256:7d2e97908579cc931eafa6c719e795a83372308a15245d07a4732f61241c1bb1 |
| shivamsilver/silver-box | synaptihand-postgres | 276MB | sha256:27cfa36bcd0bdef05601b90e1fdd9d9b12e6543af71ff8eeb6728659b8d58f7a |

### Pull Commands
```bash
docker pull shivamsilver/silver-box:synaptihand-app
docker pull shivamsilver/silver-box:synaptihand-postgres
```

### Files Created for Cloud Deployment
- `docker-compose.cloud.yml` - Production deployment configuration
- `Dockerfile.postgres` - PostgreSQL image with init scripts
- `.env.production.example` - Production environment template
- `scripts/deploy-cloud.sh` - Deployment automation script

## Next Steps