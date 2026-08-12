// SPDX-License-Identifier: Apache-2.0
// Copyright 2024-present Scalytics, Inc. (https://www.scalytics.io)
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const backend = env.BACKEND_URL || 'http://localhost:3000';

  return {
    plugins: [react()],
    envPrefix: 'REACT_APP_',
    server: {
      port: Number(env.PORT) || 3001,
      proxy: {
        '/api': { target: backend, changeOrigin: true },
        '/api-docs': { target: backend, changeOrigin: true },
        '/v1': { target: backend, changeOrigin: true },
      },
    },
    build: {
      outDir: 'build',
      assetsDir: 'static',
      sourcemap: false,
    },
    test: {
      environment: 'jsdom',
      globals: true,
      setupFiles: './src/setupTests.js',
    },
  };
});
