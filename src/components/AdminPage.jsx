import { useEffect, useMemo, useState } from 'react';
import { fetchStatus, loginAdmin, saveStatus } from '../api.js';
import {
  buildServiceTimeline,
  createEmptyIncident,
  createEmptyMaintenance,
  createEmptyService,
  formatDuration,
  fromDateTimeInputValue,
  getIncidentDerivedStatus,
  normalizeStatusConfig,
  RISK_LEVEL_META,
  RISK_LEVELS,
  SERVICE_STATUSES,
  STATUS_META,
  toDateTimeInputValue,
  validateStatusConfig
} from '../status.js';
import { Notice } from './Notice.jsx';

function removeGeneratedFields(config) {
  const { generatedAt: _generatedAt, ...editableConfig } = normalizeStatusConfig(config);
  return editableConfig;
}

function Field({ label, hint, children, className = '' }) {
  return (
    <label className={`field${className ? ` ${className}` : ''}`}>
      <span>{label}</span>
      {children}
      {hint ? <small>{hint}</small> : null}
    </label>
  );
}

function TextInput({ label, value, onChange, hint, required = true, placeholder, type = 'text' }) {
  return (
    <Field label={label} hint={hint}>
      <input
        required={required}
        type={type}
        value={value ?? ''}
        placeholder={placeholder}
        onChange={(event) => onChange(event.target.value)}
      />
    </Field>
  );
}

function TextArea({ label, value, onChange, hint, required = true, rows = 4, placeholder }) {
  return (
    <Field label={label} hint={hint}>
      <textarea
        required={required}
        rows={rows}
        value={value ?? ''}
        placeholder={placeholder}
        onChange={(event) => onChange(event.target.value)}
      />
    </Field>
  );
}

function DateTimeInput({ label, value, onChange, hint, required = true }) {
  return (
    <Field label={label} hint={hint}>
      <input
        required={required}
        type="datetime-local"
        value={toDateTimeInputValue(value)}
        onChange={(event) => onChange(fromDateTimeInputValue(event.target.value))}
      />
    </Field>
  );
}

function ReadOnlyField({ label, value, hint }) {
  return (
    <Field label={label} hint={hint}>
      <output className="readonly-output">{value}</output>
    </Field>
  );
}

function StatusSelect({ label = 'Configured status', value, onChange, hint }) {
  return (
    <Field label={label} hint={hint}>
      <select value={value} onChange={(event) => onChange(event.target.value)}>
        {SERVICE_STATUSES.map((status) => (
          <option key={status} value={status}>{STATUS_META[status].label}</option>
        ))}
      </select>
    </Field>
  );
}

function RiskLevelSelect({ value, onChange }) {
  return (
    <Field label="Risk level" hint="The public status is detected automatically from this level.">
      <select value={value} onChange={(event) => onChange(event.target.value)}>
        {RISK_LEVELS.map((riskLevel) => {
          const risk = RISK_LEVEL_META[riskLevel];
          const derived = STATUS_META[risk.derivedStatus];
          return <option key={riskLevel} value={riskLevel}>{risk.label} → {derived.label}</option>;
        })}
      </select>
    </Field>
  );
}

function AffectedServicesField({ services, affectsAllServices, affectedServiceIds, onChange }) {
  const selectedIds = Array.isArray(affectedServiceIds) ? affectedServiceIds : [];

  function toggleAll(checked) {
    if (checked) {
      onChange({ affectsAllServices: true, affectedServiceIds: [] });
      return;
    }
    onChange({
      affectsAllServices: false,
      affectedServiceIds: services[0] ? [services[0].id] : []
    });
  }

  function toggleService(serviceId, checked) {
    const nextIds = checked
      ? [...new Set([...selectedIds, serviceId])]
      : selectedIds.filter((id) => id !== serviceId);
    onChange({ affectsAllServices: false, affectedServiceIds: nextIds });
  }

  return (
    <fieldset className="service-scope-field">
      <legend>Affected services</legend>
      <p>Selecting services makes the related date bars update automatically.</p>
      <div className="scope-options">
        <label className="check-option check-option-all">
          <input
            type="checkbox"
            checked={affectsAllServices !== false}
            onChange={(event) => toggleAll(event.target.checked)}
          />
          <span>All services</span>
        </label>
        {services.map((service) => (
          <label className="check-option" key={service.id}>
            <input
              type="checkbox"
              checked={affectsAllServices === false && selectedIds.includes(service.id)}
              disabled={affectsAllServices !== false}
              onChange={(event) => toggleService(service.id, event.target.checked)}
            />
            <span>{service.name || 'Unnamed service'}</span>
          </label>
        ))}
      </div>
      {affectsAllServices === false && !selectedIds.length ? (
        <small className="scope-warning">No service is selected, so this report will not alter a status bar.</small>
      ) : null}
    </fieldset>
  );
}

