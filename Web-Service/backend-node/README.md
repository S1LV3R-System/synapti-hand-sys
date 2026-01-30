# SynaptiHand Medical Platform - Backend API

Comprehensive REST API for medical hand pose analysis with clinical workflow management, signal processing, and role-based access control.

## Features

- **JWT Authentication** - Secure token-based authentication
- **Role-Based Access Control (RBAC)** - Patient, Clinician, Admin, Researcher roles
- **Protocol Management** - Custom assessment protocol templates
- **Recording Sessions** - Patient recording lifecycle management
- **Clinical Analysis** - Tremor metrics, ROM measurements, coordination scores
- **Annotations** - Clinical observations and diagnostic notes
- **Comparisons** - Longitudinal and bilateral analysis
- **Audit Logging** - Comprehensive activity tracking
- **Admin Dashboard** - System statistics and user management

## Tech Stack

- **Runtime**: Node.js 18+
- **Framework**: Express.js
- **Language**: TypeScript
- **Database**: SQLite (Prisma ORM)
- **Validation**: Zod
- **Authentication**: JWT (jsonwebtoken)

## Project Structure

```
backend-node/
├── src/
│   ├── index.ts                    # Application entry point
│   ├── controllers/                # Business logic
│   │   ├── auth.controller.ts
│   │   ├── protocols.controller.ts
│   │   ├── recordings.controller.ts
│   │   ├── clinical.controller.ts
│   │   └── admin.controller.ts
│   ├── routes/                     # API route definitions
│   │   ├── auth.routes.ts
│   │   ├── protocols.routes.ts
│   │   ├── recordings.routes.ts
│   │   ├── clinical.routes.ts
│   │   └── admin.routes.ts
│   ├── middleware/                 # Express middleware
│   │   ├── auth.middleware.ts      # JWT authentication
│   │   ├── rbac.middleware.ts      # Role-based access control
│   │   └── error.middleware.ts     # Error handling
│   ├── schemas/                    # Zod validation schemas
│   │   ├── common.schema.ts
│   │   ├── protocols.schema.ts
│   │   ├── recordings.schema.ts
│   │   └── clinical.schema.ts
│   ├── utils/                      # Utility functions
│   │   ├── jwt.ts                  # JWT generation/verification
│   │   ├── password.ts             # Password hashing
│   │   ├── audit.ts                # Audit logging
│   │   └── validation.ts           # Validation helpers
│   └── types/
│       └── api.types.ts            # TypeScript type definitions
├── prisma/
│   ├── schema.prisma               # Database schema (11 models)
│   ├── migrations/                 # Database migrations
│   └── dev.db                      # SQLite database
├── dist/                           # Compiled JavaScript
├── API_DOCUMENTATION.md            # Complete API reference
└── package.json
```

## Setup

### Prerequisites

- Node.js 18+ and npm
- Git

### Installation

1. **Clone the repository**
   ```bash
   cd backend-node
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Configure environment**

   Create `.env` file:
   ```env
   # Server
   PORT=5000
   NODE_ENV=development

   # Database
   DATABASE_URL="file:./prisma/dev.db"

   # JWT
   JWT_SECRET=your-super-secret-jwt-key-change-this-in-production

   # CORS
   CORS_ORIGIN=http://localhost:4856
   ```

4. **Generate Prisma client**
   ```bash
   npm run prisma:generate
   ```

5. **Run database migrations**
   ```bash
   npm run prisma:migrate
   ```

6. **Seed database (optional)**
   ```bash
   npm run seed
   ```

7. **Start development server**
   ```bash
   npm run dev
   ```

The API will be available at `http://localhost:5000/api`

## Development

### Available Scripts

```bash
# Development server with hot reload
npm run dev

# Build TypeScript to JavaScript
npm run build

# Start production server
npm start

# Generate Prisma client
npm run prisma:generate

# Create new migration
npm run prisma:migrate

# Open Prisma Studio (database GUI)
npm run prisma:studio

# Seed database with test data
npm run seed
```

### Database Management

