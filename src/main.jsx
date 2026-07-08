import React, { useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import './styles.css';

const STATUS_META = {
  operational: {
    label: 'Operational',
    rank: 0,
    tone: 'good'
  },
  degraded: {
    label: 'Degraded Performance',
    rank: 1,
    tone: 'warn'
  },
  maintenance: {
    label: 'Maintenance',
    rank: 2,
    tone: 'info'
  },
  outage: {
    label: 'Major Outage',
    rank: 3,
    tone: 'bad'
  }
};

function formatDateTime(value) {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short'
  }).format(new Date(value));
}

function getWorstServiceStatus(services) {
  return services.reduce((worst, service) => {
    const current = STATUS_META[service.status] ?? STATUS_META.outage;
    return current.rank > worst.rank ? current : worst;
  }, STATUS_META.operational);
}

function App() {
  const [statusData, setStatusData] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    fetch('/api/status')
      .then((response) => {
        if (!response.ok) {
          throw new Error('Status API request failed');
        }
        return response.json();
      })
      .then(setStatusData)
      .catch((requestError) => setError(requestError.message));
  }, []);

  const overallStatus = useMemo(() => {
    if (!statusData?.services?.length) {
      return STATUS_META.maintenance;
    }

    return getWorstServiceStatus(statusData.services);
  }, [statusData]);

  if (error) {
    return (
      <main className="page page-centered">
        <section className="notice notice-error">
          <h1>Status unavailable</h1>
          <p>{error}</p>
        </section>
      </main>
    );
  }

  if (!statusData) {
    return (
      <main className="page page-centered">
        <section className="notice">
          <h1>Loading status</h1>
          <p>Fetching the latest configured service state.</p>
        </section>
      </main>
    );
  }

  const { page, services = [], incidents = [], maintenance = [], generatedAt } = statusData;

  return (
    <main className="page">
      <header className="hero">
        <div>
          <p className="eyebrow">System Status</p>
          <h1>{page.title}</h1>
          <p className="lede">{page.description}</p>
        </div>
        <div className={`overall overall-${overallStatus.tone}`}>
          <span className="status-dot" aria-hidden="true" />
          <div>
            <span className="overall-label">{overallStatus.label}</span>
            <span className="overall-time">Updated {formatDateTime(generatedAt)}</span>
          </div>
        </div>
      </header>

      <section className="summary-grid" aria-label="Service status summary">
        {services.map((service) => {
          const meta = STATUS_META[service.status] ?? STATUS_META.outage;

          return (
            <article className="service-card" key={service.name}>
              <div className="service-heading">
                <h2>{service.name}</h2>
                <span className={`pill pill-${meta.tone}`}>
                  <span className="status-dot" aria-hidden="true" />
                  {meta.label}
                </span>
              </div>
              <p>{service.description}</p>
            </article>
          );
        })}
      </section>

      <section className="content-grid">
        <div className="panel">
          <div className="section-heading">
            <h2>Active Incidents</h2>
            <span>{incidents.length}</span>
          </div>
          {incidents.length ? (
            <div className="stack">
              {incidents.map((incident) => (
                <article className="timeline-item" key={`${incident.title}-${incident.updatedAt}`}>
                  <div>
                    <h3>{incident.title}</h3>
                    <p>{incident.message}</p>
                  </div>
                  <dl>
                    <div>
                      <dt>Status</dt>
                      <dd>{incident.status}</dd>
                    </div>
                    <div>
                      <dt>Impact</dt>
                      <dd>{incident.impact}</dd>
                    </div>
                    <div>
                      <dt>Updated</dt>
                      <dd>{formatDateTime(incident.updatedAt)}</dd>
                    </div>
                  </dl>
                </article>
              ))}
            </div>
          ) : (
            <p className="empty">No active incidents.</p>
          )}
        </div>

        <div className="panel">
          <div className="section-heading">
            <h2>Scheduled Maintenance</h2>
            <span>{maintenance.length}</span>
          </div>
          {maintenance.length ? (
            <div className="stack">
              {maintenance.map((item) => (
                <article className="timeline-item" key={`${item.title}-${item.scheduledFor}`}>
                  <div>
                    <h3>{item.title}</h3>
                    <p>{item.message}</p>
                  </div>
                  <dl>
                    <div>
                      <dt>Starts</dt>
                      <dd>{formatDateTime(item.scheduledFor)}</dd>
                    </div>
                    <div>
                      <dt>Duration</dt>
                      <dd>{item.duration}</dd>
                    </div>
                  </dl>
                </article>
              ))}
            </div>
          ) : (
            <p className="empty">No maintenance scheduled.</p>
          )}
        </div>
      </section>

      <footer className="footer">
        <span>Need help?</span>
        <a href={`mailto:${page.supportEmail}`}>{page.supportEmail}</a>
      </footer>
    </main>
  );
}

createRoot(document.getElementById('root')).render(<App />);
