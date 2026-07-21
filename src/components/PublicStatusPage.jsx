import { useEffect, useMemo, useState } from 'react';
import xpedeonLogo from '../assets/xpedeon-logo.svg';
import {
  buildServiceTimeline,
  DEFAULT_HISTORY_DAYS,
  formatDateOnly,
  formatDateTime,
  getActiveIncidents,
  getAffectedServiceNames,
  getEffectiveServices,
  getResolvedIncidents,
  getVisibleMaintenance,
  getWorstServiceStatus,
  RISK_LEVEL_META,
  SERVICE_STATUSES,
  STATUS_META
} from '../status.js';

function safeMailto(email) {
  return typeof email === 'string' && email.includes('@') ? `mailto:${email}` : undefined;
}

function Nav({ supportEmail, onRefresh, refreshing }) {
  const supportHref = safeMailto(supportEmail);

  return (
    <nav className="top-nav" aria-label="Primary navigation">
      <a className="brand-link" href="/" aria-label="Xpedeon status home">
        <img className="brand-logo" src={xpedeonLogo} alt="" aria-hidden="true" />
        <span>Status</span>
      </a>
      <div>
        <a href="#services">Current status</a>
        <a href="#maintenance">Maintenance</a>
        <a href="#active-incidents">Incidents</a>
        <a href="/admin">Admin</a>
        {supportHref ? <a href={supportHref}>Support</a> : null}
        {onRefresh ? (
          <button className="nav-button refresh-button" type="button" onClick={onRefresh} disabled={refreshing}>
            <span aria-hidden="true">↻</span>
            {refreshing ? 'Refreshing' : 'Refresh'}
          </button>
        ) : null}
      </div>
    </nav>
  );
}

function AffectedServices({ event, services }) {
  const names = getAffectedServiceNames(event, services);
  return (
    <div className="affected-services" aria-label="Affected services">
      {names.map((name) => <span key={name}>{name}</span>)}
    </div>
  );
}

function IncidentBanner({ incidents, services }) {
  if (!incidents.length) {
    return null;
  }

  const worstRisk = incidents.reduce((worst, incident) => {
    const current = RISK_LEVEL_META[incident.riskLevel] ?? RISK_LEVEL_META.minor;
    return current.rank > worst.rank ? current : worst;
  }, RISK_LEVEL_META.minor);

  const mostRecent = incidents[0];
  const heading = worstRisk.rank >= 3
    ? 'Critical issue active'
    : worstRisk.rank === 2
      ? 'Major issue active'
      : 'Active issue';

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
        {incidents.map((incident) => {
          const riskMeta = RISK_LEVEL_META[incident.riskLevel] ?? RISK_LEVEL_META.minor;
          return (
            <article className="incident-item" key={incident.id}>
              <div className="incident-item-header">
                <div>
                  <h3 className="incident-item-title">{incident.title}</h3>
                  <p className="incident-state">{incident.status}</p>
                </div>
                <span className={`incident-badge incident-badge-${riskMeta.tone}`}>{riskMeta.label}</span>
              </div>
              <p className="incident-item-message">{incident.message}</p>
              {incident.impact ? <p className="incident-item-impact"><strong>Impact:</strong> {incident.impact}</p> : null}
              <AffectedServices event={incident} services={services} />
              <EventUpdateLog updates={incident.updates} type="incident" />
            </article>
          );
        })}
      </div>
    </section>
  );
}

function StatusPill({ status, compact = false }) {
  const meta = STATUS_META[status] ?? STATUS_META.outage;
  return (
    <span className={`pill pill-${meta.tone}${compact ? ' pill-compact' : ''}`}>
      <span className="status-dot" aria-hidden="true" />
      {meta.label}
    </span>
  );
}

function UpdateRiskBadge({ riskLevel }) {
  const risk = RISK_LEVEL_META[riskLevel] ?? RISK_LEVEL_META.minor;
  return <span className={`update-risk-badge update-risk-badge-${risk.tone}`}>{risk.label} risk</span>;
}

