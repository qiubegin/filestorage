import { fileURLToPath } from 'node:url';

import react from '@vitejs/plugin-react';
import { DEFAULT_WEB_PORT } from '@zhishu/shared';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  server: {
    port: DEFAULT_WEB_PORT,
    proxy: {
      '/api': 'http://localhost:3001',
    },
  },
});
