import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
  ],
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    sourcemap: false,
    minify: true,
    target: 'es2020',
    cssMinify: true,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules')) {
            if (id.includes('socket.io-client')) return 'socket'
            if (id.includes('react') || id.includes('react-dom')) return 'react'
            return 'vendor'
          }
        },
      },
    },
  },
  server: {
    proxy: {
      '/assets': {
        target: process.env.VITE_DEV_API || 'http://localhost:3000',
        changeOrigin: true,
        secure: false,
      },
      '/admin': {
        target: process.env.VITE_DEV_API || 'http://localhost:3000',
        changeOrigin: true,
        secure: false,
      },
      '/api': {
        target: process.env.VITE_DEV_API || 'http://localhost:3000',
        changeOrigin: true,
        secure: false,
      },
      '/inbox': {
        target: process.env.VITE_DEV_API || 'http://localhost:3000',
        changeOrigin: true,
        secure: false,
      },
      '/socket.io': {
        target: process.env.VITE_DEV_API || 'http://localhost:3000',
        changeOrigin: true,
        ws: true,
        secure: false,
      },
    },
  },
})