function EventUpdateLog({ updates, type = 'event' }) {
  // Updates are normalized oldest-first, so reversing avoids reparsing every
  // timestamp during each render.
  const items = Array.isArray(updates) ? updates.slice().reverse() : [];
  if (!items.length) return null;

  return (
    <section className="event-update-log" aria-label={`${type} updates`}>
      <h4>Updates</h4>
      <ol>
        {items.map((update) => (
          <li key={update.id}>
            <div className="event-update-meta">
              <div className="event-update-labels">
                {update.status ? <strong>{update.status}</strong> : <strong>Progress update</strong>}
                {type === 'incident' && update.riskLevel ? <UpdateRiskBadge riskLevel={update.riskLevel} /> : null}
              </div>
              <time dateTime={update.createdAt}>{formatDateTime(update.createdAt)}</time>
            </div>
            <p>{update.message}</p>
          </li>
        ))}
      </ol>
    </section>
  );
}

function HistorySource({ source }) {
  if (source.kind === 'incident') {
    const risk = RISK_LEVEL_META[source.riskLevel] ?? RISK_LEVEL_META.minor;
    return (
      <article className="history-source history-source-incident">
        <div className="history-source-heading">
          <div>
            <span className="history-source-type">Incident · {risk.label}</span>
            <h5>{source.title}</h5>
          </div>
          <StatusPill status={source.status} compact />
        </div>
        <p>{source.message}</p>
        <dl>
          <div><dt>State</dt><dd>{source.incidentStatus}</dd></div>
          <div><dt>Started</dt><dd>{formatDateTime(source.startedAt)}</dd></div>
          {source.endedAt ? <div><dt>Resolved</dt><dd>{formatDateTime(source.endedAt)}</dd></div> : null}
        </dl>
        <EventUpdateLog updates={source.updates} type="incident" />
      </article>
    );
  }

  if (source.kind === 'maintenance') {
    return (
      <article className="history-source history-source-maintenance">
        <div className="history-source-heading">
          <div>
            <span className="history-source-type">Maintenance window</span>
            <h5>{source.title}</h5>
          </div>
          <StatusPill status="maintenance" compact />
        </div>
        <p>{source.message}</p>
        <dl>
          <div><dt>Starts</dt><dd>{formatDateTime(source.startedAt)}</dd></div>
          <div><dt>Ends</dt><dd>{formatDateTime(source.endedAt)}</dd></div>
        </dl>
        <EventUpdateLog updates={source.updates} type="maintenance" />
      </article>
    );
  }

  return (
    <article className="history-source history-source-manual">
      <div className="history-source-heading">
        <div>
          <span className="history-source-type">{source.kind === 'current' ? 'Current setting' : 'Manual history'}</span>
          <h5>{source.title}</h5>
        </div>
        <StatusPill status={source.status} compact />
      </div>
      <p>{source.message}</p>
    </article>
  );
}

