import {
  buildStatusTimeline,
  formatDateTime,
  getWorstServiceStatus,
  RISK_LEVEL_META,
  SERVICE_STATUSES,
  STATUS_META,
  summarizeServices
} from '../status.js';

function safeMailto(email) {
  return typeof email === 'string' && email.includes('@') ? `mailto:${email}` : undefined;
}

function Nav({ supportEmail }) {
  const supportHref = safeMailto(supportEmail);

  return (
    <nav className="top-nav" aria-label="Primary navigation">
      <a className="brand-link" href="/" aria-label="Xpedeon status home">
        <span className="brand-mark" aria-hidden="true" />
        <span>Xpedeon</span>
      </a>
      <div>
        <a href="/">Status</a>
        <a href="/admin">Admin</a>
        {supportHref ? <a href={supportHref}>Support</a> : null}
      </div>
    </nav>
  );
}

function IncidentBanner({ incidents }) {
  if (!incidents.length) {
    return null;
  }

  const worstRisk = incidents.reduce((worst, incident) => {
    const current = RISK_LEVEL_META[incident.riskLevel] ?? RISK_LEVEL_META.minor;
    return current.rank > worst.rank ? current : worst;
  }, RISK_LEVEL_META.minor);

  const mostRecent = incidents.reduce((latest, incident) => {
    const latestTime = new Date(latest.updatedAt).getTime();
    const incidentTime = new Date(incident.updatedAt).getTime();
    return incidentTime > latestTime ? incident : latest;
  }, incidents[0]);

  const heading = worstRisk.rank >= 3 ? 'Critical issue active' : worstRisk.rank === 2 ? 'Major issue active' : 'Active issue';

  return (
    <section className={`incident-banner incident-banner-${worstRisk.tone}`} aria-label="Active incident alert">
      <div className="incident-banner-header">
        <div className="incident-banner-status">
          <span className="status-dot" aria-hidden="true" />
          <div>
            <h2 className="incident-banner-title">{heading}</h2>
            <p className="incident-banner-time">Updated {formatDateTime(mostRecent.updatedAt)}</p>
          </div>
        </div>
        <a className="incident-banner-link" href="#active-incidents">View details</a>
      </div>
      <div className="incident-banner-details">
        {incidents.map((incident, index) => {
          const riskMeta = RISK_LEVEL_META[incident.riskLevel] ?? RISK_LEVEL_META.minor;
          return (
            <article className="incident-item" key={`${incident.title}-${index}`}>
              <div className="incident-item-header">
                <h3 className="incident-item-title">{incident.title}</h3>
                <span className={`incident-badge incident-badge-${riskMeta.tone}`}>{riskMeta.label}</span>
              </div>
              <p className="incident-item-message">{incident.message}</p>
              {incident.impact ? <p className="incident-item-impact"><strong>Impact:</strong> {incident.impact}</p> : null}
            </article>
          );
        })}
      </div>
    </section>
  );
}

function StatusPill({ status }) {
  const meta = STATUS_META[status] ?? STATUS_META.outage;
  return (
    <span className={`pill pill-${meta.tone}`}>
      <span className="status-dot" aria-hidden="true" />
      {meta.label}
    </span>
  );
}

function ServiceRow({ service }) {
  const meta = STATUS_META[service.status] ?? STATUS_META.outage;
  const timeline = buildStatusTimeline(service.history, 30, service.status);

  return (
    <article className="service-row">
      <div className="service-copy">
        <h3>{service.name}</h3>
        <p>{service.description}</p>
      </div>
      <div className="uptime-track" aria-label={`Recent uptime for ${service.name}`}>
        {timeline.map((entry) => (
          <span
            className={`uptime-segment uptime-${entry.tone}`}
            key={entry.date}
            title={`${entry.date}: ${entry.label}`}
          />
        ))}
      </div>
      <span className={`pill pill-${meta.tone}`}>
        <span className="status-dot" aria-hidden="true" />
        {meta.label}
      </span>
    </article>
  );
}

