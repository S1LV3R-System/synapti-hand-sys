import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// ═══════════════════════════════════════════════════════════════
// VITE DEV SERVER - Internal Port 3000
// ═══════════════════════════════════════════════════════════════
// Access via unified gateway at http://localhost:5000
// This internal server runs on port 3000, proxied by gateway.
//
// DO NOT access this port directly - use port 5000 instead!
// ═══════════════════════════════════════════════════════════════

export default defineConfig({
  plugins: [react()],
  server: {
    host: '0.0.0.0',
    port: 3000,           // Internal port - access via :5000 gateway
    strictPort: true,     // Fail if port 3000 not available
    // HMR via unified gateway on port 5000
    hmr: {
      host: 'localhost',  // Force localhost for HMR in dev
      clientPort: 5000,   // HMR WebSocket connects via gateway
    },
    // No proxy needed - unified gateway handles /api routing
  },
  preview: {
    host: '0.0.0.0',
    port: 4173,
    strictPort: false,
  },
})
