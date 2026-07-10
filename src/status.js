export const STATUS_META = Object.freeze({
  operational: Object.freeze({ label: 'Operational', rank: 0, tone: 'good' }),
  degraded: Object.freeze({ label: 'Degraded Performance', rank: 1, tone: 'warn' }),
  maintenance: Object.freeze({ label: 'Maintenance', rank: 2, tone: 'info' }),
  outage: Object.freeze({ label: 'Major Outage', rank: 3, tone: 'bad' })
});

export const SERVICE_STATUSES = Object.freeze(Object.keys(STATUS_META));
export const STATUS_SET = Object.freeze(new Set(SERVICE_STATUSES));

export const RISK_LEVEL_META = Object.freeze({
  minor: Object.freeze({ label: 'Minor', rank: 1, tone: 'warn' }),
  major: Object.freeze({ label: 'Major', rank: 2, tone: 'bad' }),
  critical: Object.freeze({ label: 'Critical', rank: 3, tone: 'bad' })
});

export const RISK_LEVELS = Object.freeze(Object.keys(RISK_LEVEL_META));
export const RISK_LEVEL_SET = Object.freeze(new Set(RISK_LEVELS));

export const DEFAULT_PAGE = Object.freeze({
  title: 'Xpedeon Status',
  description: 'Live service availability for Xpedeon products and supporting systems.',
  supportEmail: 'support@example.com'
});

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function cleanString(value, fallback = '') {
  return typeof value === 'string' ? value.trim() : fallback;
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

export function getDateKey(value = new Date()) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) {
    return getDateKey(new Date());
  }
  return date.toISOString().slice(0, 10);
}

export function getRecentDateKeys(segmentCount = 30, baseDate = new Date()) {
  const safeCount = Number.isInteger(segmentCount) && segmentCount > 0 ? Math.min(segmentCount, 366) : 30;
  const base = baseDate instanceof Date ? baseDate : new Date(baseDate);
  const anchor = Number.isNaN(base.getTime()) ? new Date() : base;

  return Array.from({ length: safeCount }, (_item, index) => {
    const offset = safeCount - 1 - index;
    const date = new Date(Date.UTC(anchor.getUTCFullYear(), anchor.getUTCMonth(), anchor.getUTCDate() - offset));
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
    return { date, status, label: meta.label, tone: meta.tone };
  });
}

export function formatDateTime(value) {
  if (!value) {
    return 'Not set';
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return 'Not set';
  }

  return new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short'
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
    name: '',
    description: '',
    status: 'operational',
    history: {}
  };
}

export function createEmptyIncident() {
  return {
    title: '',
    status: 'Investigating',
    impact: '',
    riskLevel: 'minor',
    updatedAt: new Date().toISOString(),
    message: ''
  };
}

export function createEmptyMaintenance() {
  return {
    title: '',
    scheduledFor: new Date().toISOString(),
    duration: '30 minutes',
    message: ''
  };
}

function normalizeHistory(history) {
  if (!isPlainObject(history)) {
    return {};
  }

  return Object.entries(history).reduce((normalized, [date, value]) => {
    if (/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      normalized[date] = normalizeHistoryEntry(value, 'operational');
    }
    return normalized;
  }, {});
}

function normalizeService(service = {}) {
  return {
    name: cleanString(service.name),
    description: cleanString(service.description),
    status: normalizeServiceStatus(service.status),
    history: normalizeHistory(service.history)
  };
}

function normalizeIncident(incident = {}) {
  return {
    title: cleanString(incident.title),
    status: cleanString(incident.status, 'Investigating'),
    impact: cleanString(incident.impact),
    riskLevel: normalizeRiskLevel(incident.riskLevel),
    updatedAt: cleanString(incident.updatedAt) || new Date().toISOString(),
    message: cleanString(incident.message)
  };
}

function normalizeMaintenance(item = {}) {
  return {
    title: cleanString(item.title),
    scheduledFor: cleanString(item.scheduledFor) || new Date().toISOString(),
    duration: cleanString(item.duration, '30 minutes'),
    message: cleanString(item.message)
  };
}

export function normalizeStatusConfig(config = {}) {
  const page = isPlainObject(config.page) ? config.page : {};

  return {
    page: {
      title: cleanString(page.title, DEFAULT_PAGE.title),
      description: cleanString(page.description, DEFAULT_PAGE.description),
      supportEmail: cleanString(page.supportEmail, DEFAULT_PAGE.supportEmail)
    },
    services: Array.isArray(config.services) ? config.services.map(normalizeService) : [],
    incidents: Array.isArray(config.incidents) ? config.incidents.map(normalizeIncident) : [],
    maintenance: Array.isArray(config.maintenance) ? config.maintenance.map(normalizeMaintenance) : []
  };
}

function assertNonEmptyString(value, fieldName) {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error(`${fieldName} is required`);
  }
}

function assertValidDate(value, fieldName) {
  assertNonEmptyString(value, fieldName);
  if (Number.isNaN(new Date(value).getTime())) {
    throw new Error(`${fieldName} must be a valid date/time`);
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
    const rawStatus = typeof service?.status === 'string' ? service.status.trim().toLowerCase() : '';
    if (!STATUS_SET.has(rawStatus)) {
      throw new Error(`Service ${index + 1} has an unsupported status`);
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

  normalized.services.forEach((service, index) => {
    assertNonEmptyString(service.name, `Service ${index + 1} name`);
    assertNonEmptyString(service.description, `Service ${index + 1} description`);
  });

  normalized.incidents.forEach((incident, index) => {
    assertNonEmptyString(incident.title, `Incident ${index + 1} title`);
    assertNonEmptyString(incident.status, `Incident ${index + 1} status`);
    assertNonEmptyString(incident.message, `Incident ${index + 1} message`);
    assertValidDate(incident.updatedAt, `Incident ${index + 1} updated time`);
  });

  normalized.maintenance.forEach((item, index) => {
    assertNonEmptyString(item.title, `Maintenance ${index + 1} title`);
    assertValidDate(item.scheduledFor, `Maintenance ${index + 1} start time`);
    assertNonEmptyString(item.duration, `Maintenance ${index + 1} duration`);
    assertNonEmptyString(item.message, `Maintenance ${index + 1} message`);
  });

  return normalized;
}
