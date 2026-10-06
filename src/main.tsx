import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { ExperienceShell } from './experience/ExperienceShell';
import './index.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <ExperienceShell />
    </BrowserRouter>
  </StrictMode>
);
