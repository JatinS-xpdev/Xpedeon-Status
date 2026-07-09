import { buildStatusSegments, formatDateTime, getWorstServiceStatus, RISK_LEVEL_META, STATUS_META } from '../status.js';

function statusSummary(services) {
  return services.reduce(
    (summary, service) => ({
      ...summary,
      [service.status]: (summary[service.status] ?? 0) + 1
    }),
    {}
  );
}

function RaisedIncidentsBanner({ incidents }) {
  if (!incidents.length) {
    return null;
  }

  const worstRisk = incidents.reduce((worst, incident) => {
    const currentLevel = incident.riskLevel ?? 'minor';
    const riskRank = { minor: 1, major: 2, critical: 3 }[currentLevel] ?? 1;
    const worstRank = { minor: 1, major: 2, critical: 3 }[worst] ?? 1;
    return riskRank > worstRank ? currentLevel : worst;
  }, 'minor');

  const meta = RISK_LEVEL_META[worstRisk];

  return (
    <div className={`incident-banner incident-banner-${meta.tone}`}>
      <div className="incident-banner-content">
        <div>
          <h2 className="incident-banner-title">
            <span className="status-dot" aria-hidden="true" />
            {incidents.length} Active {incidents.length === 1 ? 'Issue' : 'Issues'}
          </h2>
          <p className="incident-banner-summary">
            {incidents.map((incident) => incident.title).join(' • ')}
          </p>
        </div>
        <a href="#active-incidents" className="incident-banner-link">
          View details →
        </a>
      </div>
    </div>
  );
}

function ServiceRow({ service }) {
  const meta = STATUS_META[service.status] ?? STATUS_META.outage;
  const segments = buildStatusSegments(service.history, 30, service.status);

  return (
    <article className="service-row">
      <div className="service-copy">
        <h2>{service.name}</h2>
        <p>{service.description}</p>
      </div>
      <div className="uptime-track" aria-label={`Recent uptime for ${service.name}`}>
        {segments.map((segmentStatus, segmentIndex) => {
          const segmentMeta = STATUS_META[segmentStatus] ?? STATUS_META.operational;

          return (
            <span className={`uptime-segment uptime-${segmentMeta.tone}`} key={`${service.name}-${segmentIndex}`} />
          );
        })}
      </div>
      <span className={`pill pill-${meta.tone}`}>
        <span className="status-dot" aria-hidden="true" />
        {meta.label}
      </span>
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
  const summary = statusSummary(services);

  return (
    <main className="page">
      <nav className="top-nav">
        <a className="brand-link" href="/">
          <span className="brand-mark" aria-hidden="true" />
          Xpedeon
        </a>
        <div>
          <a href="/">Status</a>
          <a href="/admin">Admin</a>
        </div>
      </nav>

      {incidents.length > 0 && <RaisedIncidentsBanner incidents={incidents} />}

      <header className="hero">
        <div>
          <p className="eyebrow">Construction ERP Service Health</p>
          <h1>{page.title}</h1>
          <p className="lede">{page.description}</p>
        </div>
        <div className={`overall overall-${overallStatus.tone}`}>
          <div className="overall-icon">
            <span className="status-dot" aria-hidden="true" />
          </div>
          <div>
            <span className="overall-label">{overallStatus.label}</span>
            <span className="overall-time">Updated {formatDateTime(generatedAt)}</span>
          </div>
        </div>
      </header>

      <section className="health-strip" aria-label="Status summary">
        <div>
          <span className="metric-value">{services.length}</span>
          <span className="metric-label">monitored services</span>
        </div>
        <div>
          <span className="metric-value">{summary.operational ?? 0}</span>
          <span className="metric-label">operational</span>
        </div>
        <div>
          <span className="metric-value">{incidents.length}</span>
          <span className="metric-label">active incidents</span>
        </div>
        <div>
          <span className="metric-value">{maintenance.length}</span>
          <span className="metric-label">maintenance windows</span>
        </div>
      </section>

      <section className="status-board" aria-label="Service status summary">
        <div className="board-heading">
          <div>
            <h2>Component Status</h2>
            <p>Current state and recent availability across core Xpedeon services.</p>
          </div>
          <div className="legend">
            <span><i className="legend-good" />Operational</span>
            <span><i className="legend-warn" />Degraded</span>
            <span><i className="legend-info" />Maintenance</span>
            <span><i className="legend-bad" />Outage</span>
          </div>
        </div>

        <div className="service-list">
          {services.map((service) => (
            <ServiceRow key={service.name} service={service} />
          ))}
        </div>
      </section>

      <section className="content-grid">
        <div id="active-incidents">
          <IncidentList incidents={incidents} />
        </div>
        <MaintenanceList maintenance={maintenance} />
      </section>

      <footer className="footer">
        <span>Need help?</span>
        <a href={`mailto:${page.supportEmail}`}>{page.supportEmail}</a>
      </footer>
    </main>
  );
}
