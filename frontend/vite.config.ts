/// <reference types="vitest/config" />
import { fileURLToPath, URL } from 'node:url'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// The browser only ever talks to its own origin; Vite forwards API calls to Spring Boot.
// This mirrors the nginx setup used in Docker, so no CORS configuration is needed anywhere.
const apiTarget = process.env.API_PROXY_TARGET ?? 'http://localhost:8080'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  build: {
    rolldownOptions: {
      output: {
        // The games' AIs (AI mode is for admins) go to assets/ai/, which nginx serves only to an
        // admin's session. Everything else keeps the usual place.
        chunkFileNames: (chunk) =>
          /[\\/]games[\\/][^\\/]+[\\/]ai[\\/]/.test(chunk.facadeModuleId ?? '')
            ? 'assets/ai/[name]-[hash].js'
            : 'assets/[name]-[hash].js',
      },
    },
  },
  server: {
    port: 5173,
    proxy: {
      '/api': apiTarget,
      '/actuator': apiTarget,
    },
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    css: false,
    restoreMocks: true,
    // The AI suites play whole games; give them room when every test file runs in parallel.
    testTimeout: 30_000,
    coverage: {
      include: ['src/**'],
      exclude: ['src/test/**', 'src/**/*.test.*', 'src/**/test/**', 'src/vite-env.d.ts'],
      reporter: ['text-summary', 'html', 'json-summary'],
    },
  },
})