function ExpandableStatusHistory({ service, incidents, maintenance, referenceTime }) {
  const historyDays = Number.isInteger(service.historyDays) ? service.historyDays : DEFAULT_HISTORY_DAYS;
  const timeline = useMemo(
    () => buildServiceTimeline({
      ...service,
      status: service.configuredStatus ?? service.status
    }, incidents, maintenance, historyDays, referenceTime),
    [service, incidents, maintenance, historyDays, referenceTime]
  );
  const today = timeline[timeline.length - 1];
  const [selectedDate, setSelectedDate] = useState(today?.date ?? '');
  const [isOpen, setIsOpen] = useState(false);
  const selected = timeline.find((entry) => entry.date === selectedDate) ?? today;
  const detailId = `history-detail-${service.id}`;
  const eventDayCount = timeline.filter((entry) => entry.isAutomatic).length;

  useEffect(() => {
    if (today?.date && !timeline.some((entry) => entry.date === selectedDate)) {
      setSelectedDate(today.date);
    }
  }, [selectedDate, timeline, today?.date]);

  return (
    <div
      className={`service-history-shell${isOpen ? ' is-expanded' : ''}`}
      style={{ '--history-columns': Math.min(historyDays, 30), '--history-mobile-columns': Math.min(historyDays, 15) }}
    >
      <div className="history-track-heading">
        <button
          className="history-toggle-button"
          type="button"
          aria-expanded={isOpen}
          aria-controls={detailId}
          onClick={() => setIsOpen((current) => !current)}
        >
          <span className="history-toggle-icon" aria-hidden="true">
            <i /><i /><i /><i /><i />
          </span>
          <span className="history-toggle-copy">
            <strong>{historyDays}-day uptime</strong>
            <small>{eventDayCount ? `${eventDayCount} affected day${eventDayCount === 1 ? '' : 's'}` : 'No reported events'}</small>
          </span>
          <span className="history-toggle-action">{isOpen ? 'Close details' : 'View details'}</span>
        </button>
      </div>

      <div className="uptime-track" aria-label={`Recent status history for ${service.name}`}>
        {timeline.map((entry) => (
          <button
            type="button"
            className={`uptime-segment uptime-${entry.tone}${entry.isAutomatic ? ' has-event' : ''}${entry.isToday ? ' is-today' : ''}${selected?.date === entry.date && isOpen ? ' is-selected' : ''}`}
            key={entry.date}
            title={`${entry.date}: ${entry.label}${entry.isAutomatic ? ' · automatic report detected' : ''}`}
            aria-label={`${formatDateOnly(entry.date)}: ${entry.label}`}
            aria-pressed={selected?.date === entry.date && isOpen}
            aria-current={entry.isToday ? 'date' : undefined}
            aria-controls={detailId}
            aria-expanded={selected?.date === entry.date && isOpen}
            onClick={() => {
              setSelectedDate(entry.date);
              setIsOpen(true);
            }}
          >
            <span className="uptime-day">{entry.date.slice(8)}</span>
            {entry.isAutomatic ? <span className="uptime-event-marker" aria-hidden="true" /> : null}
          </button>
        ))}
      </div>

      {isOpen && selected ? (
            <section id={detailId} className="history-detail" aria-live="polite" aria-label={`History details for ${service.name} on ${selected.date}`}>
              <div className="history-detail-heading">
                <div>
                  <span className="history-detail-kicker">{selected.isToday ? 'Today' : 'History detail'}</span>
                  <h4>{formatDateOnly(selected.date)}</h4>
                </div>
                <div className="history-detail-actions">
                  {selected.isAutomatic ? <span className="automatic-badge">Auto-detected</span> : null}
                  <StatusPill status={selected.status} compact />
                </div>
              </div>
              {selected.sources.length ? (
                <div className="history-source-list">
                  {selected.sources.map((source, index) => (
                    <HistorySource source={source} key={`${source.kind}-${source.id || source.title}-${index}`} />
                  ))}
                </div>
              ) : (
                <div className="history-baseline">
                  <span className="status-dot" aria-hidden="true" />
                  <div>
                    <strong>No incident or maintenance recorded</strong>
                    <p>This date uses the normal operational baseline.</p>
                  </div>
                </div>
              )}
            </section>
      ) : null}
    </div>
  );
}

function ServiceRow({ service, incidents, maintenance, referenceTime }) {
  const meta = STATUS_META[service.status] ?? STATUS_META.outage;
  const isAutomaticallyChanged = service.configuredStatus && service.configuredStatus !== service.status;
  const showHistory = service.showHistory !== false;

  return (
    <article className={`service-row service-row-${meta.tone}${showHistory ? '' : ' service-row-without-history'}`}>
      <div className="service-copy">
        <h3>{service.name}</h3>
        <p>{service.description}</p>
        {isAutomaticallyChanged ? <span className="auto-status-note">Automatically adjusted by an active report</span> : null}
      </div>
      {showHistory ? (
        <ExpandableStatusHistory
          service={service}
          incidents={incidents}
          maintenance={maintenance}
          referenceTime={referenceTime}
        />
      ) : null}
      <StatusPill status={service.status} />
    </article>
  );
}

