import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

import { App } from './App';
import './styles/app.css';

// opened without a page in the address: start on the overview (what the tool, or the study, is)
if (!window.location.hash || window.location.hash === '#') window.location.replace('#/overview');

const root = document.getElementById('root');
if (!root) throw new Error('#root not found');
createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
