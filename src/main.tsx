import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './styles/global.css'
import {
  applyThemeToDocument,
  readStoredTheme,
} from './editor/theme/themes'
import App from './App'

/* Avoid a flash of the wrong palette before React mounts. */
applyThemeToDocument(readStoredTheme())

const root = document.getElementById('root')
if (!root) throw new Error('#root not found')

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