function HistoryCalendar({ service, incidents, maintenance, onChange }) {
  const timeline = useMemo(
    () => buildServiceTimeline(service, incidents, maintenance, 30),
    [service, incidents, maintenance]
  );
  const history = service.history || {};

  function updateDate(date, status) {
    onChange({ ...history, [date]: status });
  }

  function clearDate(date) {
    const nextHistory = { ...history };
    delete nextHistory[date];
    onChange(nextHistory);
  }

  return (
    <div className="history-editor" aria-label={`Recent service history for ${service.name || 'service'}`}>
      <div className="history-editor-toolbar">
        <div>
          <span>Last 30 days</span>
          <small>Incident and maintenance reports are overlaid automatically; the most severe state wins.</small>
        </div>
        <span className="automatic-key"><i aria-hidden="true" /> Auto-detected</span>
      </div>
      <div className="history-day-grid">
        {timeline.map((entry) => {
          const explicitStatus = history?.[entry.date];
          const sourceTitles = entry.sources
            .filter((source) => source.kind === 'incident' || source.kind === 'maintenance')
            .map((source) => source.title)
            .join(', ');

          return (
            <div className="history-day" key={entry.date}>
              <button
                type="button"
                className={`history-day-button history-day-${entry.tone}${explicitStatus ? ' history-day-explicit' : ''}${entry.isAutomatic ? ' history-day-automatic' : ''}`}
                title={`${entry.date}: ${entry.label}${sourceTitles ? ` · ${sourceTitles}` : ''}. Click to cycle the manual setting.`}
                onClick={() => {
                  const currentManualStatus = explicitStatus || 'operational';
                  const currentIndex = SERVICE_STATUSES.indexOf(currentManualStatus);
                  const nextStatus = SERVICE_STATUSES[(currentIndex + 1) % SERVICE_STATUSES.length];
                  updateDate(entry.date, nextStatus);
                }}
              >
                <span>{entry.date.slice(8)}</span>
                {entry.isAutomatic ? <i className="history-auto-marker" aria-hidden="true" /> : null}
              </button>
              {explicitStatus ? (
                <button
                  className="history-clear-button"
                  type="button"
                  onClick={() => clearDate(entry.date)}
                  aria-label={`Clear manual history for ${entry.date}`}
                >
                  ×
                </button>
              ) : null}
            </div>
          );
        })}
      </div>
      <div className="history-legend">
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
  );
}

function EditorSection({ title, description, actionLabel, onAdd, children }) {
  return (
    <section className="admin-section">
      <div className="admin-section-heading">
        <div>
          <h2>{title}</h2>
          {description ? <p>{description}</p> : null}
        </div>
        <button className="secondary-button" type="button" onClick={onAdd}>{actionLabel}</button>
      </div>
      <div className="editor-stack">{children}</div>
    </section>
  );
}

function EmptyEditor({ children }) {
  return <p className="empty editor-empty">{children}</p>;
}

function CardStatus({ status, label }) {
  const meta = STATUS_META[status] ?? STATUS_META.operational;
  return <span className={`card-status card-status-${meta.tone}`}>{label || meta.label}</span>;
}

