import React from 'react';
import ReactDOM from 'react-dom/client';
import { DiscoveryPage } from './pages/DiscoveryPage';
import { httpClient } from './lib/httpClient';
import './index.css';

const root = document.getElementById('root');
if (!root) throw new Error('Missing #root element');

ReactDOM.createRoot(root).render(
  <React.StrictMode>
    <DiscoveryPage facade={httpClient} />
  </React.StrictMode>,
);
