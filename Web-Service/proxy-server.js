const http = require('http');
const httpProxy = require('http-proxy');

// ═══════════════════════════════════════════════════════════════
// UNIFIED PORT 5000 GATEWAY - Local Development Proxy
// ═══════════════════════════════════════════════════════════════
// This proxy server provides a unified entry point on port 5000
// for local development, matching the production Docker setup.
//
// Architecture:
//   Port 5000 (this proxy) → /api/* → Backend :5001
//                          → /*     → Frontend :3000
// ═══════════════════════════════════════════════════════════════

const PROXY_PORT = 5000;      // Unified gateway port
const BACKEND_PORT = 5001;    // Internal backend port
const FRONTEND_PORT = 3000;   // Internal frontend port

const proxy = httpProxy.createProxyServer({});

// Handle WebSocket upgrades for Vite HMR
const server = http.createServer((req, res) => {
  // Enable CORS for all origins in development
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, PATCH, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With');
  res.setHeader('Access-Control-Allow-Credentials', 'true');

  if (req.method === 'OPTIONS') {
    res.writeHead(200);
    res.end();
    return;
  }

  // Route /api/* requests to backend
  if (req.url.startsWith('/api')) {
    proxy.web(req, res, {
      target: `http://localhost:${BACKEND_PORT}`,
      changeOrigin: true
    });
  }
  // Route everything else to frontend (Vite dev server)
  else {
    proxy.web(req, res, {
      target: `http://localhost:${FRONTEND_PORT}`,
      changeOrigin: true
    });
  }
});

// Handle WebSocket upgrades (required for Vite HMR)
server.on('upgrade', (req, socket, head) => {
  proxy.ws(req, socket, head, {
    target: `http://localhost:${FRONTEND_PORT}`,
    changeOrigin: true
  });
});

// Handle proxy errors gracefully
proxy.on('error', (err, req, res) => {
  console.error('Proxy error:', err.message);
  if (res.writeHead) {
    res.writeHead(502, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      error: 'Service unavailable',
      message: err.message,
      hint: 'Ensure backend (:5001) and frontend (:3000) are running'
    }));
  }
});

server.listen(PROXY_PORT, '0.0.0.0', () => {
  console.log('');
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('  🚀 UNIFIED GATEWAY - Port 5000');
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('');
  console.log(`  📍 Access: http://localhost:${PROXY_PORT}`);
  console.log(`  📍 Network: http://<your-ip>:${PROXY_PORT}`);
  console.log('');
  console.log('  Routing:');
  console.log(`    /api/*  → Backend  (localhost:${BACKEND_PORT})`);
  console.log(`    /*      → Frontend (localhost:${FRONTEND_PORT})`);
  console.log('');
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('');
});
