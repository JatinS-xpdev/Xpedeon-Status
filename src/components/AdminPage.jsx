import { useEffect, useState } from 'react';
import { fetchStatus, saveStatus } from '../api.js';
import {
  createEmptyIncident,
  createEmptyMaintenance,
  createEmptyService,
  SERVICE_STATUSES,
  STATUS_META
} from '../status.js';
import { Notice } from './Notice.jsx';

function stripGeneratedFields(config) {
  const { generatedAt, ...editableConfig } = config;
  return editableConfig;
}

function toDateTimeInput(value) {
  if (!value) {
    return '';
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return '';
  }

  const offset = date.getTimezoneOffset() * 60000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
}

function Field({ label, children }) {
  return (
    <label className="field">
      <span>{label}</span>
      {children}
    </label>
  );
}

function TextInput({ label, value, onChange, type = 'text' }) {
  return (
    <Field label={label}>
      <input type={type} value={value ?? ''} onChange={(event) => onChange(event.target.value)} />
    </Field>
  );
}

function TextArea({ label, value, onChange }) {
  return (
    <Field label={label}>
      <textarea value={value ?? ''} onChange={(event) => onChange(event.target.value)} rows={3} />
    </Field>
  );
}

function StatusSelect({ value, onChange }) {
  return (
    <Field label="Status">
      <select value={value} onChange={(event) => onChange(event.target.value)}>
        {SERVICE_STATUSES.map((status) => (
          <option key={status} value={status}>
            {STATUS_META[status].label}
          </option>
        ))}
      </select>
    </Field>
  );
}

function EditorList({ title, count, onAdd, children }) {
  return (
    <section className="admin-section">
      <div className="section-heading">
        <h2>{title}</h2>
        <span>{count}</span>
      </div>
      <div className="editor-list">{children}</div>
      <button className="secondary-button" type="button" onClick={onAdd}>
        Add {title.toLowerCase()}
      </button>
    </section>
  );
}