**View database**:
```bash
npm run prisma:studio
```

**Create migration**:
```bash
npx prisma migrate dev --name description-of-changes
```

**Reset database** (⚠️ destroys all data):
```bash
npx prisma migrate reset
```

## API Endpoints

### Base URL
```
http://localhost:5000/api
```

### Authentication
```
POST   /auth/register          - Create new user account
POST   /auth/login             - Login and get JWT token
POST   /auth/logout            - Logout (invalidate token)
GET    /auth/me                - Get current user profile
```

### Protocols
```
POST   /protocols              - Create protocol (Clinician/Admin)
GET    /protocols              - List protocols with filtering
GET    /protocols/:id          - Get protocol details
PUT    /protocols/:id          - Update protocol
DELETE /protocols/:id          - Delete protocol (soft delete)
```

### Recording Sessions
```
POST   /recordings             - Create recording session
GET    /recordings             - List recordings (role-filtered)
GET    /recordings/:id         - Get recording with optional includes
PUT    /recordings/:id         - Update recording metadata
PATCH  /recordings/:id/status  - Update processing status
PATCH  /recordings/:id/review  - Update review status
DELETE /recordings/:id         - Delete recording (soft delete)
```

### Clinical Analysis
```
POST   /clinical/recordings/:recordingId/analysis         - Create/update analysis
GET    /clinical/recordings/:recordingId/analysis         - Get analyses
PUT    /clinical/analysis/:analysisId                     - Update analysis
POST   /clinical/recordings/:recordingId/annotations      - Add annotation
GET    /clinical/recordings/:recordingId/annotations      - List annotations
PUT    /clinical/annotations/:annotationId                - Update annotation
DELETE /clinical/annotations/:annotationId                - Delete annotation
POST   /clinical/comparisons                              - Create comparison
GET    /clinical/comparisons/:comparisonId                - Get comparison
GET    /clinical/comparisons                              - List comparisons
```

### Admin
```
GET    /admin/stats                - System statistics
GET    /admin/users                - List all users
GET    /admin/users/:userId        - Get user details
PATCH  /admin/users/:userId/role   - Update user role
PATCH  /admin/users/:userId/status - Toggle user active status
GET    /admin/audit-logs           - View audit logs
```

## Authentication

All API endpoints (except `/auth/*` and `/health`) require JWT authentication.

**Login to get token**:
```bash
curl -X POST http://localhost:5000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email": "user@example.com", "password": "password123"}'
```

