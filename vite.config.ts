import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

const apiTarget = process.env.VITE_API_TARGET ?? 'http://127.0.0.1:3010'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    proxy: {
      '/api': {
        target: apiTarget,
        changeOrigin: true,
      },
    },
  },
  build: {
    modulePreload: false,
    rollupOptions: {
      output: {
        manualChunks: (id) => id.includes('node_modules/xlsx') ? 'xlsx' : undefined,
        chunkFileNames: (chunk) => chunk.name === 'xlsx' ? 'assets/xlsx.js' : 'assets/[name]-[hash].js',
      },
    },
  },
  worker: {
    format: 'es',
    rollupOptions: {
      external: ['xlsx'],
      output: { paths: { xlsx: '/assets/xlsx.js' } },
    },
  },
  test: {
    environment: 'jsdom',
    globals: true,
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx', 'scripts/**/*.test.mjs'],
  },
})
