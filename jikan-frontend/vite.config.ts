import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
    plugins: [react()],
    server: {
        proxy: {
            '/api': {
                target: 'http://localhost:3001',
                changeOrigin: true,
            },
            '/consumet': {
                target: 'https://api.consumet.org',
                changeOrigin: true,
                rewrite: (path) => path.replace(/^\/consumet/, ''),
                secure: false,
            },
            // Animelok proxy: Vite dev server forwards requests to animelok.xyz
            // server-side (using your home/residential IP), spoofing Origin so
            // animelok's 401 Origin check passes. No CORS needed since browser
            // talks to same-origin localhost:5173.
            '/animelok-api': {
                target: 'https://animelok.xyz',
                changeOrigin: true,
                secure: true,
                rewrite: (path) => path.replace(/^\/animelok-api/, '/api/anime'),
                headers: {
                    'Origin': 'https://animelok.xyz',
                    'Referer': 'https://animelok.xyz/',
                    'Accept': 'application/json, text/plain, */*',
                    'X-Requested-With': 'XMLHttpRequest',
                },
            }
        }
    }
})