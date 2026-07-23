import { useEffect, useMemo, useState } from 'react';
import xpedeonLogo from '../assets/xpedeon-logo.svg';
import { fetchStatus, loginAdmin, saveStatus } from '../api.js';
import {
  buildServiceTimeline,
  CORE_STATUS_IDS,
  createEventUpdate,
  createEmptyIncident,
  createIncidentFollowUp,
  createEmptyMaintenance,
  createEmptyService,
  createEmptyStatusCategory,
  DEFAULT_HISTORY_DAYS,
  formatDateTime,
  formatDuration,
  fromDateTimeInputValue,
  getActiveIncidents,
  getIncidentDerivedStatus,
  getStatusDefinition,
  isMaintenanceActiveAt,
  isIncidentResolved,
  MAX_HISTORY_DAYS,
  MIN_HISTORY_DAYS,
  normalizeStatusConfig,
  RISK_LEVEL_META,
  RISK_LEVELS,
  resolveIncident,
  toDateTimeInputValue,
  validateStatusConfig
} from '../status.js';
import { Notice } from './Notice.jsx';

const INCIDENT_PROGRESS_STATUSES = Object.freeze(['Investigating', 'Identified', 'Monitoring']);

function removeGeneratedFields(config) {
  const { generatedAt: _generatedAt, ...editableConfig } = normalizeStatusConfig(config);
  return editableConfig;
}

function extendedConfigurationWasSaved(requestedConfig, savedConfig) {
  const savedStatusCategories = new Map(
    (Array.isArray(savedConfig?.statusCategories) ? savedConfig.statusCategories : [])
      .map((category) => [category.id, category])
  );
  const statusCategoriesSaved = requestedConfig.statusCategories.every((requestedCategory) => {
    const savedCategory = savedStatusCategories.get(requestedCategory.id);
    return savedCategory
      && savedCategory.label === requestedCategory.label
      && savedCategory.color === requestedCategory.color
      && savedCategory.rank === requestedCategory.rank;
  });
  const savedServices = new Map(
    (Array.isArray(savedConfig?.services) ? savedConfig.services : [])
      .map((service) => [service.id, service])
  );
  const servicePreferencesSaved = requestedConfig.services.every((requestedService) => {
    const savedService = savedServices.get(requestedService.id);
    return savedService
      && savedService.showHistory === requestedService.showHistory
      && savedService.historyDays === requestedService.historyDays;
  });

  const savedIncidents = new Map(
    (Array.isArray(savedConfig?.incidents) ? savedConfig.incidents : [])
      .map((incident) => [incident.id, incident])
  );
  const updateRiskLevelsSaved = requestedConfig.incidents.every((requestedIncident) => {
    const savedUpdates = new Map(
      (savedIncidents.get(requestedIncident.id)?.updates || []).map((update) => [update.id, update])
    );
    return requestedIncident.updates.every((requestedUpdate) => (
      savedUpdates.get(requestedUpdate.id)?.riskLevel === requestedUpdate.riskLevel
    ));
  });

  return statusCategoriesSaved && servicePreferencesSaved && updateRiskLevelsSaved;
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
    <Field label={label} hint={[hint, value ? `Displayed as ${formatDateTime(value)}` : ''].filter(Boolean).join(' ')}>
      <input
        required={required}
        type="datetime-local"
        value={toDateTimeInputValue(value)}
        onChange={(event) => onChange(fromDateTimeInputValue(event.target.value))}
      />
    </Field>
  );
}

function NumberInput({ label, value, onChange, hint, min, max }) {
  return (
    <Field label={label} hint={hint}>
      <input
        required
        type="number"
        inputMode="numeric"
        min={min}
        max={max}
        step="1"
        value={value}
        onChange={(event) => onChange(event.target.value === '' ? '' : Number(event.target.value))}
      />
    </Field>
  );
}