export function AdminPage() {
  const [authenticated, setAuthenticated] = useState(false);
  const [password, setPassword] = useState('');
  const [config, setConfig] = useState(null);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [loggingIn, setLoggingIn] = useState(false);
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    if (!authenticated) {
      return undefined;
    }

    const controller = new AbortController();
    setLoading(true);
    setError('');

    fetchStatus({ signal: controller.signal })
      .then((data) => {
        setConfig(removeGeneratedFields(data));
        setDirty(false);
      })
      .catch((fetchError) => {
        if (fetchError.name !== 'AbortError') {
          setError(fetchError.message || 'Unable to load the status configuration.');
        }
      })
      .finally(() => setLoading(false));

    return () => controller.abort();
  }, [authenticated]);

  useEffect(() => {
    if (!dirty) {
      return undefined;
    }

    function warnBeforeUnload(event) {
      event.preventDefault();
      event.returnValue = '';
    }

    window.addEventListener('beforeunload', warnBeforeUnload);
    return () => window.removeEventListener('beforeunload', warnBeforeUnload);
  }, [dirty]);

  function changeConfig(updater) {
    setConfig(updater);
    setDirty(true);
    setMessage('');
  }

  function updatePage(field, value) {
    changeConfig((current) => ({
      ...current,
      page: { ...current.page, [field]: value }
    }));
  }

  function updateListItem(listName, index, field, value) {
    changeConfig((current) => ({
      ...current,
      [listName]: current[listName].map((item, itemIndex) => (
        itemIndex === index ? { ...item, [field]: value } : item
      ))
    }));
  }

  function updateEventScope(listName, index, scope) {
    changeConfig((current) => ({
      ...current,
      [listName]: current[listName].map((item, itemIndex) => (
        itemIndex === index ? { ...item, ...scope } : item
      ))
    }));
  }

  function updateMaintenanceTime(index, field, value) {
    changeConfig((current) => ({
      ...current,
      maintenance: current.maintenance.map((item, itemIndex) => {
        if (itemIndex !== index) {
          return item;
        }

        if (field === 'scheduledFor') {
          const previousStart = new Date(item.scheduledFor);
          const previousEnd = new Date(item.endsAt);
          const nextStart = new Date(value);
          const previousDuration = Number.isNaN(previousStart.getTime()) || Number.isNaN(previousEnd.getTime())
            ? 30 * 60 * 1000
            : Math.max(60 * 1000, previousEnd - previousStart);
          const endsAt = Number.isNaN(nextStart.getTime())
            ? item.endsAt
            : new Date(nextStart.getTime() + previousDuration).toISOString();
          return { ...item, scheduledFor: value, endsAt, duration: formatDuration(value, endsAt) };
        }

        return { ...item, endsAt: value, duration: formatDuration(item.scheduledFor, value) };
      })
    }));
  }

  function addListItem(listName, factory) {
    changeConfig((current) => ({
      ...current,
      [listName]: [...current[listName], factory()]
    }));
  }

  function removeListItem(listName, index) {
    const item = config?.[listName]?.[index];
    const typeLabel = listName === 'incidents' ? 'incident report' : 'maintenance report';
    const itemLabel = item?.title ? ` “${item.title}”` : '';
    if (!window.confirm(`Delete this ${typeLabel}${itemLabel}? Its automatically detected history details will also be removed.`)) {
      return;
    }

    changeConfig((current) => ({
      ...current,
      [listName]: current[listName].filter((_item, itemIndex) => itemIndex !== index)
    }));
  }

  function removeService(index) {
    const serviceName = config?.services?.[index]?.name || `Service ${index + 1}`;
    if (!window.confirm(`Remove “${serviceName}”? It will also be removed from every incident and maintenance scope.`)) {
      return;
    }

    changeConfig((current) => {
      const serviceId = current.services[index]?.id;
      const withoutService = (items) => items.map((item) => ({
        ...item,
        affectedServiceIds: (item.affectedServiceIds || []).filter((id) => id !== serviceId)
      }));

      return {
        ...current,
        services: current.services.filter((_service, serviceIndex) => serviceIndex !== index),
        incidents: withoutService(current.incidents),
        maintenance: withoutService(current.maintenance)
      };
    });
  }

  function markIncidentResolved(index) {
    const now = new Date().toISOString();
    changeConfig((current) => ({
      ...current,
      incidents: current.incidents.map((incident, incidentIndex) => (
        incidentIndex === index
          ? { ...incident, status: 'Resolved', updatedAt: now, resolvedAt: now }
          : incident
      ))
    }));
  }

  function reopenIncident(index) {
    changeConfig((current) => ({
      ...current,
      // Keep the resolved report intact so its original dates remain in
      // history. A follow-up gets a fresh start time and a new stable ID.
      incidents: [
        ...current.incidents,
        {
          ...createEmptyIncident(),
          title: current.incidents[index].title,
          impact: current.incidents[index].impact,
          riskLevel: current.incidents[index].riskLevel,
          affectsAllServices: current.incidents[index].affectsAllServices,
          affectedServiceIds: [...current.incidents[index].affectedServiceIds],
          message: current.incidents[index].message
        }
      ]
    }));
  }

  async function handleLogin(event) {
    event.preventDefault();
    setLoggingIn(true);
    setError('');
    setMessage('');

    try {
      await loginAdmin(password);
      setAuthenticated(true);
      setMessage('Signed in. You can now edit the status page.');
    } catch (loginError) {
      setAuthenticated(false);
      setPassword('');
      setError(loginError.message || 'Login failed.');
    } finally {
      setLoggingIn(false);
    }
  }

  async function handleSave(event) {
    event.preventDefault();
    setSaving(true);
    setError('');
    setMessage('');

    try {
      const normalizedConfig = validateStatusConfig(config);
      const savedConfig = await saveStatus(normalizedConfig, password);
      setConfig(removeGeneratedFields(savedConfig));
      setDirty(false);
      setMessage('Status page updated successfully. Automatic history has been recalculated.');
    } catch (saveError) {
      setError(saveError.message || 'Unable to save changes.');
    } finally {
      setSaving(false);
    }
  }

  function handleSignOut() {
    if (dirty && !window.confirm('You have unsaved changes. Sign out and discard them?')) {
      return;
    }
    setAuthenticated(false);
    setPassword('');
    setConfig(null);
    setError('');
    setMessage('Signed out.');
    setDirty(false);
  }

  if (!authenticated) {
    return (
      <main className="page page-centered">
        <section className="login-card">
          <p className="eyebrow">Status Administration</p>
          <h1>Sign in to update Xpedeon Status</h1>
          <p>Enter the administrator password configured on the server.</p>
          <form className="login-form" onSubmit={handleLogin}>
            <Field label="Admin password">
              <input
                autoFocus
                required
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
              />
            </Field>
            {error ? <Notice tone="error">{error}</Notice> : null}
            {message ? <Notice tone="success">{message}</Notice> : null}
            <button className="primary-button" type="submit" disabled={loggingIn}>
              {loggingIn ? 'Signing in...' : 'Sign in'}
            </button>
          </form>
          <a className="back-link" href="/">Return to public status page</a>
        </section>
      </main>
    );
  }

  return (
    <main className="page admin-page">
      <nav className="top-nav" aria-label="Primary navigation">
        <a className="brand-link" href="/" aria-label="Xpedeon status home">
          <span className="brand-mark" aria-hidden="true" />
          <span>Xpedeon</span>
        </a>
        <div>
          <a href="/">Status</a>
          <button className="nav-button" type="button" onClick={handleSignOut}>Sign out</button>
        </div>
      </nav>

      <header className="admin-header">
        <div>
          <p className="eyebrow">Administration</p>
          <h1>Status page editor</h1>
          <p>Reports now drive service history automatically. Select the affected services and the system applies the appropriate status level.</p>
        </div>
        <div className="admin-actions">
          {dirty ? <span className="unsaved-badge">Unsaved changes</span> : <span className="saved-badge">Up to date</span>}
          <a className="secondary-button button-link" href="/" target="_blank" rel="noreferrer">Preview</a>
          <button className="primary-button" type="submit" form="status-editor" disabled={saving || loading || !config || !dirty}>
            {saving ? 'Saving...' : 'Save changes'}
          </button>
        </div>
      </header>

      {error ? <Notice tone="error">{error}</Notice> : null}
      {message ? <Notice tone="success">{message}</Notice> : null}
      {loading ? <Notice>Loading the current status configuration...</Notice> : null}

      {config ? (
        <form id="status-editor" className="admin-form" onSubmit={handleSave}>
          <section className="admin-section">
            <div className="admin-section-heading">
              <div>
                <h2>Page details</h2>
                <p>These values appear at the top and bottom of the public page.</p>
              </div>
            </div>
            <div className="form-grid">
              <TextInput label="Page title" value={config.page.title} onChange={(value) => updatePage('title', value)} />
              <TextInput label="Support email" type="email" value={config.page.supportEmail} onChange={(value) => updatePage('supportEmail', value)} />
              <TextArea label="Page description" value={config.page.description} onChange={(value) => updatePage('description', value)} rows={3} />
            </div>
          </section>

          <EditorSection
            title="Services"
            description="The configured status is the manual baseline. Active incident and maintenance reports can automatically raise it."
            actionLabel="Add service"
            onAdd={() => addListItem('services', createEmptyService)}
          >
            {config.services.length ? config.services.map((service, index) => (
              <article className="editor-card" key={service.id}>
                <div className="editor-card-heading">
                  <div className="editor-title-row">
                    <h3>{service.name || `Service ${index + 1}`}</h3>
                    <CardStatus status={service.status} />
                  </div>
                  <button className="danger-button" type="button" onClick={() => removeService(index)}>Remove</button>
                </div>
                <div className="form-grid">
                  <TextInput label="Service name" value={service.name} onChange={(value) => updateListItem('services', index, 'name', value)} />
                  <StatusSelect
                    value={service.status}
                    onChange={(value) => updateListItem('services', index, 'status', value)}
                    hint="Use this for a manual baseline; reports are applied automatically on top."
                  />
                  <TextArea label="Description" value={service.description} onChange={(value) => updateListItem('services', index, 'description', value)} rows={3} />
                </div>
                <HistoryCalendar
                  service={service}
                  incidents={config.incidents}
                  maintenance={config.maintenance}
                  onChange={(value) => updateListItem('services', index, 'history', value)}
                />
              </article>
            )) : <EmptyEditor>No services configured yet.</EmptyEditor>}
          </EditorSection>

          <EditorSection
            title="Incident reports"
            description="Keep resolved reports so their dates remain visible in history. Use Risk level and Affected services to drive automatic status detection."
            actionLabel="Add incident"
            onAdd={() => addListItem('incidents', createEmptyIncident)}
          >
            {config.incidents.length ? config.incidents.map((incident, index) => {
              const derivedStatus = getIncidentDerivedStatus(incident.riskLevel);
              const resolved = Boolean(incident.resolvedAt);
              return (
                <article className={`editor-card${resolved ? ' editor-card-resolved' : ''}`} key={incident.id}>
                  <div className="editor-card-heading">
                    <div className="editor-title-row">
                      <h3>{incident.title || `Incident ${index + 1}`}</h3>
                      <CardStatus status={resolved ? 'operational' : derivedStatus} label={resolved ? 'Resolved' : `Auto: ${STATUS_META[derivedStatus].label}`} />
                    </div>
                    <div className="card-actions">
                      {resolved ? (
                        <button className="secondary-button" type="button" onClick={() => reopenIncident(index)}>Create follow-up</button>
                      ) : (
                        <button className="secondary-button" type="button" onClick={() => markIncidentResolved(index)}>Mark resolved</button>
                      )}
                      <button className="danger-button" type="button" onClick={() => removeListItem('incidents', index)}>Delete</button>
                    </div>
                  </div>
                  <div className="form-grid">
                    <TextInput label="Incident title" value={incident.title} onChange={(value) => updateListItem('incidents', index, 'title', value)} />
                    <TextInput label="Current report status" value={incident.status} onChange={(value) => updateListItem('incidents', index, 'status', value)} placeholder="Investigating / Monitoring / Identified / Resolved" />
                    <RiskLevelSelect value={incident.riskLevel} onChange={(value) => updateListItem('incidents', index, 'riskLevel', value)} />
                    <ReadOnlyField label="Detected service status" value={STATUS_META[derivedStatus].label} hint="Minor → Degraded; Major/Critical → Major Outage." />
                    <DateTimeInput label="Started" value={incident.startedAt} onChange={(value) => updateListItem('incidents', index, 'startedAt', value)} />
                    <DateTimeInput label="Last updated" value={incident.updatedAt} onChange={(value) => updateListItem('incidents', index, 'updatedAt', value)} />
                    <DateTimeInput label="Resolved at" required={false} value={incident.resolvedAt} onChange={(value) => updateListItem('incidents', index, 'resolvedAt', value)} hint="Leave blank while the incident is active." />
                    <TextInput label="Impact" value={incident.impact} required={false} onChange={(value) => updateListItem('incidents', index, 'impact', value)} placeholder="Brief affected area" />
                    <div className="wide-field">
                      <AffectedServicesField
                        services={config.services}
                        affectsAllServices={incident.affectsAllServices}
                        affectedServiceIds={incident.affectedServiceIds}
                        onChange={(scope) => updateEventScope('incidents', index, scope)}
                      />
                    </div>
                    <div className="wide-field">
                      <TextArea label="Customer message" value={incident.message} onChange={(value) => updateListItem('incidents', index, 'message', value)} />
                    </div>
                  </div>
                </article>
              );
            }) : <EmptyEditor>No incident reports.</EmptyEditor>}
          </EditorSection>

          <EditorSection
            title="Maintenance reports"
            description="Maintenance dates are applied automatically to every selected service’s history bar. Past reports can remain for historical detail."
            actionLabel="Add maintenance"
            onAdd={() => addListItem('maintenance', createEmptyMaintenance)}
          >
            {config.maintenance.length ? config.maintenance.map((item, index) => {
              const ended = new Date(item.endsAt) < new Date();
              return (
                <article className={`editor-card${ended ? ' editor-card-resolved' : ''}`} key={item.id}>
                  <div className="editor-card-heading">
                    <div className="editor-title-row">
                      <h3>{item.title || `Maintenance ${index + 1}`}</h3>
                      <CardStatus status={ended ? 'operational' : 'maintenance'} label={ended ? 'Completed' : 'Auto: Maintenance'} />
                    </div>
                    <button className="danger-button" type="button" onClick={() => removeListItem('maintenance', index)}>Delete</button>
                  </div>
                  <div className="form-grid">
                    <TextInput label="Maintenance title" value={item.title} onChange={(value) => updateListItem('maintenance', index, 'title', value)} />
                    <ReadOnlyField label="Detected service status" value={STATUS_META.maintenance.label} />
                    <DateTimeInput label="Scheduled start" value={item.scheduledFor} onChange={(value) => updateMaintenanceTime(index, 'scheduledFor', value)} />
                    <DateTimeInput label="Scheduled end" value={item.endsAt} onChange={(value) => updateMaintenanceTime(index, 'endsAt', value)} />
                    <ReadOnlyField label="Calculated duration" value={formatDuration(item.scheduledFor, item.endsAt)} />
                    <div className="wide-field">
                      <AffectedServicesField
                        services={config.services}
                        affectsAllServices={item.affectsAllServices}
                        affectedServiceIds={item.affectedServiceIds}
                        onChange={(scope) => updateEventScope('maintenance', index, scope)}
                      />
                    </div>
                    <div className="wide-field">
                      <TextArea label="Customer message" value={item.message} onChange={(value) => updateListItem('maintenance', index, 'message', value)} />
                    </div>
                  </div>
                </article>
              );
            }) : <EmptyEditor>No maintenance reports.</EmptyEditor>}
          </EditorSection>
        </form>
      ) : null}
    </main>
  );
}
