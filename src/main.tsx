import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import App from './App'
import './styles.css'
import 'katex/dist/katex.min.css'
import { registerSW } from 'virtual:pwa-register'

const updateSW = registerSW({
  immediate: true,
  onNeedRefresh() { void updateSW(true) },
  onRegisteredSW(_url, registration) {
    if (!registration) return
    void registration.update()
    window.setInterval(() => { void registration.update() }, 60_000)
  }
})

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode><BrowserRouter><App /></BrowserRouter></React.StrictMode>
)
