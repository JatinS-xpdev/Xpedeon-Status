export const STATUS_META = Object.freeze({
  operational: Object.freeze({ label: 'Operational', rank: 0, tone: 'good' }),
  degraded: Object.freeze({ label: 'Degraded Performance', rank: 1, tone: 'warn' }),
  maintenance: Object.freeze({ label: 'Maintenance', rank: 2, tone: 'info' }),
  outage: Object.freeze({ label: 'Major Outage', rank: 3, tone: 'bad' })
});

export const SERVICE_STATUSES = Object.freeze(Object.keys(STATUS_META));
export const STATUS_SET = Object.freeze(new Set(SERVICE_STATUSES));

export const RISK_LEVEL_META = Object.freeze({
  minor: Object.freeze({ label: 'Minor', rank: 1, tone: 'warn', derivedStatus: 'degraded' }),
  major: Object.freeze({ label: 'Major', rank: 2, tone: 'bad', derivedStatus: 'outage' }),
  critical: Object.freeze({ label: 'Critical', rank: 3, tone: 'bad', derivedStatus: 'outage' })
});

export const RISK_LEVELS = Object.freeze(Object.keys(RISK_LEVEL_META));
export const RISK_LEVEL_SET = Object.freeze(new Set(RISK_LEVELS));

export const DEFAULT_PAGE = Object.freeze({
  title: 'Xpedeon Status',
  description: 'Live service availability for Xpedeon products and supporting systems.',
  supportEmail: 'support@example.com'
});

const RESOLVED_STATUS_PATTERN = /\b(resolved|closed|completed|fixed)\b/i;
const DATE_KEY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const DEFAULT_MAINTENANCE_MINUTES = 30;
const DAY_MS = 24 * 60 * 60 * 1000;

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function cleanString(value, fallback = '') {
  return typeof value === 'string' && value.trim() ? value.trim() : fallback;
}

function isValidDate(value) {
  return Boolean(value) && !Number.isNaN(new Date(value).getTime());
}

function normalizeDateTime(value, fallback = '') {
  if (!isValidDate(value)) {
    return fallback;
  }
  return new Date(value).toISOString();
}

function slugify(value) {
  return cleanString(value, 'item')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 54) || 'item';
}

function createStableId(prefix, preferredId, label, index, usedIds) {
  const preferred = cleanString(preferredId)
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '');
  const base = preferred || `${prefix}-${slugify(label || `${index + 1}`)}`;
  let candidate = base;
  let suffix = 2;

  while (usedIds.has(candidate)) {
    candidate = `${base}-${suffix}`;
    suffix += 1;
  }

  usedIds.add(candidate);
  return candidate;
}

