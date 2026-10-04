import { StrictMode } from 'react'
// Fuentes servidas desde la propia web (sin peticiones a Google Fonts)
import '@fontsource-variable/fraunces/opsz.css'
import '@fontsource-variable/manrope'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import I18nProvider from './components/I18nProvider.tsx'
import App from './App.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <I18nProvider>
        <App />
      </I18nProvider>
    </BrowserRouter>
  </StrictMode>,
)
