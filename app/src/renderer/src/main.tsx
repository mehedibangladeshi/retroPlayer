import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import { start } from './engine/store'

start()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>
)
