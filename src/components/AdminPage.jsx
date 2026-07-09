import { useEffect, useMemo, useState } from 'react';
import { fetchStatus, loginAdmin, saveStatus } from '../api.js';
import {
  createEmptyIncident,
  createEmptyMaintenance,
  createEmptyService,
  fromDateTimeInputValue,
  getRecentDateKeys,
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

function Field({ label, hint, children }) {
  return (
    <label className="field">
      <span>{label}</span>
      {children}
      {hint ? <small>{hint}</small> : null}
    </label>
  );
}

function TextInput({ label, value, onChange, hint, required = true, placeholder }) {
  return (
    <Field label={label} hint={hint}>
      <input
        required={required}
        type="text"
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

function StatusSelect({ label = 'Current status', value, onChange, hint }) {
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
    <Field label="Risk level" hint="Controls how prominently the incident is shown on the public page.">
      <select value={value} onChange={(event) => onChange(event.target.value)}>
        {RISK_LEVELS.map((riskLevel) => (
          <option key={riskLevel} value={riskLevel}>{RISK_LEVEL_META[riskLevel].label}</option>
        ))}
      </select>
    </Field>
  );
}

function HistoryCalendar({ history = {}, currentStatus, onChange }) {
  const dates = useMemo(() => getRecentDateKeys(30), []);

  function updateDate(date, status) {
    onChange({ ...history, [date]: status });
  }

  function clearDate(date) {
    const nextHistory = { ...history };
    delete nextHistory[date];
    onChange(nextHistory);
  }

  return (
    <div className="history-editor" aria-label="Recent service history">
      <div className="history-editor-toolbar">
        <span>Last 30 days</span>
        <small>Blank days inherit the current service status.</small>
      </div>
      <div className="history-day-grid">
        {dates.map((date) => {
          const explicitStatus = history?.[date];
          const status = explicitStatus || currentStatus;
          const meta = STATUS_META[status] ?? STATUS_META.operational;

          return (
            <div className="history-day" key={date}>
              <button
                type="button"
                className={`history-day-button history-day-${meta.tone}${explicitStatus ? ' history-day-explicit' : ''}`}
                title={`${date}: ${meta.label}${explicitStatus ? '' : ' (inherited)'}`}
                onClick={() => {
                  const currentIndex = SERVICE_STATUSES.indexOf(status);
                  const nextStatus = SERVICE_STATUSES[(currentIndex + 1) % SERVICE_STATUSES.length];
                  updateDate(date, nextStatus);
                }}
              >
                <span>{date.slice(8)}</span>
              </button>
              {explicitStatus ? (
                <button className="history-clear-button" type="button" onClick={() => clearDate(date)} aria-label={`Clear ${date}`}>
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

export function AdminPage() {
  const [authenticated, setAuthenticated] = useState(false);
  const [password, setPassword] = useState('');
  const [config, setConfig] = useState(null);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [loggingIn, setLoggingIn] = useState(false);

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
      })
      .catch((fetchError) => {
        if (fetchError.name !== 'AbortError') {
          setError(fetchError.message || 'Unable to load the status configuration.');
        }
      })
      .finally(() => setLoading(false));

    return () => controller.abort();
  }, [authenticated]);

  function updatePage(field, value) {
    setConfig((current) => ({
      ...current,
      page: { ...current.page, [field]: value }
    }));
  }

  function updateListItem(listName, index, field, value) {
    setConfig((current) => ({
      ...current,
      [listName]: current[listName].map((item, itemIndex) => (
        itemIndex === index ? { ...item, [field]: value } : item
      ))
    }));
  }

  function addListItem(listName, factory) {
    setConfig((current) => ({
      ...current,
      [listName]: [...current[listName], factory()]
    }));
  }

  function removeListItem(listName, index) {
    setConfig((current) => ({
      ...current,
      [listName]: current[listName].filter((_item, itemIndex) => itemIndex !== index)
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
      await saveStatus(normalizedConfig, password);
      setConfig(normalizedConfig);
      setMessage('Status page updated successfully.');
    } catch (saveError) {
      setError(saveError.message || 'Unable to save changes.');
    } finally {
      setSaving(false);
    }
  }

  function handleSignOut() {
    setAuthenticated(false);
    setPassword('');
    setConfig(null);
    setError('');
    setMessage('Signed out.');
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
            {error ? <Notice type="error">{error}</Notice> : null}
            {message ? <Notice type="success">{message}</Notice> : null}
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
          <p>Update service health, active incidents and maintenance windows from one place.</p>
        </div>
        <div className="admin-actions">
          <button className="secondary-button" type="button" onClick={handleSignOut}>Sign out</button>
          <button className="primary-button" type="submit" form="status-editor" disabled={saving || loading || !config}>
            {saving ? 'Saving...' : 'Save changes'}
          </button>
        </div>
      </header>

      {error ? <Notice type="error">{error}</Notice> : null}
      {message ? <Notice type="success">{message}</Notice> : null}
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
              <TextInput label="Support email" value={config.page.supportEmail} onChange={(value) => updatePage('supportEmail', value)} />
              <TextArea label="Page description" value={config.page.description} onChange={(value) => updatePage('description', value)} rows={3} />
            </div>
          </section>

          <EditorSection
            title="Services"
            description="Set the current state for each monitored component and optionally override individual days in the 30-day history."
            actionLabel="Add service"
            onAdd={() => addListItem('services', createEmptyService)}
          >
            {config.services.length ? config.services.map((service, index) => (
              <article className="editor-card" key={`service-${index}`}>
                <div className="editor-card-heading">
                  <h3>{service.name || `Service ${index + 1}`}</h3>
                  <button className="danger-button" type="button" onClick={() => removeListItem('services', index)}>Remove</button>
                </div>
                <div className="form-grid">
                  <TextInput label="Service name" value={service.name} onChange={(value) => updateListItem('services', index, 'name', value)} />
                  <StatusSelect value={service.status} onChange={(value) => updateListItem('services', index, 'status', value)} />
                  <TextArea label="Description" value={service.description} onChange={(value) => updateListItem('services', index, 'description', value)} rows={3} />
                </div>
                <HistoryCalendar
                  history={service.history}
                  currentStatus={service.status}
                  onChange={(value) => updateListItem('services', index, 'history', value)}
                />
              </article>
            )) : <EmptyEditor>No services configured yet.</EmptyEditor>}
          </EditorSection>

          <EditorSection
            title="Active incidents"
            description="Only add incidents that should be visible to customers now. Remove resolved incidents when they no longer need to appear."
            actionLabel="Add incident"
            onAdd={() => addListItem('incidents', createEmptyIncident)}
          >
            {config.incidents.length ? config.incidents.map((incident, index) => (
              <article className="editor-card" key={`incident-${index}`}>
                <div className="editor-card-heading">
                  <h3>{incident.title || `Incident ${index + 1}`}</h3>
                  <button className="danger-button" type="button" onClick={() => removeListItem('incidents', index)}>Remove</button>
                </div>
                <div className="form-grid">
                  <TextInput label="Incident title" value={incident.title} onChange={(value) => updateListItem('incidents', index, 'title', value)} />
                  <TextInput label="Status" value={incident.status} onChange={(value) => updateListItem('incidents', index, 'status', value)} placeholder="Investigating / Monitoring / Identified" />
                  <RiskLevelSelect value={incident.riskLevel} onChange={(value) => updateListItem('incidents', index, 'riskLevel', value)} />
                  <DateTimeInput label="Last updated" value={incident.updatedAt} onChange={(value) => updateListItem('incidents', index, 'updatedAt', value)} />
                  <TextInput label="Impact" value={incident.impact} required={false} onChange={(value) => updateListItem('incidents', index, 'impact', value)} placeholder="Brief affected area" />
                  <TextArea label="Message" value={incident.message} onChange={(value) => updateListItem('incidents', index, 'message', value)} />
                </div>
              </article>
            )) : <EmptyEditor>No active incidents.</EmptyEditor>}
          </EditorSection>

          <EditorSection
            title="Scheduled maintenance"
            description="Add planned maintenance windows that customers should see in advance."
            actionLabel="Add maintenance"
            onAdd={() => addListItem('maintenance', createEmptyMaintenance)}
          >
            {config.maintenance.length ? config.maintenance.map((item, index) => (
              <article className="editor-card" key={`maintenance-${index}`}>
                <div className="editor-card-heading">
                  <h3>{item.title || `Maintenance ${index + 1}`}</h3>
                  <button className="danger-button" type="button" onClick={() => removeListItem('maintenance', index)}>Remove</button>
                </div>
                <div className="form-grid">
                  <TextInput label="Maintenance title" value={item.title} onChange={(value) => updateListItem('maintenance', index, 'title', value)} />
                  <DateTimeInput label="Scheduled start" value={item.scheduledFor} onChange={(value) => updateListItem('maintenance', index, 'scheduledFor', value)} />
                  <TextInput label="Duration" value={item.duration} onChange={(value) => updateListItem('maintenance', index, 'duration', value)} />
                  <TextArea label="Message" value={item.message} onChange={(value) => updateListItem('maintenance', index, 'message', value)} />
                </div>
              </article>
            )) : <EmptyEditor>No maintenance scheduled.</EmptyEditor>}
          </EditorSection>
        </form>
      ) : null}
    </main>
  );
}
