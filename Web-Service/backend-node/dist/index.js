"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const dotenv_1 = __importDefault(require("dotenv"));
const path_1 = __importDefault(require("path"));
const compression_1 = __importDefault(require("compression"));
const helmet_1 = __importDefault(require("helmet"));
const auth_routes_1 = __importDefault(require("./routes/auth.routes"));
const system_routes_1 = __importDefault(require("./routes/system.routes"));
const protocols_routes_1 = __importDefault(require("./routes/protocols.routes"));
const recordings_routes_1 = __importDefault(require("./routes/recordings.routes"));
const clinical_routes_1 = __importDefault(require("./routes/clinical.routes"));
const admin_routes_1 = __importDefault(require("./routes/admin.routes"));
const upload_routes_1 = __importDefault(require("./routes/upload.routes"));
const project_routes_1 = __importDefault(require("./routes/project.routes"));
const patient_routes_1 = __importDefault(require("./routes/patient.routes"));
const mobile_routes_1 = __importDefault(require("./routes/mobile.routes"));
const stats_routes_1 = __importDefault(require("./routes/stats.routes"));
const invitation_routes_1 = __importDefault(require("./routes/invitation.routes"));
const labelImages_routes_1 = __importDefault(require("./routes/labelImages.routes"));
const error_middleware_1 = require("./middleware/error.middleware");
const processing_worker_1 = require("./workers/processing.worker");
const cleanup_worker_1 = require("./workers/cleanup.worker");
dotenv_1.default.config();
// Initialize background workers
(0, processing_worker_1.registerWorker)();
(0, cleanup_worker_1.startCleanupCronJob)();
const app = (0, express_1.default)();
const PORT = parseInt(process.env.PORT || '5000', 10);
const NODE_ENV = process.env.NODE_ENV || 'development';
const IS_PRODUCTION = NODE_ENV === 'production';
// ============================================================================
// UNIFIED ARCHITECTURE MIDDLEWARE
// ============================================================================
// 1. Security Headers (Helmet.js)
app.use((0, helmet_1.default)({
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
app.use((0, compression_1.default)({
    filter: (req, res) => {
        // Don't compress responses if header says not to
        if (req.headers['x-no-compression']) {
            return false;
        }
        // Compress everything else
        return compression_1.default.filter(req, res);
    },
    level: IS_PRODUCTION ? 6 : 1, // Higher compression in production
    threshold: 1024, // Only compress if > 1KB
}));
// 3. Body parsing middleware (applies globally)
app.use(express_1.default.json());
app.use(express_1.default.urlencoded({ extended: true }));
// CORS configuration for API routes only
const corsOrigins = process.env.CORS_ORIGIN
    ? process.env.CORS_ORIGIN.split(',')
    : ['http://localhost:3000', 'http://localhost:4856'];
const corsOptions = {
    origin: (origin, callback) => {
        // Allow requests with no origin (like mobile apps or curl)
        if (!origin)
            return callback(null, true);
        // Allow all origins in development/testing
        if (process.env.NODE_ENV !== 'production') {
            return callback(null, true);
        }
        // In production, check against allowed origins
        if (corsOrigins.includes(origin)) {
            callback(null, true);
        }
        else {
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
app.get('/api/health', (0, cors_1.default)(corsOptions), (req, res) => {
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
app.use('/api/auth', (0, cors_1.default)(corsOptions), auth_routes_1.default);
app.use('/api/system', (0, cors_1.default)(corsOptions), system_routes_1.default);
app.use('/api/protocols', (0, cors_1.default)(corsOptions), protocols_routes_1.default);
app.use('/api/recordings', (0, cors_1.default)(corsOptions), recordings_routes_1.default);
app.use('/api/recordings', (0, cors_1.default)(corsOptions), labelImages_routes_1.default);
app.use('/api/clinical', (0, cors_1.default)(corsOptions), clinical_routes_1.default);
app.use('/api/admin', (0, cors_1.default)(corsOptions), admin_routes_1.default);
app.use('/api/upload', (0, cors_1.default)(corsOptions), upload_routes_1.default);
app.use('/api/projects', (0, cors_1.default)(corsOptions), project_routes_1.default);
app.use('/api/patients', (0, cors_1.default)(corsOptions), patient_routes_1.default);
app.use('/api/mobile', (0, cors_1.default)(corsOptions), mobile_routes_1.default);
app.use('/api/stats', (0, cors_1.default)(corsOptions), stats_routes_1.default);
app.use('/api/invitations', (0, cors_1.default)(corsOptions), invitation_routes_1.default);
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
const publicPath = path_1.default.join(__dirname, '../public');
// Serve static frontend files with optimized caching
app.use(express_1.default.static(publicPath, {
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
    const indexPath = path_1.default.join(publicPath, 'index.html');
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
app.use(error_middleware_1.errorMiddleware);
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