function createRuntimeId(prefix) {
  const uuid = globalThis.crypto?.randomUUID?.();
  if (uuid) {
    return `${prefix}-${uuid}`;
  }
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`;
}

export function normalizeServiceStatus(value, fallbackStatus = 'operational') {
  const status = typeof value === 'string' ? value.trim().toLowerCase() : '';
  if (STATUS_SET.has(status)) {
    return status;
  }

  const safeFallback = typeof fallbackStatus === 'string' ? fallbackStatus.trim().toLowerCase() : '';
  return STATUS_SET.has(safeFallback) ? safeFallback : 'operational';
}

export function normalizeRiskLevel(value, fallbackRisk = 'minor') {
  const riskLevel = typeof value === 'string' ? value.trim().toLowerCase() : '';
  if (RISK_LEVEL_SET.has(riskLevel)) {
    return riskLevel;
  }

  const safeFallback = typeof fallbackRisk === 'string' ? fallbackRisk.trim().toLowerCase() : '';
  return RISK_LEVEL_SET.has(safeFallback) ? safeFallback : 'minor';
}

export function getIncidentDerivedStatus(riskLevel) {
  return RISK_LEVEL_META[normalizeRiskLevel(riskLevel)].derivedStatus;
}

function parseDateKey(value) {
  if (typeof value !== 'string' || !DATE_KEY_PATTERN.test(value)) {
    return null;
  }

  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(year, month - 1, day, 12);
  if (
    date.getFullYear() !== year
    || date.getMonth() !== month - 1
    || date.getDate() !== day
  ) {
    return null;
  }
  return date;
}

function isValidDateKey(value) {
  return Boolean(parseDateKey(value));
}

function toLocalDate(value) {
  const dateKey = parseDateKey(value);
  if (dateKey) {
    return dateKey;
  }

  return value instanceof Date ? value : new Date(value);
}

function getLocalDateKey(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function getDateKey(value = new Date()) {
  if (isValidDateKey(value)) {
    return value;
  }

  const date = toLocalDate(value);
  if (Number.isNaN(date.getTime())) {
    return getDateKey(new Date());
  }
  return getLocalDateKey(date);
}

export function getRecentDateKeys(segmentCount = 30, baseDate = new Date()) {
  const safeCount = Number.isInteger(segmentCount) && segmentCount > 0 ? Math.min(segmentCount, 366) : 30;
  const base = toLocalDate(baseDate);
  const anchor = Number.isNaN(base.getTime()) ? new Date() : base;

  return Array.from({ length: safeCount }, (_item, index) => {
    const offset = safeCount - 1 - index;
    // Noon avoids daylight-saving transitions that can occur around midnight.
    const date = new Date(anchor.getFullYear(), anchor.getMonth(), anchor.getDate() - offset, 12);
    return getDateKey(date);
  });
}

function normalizeHistoryEntry(value, fallbackStatus) {
  if (typeof value === 'string') {
    return normalizeServiceStatus(value, fallbackStatus);
  }
  if (isPlainObject(value) && typeof value.status === 'string') {
    return normalizeServiceStatus(value.status, fallbackStatus);
  }
  return normalizeServiceStatus(fallbackStatus);
}

export function buildStatusSegments(history = {}, segmentCount = 30, fallbackStatus = 'operational', baseDate = new Date()) {
  const safeFallback = normalizeServiceStatus(fallbackStatus);
  const historyMap = isPlainObject(history) ? history : {};
  return getRecentDateKeys(segmentCount, baseDate).map((date) =>
    normalizeHistoryEntry(historyMap[date], safeFallback)
  );
}

export function buildStatusTimeline(history = {}, segmentCount = 30, fallbackStatus = 'operational', baseDate = new Date()) {
  const safeFallback = normalizeServiceStatus(fallbackStatus);
  const historyMap = isPlainObject(history) ? history : {};
  return getRecentDateKeys(segmentCount, baseDate).map((date) => {
    const status = normalizeHistoryEntry(historyMap[date], safeFallback);
    const meta = STATUS_META[status];
    return { date, status, label: meta.label, tone: meta.tone, sources: [] };
  });
}

export function formatDateTime(value) {
  if (!isValidDate(value)) {
    return 'Not set';
  }

  return new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short'
  }).format(new Date(value));
}

export function formatDateOnly(value) {
  if (!value) {
    return 'Unknown date';
  }

  const date = toLocalDate(value);

  if (Number.isNaN(date.getTime())) {
    return 'Unknown date';
  }

  return new Intl.DateTimeFormat(undefined, {
    dateStyle: 'full'
  }).format(date);
}

export function toDateTimeInputValue(value) {
  const date = new Date(value);
  if (!value || Number.isNaN(date.getTime())) {
    return '';
  }
  const offset = date.getTimezoneOffset() * 60000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
}

export function fromDateTimeInputValue(value) {
  if (!value) {
    return '';
  }
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '' : date.toISOString();
}

function parseDurationToMilliseconds(value) {
  const normalized = cleanString(value).toLowerCase();
  if (!normalized) {
    return DEFAULT_MAINTENANCE_MINUTES * 60 * 1000;
  }

  const numberOnly = Number(normalized);
  if (Number.isFinite(numberOnly) && numberOnly > 0) {
    return numberOnly * 60 * 1000;
  }

  const matches = [...normalized.matchAll(/(\d+(?:\.\d+)?)\s*(days?|d|hours?|hrs?|h|minutes?|mins?|m)\b/g)];
  if (!matches.length) {
    return DEFAULT_MAINTENANCE_MINUTES * 60 * 1000;
  }

  return matches.reduce((total, match) => {
    const amount = Number(match[1]);
    const unit = match[2];
    if (unit.startsWith('d')) {
      return total + amount * DAY_MS;
    }
    if (unit.startsWith('h')) {
      return total + amount * 60 * 60 * 1000;
    }
    return total + amount * 60 * 1000;
  }, 0);
}

export function formatDuration(startValue, endValue) {
  if (!isValidDate(startValue) || !isValidDate(endValue)) {
    return `${DEFAULT_MAINTENANCE_MINUTES} minutes`;
  }

  const totalMinutes = Math.max(1, Math.round((new Date(endValue) - new Date(startValue)) / 60000));
  const days = Math.floor(totalMinutes / 1440);
  const hours = Math.floor((totalMinutes % 1440) / 60);
  const minutes = totalMinutes % 60;
  const parts = [];

  if (days) {
    parts.push(`${days} day${days === 1 ? '' : 's'}`);
  }
  if (hours) {
    parts.push(`${hours} hour${hours === 1 ? '' : 's'}`);
  }
  if (minutes || !parts.length) {
    parts.push(`${minutes} minute${minutes === 1 ? '' : 's'}`);
  }

  return parts.join(' ');
}

function getMaintenanceEnd(item) {
  if (isValidDate(item?.endsAt)) {
    return new Date(item.endsAt);
  }
  if (!isValidDate(item?.scheduledFor)) {
    return null;
  }
  return new Date(new Date(item.scheduledFor).getTime() + parseDurationToMilliseconds(item.duration));
}

function getIncidentEnd(incident) {
  if (isValidDate(incident?.resolvedAt)) {
    return new Date(incident.resolvedAt);
  }
  if (RESOLVED_STATUS_PATTERN.test(cleanString(incident?.status)) && isValidDate(incident?.updatedAt)) {
    return new Date(incident.updatedAt);
  }
  return null;
}

export function isIncidentActiveAt(incident, at = new Date()) {
  const instant = at instanceof Date ? at : new Date(at);
  const start = new Date(incident?.startedAt || incident?.updatedAt);
  const end = getIncidentEnd(incident);

  if (Number.isNaN(instant.getTime()) || Number.isNaN(start.getTime()) || start > instant) {
    return false;
  }
  return !end || instant < end;
}

export function isMaintenanceActiveAt(item, at = new Date()) {
  const instant = at instanceof Date ? at : new Date(at);
  const start = new Date(item?.scheduledFor);
  const end = getMaintenanceEnd(item);

  if (Number.isNaN(instant.getTime()) || Number.isNaN(start.getTime()) || !end) {
    return false;
  }
  return start <= instant && instant < end;
}

function eventAffectsService(event, serviceId) {
  if (event?.affectsAllServices !== false) {
    return true;
  }
  return Array.isArray(event?.affectedServiceIds) && event.affectedServiceIds.includes(serviceId);
}

function eventOverlapsDate(startValue, endValue, dateKey) {
  if (!isValidDate(startValue)) {
    return false;
  }

  const dayStart = toLocalDate(dateKey);
  dayStart.setHours(0, 0, 0, 0);
  const nextDay = new Date(dayStart.getFullYear(), dayStart.getMonth(), dayStart.getDate() + 1);
  const start = new Date(startValue);
  const end = endValue && isValidDate(endValue) ? new Date(endValue) : null;

  // Event ranges are half-open: an event ending exactly at midnight does not
  // mark the following day. Constructing nextDay locally also handles DST.
  return start < nextDay && (!end || end > dayStart);
}

function chooseWorseStatus(left, right) {
  const leftStatus = normalizeServiceStatus(left);
  const rightStatus = normalizeServiceStatus(right);
  return STATUS_META[rightStatus].rank > STATUS_META[leftStatus].rank ? rightStatus : leftStatus;
}

function makeIncidentSource(incident) {
  const status = getIncidentDerivedStatus(incident.riskLevel);
  return {
    kind: 'incident',
    id: incident.id,
    title: incident.title,
    message: incident.message,
    status,
    label: STATUS_META[status].label,
    riskLevel: normalizeRiskLevel(incident.riskLevel),
    incidentStatus: incident.status,
    startedAt: incident.startedAt,
    endedAt: getIncidentEnd(incident)?.toISOString() || '',
    updatedAt: incident.updatedAt
  };
}

function makeMaintenanceSource(item) {
  const end = getMaintenanceEnd(item);
  return {
    kind: 'maintenance',
    id: item.id,
    title: item.title,
    message: item.message,
    status: 'maintenance',
    label: STATUS_META.maintenance.label,
    startedAt: item.scheduledFor,
    endedAt: end?.toISOString() || '',
    duration: item.duration
  };
}

export function buildServiceTimeline(
  service,
  incidents = [],
  maintenance = [],
  segmentCount = 30,
  baseDate = new Date()
) {
  const safeService = service || {};
  const serviceId = cleanString(safeService.id, slugify(safeService.name));
  const history = isPlainObject(safeService.history) ? safeService.history : {};
  const todayKey = getDateKey(baseDate);
  const activeEnd = baseDate instanceof Date ? baseDate : new Date(baseDate);
  const safeActiveEnd = Number.isNaN(activeEnd.getTime()) ? new Date() : activeEnd;

  return getRecentDateKeys(segmentCount, safeActiveEnd).map((date) => {
    const explicitHistory = Object.prototype.hasOwnProperty.call(history, date);
    const fallback = date === todayKey ? normalizeServiceStatus(safeService.status) : 'operational';
    let status = normalizeHistoryEntry(history[date], fallback);
    const sources = [];

    if (explicitHistory) {
      sources.push({
        kind: 'manual',
        title: 'Manual history entry',
        message: 'This date was set manually in the status editor.',
        status,
        label: STATUS_META[status].label
      });
    } else if (date === todayKey && status !== 'operational') {
      sources.push({
        kind: 'current',
        title: 'Current service status',
        message: 'This state comes from the service’s current status setting.',
        status,
        label: STATUS_META[status].label
      });
    }

    const maintenanceList = Array.isArray(maintenance) ? maintenance : [];
    maintenanceList.forEach((item) => {
      const end = getMaintenanceEnd(item);
      if (
        eventAffectsService(item, serviceId)
        && eventOverlapsDate(item.scheduledFor, end?.toISOString(), date)
      ) {
        const source = makeMaintenanceSource(item);
        status = chooseWorseStatus(status, source.status);
        sources.push(source);
      }
    });

    const incidentList = Array.isArray(incidents) ? incidents : [];
    incidentList.forEach((incident) => {
      const end = getIncidentEnd(incident) || safeActiveEnd;
      if (
        eventAffectsService(incident, serviceId)
        && eventOverlapsDate(incident.startedAt || incident.updatedAt, end.toISOString(), date)
      ) {
        const source = makeIncidentSource(incident);
        status = chooseWorseStatus(status, source.status);
        sources.push(source);
      }
    });

    sources.sort((left, right) => STATUS_META[right.status].rank - STATUS_META[left.status].rank);
    const meta = STATUS_META[status];
    return {
      date,
      status,
      label: meta.label,
      tone: meta.tone,
      isToday: date === todayKey,
      isAutomatic: sources.some((source) => source.kind === 'incident' || source.kind === 'maintenance'),
      sources
    };
  });
}

export function getEffectiveServiceStatus(service, incidents = [], maintenance = [], at = new Date()) {
  const serviceId = cleanString(service?.id, slugify(service?.name));
  let status = normalizeServiceStatus(service?.status);

  const maintenanceList = Array.isArray(maintenance) ? maintenance : [];
  maintenanceList.forEach((item) => {
    if (eventAffectsService(item, serviceId) && isMaintenanceActiveAt(item, at)) {
      status = chooseWorseStatus(status, 'maintenance');
    }
  });

  const incidentList = Array.isArray(incidents) ? incidents : [];
  incidentList.forEach((incident) => {
    if (eventAffectsService(incident, serviceId) && isIncidentActiveAt(incident, at)) {
      status = chooseWorseStatus(status, getIncidentDerivedStatus(incident.riskLevel));
    }
  });

  return status;
}

export function getEffectiveServices(services = [], incidents = [], maintenance = [], at = new Date()) {
  const serviceList = Array.isArray(services) ? services : [];
  return serviceList.map((service) => ({
    ...service,
    configuredStatus: normalizeServiceStatus(service.status),
    status: getEffectiveServiceStatus(service, incidents, maintenance, at)
  }));
}

export function getActiveIncidents(incidents = [], at = new Date()) {
  const incidentList = Array.isArray(incidents) ? incidents : [];
  return incidentList
    .filter((incident) => isIncidentActiveAt(incident, at))
    .sort((left, right) => new Date(right.updatedAt) - new Date(left.updatedAt));
}

export function getVisibleMaintenance(maintenance = [], at = new Date()) {
  const instant = at instanceof Date ? at : new Date(at);
  const maintenanceList = Array.isArray(maintenance) ? maintenance : [];
  return maintenanceList
    .filter((item) => {
      const end = getMaintenanceEnd(item);
      return end && end >= instant;
    })
    .sort((left, right) => new Date(left.scheduledFor) - new Date(right.scheduledFor));
}

export function getAffectedServiceNames(event, services = []) {
  if (event?.affectsAllServices !== false) {
    return ['All services'];
  }

  const serviceById = new Map((Array.isArray(services) ? services : []).map((service) => [service.id, service.name]));
  const names = (Array.isArray(event?.affectedServiceIds) ? event.affectedServiceIds : [])
    .map((id) => serviceById.get(id))
    .filter(Boolean);

  return names.length ? names : ['No services selected'];
}

export function getWorstServiceStatus(services = []) {
  const serviceList = Array.isArray(services) ? services : [];
  return serviceList.reduce((worst, service) => {
    const status = normalizeServiceStatus(service?.status, 'outage');
    const current = STATUS_META[status];
    return current.rank > worst.rank ? current : worst;
  }, STATUS_META.operational);
}

export function summarizeServices(services = []) {
  const summary = Object.fromEntries(SERVICE_STATUSES.map((status) => [status, 0]));
  const serviceList = Array.isArray(services) ? services : [];

  return serviceList.reduce((accumulator, service) => {
    const status = normalizeServiceStatus(service?.status, 'outage');
    accumulator[status] += 1;
    return accumulator;
  }, summary);
}

export function createEmptyService() {
  return {
    id: createRuntimeId('service'),
    name: '',
    description: '',
    status: 'operational',
    history: {}
  };
}

export function createEmptyIncident() {
  const now = new Date().toISOString();
  return {
    id: createRuntimeId('incident'),
    title: '',
    status: 'Investigating',
    impact: '',
    riskLevel: 'minor',
    startedAt: now,
    updatedAt: now,
    resolvedAt: '',
    affectsAllServices: true,
    affectedServiceIds: [],
    message: ''
  };
}

export function createEmptyMaintenance() {
  const start = new Date();
  const end = new Date(start.getTime() + DEFAULT_MAINTENANCE_MINUTES * 60 * 1000);
  return {
    id: createRuntimeId('maintenance'),
    title: '',
    scheduledFor: start.toISOString(),
    endsAt: end.toISOString(),
    duration: formatDuration(start, end),
    affectsAllServices: true,
    affectedServiceIds: [],
    message: ''
  };
}

function normalizeHistory(history) {
  if (!isPlainObject(history)) {
    return {};
  }

  return Object.entries(history).reduce((normalized, [date, value]) => {
    if (isValidDateKey(date)) {
      normalized[date] = normalizeHistoryEntry(value, 'operational');
    }
    return normalized;
  }, {});
}

function normalizeServices(services) {
  const usedIds = new Set();
  return (Array.isArray(services) ? services : []).map((service = {}, index) => ({
    id: createStableId('service', service.id, service.name, index, usedIds),
    name: cleanString(service.name),
    description: cleanString(service.description),
    status: normalizeServiceStatus(service.status),
    history: normalizeHistory(service.history)
  }));
}

function normalizeEventScope(event, services) {
  const rawIds = Array.isArray(event?.affectedServiceIds)
    ? event.affectedServiceIds
    : Array.isArray(event?.affectedServices)
      ? event.affectedServices
      : [];
  const serviceByName = new Map(services.map((service) => [service.name.toLowerCase(), service.id]));
  const normalizedIds = [...new Set(rawIds
    .map((value) => cleanString(value).toLowerCase())
    .filter(Boolean)
    .map((value) => serviceByName.get(value) || value))];
  const hasExplicitScope = typeof event?.affectsAllServices === 'boolean';

  return {
    affectsAllServices: hasExplicitScope ? event.affectsAllServices : normalizedIds.length === 0,
    affectedServiceIds: normalizedIds
  };
}

function normalizeIncidents(incidents, services) {
  const usedIds = new Set();
  const fallbackNow = new Date().toISOString();

  return (Array.isArray(incidents) ? incidents : []).map((incident = {}, index) => {
    const status = cleanString(incident.status, 'Investigating');
    const updatedAt = normalizeDateTime(incident.updatedAt, fallbackNow);
    const startedAt = normalizeDateTime(incident.startedAt, updatedAt);
    const explicitResolvedAt = normalizeDateTime(incident.resolvedAt, '');
    const resolvedAt = explicitResolvedAt || (RESOLVED_STATUS_PATTERN.test(status) ? updatedAt : '');

    return {
      id: createStableId('incident', incident.id, incident.title, index, usedIds),
      title: cleanString(incident.title),
      status,
      impact: cleanString(incident.impact),
      riskLevel: normalizeRiskLevel(incident.riskLevel),
      startedAt,
      updatedAt,
      resolvedAt,
      ...normalizeEventScope(incident, services),
      message: cleanString(incident.message)
    };
  });
}

function normalizeMaintenance(maintenance, services) {
  const usedIds = new Set();
  const fallbackStart = new Date().toISOString();

  return (Array.isArray(maintenance) ? maintenance : []).map((item = {}, index) => {
    const scheduledFor = normalizeDateTime(item.scheduledFor, fallbackStart);
    const parsedEnd = getMaintenanceEnd({ ...item, scheduledFor });
    const endsAt = parsedEnd?.toISOString()
      || new Date(new Date(scheduledFor).getTime() + DEFAULT_MAINTENANCE_MINUTES * 60000).toISOString();

    return {
      id: createStableId('maintenance', item.id, item.title, index, usedIds),
      title: cleanString(item.title),
      scheduledFor,
      endsAt,
      duration: formatDuration(scheduledFor, endsAt),
      ...normalizeEventScope(item, services),
      message: cleanString(item.message)
    };
  });
}

export function normalizeStatusConfig(config = {}) {
  const page = isPlainObject(config.page) ? config.page : {};
  const services = normalizeServices(config.services);

  return {
    page: {
      title: cleanString(page.title, DEFAULT_PAGE.title),
      description: cleanString(page.description, DEFAULT_PAGE.description),
      supportEmail: cleanString(page.supportEmail, DEFAULT_PAGE.supportEmail)
    },
    services,
    incidents: normalizeIncidents(config.incidents, services),
    maintenance: normalizeMaintenance(config.maintenance, services)
  };
}

function assertNonEmptyString(value, fieldName) {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error(`${fieldName} is required`);
  }
}

function assertValidDate(value, fieldName) {
  assertNonEmptyString(value, fieldName);
  if (!isValidDate(value)) {
    throw new Error(`${fieldName} must be a valid date/time`);
  }
}

function validateRawStatus(value, fieldName) {
  const status = typeof value === 'string' ? value.trim().toLowerCase() : '';
  if (!STATUS_SET.has(status)) {
    throw new Error(`${fieldName} has an unsupported status`);
  }
}

export function validateStatusConfig(config = {}) {
  if (!isPlainObject(config)) {
    throw new Error('Configuration must be an object');
  }

  if (!Array.isArray(config.services) || !Array.isArray(config.incidents) || !Array.isArray(config.maintenance)) {
    throw new Error('Services, incidents and maintenance must be arrays');
  }

  config.services.forEach((service, index) => {
    validateRawStatus(service?.status, `Service ${index + 1}`);
    if (isPlainObject(service?.history)) {
      Object.entries(service.history).forEach(([date, value]) => {
        if (!isValidDateKey(date)) {
          throw new Error(`Service ${index + 1} history contains an invalid date`);
        }
        const rawStatus = isPlainObject(value) ? value.status : value;
        validateRawStatus(rawStatus, `Service ${index + 1} history on ${date}`);
      });
    }
  });

  config.incidents.forEach((incident, index) => {
    const rawRiskLevel = typeof incident?.riskLevel === 'string' ? incident.riskLevel.trim().toLowerCase() : '';
    if (!RISK_LEVEL_SET.has(rawRiskLevel)) {
      throw new Error(`Incident ${index + 1} has an unsupported risk level`);
    }
  });

  const normalized = normalizeStatusConfig(config);
  assertNonEmptyString(normalized.page.title, 'Page title');
  assertNonEmptyString(normalized.page.description, 'Page description');
  assertNonEmptyString(normalized.page.supportEmail, 'Support email');
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized.page.supportEmail)) {
    throw new Error('Support email must be a valid email address');
  }

  const serviceIds = new Set(normalized.services.map((service) => service.id));
  const serviceNames = new Set();
  normalized.services.forEach((service, index) => {
    assertNonEmptyString(service.id, `Service ${index + 1} ID`);
    assertNonEmptyString(service.name, `Service ${index + 1} name`);
    assertNonEmptyString(service.description, `Service ${index + 1} description`);
    const comparableName = service.name.toLowerCase();
    if (serviceNames.has(comparableName)) {
      throw new Error(`Service names must be unique; “${service.name}” is repeated`);
    }
    serviceNames.add(comparableName);
  });

  normalized.incidents.forEach((incident, index) => {
    assertNonEmptyString(incident.title, `Incident ${index + 1} title`);
    assertNonEmptyString(incident.status, `Incident ${index + 1} status`);
    assertNonEmptyString(incident.message, `Incident ${index + 1} message`);
    assertValidDate(incident.startedAt, `Incident ${index + 1} start time`);
    assertValidDate(incident.updatedAt, `Incident ${index + 1} updated time`);
    if (new Date(incident.updatedAt) < new Date(incident.startedAt)) {
      throw new Error(`Incident ${index + 1} updated time cannot be before its start time`);
    }
    if (incident.resolvedAt) {
      assertValidDate(incident.resolvedAt, `Incident ${index + 1} resolved time`);
      if (new Date(incident.resolvedAt) < new Date(incident.startedAt)) {
        throw new Error(`Incident ${index + 1} resolved time cannot be before its start time`);
      }
    }
    incident.affectedServiceIds.forEach((serviceId) => {
      if (!serviceIds.has(serviceId)) {
        throw new Error(`Incident ${index + 1} references an unknown service`);
      }
    });
    if (!incident.affectsAllServices && !incident.affectedServiceIds.length) {
      throw new Error(`Incident ${index + 1} must affect at least one service`);
    }
  });

  normalized.maintenance.forEach((item, index) => {
    assertNonEmptyString(item.title, `Maintenance ${index + 1} title`);
    assertValidDate(item.scheduledFor, `Maintenance ${index + 1} start time`);
    assertValidDate(item.endsAt, `Maintenance ${index + 1} end time`);
    if (new Date(item.endsAt) <= new Date(item.scheduledFor)) {
      throw new Error(`Maintenance ${index + 1} end time must be after its start time`);
    }
    assertNonEmptyString(item.message, `Maintenance ${index + 1} message`);
    item.affectedServiceIds.forEach((serviceId) => {
      if (!serviceIds.has(serviceId)) {
        throw new Error(`Maintenance ${index + 1} references an unknown service`);
      }
    });
    if (!item.affectsAllServices && !item.affectedServiceIds.length) {
      throw new Error(`Maintenance ${index + 1} must affect at least one service`);
    }
  });

  return normalized;
}
