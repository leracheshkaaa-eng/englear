import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './index.css'
import { initI18n } from './i18n'

// Whiteboard fonts are served by this site (see excalidrawFonts in vite.config.ts), not by a public CDN.
;(window as unknown as { EXCALIDRAW_ASSET_PATH: string }).EXCALIDRAW_ASSET_PATH = '/excalidraw/'

// After a new deploy an open tab may ask for code files that no longer exist: reload once to get the new ones.
window.addEventListener('vite:preloadError', (e) => {
  try {
    if (sessionStorage.getItem('englean.reloadedAfterDeploy')) return
    sessionStorage.setItem('englean.reloadedAfterDeploy', '1')
  } catch {
    /* no storage: reload anyway */
  }
  e.preventDefault()
  location.reload()
})

// Load the interface language before the first render, so no text flashes in the wrong language.
initI18n().finally(() => {
  ReactDOM.createRoot(document.getElementById('root')!).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>,
  )
})