export function AdminPage() {
  const [config, setConfig] = useState(null);
  const [error, setError] = useState('');
  const [saveState, setSaveState] = useState('idle');

  useEffect(() => {
    fetchStatus()
      .then((data) => setConfig(stripGeneratedFields(data)))
      .catch((requestError) => setError(requestError.message));
  }, []);

  function updatePage(field, value) {
    setConfig((current) => ({
      ...current,
      page: {
        ...current.page,
        [field]: value
      }
    }));
  }

  function updateListItem(listName, index, field, value) {
    setConfig((current) => ({
      ...current,
      [listName]: (current[listName] ?? []).map((item, itemIndex) =>
        itemIndex === index ? { ...item, [field]: value } : item
      )
    }));
  }

  function addListItem(listName, item) {
    setConfig((current) => ({
      ...current,
      [listName]: [...(current[listName] ?? []), item]
    }));
  }

  function removeListItem(listName, index) {
    setConfig((current) => ({
      ...current,
      [listName]: (current[listName] ?? []).filter((_item, itemIndex) => itemIndex !== index)
    }));
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setError('');
    setSaveState('saving');

    try {
      const savedConfig = await saveStatus(config);
      setConfig(stripGeneratedFields(savedConfig));
      setSaveState('saved');
      window.setTimeout(() => setSaveState('idle'), 1800);
    } catch (saveError) {
      setError(saveError.message);
      setSaveState('idle');
    }
  }

  if (error && !config) {
    return <Notice title="Admin unavailable" tone="error">{error}</Notice>;
  }

  if (!config) {
    return <Notice title="Loading admin">Fetching editable status configuration.</Notice>;
  }

  const services = config.services ?? [];
  const incidents = config.incidents ?? [];
  const maintenance = config.maintenance ?? [];

  return (
    <main className="page admin-page">
      <nav className="top-nav">
        <a href="/">Status</a>
        <a href="/admin">Admin</a>
      </nav>

      <header className="admin-header">
        <div>
          <p className="eyebrow">Status Admin</p>
          <h1>Edit status page</h1>
          <p className="lede">Changes are saved to status.config.json through the local Node API.</p>
        </div>
        <button className="primary-button" type="submit" form="status-admin-form" disabled={saveState === 'saving'}>
          {saveState === 'saving' ? 'Saving...' : 'Save changes'}
        </button>
      </header>

      {error ? <div className="inline-error">{error}</div> : null}
      {saveState === 'saved' ? <div className="inline-success">Configuration saved.</div> : null}

      <form id="status-admin-form" className="admin-form" onSubmit={handleSubmit}>
        <section className="admin-section">
          <div className="section-heading">
            <h2>Page details</h2>
          </div>
          <div className="form-grid">
            <TextInput label="Title" value={config.page.title} onChange={(value) => updatePage('title', value)} />
            <TextInput
              label="Support email"
              type="email"
              value={config.page.supportEmail}
              onChange={(value) => updatePage('supportEmail', value)}
            />
            <div className="wide-field">
              <TextArea
                label="Description"
                value={config.page.description}
                onChange={(value) => updatePage('description', value)}
              />
            </div>
          </div>
        </section>

        <EditorList
          title="Services"
          count={services.length}
          onAdd={() => addListItem('services', createEmptyService())}
        >
          {services.map((service, index) => (
            <div className="editor-row" key={`${service.name}-${index}`}>
              <div className="form-grid">
                <TextInput
                  label="Name"
                  value={service.name}
                  onChange={(value) => updateListItem('services', index, 'name', value)}
                />
                <StatusSelect
                  value={service.status}
                  onChange={(value) => updateListItem('services', index, 'status', value)}
                />
                <div className="wide-field">
                  <TextArea
                    label="Description"
                    value={service.description}
                    onChange={(value) => updateListItem('services', index, 'description', value)}
                  />
                </div>
              </div>
              <button className="danger-button" type="button" onClick={() => removeListItem('services', index)}>
                Remove
              </button>
            </div>
          ))}
        </EditorList>

        <EditorList
          title="Incidents"
          count={incidents.length}
          onAdd={() => addListItem('incidents', createEmptyIncident())}
        >
          {incidents.map((incident, index) => (
            <div className="editor-row" key={`${incident.title}-${index}`}>
              <div className="form-grid">
                <TextInput
                  label="Title"
                  value={incident.title}
                  onChange={(value) => updateListItem('incidents', index, 'title', value)}
                />
                <TextInput
                  label="Status"
                  value={incident.status}
                  onChange={(value) => updateListItem('incidents', index, 'status', value)}
                />
                <TextInput
                  label="Impact"
                  value={incident.impact}
                  onChange={(value) => updateListItem('incidents', index, 'impact', value)}
                />
                <TextInput
                  label="Updated"
                  type="datetime-local"
                  value={toDateTimeInput(incident.updatedAt)}
                  onChange={(value) => updateListItem('incidents', index, 'updatedAt', value)}
                />
                <div className="wide-field">
                  <TextArea
                    label="Message"
                    value={incident.message}
                    onChange={(value) => updateListItem('incidents', index, 'message', value)}
                  />
                </div>
              </div>
              <button className="danger-button" type="button" onClick={() => removeListItem('incidents', index)}>
                Remove
              </button>
            </div>
          ))}
        </EditorList>

        <EditorList
          title="Maintenance"
          count={maintenance.length}
          onAdd={() => addListItem('maintenance', createEmptyMaintenance())}
        >
          {maintenance.map((item, index) => (
            <div className="editor-row" key={`${item.title}-${index}`}>
              <div className="form-grid">
                <TextInput
                  label="Title"
                  value={item.title}
                  onChange={(value) => updateListItem('maintenance', index, 'title', value)}
                />
                <TextInput
                  label="Starts"
                  type="datetime-local"
                  value={toDateTimeInput(item.scheduledFor)}
                  onChange={(value) => updateListItem('maintenance', index, 'scheduledFor', value)}
                />
                <TextInput
                  label="Duration"
                  value={item.duration}
                  onChange={(value) => updateListItem('maintenance', index, 'duration', value)}
                />
                <div className="wide-field">
                  <TextArea
                    label="Message"
                    value={item.message}
                    onChange={(value) => updateListItem('maintenance', index, 'message', value)}
                  />
                </div>
              </div>
              <button className="danger-button" type="button" onClick={() => removeListItem('maintenance', index)}>
                Remove
              </button>
            </div>
          ))}
        </EditorList>
      </form>
    </main>
  );
}
