import { StrictMode } from 'react';
import ReactDOM from 'react-dom/client';
import { IconContext } from '@phosphor-icons/react';
import '@fontsource-variable/geist';
import '@fontsource-variable/geist-mono';
import App from './App';
import './styles/index.css';
import './styles/tailwind.css';

// Ícones Phosphor em traço fino em todo o app (cada ícone ainda pode pedir outro peso)
const ICONS = { weight: 'light' };

ReactDOM.createRoot(document.getElementById('root')).render(
  <StrictMode>
    <IconContext.Provider value={ICONS}>
      <App />
    </IconContext.Provider>
  </StrictMode>,
);
// Service worker só no app web servido pelo PC (celular); o desktop carrega de file://
if (!window.sentinelAPI && 'serviceWorker' in navigator && window.location.protocol.startsWith('http')) {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}