**Use token in requests**:
```bash
curl http://localhost:5000/api/recordings \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

## User Roles & Permissions

### Patient
- View own recordings
- Cannot create/modify protocols
- Cannot access other patients' data

### Clinician
- Manage assigned patient recordings
- Create and manage protocols
- Add clinical annotations
- Review and analyze recordings

### Admin
- Full system access
- User management
- System configuration
- View audit logs

### Researcher
- Read-only access to approved recordings
- Create comparisons
- Export anonymized data

## Database Schema

### Core Models (11 total)

1. **User** - Authentication and user management
2. **Session** - Active JWT sessions
3. **AuditLog** - System activity tracking
4. **Protocol** - Assessment protocol templates
5. **RecordingSession** - Patient recordings
6. **SignalProcessingResult** - Filtered landmark data
7. **ClinicalAnalysis** - Clinical metrics and scores
8. **ClinicalAnnotation** - Clinical observations
9. **Report** - Generated clinical reports
10. **RecordingComparison** - Longitudinal comparisons
11. **Future extensions** - Patient profiles, treatment plans, ML models

### Key Relationships

- User → RecordingSession (as patient, clinician, or reviewer)
- Protocol → RecordingSession (assessment protocol used)
- RecordingSession → ClinicalAnalysis (1:many)
- RecordingSession → ClinicalAnnotation (1:many)
- RecordingSession → SignalProcessingResult (1:many)

## Validation

All request validation uses Zod schemas. Validation errors return detailed error messages:

```json
{
  "success": false,
  "message": "Validation failed",
  "error": {
    "code": "VALIDATION_ERROR",
    "details": [
      {
        "path": "body.email",
        "message": "Invalid email address"
      }
    ]
  }
}
```

## Error Handling

Standard error response format:

```json
{
  "success": false,
  "message": "Error description",
  "error": {
    "code": "ERROR_CODE",
    "details": "Additional error information"
  }
}
```

### Common Error Codes

- `VALIDATION_ERROR` (400) - Request validation failed
- `UNAUTHORIZED` (401) - Authentication required
- `FORBIDDEN` (403) - Insufficient permissions
- `NOT_FOUND` (404) - Resource not found
- `INTERNAL_ERROR` (500) - Server error

## Audit Logging

All sensitive operations are automatically logged:

- User authentication events
- Protocol creation/modification
- Recording access and modifications
- Clinical analysis creation
- Annotation changes
- Admin actions (role changes, user deactivation)

Audit logs include:
- User ID and role
- Action type
- Resource type and ID
- IP address and user agent
- Timestamp
- Additional details (JSON)

## Security Features

- **JWT Authentication** - Stateless token-based auth
- **Password Hashing** - bcrypt with salt rounds
- **Role-Based Access Control** - Fine-grained permissions
- **Input Validation** - Zod schema validation on all endpoints
- **SQL Injection Prevention** - Prisma ORM parameterized queries
- **Audit Logging** - Comprehensive activity tracking
- **Soft Delete** - Data retention for compliance
- **CORS Configuration** - Restricted origins

## Production Deployment

### Environment Variables

Set these in production:

```env
NODE_ENV=production
PORT=5000
DATABASE_URL=postgresql://user:pass@host:5432/dbname
JWT_SECRET=your-super-long-random-secret-key
CORS_ORIGIN=https://your-frontend-domain.com
```

### Migration to PostgreSQL

Update `prisma/schema.prisma`:

```prisma
datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}
```

Convert JSON fields to JSONB for better performance.

### Build and Deploy

```bash
# Install dependencies
npm ci --production

# Generate Prisma client
npm run prisma:generate

# Run migrations
npm run prisma:migrate

# Build TypeScript
npm run build

# Start server
npm start
```

### Recommended Deployment Platforms

- **Railway** - One-click deployment
- **Heroku** - Add PostgreSQL addon
- **DigitalOcean App Platform** - Managed deployment
- **AWS EC2/RDS** - Full control

### Docker Support

Create `Dockerfile`:

```dockerfile
FROM node:18-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --production
COPY . .
RUN npm run prisma:generate
RUN npm run build
EXPOSE 5000
CMD ["npm", "start"]
```

## Testing

### Health Check

```bash
curl http://localhost:5000/api/health
```

Expected response:
```json
{
  "status": "ok",
  "message": "HandPose API is running",
  "timestamp": "2026-01-08T12:00:00.000Z",
  "version": "1.0.0"
}
```

### Test User Creation

```bash
curl -X POST http://localhost:5000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "email": "test@example.com",
    "password": "Test123!",
    "firstName": "Test",
    "lastName": "User",
    "role": "clinician"
  }'
```

## API Documentation

Complete API documentation with examples: [API_DOCUMENTATION.md](./API_DOCUMENTATION.md)

## Troubleshooting

### Port already in use
```bash
# Find process using port 5000
lsof -i :5000
# Kill process
kill -9 <PID>
```

### Database connection errors
```bash
# Reset database
npx prisma migrate reset
# Regenerate client
npm run prisma:generate
```

### TypeScript errors
```bash
# Clean build
rm -rf dist node_modules
npm install
npm run build
```

## Contributing

1. Create feature branch: `git checkout -b feature/amazing-feature`
2. Make changes with clear commit messages
3. Test thoroughly
4. Submit pull request

## License

ISC

## Support

For issues or questions, please open a GitHub issue or contact the development team.

---

**Version**: 1.0.0
**Last Updated**: January 8, 2026
**Node.js**: 18+
**Database**: SQLite (development) / PostgreSQL (production)
