# SynaptiHand Web Service

> **Unified Management Interface** - All operations consolidated into `synaptihand.sh`

## Quick Start

```bash
# First time setup
./synaptihand.sh setup

# Development (all services)
./synaptihand.sh dev

# Production deployment
./synaptihand.sh prod up

# Testing
./synaptihand.sh test all

# Status check
./synaptihand.sh status
```

## Architecture

```
Web-Service/
├── backend-node/           # Express + Prisma API (TypeScript)
├── frontend/               # React + Vite + Ant Design
├── processing-service/     # Python FastAPI video processing
├── analysis-service/       # Python LSTM analysis
├── e2e/                    # Playwright E2E tests
├── synaptihand.sh         # 🎯 UNIFIED MANAGEMENT SCRIPT
└── package.json           # Root orchestration scripts
```

## Unified Management Commands

All operations are now unified through `synaptihand.sh`:

### Setup & Configuration
```bash
./synaptihand.sh setup                    # Install all dependencies
```

### Development
```bash
./synaptihand.sh dev                      # All services (backend + frontend + proxy)
./synaptihand.sh dev:backend              # Backend only (port 5001)
./synaptihand.sh dev:frontend             # Frontend only (port 3000)
```

**URLs:** Gateway: http://localhost:5000 | Backend: http://localhost:5001 | Frontend: http://localhost:3000

### Production Deployment
```bash
./synaptihand.sh prod up                  # Build and start container
./synaptihand.sh prod down                # Stop container
./synaptihand.sh prod restart             # Restart container
./synaptihand.sh prod rebuild             # Force rebuild from scratch
./synaptihand.sh prod logs [n]            # View logs (default 100 lines)
./synaptihand.sh prod shell               # Shell access
```

**Production URL:** https://app.synaptihand.com

### Database Operations
```bash
./synaptihand.sh db migrate               # Run migrations
./synaptihand.sh db generate              # Generate Prisma client
./synaptihand.sh db studio                # Open Prisma Studio GUI (port 5555)
./synaptihand.sh db seed                  # Seed with default admin user
./synaptihand.sh db backup                # Create backup
./synaptihand.sh db reset                 # ⚠️  DESTRUCTIVE: Reset database
```

### Testing
```bash
./synaptihand.sh test health              # Quick health check
./synaptihand.sh test api                 # Test all API endpoints
./synaptihand.sh test e2e                 # Run Playwright E2E tests
./synaptihand.sh test prod                # Test production server
./synaptihand.sh test all                 # Run all tests (except E2E)
```

### System Management
```bash
./synaptihand.sh status                   # Container status and health
./synaptihand.sh clean                    # ⚠️  Remove all containers/volumes
./synaptihand.sh help                     # Show help
```

## Technology Stack

### Backend
- Node.js 18 (TypeScript), Express.js, Prisma ORM
- PostgreSQL (Supabase hosted), Redis (in-container)
- JWT authentication, Google Cloud Storage, Bull job queue

### Frontend
- React 19, Vite, Ant Design v6
- Redux Toolkit, TanStack Query, React Router v7
- React Hook Form + Zod, Tailwind CSS

### Processing
- Python FastAPI, MediaPipe (21-point hand landmarks)
- 40+ signal filters, TensorFlow LSTM analysis

### Infrastructure
- Docker (single-container), Supervisord
- Health monitoring, structured logging

## Database Schema

- **User** - Authentication, roles (admin, clinician, researcher, patient)
- **Project** - Group patients and recordings
- **Patient** - Demographics (firstName, middleName, lastName)
- **Protocol** - Clinical assessment templates
- **RecordingSession** - Video/CSV uploads, processing status
- **SignalProcessingResult** - Filtered landmark data
- **ClinicalAnalysis** - Tremor metrics, ROM, severity
- **AuditLog** - Security audit trail

**Soft-Delete System:** 15-day retention, automatic cleanup at 2 AM UTC daily

## API Endpoints

### Authentication
- `POST /api/auth/register` - User registration (email verification)
- `POST /api/auth/login` - Login (JWT)
- `POST /api/auth/verify-code` - Verify email code

### Core Resources
- Projects: `/api/projects` (GET, POST, PUT, DELETE)
- Patients: `/api/patients` (GET, POST, PUT, DELETE)
- Protocols: `/api/protocols` (GET, POST, PUT, DELETE)
- Recordings: `/api/recordings` (GET, POST, DELETE)

### Admin
- `GET /api/admin/users` - User management
- `GET /api/admin/audit-logs` - Audit trail
- `DELETE /api/system/[resource]/:id/hard-delete` - Hard delete

### Mobile
- `POST /api/mobile/upload` - Android uploads (no auth)

## Role-Based Access

| Feature | Admin | Clinician | Researcher | Patient |
|---------|-------|-----------|------------|---------|
| User Management | ✅ | ❌ | ❌ | ❌ |
| Patient Management | ✅ | ✅ | ✅ | ❌ |
| Recording Upload | ✅ | ✅ | ✅ | ❌ |
| Protocol Creation | ✅ | ❌ | ✅ | ❌ |
| Clinical Analysis | ✅ | ✅ | ✅ | ❌ |

## Security

- JWT tokens (7-day expiration)
- Rate limiting (5 req/15min on auth)
- bcrypt password hashing
- Email verification (6-digit codes)
- File validation, XSS protection (Helmet.js)
- Audit logging for admin actions

## Production Deployment

```bash
# Deploy
./synaptihand.sh prod up

# Update
git pull && ./synaptihand.sh prod rebuild

# Monitor
./synaptihand.sh status
./synaptihand.sh prod logs 500
```

## Troubleshooting

### Container Issues
```bash
./synaptihand.sh prod logs 500     # Check logs
./synaptihand.sh prod rebuild      # Rebuild
```

### Database Issues
```bash
./synaptihand.sh db generate       # Test connection
# Check DATABASE_URL in docker-compose-single-container.yml
```

### Frontend Not Loading
```bash
curl http://localhost:5000/api/health  # Check backend
./synaptihand.sh prod restart          # Restart
```

## Documentation

- **Main Guide:** `CLAUDE.md`
- **Soft-Delete:** `claudedocs/SOFT_DELETE_SYSTEM.md`
- **Android App:** `android/CLAUDE.md`

## Default Admin Account

```
Email: admin@handpose.com
Password: Admin123!
```

## License

Proprietary - SynaptiHand Medical Platform
