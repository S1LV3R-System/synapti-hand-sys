import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'path';
import compression from 'compression';
import helmet from 'helmet';
import authRoutes from './routes/auth.routes';
import userRoutes from './routes/user.routes';
import systemRoutes from './routes/system.routes';
import protocolRoutes from './routes/protocols.routes';
import recordingRoutes from './routes/recordings.routes';
import clinicalRoutes from './routes/clinical.routes';
import adminRoutes from './routes/admin.routes';
import uploadRoutes from './routes/upload.routes';
import projectRoutes from './routes/project.routes';
import patientRoutes from './routes/patient.routes';
import mobileRoutes from './routes/mobile.routes';
import statsRoutes from './routes/stats.routes';
import invitationRoutes from './routes/invitation.routes';
import labelImagesRoutes from './routes/labelImages.routes';
import { errorMiddleware } from './middleware/error.middleware';
import { registerWorker } from './workers/processing.worker';
import { startCleanupCronJob } from './workers/cleanup.worker';

dotenv.config();

// Initialize background workers
registerWorker();
startCleanupCronJob();

const app = express();
const PORT = parseInt(process.env.PORT || '5000', 10);
const NODE_ENV = process.env.NODE_ENV || 'development';
const IS_PRODUCTION = NODE_ENV === 'production';

// ============================================================================
// UNIFIED ARCHITECTURE MIDDLEWARE
// ============================================================================

// 1. Security Headers (Helmet.js)
app.use(helmet({
  contentSecurityPolicy: IS_PRODUCTION ? {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'", "'wasm-unsafe-eval'", 'https://static.cloudflareinsights.com', 'https://app.synaptihand.com/cdn-cgi', 'https://cdn.jsdelivr.net'], // Allow inline scripts, WebAssembly, Cloudflare Insights, and MediaPipe
      styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'], // Allow Google Fonts
      imgSrc: ["'self'", 'data:', 'https:'],
      connectSrc: ["'self'", 'https://cloudflareinsights.com', 'https://app.synaptihand.com/cdn-cgi', 'https://cdn.jsdelivr.net', 'https://storage.googleapis.com', 'https://mtodevikkgraisalolkq.supabase.co', 'https://*.supabase.co'], // Allow external CDNs, GCS, and Supabase
      fontSrc: ["'self'", 'https://fonts.gstatic.com'], // Allow Google Fonts
      objectSrc: ["'none'"],
      mediaSrc: ["'self'", 'blob:', 'https:'], // Allow blob URLs for video playback
      frameSrc: ["'none'"],
    },
  } : false, // Disable CSP in development for easier debugging
  hsts: IS_PRODUCTION ? {
    maxAge: 31536000, // 1 year
    includeSubDomains: true,
    preload: true
  } : false,
  noSniff: true,
  referrerPolicy: { policy: 'same-origin' },
}));

// 2. Compression (gzip/deflate)
app.use(compression({
  filter: (req: express.Request, res: express.Response) => {
    // Don't compress responses if header says not to
    if (req.headers['x-no-compression']) {
      return false;
    }
    // Compress everything else
    return compression.filter(req, res);
  },
  level: IS_PRODUCTION ? 6 : 1, // Higher compression in production
  threshold: 1024, // Only compress if > 1KB
}));

// 3. Body parsing middleware (applies globally)
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// CORS configuration for API routes only
const corsOrigins = process.env.CORS_ORIGIN
  ? process.env.CORS_ORIGIN.split(',')
  : ['http://localhost:3000', 'http://localhost:4856'];

