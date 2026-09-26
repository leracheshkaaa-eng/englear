import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './index.css'
import { initI18n } from './i18n'

// Load the interface language before the first render, so no text flashes in the wrong language.
initI18n().finally(() => {
  ReactDOM.createRoot(document.getElementById('root')!).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>,
  )
})
