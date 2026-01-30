# SynaptiHand - Quick Reference Card

> All operations unified in `./synaptihand.sh`

## Common Commands

```bash
# First time setup
./synaptihand.sh setup

# Development
./synaptihand.sh dev                  # All services (port 5000)
./synaptihand.sh dev:backend          # Backend only (port 5001)
./synaptihand.sh dev:frontend         # Frontend only (port 3000)

# Production
./synaptihand.sh prod up              # Deploy
./synaptihand.sh prod rebuild         # Update & rebuild
./synaptihand.sh prod logs            # View logs
./synaptihand.sh prod shell           # Shell access
./synaptihand.sh prod down            # Stop

# Database
./synaptihand.sh db migrate           # Run migrations
./synaptihand.sh db studio            # GUI (port 5555)
./synaptihand.sh db seed              # Add admin user
./synaptihand.sh db backup            # Create backup

# Testing
./synaptihand.sh test health          # Quick check
./synaptihand.sh test api             # API tests
./synaptihand.sh test e2e             # E2E tests
./synaptihand.sh test all             # All tests

# System
./synaptihand.sh status               # Health & resources
./synaptihand.sh help                 # Show all commands
```

## URLs

| Environment | URL | Notes |
|-------------|-----|-------|
| **Production** | https://app.synaptihand.com | Live server |
| **Local Gateway** | http://localhost:5000 | Unified entry point |
| **Backend API** | http://localhost:5001 | Dev mode only |
| **Frontend** | http://localhost:3000 | Dev mode only |
| **Prisma Studio** | http://localhost:5555 | After `db studio` |

## Default Admin Account

```
Email: admin@handpose.com
Password: Admin123!
```

## Common Workflows

### First Time Setup
```bash
git clone <repository>
cd Web-Service
./synaptihand.sh setup
./synaptihand.sh dev
```

### Development Workflow
```bash
./synaptihand.sh dev          # Start all services
# Make changes (hot reload enabled)
./synaptihand.sh test all     # Test changes
```

### Database Changes
```bash
# Edit backend-node/prisma/schema.prisma
./synaptihand.sh db migrate   # Apply changes
./synaptihand.sh db generate  # Update client
```

### Production Deployment
```bash
git pull
./synaptihand.sh prod rebuild
./synaptihand.sh test prod
./synaptihand.sh status
```

### Troubleshooting
```bash
./synaptihand.sh prod logs 500    # Check logs
./synaptihand.sh status           # Check health
./synaptihand.sh prod rebuild     # Force rebuild
```

## Environment Files

### Backend (.env)
```env
DATABASE_URL=postgresql://...
JWT_SECRET=<generate-random>
REDIS_HOST=127.0.0.1
GCS_BUCKET_NAME=handpose-system
```

### Frontend (.env)
```env
VITE_API_URL=http://localhost:5000/api
```

## File Structure

```
Web-Service/
├── synaptihand.sh         # 🎯 Unified script
├── README.md              # Full documentation
├── QUICK_REFERENCE.md     # This file
├── backend-node/          # Express API
├── frontend/              # React app
├── docker-compose-single-container.yml
└── archive/               # Legacy files
```

## Help

```bash
./synaptihand.sh help      # Show all commands
cat README.md              # Full documentation
cat CLAUDE.md              # Project guide
```

## Emergency

### Container Won't Start
```bash
./synaptihand.sh prod logs 500
./synaptihand.sh prod rebuild
```

### Database Issues
```bash
./synaptihand.sh db generate
# Check DATABASE_URL in docker-compose-single-container.yml
```

### Frontend Not Loading
```bash
curl http://localhost:5000/api/health  # Check backend
./synaptihand.sh prod restart           # Restart
```

### Complete Reset (Nuclear Option)
```bash
./synaptihand.sh clean     # Remove containers
./synaptihand.sh db reset  # Reset database
./synaptihand.sh setup     # Fresh setup
```

---

**Quick Help:** `./synaptihand.sh help`
**Full Docs:** `README.md` | `CLAUDE.md`
