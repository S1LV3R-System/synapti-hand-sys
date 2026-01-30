# Development Workflow Rules

## CRITICAL: Always Update Docker After Code Fixes

When making code changes to the backend or frontend:

1. **After fixing bugs or adding features**, ALWAYS rebuild Docker:
   ```bash
   docker compose -f docker-compose-single-container.yml build --no-cache
   docker compose -f docker-compose-single-container.yml up -d
   ```

2. **Before testing**, ensure Docker is running with latest code

3. **Workflow Order**:
   - Make code changes
   - Rebuild Docker container
   - Test via Docker (port 5000)
   - Never leave Docker running old code

## Project Structure

- Backend: `/backend-node` (Express + Prisma)
- Frontend: `/frontend` (React + Vite)
- Docker serves both on port 5000 (single unified container)

## Docker Commands (SINGLE CONTAINER ONLY)

```bash
# Rebuild and restart (USE THIS)
docker compose -f docker-compose-single-container.yml build --no-cache
docker compose -f docker-compose-single-container.yml up -d

# View logs
docker compose -f docker-compose-single-container.yml logs -f

# Stop
docker compose -f docker-compose-single-container.yml down
```

## NEVER USE
- `docker-compose.yml` (multi-container - outdated)
- `docker compose up` without specifying the single container file

## Testing

Always test through Docker on port 5000 for production-like environment.