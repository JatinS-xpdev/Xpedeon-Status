import { formatDateTime, getWorstServiceStatus, STATUS_META } from '../status.js';

function ServiceCard({ service }) {
  const meta = STATUS_META[service.status] ?? STATUS_META.outage;

  return (
    <article className="service-card">
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
}

function IncidentList({ incidents }) {
  return (
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
  );
}

function MaintenanceList({ maintenance }) {
  return (
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
  );
}

export function PublicStatusPage({ statusData }) {
  const { page, services = [], incidents = [], maintenance = [], generatedAt } = statusData;
  const overallStatus = services.length
    ? getWorstServiceStatus(services)
    : STATUS_META.maintenance;

  return (
    <main className="page">
      <nav className="top-nav">
        <a href="/">Status</a>
        <a href="/admin">Admin</a>
      </nav>

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
        {services.map((service) => (
          <ServiceCard key={service.name} service={service} />
        ))}
      </section>

      <section className="content-grid">
        <IncidentList incidents={incidents} />
        <MaintenanceList maintenance={maintenance} />
      </section>

      <footer className="footer">
        <span>Need help?</span>
        <a href={`mailto:${page.supportEmail}`}>{page.supportEmail}</a>
      </footer>
    </main>
  );
}
