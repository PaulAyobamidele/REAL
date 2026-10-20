import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

import { App } from './App';
import './styles/app.css';

// opened without a page in the address: start on the welcome page, each tool's first page
// (the study shows its start screen first anyway, until a session exists)
if (!window.location.hash || window.location.hash === '#') window.location.replace('#/welcome');

const root = document.getElementById('root');
if (!root) throw new Error('#root not found');
createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
