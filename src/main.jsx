import { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';

import { fetchStatus } from './api.js';
import { AdminPage } from './components/AdminPage.jsx';
import { Notice } from './components/Notice.jsx';
import { PublicStatusPage } from './components/PublicStatusPage.jsx';
import './styles.css';

function isAdminRoute() {
  return window.location.pathname.replace(/\/+$/, '') === '/admin';
}

function App() {
  const [statusData, setStatusData] = useState(null);
  const [error, setError] = useState('');
  const adminRoute = isAdminRoute();

  useEffect(() => {
    if (adminRoute) {
      return undefined;
    }

    const controller = new AbortController();
    setError('');

    fetchStatus({ signal: controller.signal })
      .then(setStatusData)
      .catch((requestError) => {
        if (requestError.name !== 'AbortError') {
          setError(requestError.message);
        }
      });

    return () => controller.abort();
  }, [adminRoute]);

  if (adminRoute) {
    return <AdminPage />;
  }

  if (error) {
    return <Notice fullPage title="Status unavailable" tone="error">{error}</Notice>;
  }

  if (!statusData) {
    return <Notice fullPage title="Loading status">Fetching the latest configured service state.</Notice>;
  }

  return <PublicStatusPage statusData={statusData} />;
}

createRoot(document.getElementById('root')).render(<App />);