function ColorInput({ label = 'Colour', value, onChange, hint }) {
  const safeValue = /^#[0-9a-f]{6}$/i.test(value || '') ? value : '#6D28D9';
  return (
    <Field label={label} hint={hint}>
      <span className="color-input-shell">
        <input
          className="color-picker"
          type="color"
          value={safeValue}
          onChange={(event) => onChange(event.target.value.toUpperCase())}
          aria-label={`${label} picker`}
        />
        <input
          required
          type="text"
          value={value ?? ''}
          pattern="#[0-9A-Fa-f]{6}"
          placeholder="#159957"
          onChange={(event) => onChange(event.target.value)}
          aria-label={`${label} hex value`}
        />
      </span>
    </Field>
  );
}

function EventUpdatesEditor({ kind, updates, currentStatus, currentRiskLevel, categories, onAdd, onChange, onRemove }) {
  const items = Array.isArray(updates) ? updates : [];
  const isIncident = kind === 'incident';

  return (
    <section className="event-updates-editor" aria-label={`${isIncident ? 'Incident' : 'Maintenance'} updates`}>
      <div className="event-updates-heading">
        <div>
          <h4>Timestamped updates</h4>
          <p>Add progress updates here. Incident status and risk from the newest update are reflected on the public page.</p>
        </div>
        <button className="secondary-button" type="button" onClick={onAdd}>Add update</button>
      </div>
      {items.length ? (
        <div className="event-update-list">
          {items.map((update, index) => (
            <article className="event-update-editor" key={update.id}>
              <div className="event-update-number">
                <strong>Update {index + 1}</strong>
                <button className="danger-button" type="button" onClick={() => onRemove(index)}>Remove</button>
              </div>
              <div className={`form-grid${isIncident ? ' event-update-fields' : ''}`}>
                {isIncident ? (
                  <IncidentProgressSelect
                    value={update.status || currentStatus}
                    onChange={(value) => onChange(index, 'status', value)}
                  />
                ) : null}
                {isIncident ? (
                  <RiskLevelSelect
                    value={update.riskLevel || currentRiskLevel}
                    categories={categories}
                    onChange={(value) => onChange(index, 'riskLevel', value)}
                  />
                ) : null}
                <DateTimeInput label="Published at" value={update.createdAt} onChange={(value) => onChange(index, 'createdAt', value)} />
                <div className="wide-field">
                  <TextArea
                    label="Update message"
                    value={update.message}
                    rows={3}
                    placeholder="What changed since the previous update?"
                    onChange={(value) => onChange(index, 'message', value)}
                  />
                </div>
              </div>
            </article>
          ))}
        </div>
      ) : <p className="empty event-updates-empty">No timestamped updates yet.</p>}
    </section>
  );
}

function ReadOnlyField({ label, value, hint }) {
  return (
    <Field label={label} hint={hint}>
      <output className="readonly-output">{value}</output>
    </Field>
  );
}

function StatusSelect({ label = 'Configured status', value, onChange, hint, categories }) {
  return (
    <Field label={label} hint={hint}>
      <select value={value} onChange={(event) => onChange(event.target.value)}>
        {categories.map((category) => (
          <option key={category.id} value={category.id}>{category.label}</option>
        ))}
      </select>
    </Field>
  );
}

function RiskLevelSelect({ value, onChange, categories }) {
  return (
    <Field label="Risk level" hint="The public status is detected automatically from this level.">
      <select value={value} onChange={(event) => onChange(event.target.value)}>
        {RISK_LEVELS.map((riskLevel) => {
          const risk = RISK_LEVEL_META[riskLevel];
          const derived = getStatusDefinition(risk.derivedStatus, categories);
          return <option key={riskLevel} value={riskLevel}>{risk.label} → {derived.label}</option>;
        })}
      </select>
    </Field>
  );
}

