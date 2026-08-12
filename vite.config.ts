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
        name: '辽宁科技大学 · 知行教学诊断',
        short_name: '知行课堂',
        description: '辽宁科技大学课堂检测、课后作业、诊断与强化练习系统',
        theme_color: '#0b4a7f',
        background_color: '#f6f8fa',
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
