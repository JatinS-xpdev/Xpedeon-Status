import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { fetchStatus } from './api.js';
import { AdminPage } from './components/AdminPage.jsx';
import { Notice } from './components/Notice.jsx';
import { PublicStatusPage } from './components/PublicStatusPage.jsx';
import './styles.css';

function App() {
  const [statusData, setStatusData] = useState(null);
  const [error, setError] = useState('');
  const isAdmin = window.location.pathname === '/admin';

  useEffect(() => {
    if (isAdmin) {
      return;
    }

    fetchStatus()
      .then(setStatusData)
      .catch((requestError) => setError(requestError.message));
  }, [isAdmin]);

  if (isAdmin) {
    return <AdminPage />;
  }

  if (error) {
    return <Notice title="Status unavailable" tone="error">{error}</Notice>;
  }

  if (!statusData) {
    return <Notice title="Loading status">Fetching the latest configured service state.</Notice>;
  }

  return <PublicStatusPage statusData={statusData} />;
}

createRoot(document.getElementById('root')).render(<App />);
