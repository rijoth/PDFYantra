import path from 'path';
import { fileURLToPath } from 'url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { securityHeaders } from './plugins/securityHeaders.ts';
import { buildSecurityHeaders } from './config/csp.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export default defineConfig({
  server: {
    port: 3000,
    host: '0.0.0.0',
  },
  // `vite preview` serves the same header set as production. CSP is not applied
  // to the dev server: HMR and the React refresh preamble need inline script.
  preview: {
    headers: buildSecurityHeaders(),
  },
  plugins: [react(), securityHeaders()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, '.'),
    }
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          'vendor-react': ['react', 'react-dom'],
          'vendor-pdfjs': ['pdfjs-dist'],
          'vendor-pdflib': ['pdf-lib'],
          'vendor-office': ['mammoth', 'xlsx'],
          'vendor-dnd': ['@dnd-kit/core', '@dnd-kit/sortable', '@dnd-kit/utilities'],
          'vendor-utils': ['jszip', 'html2canvas', 'zustand']
        }
      }
    },
    chunkSizeWarningLimit: 1200
  }
});
