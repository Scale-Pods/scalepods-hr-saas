import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export default defineConfig({
  plugins: [react(), tailwindcss()],
  build: {
    rollupOptions: {
      input: {
        main: path.resolve(__dirname, 'index.html'),
        reset: path.resolve(__dirname, 'reset-password/index.html'),
      },
    },
  },
  server: {
    port: 3000,
    open: true,
    proxy: {
      '/n8n-proxy': {
        target: 'https://n8n.srv1711190.hstgr.cloud',
        changeOrigin: true,
        rewrite: p => p.replace('/n8n-proxy', ''),
        secure: false,
      },
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
    },
  },
});
