import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './App'
import { isStandalone, requestPersistence } from './lib/platform'
import { pruneDeletedFiles, startAutoSync } from './lib/sync'
import './index.css'

// Home Screen apps get persistent storage without a prompt; ask up front.
if (isStandalone()) void requestPersistence()
startAutoSync()
void pruneDeletedFiles()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
