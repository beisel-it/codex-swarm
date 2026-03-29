import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '@fontsource/iosevka-aile/400.css'
import '@fontsource/iosevka-aile/500.css'
import '@fontsource/iosevka-aile/600.css'
import '@fontsource/iosevka-aile/700.css'
import '@fontsource/iosevka-etoile/400.css'
import '@fontsource/iosevka-etoile/500.css'
import '@fontsource/iosevka/400.css'
import '@fontsource/iosevka/500.css'
import '@fontsource/iosevka/600.css'
import './index.css'
import App from './App.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
