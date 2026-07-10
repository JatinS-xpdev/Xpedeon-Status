import { useCallback, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';

import { fetchStatus } from './api.js';
import { AdminPage } from './components/AdminPage.jsx';
import { Notice } from './components/Notice.jsx';
import { PublicStatusPage } from './components/PublicStatusPage.jsx';
import './styles.css';

const REFRESH_INTERVAL_MS = 60 * 1000;

function isAdminRoute() {
  return window.location.pathname.replace(/\/+$/, '') === '/admin';
}

function App() {
  const [statusData, setStatusData] = useState(null);
  const [error, setError] = useState('');
  const [refreshError, setRefreshError] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const adminRoute = isAdminRoute();

  const loadStatus = useCallback(async ({ signal, initial = false } = {}) => {
    if (!initial) {
      setRefreshing(true);
    }

    try {
      const data = await fetchStatus({ signal });
      setStatusData(data);
      setError('');
      setRefreshError('');
    } catch (requestError) {
      if (requestError.name === 'AbortError') {
        return;
      }
      if (initial) {
        setError(requestError.message || 'Unable to load status.');
      } else {
        setRefreshError(requestError.message || 'Unable to refresh status.');
      }
    } finally {
      if (!initial) {
        setRefreshing(false);
      }
    }
  }, []);

  useEffect(() => {
    if (adminRoute) {
      return undefined;
    }

    const controller = new AbortController();
    loadStatus({ signal: controller.signal, initial: true });

    const interval = window.setInterval(() => {
      if (document.visibilityState === 'visible') {
        loadStatus({ signal: controller.signal });
      }
    }, REFRESH_INTERVAL_MS);

    function refreshWhenVisible() {
      if (document.visibilityState === 'visible') {
        loadStatus({ signal: controller.signal });
      }
    }

    document.addEventListener('visibilitychange', refreshWhenVisible);
    return () => {
      controller.abort();
      window.clearInterval(interval);
      document.removeEventListener('visibilitychange', refreshWhenVisible);
    };
  }, [adminRoute, loadStatus]);

  if (adminRoute) {
    return <AdminPage />;
  }

  if (error && !statusData) {
    return <Notice fullPage title="Status unavailable" tone="error">{error}</Notice>;
  }

  if (!statusData) {
    return <Notice fullPage title="Loading status">Fetching the latest configured service state.</Notice>;
  }

  return (
    <PublicStatusPage
      statusData={statusData}
      onRefresh={() => loadStatus()}
      refreshing={refreshing}
      refreshError={refreshError}
    />
  );
}

createRoot(document.getElementById('root')).render(<App />);