function MetricStrip({ services, summary }) {
  const total = services.length;
  return (
    <section className="health-strip" aria-label="Service status summary">
      <div>
        <span className="metric-value">{total}</span>
        <span className="metric-label">Monitored services</span>
      </div>
      <div>
        <span className="metric-value">{summary.operational ?? 0}</span>
        <span className="metric-label">Operational</span>
      </div>
      <div>
        <span className="metric-value">{(summary.degraded ?? 0) + (summary.maintenance ?? 0)}</span>
        <span className="metric-label">Warnings</span>
      </div>
      <div>
        <span className="metric-value">{summary.outage ?? 0}</span>
        <span className="metric-label">Outages</span>
      </div>
    </section>
  );
}

function ServiceBoard({ services }) {
  return (
    <section className="status-board" aria-labelledby="service-board-title">
      <div className="board-heading">
        <div>
          <h2 id="service-board-title">Services</h2>
          <p>Last 30 days are shown from left to right. Hover over a bar for the date and state.</p>
        </div>
        <div className="legend" aria-label="Legend">
          {SERVICE_STATUSES.map((status) => {
            const meta = STATUS_META[status];
            return (
              <span key={status}>
                <i className={`legend-${meta.tone}`} aria-hidden="true" />
                {meta.label}
              </span>
            );
          })}
        </div>
      </div>
      <div className="service-list">
        {services.length ? services.map((service) => <ServiceRow service={service} key={service.name} />) : <p className="empty board-empty">No services configured.</p>}
      </div>
    </section>
  );
}

function IncidentList({ incidents }) {
  return (
    <section className="panel" id="active-incidents" aria-labelledby="active-incidents-title">
      <div className="section-heading">
        <h2 id="active-incidents-title">Active Incidents</h2>
        <span>{incidents.length}</span>
      </div>
      {incidents.length ? (
        <div className="stack">
          {incidents.map((incident, index) => (
            <article className="timeline-item" key={`${incident.title}-${incident.updatedAt}-${index}`}>
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
                  <dd>{incident.impact || 'Not specified'}</dd>
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
    </section>
  );
}

function MaintenanceList({ maintenance }) {
  return (
    <section className="panel" aria-labelledby="scheduled-maintenance-title">
      <div className="section-heading">
        <h2 id="scheduled-maintenance-title">Scheduled Maintenance</h2>
        <span>{maintenance.length}</span>
      </div>
      {maintenance.length ? (
        <div className="stack">
          {maintenance.map((item, index) => (
            <article className="timeline-item" key={`${item.title}-${item.scheduledFor}-${index}`}>
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
    </section>
  );
}

export function PublicStatusPage({ statusData }) {
  const { page = {}, services = [], incidents = [], maintenance = [], generatedAt } = statusData;
  const overallStatus = services.length ? getWorstServiceStatus(services) : STATUS_META.maintenance;
  const summary = summarizeServices(services);

  return (
    <main className="page">
      <Nav supportEmail={page.supportEmail} />
      <IncidentBanner incidents={incidents} />

      <header className="hero">
        <div>
          <p className="eyebrow">Construction ERP Service Health</p>
          <h1>{page.title || 'Xpedeon Status'}</h1>
          <p className="lede">{page.description || 'Live service availability for Xpedeon products and supporting systems.'}</p>
        </div>
        <aside className={`overall overall-${overallStatus.tone}`} aria-label="Overall status">
          <span className="overall-icon" aria-hidden="true"><span className="status-dot" /></span>
          <div>
            <span className="overall-label">{overallStatus.label}</span>
            <span className="overall-time">Last checked {formatDateTime(generatedAt)}</span>
          </div>
        </aside>
      </header>

      <MetricStrip services={services} summary={summary} />
      <ServiceBoard services={services} />

      <div className="content-grid">
        <IncidentList incidents={incidents} />
        <MaintenanceList maintenance={maintenance} />
      </div>

      <footer className="footer">
        <span>Need help?</span>
        {safeMailto(page.supportEmail) ? <a href={safeMailto(page.supportEmail)}>{page.supportEmail}</a> : <span>{page.supportEmail || 'Contact support'}</span>}
      </footer>
    </main>
  );
}