const corsOptions = {
  origin: (origin: string | undefined, callback: (err: Error | null, allow?: boolean) => void) => {
    // Allow requests with no origin (like mobile apps or curl)
    if (!origin) return callback(null, true);

    // Allow all origins in development/testing
    if (process.env.NODE_ENV !== 'production') {
      return callback(null, true);
    }

    // In production, check against allowed origins
    if (corsOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true
};

// ============================================================================
// HEALTH CHECK & MONITORING ENDPOINTS
// ============================================================================

// Basic health check (no CORS needed - used by load balancers)
app.get('/health', (req, res) => {
  res.status(200).json({
    status: 'ok',
    timestamp: new Date().toISOString()
  });
});

// Detailed health check with system info (with CORS for dashboard)
app.get('/api/health', cors(corsOptions), (req, res) => {
  const uptime = process.uptime();
  const memUsage = process.memoryUsage();

  res.json({
    status: 'ok',
    message: 'SynaptiHand API is running',
    timestamp: new Date().toISOString(),
    version: '1.0.0',
    environment: NODE_ENV,
    uptime: {
      seconds: Math.floor(uptime),
      formatted: `${Math.floor(uptime / 3600)}h ${Math.floor((uptime % 3600) / 60)}m ${Math.floor(uptime % 60)}s`
    },
    memory: {
      rss: `${Math.round(memUsage.rss / 1024 / 1024)}MB`,
      heapUsed: `${Math.round(memUsage.heapUsed / 1024 / 1024)}MB`,
      heapTotal: `${Math.round(memUsage.heapTotal / 1024 / 1024)}MB`,
    },
    architecture: 'unified-single-port',
    features: {
      compression: true,
      security: IS_PRODUCTION,
      caching: IS_PRODUCTION,
      cors: !IS_PRODUCTION || 'restricted'
    }
  });
});

// Readiness probe (checks if app can serve traffic)
app.get('/ready', (req, res) => {
  // Add checks for database, redis, etc. if needed
  res.status(200).json({ ready: true });
});

// Liveness probe (checks if app should be restarted)
app.get('/live', (req, res) => {
  res.status(200).json({ alive: true });
});

// API Routes - Apply CORS to each API route
app.use('/api/auth', cors(corsOptions), authRoutes);
app.use('/api/users', cors(corsOptions), userRoutes);
app.use('/api/system', cors(corsOptions), systemRoutes);
app.use('/api/protocols', cors(corsOptions), protocolRoutes);
app.use('/api/recordings', cors(corsOptions), recordingRoutes);
app.use('/api/recordings', cors(corsOptions), labelImagesRoutes);
app.use('/api/clinical', cors(corsOptions), clinicalRoutes);
app.use('/api/admin', cors(corsOptions), adminRoutes);
app.use('/api/upload', cors(corsOptions), uploadRoutes);
app.use('/api/projects', cors(corsOptions), projectRoutes);
app.use('/api/patients', cors(corsOptions), patientRoutes);
app.use('/api/mobile', cors(corsOptions), mobileRoutes);
app.use('/api/stats', cors(corsOptions), statsRoutes);
app.use('/api/invitations', cors(corsOptions), invitationRoutes);

// Catch-all for undefined API routes
app.use('/api/*', (req, res) => {
  res.status(404).json({
    success: false,
    error: 'API route not found',
    path: req.path
  });
});

// ============================================================================
// STATIC FILE SERVING (Unified Architecture)
// ============================================================================

const publicPath = path.join(__dirname, '../public');

// Serve static frontend files with optimized caching
app.use(express.static(publicPath, {
  maxAge: IS_PRODUCTION ? '1y' : '0', // 1 year in production, no cache in dev
  etag: true,
  lastModified: true,
  setHeaders: (res, filepath) => {
    // Cache immutable assets (with hash in filename) for 1 year
    if (filepath.match(/\.(js|css|woff2?|ttf|eot|svg|png|jpg|jpeg|gif|ico|webp)$/)) {
      res.setHeader('Cache-Control', IS_PRODUCTION ? 'public, max-age=31536000, immutable' : 'no-cache');
    }
    // Don't cache index.html (always fetch latest)
    if (filepath.endsWith('index.html')) {
      res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
      res.setHeader('Pragma', 'no-cache');
      res.setHeader('Expires', '0');
    }
  }
}));

// SPA Fallback: Serve index.html for all non-API routes
// This allows client-side routing (React Router, Vue Router, etc.)
app.get('*', (req, res) => {
  // Security: prevent directory traversal
  const indexPath = path.join(publicPath, 'index.html');

  // Set no-cache headers for index.html
  res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');

  res.sendFile(indexPath, (err) => {
    if (err) {
      // If index.html not found, serve a minimal 404 response
      res.status(404).json({
        success: false,
        error: 'Frontend not built. Run `npm run build` in the frontend directory.',
        hint: 'Make sure the public directory contains built frontend files.'
      });
    }
  });
});

// Error handling
app.use(errorMiddleware);

// Start server - bind to 0.0.0.0 for server access
const HOST = process.env.HOST || '0.0.0.0';
app.listen(PORT, HOST, () => {
  console.log(`🚀 SynaptiHand Backend Server Started`);
  console.log(`📡 Listening on: http://${HOST}:${PORT}`);
  console.log(`🏥 Health Check: http://${HOST}:${PORT}/api/health`);
  console.log(`\n📚 Available API Endpoints:`);
  console.log(`   - /api/auth         - Authentication (register, login)`);
  console.log(`   - /api/projects     - Project management (CRUD)`);
  console.log(`   - /api/patients     - Patient management (CRUD)`);
  console.log(`   - /api/protocols    - Protocol templates (CRUD)`);
  console.log(`   - /api/recordings   - Recording sessions (upload, list, detail)`);
  console.log(`   - /api/clinical     - Clinical analysis & annotations`);
  console.log(`   - /api/admin        - Admin operations (user approval)`);
  console.log(`   - /api/upload       - Chunked video upload`);
  console.log(`   - /api/mobile       - Mobile app uploads (no auth)`);
  console.log(`\n✅ Ready for testing!`);
});
