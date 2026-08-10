import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icon.svg'],
      manifest: {
        name: '知行 AI 教学诊断',
        short_name: '知行课堂',
        description: '面向课堂检测、诊断与强化练习的 AI 助教',
        theme_color: '#173f3a',
        background_color: '#f4f6f2',
        display: 'standalone',
        start_url: '/',
        icons: [{ src: '/icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' }]
      }
    })
  ],
  server: {
    host: '0.0.0.0',
    port: 5173,
    proxy: {
      '/api': 'http://localhost:4173',
      '/uploads': 'http://localhost:4173'
    }
  }
})