function ServiceBoard({ services, incidents, maintenance, referenceTime }) {
  const visibleHistoryCount = services.filter((service) => service.showHistory !== false).length;
  return (
    <section className="status-board" id="services" aria-labelledby="service-board-title">
      <div className="board-heading">
        <div>
          <h2 id="service-board-title">Services</h2>
          <p>
            {visibleHistoryCount
              ? 'Daily uptime is shown for each service. Select any day to inspect its incident and maintenance details.'
              : 'Current availability is shown for each configured service.'}
          </p>
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
        {services.length ? services.map((service) => (
          <ServiceRow
            service={service}
            incidents={incidents}
            maintenance={maintenance}
            referenceTime={referenceTime}
            key={service.id}
          />
        )) : <p className="empty board-empty">No services configured.</p>}
      </div>
    </section>
  );
}

function IncidentList({ incidents, services }) {
  return (
    <section className="panel" id="active-incidents" aria-labelledby="active-incidents-title">
      <div className="section-heading">
        <h2 id="active-incidents-title">Active Incidents</h2>
        <span>{incidents.length}</span>
      </div>
      {incidents.length ? (
        <div className="stack">
          {incidents.map((incident) => {
            const risk = RISK_LEVEL_META[incident.riskLevel] ?? RISK_LEVEL_META.minor;
            return (
              <article className="timeline-item" key={incident.id}>
                <div className="timeline-item-heading">
                  <div>
                    <h3>{incident.title}</h3>
                    <p>{incident.message}</p>
                  </div>
                  <span className={`incident-badge incident-badge-${risk.tone}`}>{risk.label}</span>
                </div>
                <AffectedServices event={incident} services={services} />
                <dl>
                  <div><dt>Status</dt><dd>{incident.status}</dd></div>
                  <div><dt>Impact</dt><dd>{incident.impact || 'Not specified'}</dd></div>
                  <div><dt>Started</dt><dd>{formatDateTime(incident.startedAt)}</dd></div>
                  <div><dt>Updated</dt><dd>{formatDateTime(incident.updatedAt)}</dd></div>
                </dl>
                <EventUpdateLog updates={incident.updates} type="incident" />
              </article>
            );
          })}
        </div>
      ) : (
        <p className="empty empty-positive"><span className="status-dot" aria-hidden="true" /> No active incidents.</p>
      )}
    </section>
  );
}

function ResolvedIncidentList({ incidents, services }) {
  if (!incidents.length) {
    return null;
  }

  return (
    <section className="panel resolved-incidents-panel" aria-labelledby="resolved-incidents-title">
      <div className="section-heading">
        <div>
          <h2 id="resolved-incidents-title">Recently Resolved</h2>
          <p>Incidents resolved during the last 30 days.</p>
        </div>
        <span>{incidents.length}</span>
      </div>
      <div className="stack">
        {incidents.map((incident) => (
          <article className="timeline-item timeline-item-resolved" key={incident.id}>
            <div className="timeline-item-heading">
              <div>
                <h3>{incident.title}</h3>
                <p>{incident.message}</p>
              </div>
              <span className="resolved-incident-badge">Resolved</span>
            </div>
            <AffectedServices event={incident} services={services} />
            <dl>
              <div><dt>Impact</dt><dd>{incident.impact || 'Not specified'}</dd></div>
              <div><dt>Started</dt><dd>{formatDateTime(incident.startedAt)}</dd></div>
              <div><dt>Resolved</dt><dd>{formatDateTime(incident.resolvedAt || incident.updatedAt)}</dd></div>
            </dl>
            <EventUpdateLog updates={incident.updates} type="incident" />
          </article>
        ))}
      </div>
    </section>
  );
}