function IncidentProgressSelect({ value, onChange }) {
  const currentValue = typeof value === 'string' && value.trim() ? value.trim() : 'Investigating';
  const options = INCIDENT_PROGRESS_STATUSES.includes(currentValue)
    ? INCIDENT_PROGRESS_STATUSES
    : [currentValue, ...INCIDENT_PROGRESS_STATUSES];

  return (
    <Field label="Progress status" hint="Use Issue resolution below to close the incident.">
      <select value={currentValue} onChange={(event) => onChange(event.target.value)}>
        {options.map((status) => <option key={status} value={status}>{status}</option>)}
      </select>
    </Field>
  );
}

function IncidentResolutionControl({ incident, onResolve, onCreateFollowUp }) {
  const resolved = isIncidentResolved(incident);

  return (
    <fieldset className={`incident-resolution-field${resolved ? ' is-resolved' : ''}`}>
      <legend>Issue resolution</legend>
      <div className="incident-resolution-row">
        <button
          className={`resolution-state-button${resolved ? ' is-resolved' : ''}`}
          type="button"
          aria-pressed={resolved}
          disabled={resolved}
          onClick={onResolve}
        >
          <span className="resolution-state-icon" aria-hidden="true">{resolved ? '✓' : '○'}</span>
          <span>
            <strong>{resolved ? 'Issue resolved' : 'Mark issue as resolved'}</strong>
            <small>
              {resolved
                ? 'This issue no longer changes the current service or overall status.'
                : 'Resolution immediately removes this incident from the live status calculation after saving.'}
            </small>
          </span>
        </button>
        {resolved ? (
          <button className="secondary-button" type="button" onClick={onCreateFollowUp}>
            Create follow-up incident
          </button>
        ) : null}
      </div>
      <p>
        The incident remains in the 30-day history with its original severity and resolution time.
        A recurrence should be recorded as a follow-up so the resolved interval stays accurate.
      </p>
    </fieldset>
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

function HistoryCalendar({ service, incidents, maintenance, categories, onChange }) {
  const historyDays = Math.min(
    MAX_HISTORY_DAYS,
    Math.max(MIN_HISTORY_DAYS, Number.isInteger(service.historyDays) ? service.historyDays : DEFAULT_HISTORY_DAYS)
  );
  const timeline = useMemo(
    () => buildServiceTimeline(service, incidents, maintenance, historyDays, new Date(), categories),
    [service, incidents, maintenance, historyDays, categories]
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
    <div
      className="history-editor"
      aria-label={`Recent service history for ${service.name || 'service'}`}
      style={{ '--history-columns': Math.min(historyDays, 30), '--history-mobile-columns': Math.min(historyDays, 15) }}
    >
      <div className="history-editor-toolbar">
        <div>
          <span>Last {historyDays} day{historyDays === 1 ? '' : 's'}</span>
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
                className={`history-day-button status-color-block history-day-${entry.tone}${explicitStatus ? ' history-day-explicit' : ''}${entry.isAutomatic ? ' history-day-automatic' : ''}`}
                title={`${entry.date}: ${entry.label}${sourceTitles ? ` · ${sourceTitles}` : ''}. Click to cycle the manual setting.`}
                onClick={() => {
                  const currentManualStatus = explicitStatus || 'operational';
                  const categoryIds = categories.map((category) => category.id);
                  const currentIndex = categoryIds.indexOf(currentManualStatus);
                  const nextStatus = categoryIds[(currentIndex + 1) % categoryIds.length];
                  updateDate(entry.date, nextStatus);
                }}
                style={{ '--status-color': entry.color }}
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
        {categories.map((category) => {
          return (
            <span key={category.id}>
              <i style={{ background: category.color }} aria-hidden="true" />
              {category.label}
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

function CardStatus({ status, label, categories }) {
  const meta = getStatusDefinition(status, categories);
  return (
    <span className="card-status card-status-custom" style={{ '--status-color': meta.color }}>
      {label || meta.label}
    </span>
  );
}

export function AdminPage() {
  const [authenticated, setAuthenticated] = useState(false);
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [config, setConfig] = useState(null);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [loggingIn, setLoggingIn] = useState(false);
  const [dirty, setDirty] = useState(false);
  const editorStats = useMemo(() => {
    const now = new Date();
    const incidents = config?.incidents || [];
    const maintenance = config?.maintenance || [];
    return {
      services: config?.services?.length || 0,
      activeIncidents: getActiveIncidents(incidents, now).length,
      activeMaintenance: maintenance.filter((item) => isMaintenanceActiveAt(item, now)).length,
      retainedReports: incidents.length + maintenance.length
    };
  }, [config]);

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

  useEffect(() => {
    if (!authenticated) {
      return undefined;
    }

    function saveWithKeyboard(event) {
      if (!(event.ctrlKey || event.metaKey) || event.altKey || event.key.toLowerCase() !== 's') {
        return;
      }

      event.preventDefault();
      if (!event.repeat && dirty && !saving && !loading && config) {
        document.getElementById('status-editor')?.requestSubmit();
      }
    }

    window.addEventListener('keydown', saveWithKeyboard);
    return () => window.removeEventListener('keydown', saveWithKeyboard);
  }, [authenticated, config, dirty, loading, saving]);

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

  function addEventUpdate(listName, index) {
    changeConfig((current) => ({
      ...current,
      [listName]: current[listName].map((item, itemIndex) => {
        if (itemIndex !== index) return item;
        const update = createEventUpdate({
          status: listName === 'incidents' ? item.status : '',
          riskLevel: listName === 'incidents' ? item.riskLevel : ''
        });
        return {
          ...item,
          updatedAt: listName === 'incidents' ? update.createdAt : item.updatedAt,
          updates: [...(item.updates || []), update]
        };
      })
    }));
  }

  function updateEventUpdate(listName, itemIndex, updateIndex, field, value) {
    changeConfig((current) => ({
      ...current,
      [listName]: current[listName].map((item, index) => {
        if (index !== itemIndex) return item;
        const updates = (item.updates || []).map((update, index) => (
          index === updateIndex ? { ...update, [field]: value } : update
        ));
        const latestUpdate = listName === 'incidents'
          ? updates.reduce((latest, update) => (
            !latest || new Date(update.createdAt) > new Date(latest.createdAt) ? update : latest
          ), null)
          : null;
        return {
          ...item,
          status: latestUpdate?.status || item.status,
          riskLevel: latestUpdate?.riskLevel || item.riskLevel,
          updatedAt: latestUpdate?.createdAt || item.updatedAt,
          updates
        };
      })
    }));
  }

  function removeEventUpdate(listName, itemIndex, updateIndex) {
    changeConfig((current) => ({
      ...current,
      [listName]: current[listName].map((item, index) => {
        if (index !== itemIndex) return item;
        const updates = (item.updates || []).filter((_update, index) => index !== updateIndex);
        const latestUpdate = listName === 'incidents'
          ? updates.reduce((latest, update) => (
            !latest || new Date(update.createdAt) > new Date(latest.createdAt) ? update : latest
          ), null)
          : null;
        return {
          ...item,
          status: latestUpdate?.status || item.status,
          riskLevel: latestUpdate?.riskLevel || item.riskLevel,
          updatedAt: latestUpdate?.createdAt || item.updatedAt,
          updates
        };
      })
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

  function removeStatusCategory(index) {
    const category = config?.statusCategories?.[index];
    if (!category || CORE_STATUS_IDS.includes(category.id)) {
      return;
    }

    const usedByService = (config.services || []).some((service) => (
      service.status === category.id
      || Object.values(service.history || {}).some((value) => (
        (typeof value === 'string' ? value : value?.status) === category.id
      ))
    ));
    if (usedByService) {
      setError(`"${category.label}" is in use. Assign those services and history entries to another category before removing it.`);
      return;
    }
    if (!window.confirm(`Remove the "${category.label}" status category?`)) {
      return;
    }

    changeConfig((current) => ({
      ...current,
      statusCategories: current.statusCategories.filter((_item, itemIndex) => itemIndex !== index)
    }));
  }

  function markIncidentResolved(index) {
    changeConfig((current) => ({
      ...current,
      incidents: current.incidents.map((incident, incidentIndex) => (
        incidentIndex === index
          ? resolveIncident(incident)
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
        createIncidentFollowUp(current.incidents[index])
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
      if (!extendedConfigurationWasSaved(normalizedConfig, savedConfig)) {
        throw new Error('The running API is out of date and did not save all configuration fields. Restart the development server, then save again.');
      }
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
    setShowPassword(false);
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
              <span className="password-input-shell">
                <input
                  autoFocus
                  required
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="current-password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                />
                <button
                  className="password-visibility-button"
                  type="button"
                  aria-label={showPassword ? 'Hide administrator password' : 'Show administrator password'}
                  aria-pressed={showPassword}
                  onClick={() => setShowPassword((current) => !current)}
                >
                  {showPassword ? 'Hide' : 'Show'}
                </button>
              </span>
            </Field>
            <p className="login-password-help">
              To change this password, update <code>STATUS_ADMIN_PASSWORD</code> on the server and restart it.
            </p>
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
          <img className="brand-logo" src={xpedeonLogo} alt="" aria-hidden="true" />
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
          <button
            className="primary-button save-button"
            type="submit"
            form="status-editor"
            disabled={saving || loading || !config || !dirty}
            aria-keyshortcuts="Control+S Meta+S"
            title="Save changes (Ctrl+S or Command+S)"
          >
            <span>{saving ? 'Saving...' : 'Save changes'}</span>
            {!saving ? <kbd>Ctrl/⌘ S</kbd> : null}
          </button>
        </div>
      </header>

      {error ? <Notice tone="error">{error}</Notice> : null}
      {message ? <Notice tone="success">{message}</Notice> : null}
      {loading ? <Notice>Loading the current status configuration...</Notice> : null}

      {config ? (
        <form id="status-editor" className="admin-form" onSubmit={handleSave}>
          <section className="admin-overview" aria-label="Status configuration overview">
            <div className="admin-stat"><strong>{editorStats.services}</strong><span>Services</span></div>
            <div className="admin-stat"><strong>{config.statusCategories.length}</strong><span>Status categories</span></div>
            <div className="admin-stat admin-stat-bad"><strong>{editorStats.activeIncidents}</strong><span>Active incidents</span></div>
            <div className="admin-stat admin-stat-info"><strong>{editorStats.activeMaintenance}</strong><span>Maintenance active</span></div>
            <p>Resolved incidents and completed maintenance are automatically deleted 30 days after their end time.</p>
          </section>
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
            title="Status categories"
            description="Create the labels and colours shown on service pills, history bars, the legend and overall status. A higher severity number takes priority."
            actionLabel="Add status category"
            onAdd={() => addListItem(
              'statusCategories',
              () => createEmptyStatusCategory(config.statusCategories)
            )}
          >
            {config.statusCategories.map((category, index) => {
              const isCoreCategory = CORE_STATUS_IDS.includes(category.id);
              return (
                <article className="editor-card status-category-card" key={category.id}>
                  <div className="editor-card-heading">
                    <div className="editor-title-row">
                      <h3>{category.label || `Status category ${index + 1}`}</h3>
                      <CardStatus status={category.id} categories={config.statusCategories} />
                      {isCoreCategory ? <span className="system-category-badge">Automatic reports</span> : null}
                    </div>
                    {!isCoreCategory ? (
                      <button className="danger-button" type="button" onClick={() => removeStatusCategory(index)}>Remove</button>
                    ) : null}
                  </div>
                  <div className="form-grid status-category-fields">
                    <TextInput
                      label="Category name"
                      value={category.label}
                      onChange={(value) => updateListItem('statusCategories', index, 'label', value)}
                    />
                    <ColorInput
                      value={category.color}
                      hint="Used consistently across all public status indicators."
                      onChange={(value) => updateListItem('statusCategories', index, 'color', value)}
                    />
                    <NumberInput
                      label="Severity priority"
                      value={category.rank}
                      min={0}
                      max={100}
                      hint="0 is the normal baseline. The highest active number becomes the overall status."
                      onChange={(value) => updateListItem('statusCategories', index, 'rank', value)}
                    />
                    <ReadOnlyField
                      label="Category ID"
                      value={category.id}
                      hint={isCoreCategory ? 'Required for automatic incident and maintenance detection.' : 'Stable identifier saved with services and history.'}
                    />
                  </div>
                </article>
              );
            })}
          </EditorSection>

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
                    <CardStatus status={service.status} categories={config.statusCategories} />
                  </div>
                  <button className="danger-button" type="button" onClick={() => removeService(index)}>Remove</button>
                </div>
                <div className="form-grid">
                  <TextInput label="Service name" value={service.name} onChange={(value) => updateListItem('services', index, 'name', value)} />
                  <StatusSelect
                    value={service.status}
                    categories={config.statusCategories}
                    onChange={(value) => updateListItem('services', index, 'status', value)}
                    hint="Use this for a manual baseline; reports are applied automatically on top."
                  />
                  <TextArea label="Description" value={service.description} onChange={(value) => updateListItem('services', index, 'description', value)} rows={3} />
                </div>
                <fieldset className="history-settings-field">
                  <legend>Public history</legend>
                  <label className="history-visibility-option">
                    <input
                      type="checkbox"
                      checked={service.showHistory}
                      onChange={(event) => updateListItem('services', index, 'showHistory', event.target.checked)}
                    />
                    <span>
                      <strong>Show history on the public status page</strong>
                      <small>Turn this off to show only the service description and current status.</small>
                    </span>
                  </label>
                  <NumberInput
                    label="History range in days"
                    value={service.historyDays}
                    min={MIN_HISTORY_DAYS}
                    max={MAX_HISTORY_DAYS}
                    hint={`Choose any whole number from ${MIN_HISTORY_DAYS} to ${MAX_HISTORY_DAYS}. This service can differ from the others.`}
                    onChange={(value) => updateListItem('services', index, 'historyDays', value)}
                  />
                </fieldset>
                {service.showHistory ? (
                  <HistoryCalendar
                    service={service}
                    incidents={config.incidents}
                    maintenance={config.maintenance}
                    categories={config.statusCategories}
                    onChange={(value) => updateListItem('services', index, 'history', value)}
                  />
                ) : (
                  <p className="history-hidden-note">History is hidden for this service. Existing history data is preserved.</p>
                )}
              </article>
            )) : <EmptyEditor>No services configured yet.</EmptyEditor>}
          </EditorSection>

          <EditorSection
            title="Incident reports"
            description="Resolved reports remain in history for 30 days, then are deleted automatically. Risk level and affected services drive status detection."
            actionLabel="Add incident"
            onAdd={() => addListItem('incidents', createEmptyIncident)}
          >
            {config.incidents.length ? config.incidents.map((incident, index) => {
              const derivedStatus = getIncidentDerivedStatus(incident.riskLevel);
              const resolved = isIncidentResolved(incident);
              return (
                <article className={`editor-card${resolved ? ' editor-card-resolved' : ''}`} key={incident.id}>
                  <div className="editor-card-heading">
                    <div className="editor-title-row">
                      <h3>{incident.title || `Incident ${index + 1}`}</h3>
                      <CardStatus
                        status={resolved ? 'operational' : derivedStatus}
                        categories={config.statusCategories}
                        label={resolved
                          ? 'Resolved · no live impact'
                          : `Active · ${getStatusDefinition(derivedStatus, config.statusCategories).label}`}
                      />
                    </div>
                    <div className="card-actions">
                      <button className="danger-button" type="button" onClick={() => removeListItem('incidents', index)}>Delete</button>
                    </div>
                  </div>
                  <div className="form-grid">
                    <div className="wide-field">
                      <IncidentResolutionControl
                        incident={incident}
                        onResolve={() => markIncidentResolved(index)}
                        onCreateFollowUp={() => reopenIncident(index)}
                      />
                    </div>
                    <TextInput label="Incident title" value={incident.title} onChange={(value) => updateListItem('incidents', index, 'title', value)} />
                    {resolved ? (
                      <ReadOnlyField label="Progress status" value="Resolved" hint="Set automatically from the issue resolution option." />
                    ) : (
                      <IncidentProgressSelect value={incident.status} onChange={(value) => updateListItem('incidents', index, 'status', value)} />
                    )}
                    <RiskLevelSelect
                      value={incident.riskLevel}
                      categories={config.statusCategories}
                      onChange={(value) => updateListItem('incidents', index, 'riskLevel', value)}
                    />
                    <ReadOnlyField
                      label="Live service impact"
                      value={resolved ? 'None — issue resolved' : getStatusDefinition(derivedStatus, config.statusCategories).label}
                      hint={resolved
                        ? 'The original impact remains visible in service history.'
                        : 'Minor → Degraded Performance; Major/Critical → Major Outage.'}
                    />
                    <DateTimeInput label="Started" value={incident.startedAt} onChange={(value) => updateListItem('incidents', index, 'startedAt', value)} />
                    <DateTimeInput label="Last updated" value={incident.updatedAt} onChange={(value) => updateListItem('incidents', index, 'updatedAt', value)} />
                    {resolved ? (
                      <DateTimeInput
                        label="Resolved at"
                        value={incident.resolvedAt}
                        onChange={(value) => updateListItem('incidents', index, 'resolvedAt', value)}
                        hint="Adjust this only when the actual resolution time differs from the recorded time."
                      />
                    ) : null}
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
                      <TextArea label="Public summary" hint="A stable overview of the incident. Add chronological progress below." value={incident.message} onChange={(value) => updateListItem('incidents', index, 'message', value)} />
                    </div>
                    <div className="wide-field">
                      <EventUpdatesEditor
                        kind="incident"
                        updates={incident.updates}
                        currentStatus={incident.status}
                        currentRiskLevel={incident.riskLevel}
                        categories={config.statusCategories}
                        onAdd={() => addEventUpdate('incidents', index)}
                        onChange={(updateIndex, field, value) => updateEventUpdate('incidents', index, updateIndex, field, value)}
                        onRemove={(updateIndex) => removeEventUpdate('incidents', index, updateIndex)}
                      />
                    </div>
                  </div>
                </article>
              );
            }) : <EmptyEditor>No incident reports.</EmptyEditor>}
          </EditorSection>

          <EditorSection
            title="Maintenance reports"
            description="Maintenance dates are applied to selected service history. Completed reports remain for 30 days, then are deleted automatically."
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
                      <CardStatus
                        status={ended ? 'operational' : 'maintenance'}
                        categories={config.statusCategories}
                        label={ended ? 'Completed' : 'Auto: Maintenance'}
                      />
                    </div>
                    <button className="danger-button" type="button" onClick={() => removeListItem('maintenance', index)}>Delete</button>
                  </div>
                  <div className="form-grid">
                    <TextInput label="Maintenance title" value={item.title} onChange={(value) => updateListItem('maintenance', index, 'title', value)} />
                    <ReadOnlyField
                      label="Detected service status"
                      value={getStatusDefinition('maintenance', config.statusCategories).label}
                    />
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
                      <TextArea label="Public summary" hint="A stable overview of the maintenance. Add chronological progress below." value={item.message} onChange={(value) => updateListItem('maintenance', index, 'message', value)} />
                    </div>
                    <div className="wide-field">
                      <EventUpdatesEditor
                        kind="maintenance"
                        updates={item.updates}
                        categories={config.statusCategories}
                        onAdd={() => addEventUpdate('maintenance', index)}
                        onChange={(updateIndex, field, value) => updateEventUpdate('maintenance', index, updateIndex, field, value)}
                        onRemove={(updateIndex) => removeEventUpdate('maintenance', index, updateIndex)}
                      />
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
