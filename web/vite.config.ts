import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': `${import.meta.dirname}/src`,
    },
  },
  optimizeDeps: {
    include: ['react-is', 'recharts'],
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules')) {
            if (id.includes('@codemirror') || id.includes('@uiw/react-codemirror')) {
              return 'vendor-codemirror';
            }
            if (id.includes('@xyflow') || id.includes('dagre') || id.includes('html-to-image')) {
              return 'vendor-xyflow';
            }
            if (id.includes('recharts') || id.includes('d3-')) {
              return 'vendor-charts';
            }
            if (id.includes('lucide-react')) {
              return 'vendor-icons';
            }
            if (
              id.includes('@tanstack/react-table') ||
              id.includes('@tanstack/react-virtual') ||
              id.includes('@tanstack/react-query')
            ) {
              return 'vendor-tanstack';
            }
          }
        },
      },
    },
    chunkSizeWarningLimit: 800,
  },
  server: {
    proxy: {
      '/api': {
        target: 'http://localhost:8080',
        changeOrigin: true,
      },
    },
  },
})
