import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { play } from './sound'
import { MusicPlayer } from './ui/MusicPlayer'

// Soft click on every button and nav link (specific actions add their own sounds on top).
document.addEventListener('pointerdown', (e) => {
  const el = (e.target as HTMLElement).closest('button:not(:disabled), nav a, .team-tile');
  if (el) play('click')
}, { capture: true })

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
    <MusicPlayer />
  </StrictMode>,
)
