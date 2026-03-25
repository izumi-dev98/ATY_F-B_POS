import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    proxy: {
      '/api/ai': {
        target: 'https://api.kiro.cheap',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/ai/, '/v1'),
        configure: (proxy, _options) => {
          proxy.on('proxyReq', (proxyReq, req, res) => {
            proxyReq.setHeader('Authorization', 'Bearer sk-aw-18231c9bdfb3b5dfd7c5298ab1995f4f');
            proxyReq.setHeader('Content-Type', 'application/json');
          });
        }
      }
    }
  }
})