function MaintenanceList({ maintenance, services, referenceTime }) {
  return (
    <section className="panel" id="maintenance" aria-labelledby="scheduled-maintenance-title">
      <div className="section-heading">
        <div>
          <h2 id="scheduled-maintenance-title">Maintenance</h2>
          <p>Scheduled, active and recently completed work.</p>
        </div>
        <span>{maintenance.length}</span>
      </div>
      {maintenance.length ? (
        <div className="stack">
          {maintenance.map((item) => {
            const active = new Date(item.scheduledFor) <= referenceTime && referenceTime < new Date(item.endsAt);
            const completed = new Date(item.endsAt) < referenceTime;
            return (
              <article className={`timeline-item${completed ? ' timeline-item-completed' : ''}`} key={item.id}>
                <div className="timeline-item-heading">
                  <div>
                    <h3>{item.title}</h3>
                    <p>{item.message}</p>
                  </div>
                  <span className={active ? 'active-maintenance-badge' : completed ? 'completed-maintenance-badge' : 'scheduled-maintenance-badge'}>
                    {active ? 'In progress' : completed ? 'Completed' : 'Scheduled'}
                  </span>
                </div>
                <AffectedServices event={item} services={services} />
                <dl>
                  <div><dt>Starts</dt><dd>{formatDateTime(item.scheduledFor)}</dd></div>
                  <div><dt>Ends</dt><dd>{formatDateTime(item.endsAt)}</dd></div>
                  <div><dt>Duration</dt><dd>{item.duration}</dd></div>
                </dl>
                <EventUpdateLog updates={item.updates} type="maintenance" />
              </article>
            );
          })}
        </div>
      ) : (
        <p className="empty">No maintenance scheduled.</p>
      )}
    </section>
  );
}

export function PublicStatusPage({ statusData, onRefresh, refreshing = false, refreshError = '' }) {
  const { page = {}, services = [], incidents = [], maintenance = [], generatedAt } = statusData;
  const supportHref = safeMailto(page.supportEmail);
  const referenceTime = useMemo(() => {
    const generatedDate = new Date(generatedAt);
    return Number.isNaN(generatedDate.getTime()) ? new Date() : generatedDate;
  }, [generatedAt]);
  const activeIncidents = useMemo(() => getActiveIncidents(incidents, referenceTime), [incidents, referenceTime]);
  const resolvedIncidents = useMemo(
    () => getResolvedIncidents(incidents, referenceTime, 30),
    [incidents, referenceTime]
  );
  const visibleMaintenance = useMemo(() => getVisibleMaintenance(maintenance, referenceTime), [maintenance, referenceTime]);
  const effectiveServices = useMemo(
    () => getEffectiveServices(services, incidents, maintenance, referenceTime),
    [services, incidents, maintenance, referenceTime]
  );
  const overallStatus = effectiveServices.length ? getWorstServiceStatus(effectiveServices) : STATUS_META.operational;

  return (
    <main className="page">
      <Nav supportEmail={page.supportEmail} onRefresh={onRefresh} refreshing={refreshing} />
      {refreshError ? <div className="refresh-warning" role="status">The latest refresh failed. Showing the most recently loaded status.</div> : null}
      <IncidentBanner incidents={activeIncidents} services={services} />

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

      <ServiceBoard
        services={effectiveServices}
        incidents={incidents}
        maintenance={maintenance}
        referenceTime={referenceTime}
      />

      <div className="content-grid">
        <IncidentList incidents={activeIncidents} services={services} />
        <MaintenanceList maintenance={visibleMaintenance} services={services} referenceTime={referenceTime} />
      </div>
      <ResolvedIncidentList incidents={resolvedIncidents} services={services} />

      <footer className="footer">
        <span>Need help?</span>
        {supportHref
          ? <a href={supportHref}>{page.supportEmail}</a>
          : <span>{page.supportEmail || 'Contact support'}</span>}
      </footer>
    </main>
  );
}
