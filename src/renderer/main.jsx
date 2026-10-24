import { StrictMode } from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './styles.css';
import './tailwind.css';

ReactDOM.createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

// Service worker só no app web servido pelo PC (celular); o desktop carrega de file://
if (!window.sentinelAPI && 'serviceWorker' in navigator && window.location.protocol.startsWith('http')) {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}
