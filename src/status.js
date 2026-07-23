export const CORE_STATUS_IDS = Object.freeze(['operational', 'degraded', 'maintenance', 'outage']);

export const DEFAULT_STATUS_CATEGORIES = Object.freeze([
  Object.freeze({ id: 'operational', label: 'Operational', color: '#159957', rank: 0, tone: 'good' }),
  Object.freeze({ id: 'degraded', label: 'Degraded Performance', color: '#BA6D00', rank: 1, tone: 'warn' }),
  Object.freeze({ id: 'maintenance', label: 'Maintenance', color: '#2563EB', rank: 2, tone: 'info' }),
  Object.freeze({ id: 'outage', label: 'Major Outage', color: '#D92828', rank: 3, tone: 'bad' })
]);

export const STATUS_META = Object.freeze(Object.fromEntries(
  DEFAULT_STATUS_CATEGORIES.map((category) => [category.id, category])
));

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
const STATUS_ID_PATTERN = /^[a-z0-9][a-z0-9_-]{0,63}$/;
const HEX_COLOR_PATTERN = /^#[0-9a-f]{6}$/i;
const DEFAULT_MAINTENANCE_MINUTES = 30;
const DAY_MS = 24 * 60 * 60 * 1000;
export const REPORT_RETENTION_DAYS = 30;
export const DEFAULT_HISTORY_DAYS = 30;
export const MIN_HISTORY_DAYS = 1;
export const MAX_HISTORY_DAYS = 60;

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

function getToneForRank(rank) {
  if (rank <= 0) return 'good';
  if (rank <= 1) return 'warn';
  if (rank <= 2) return 'info';
  return 'bad';
}

function normalizeStatusCategoryId(value) {
  const id = typeof value === 'string' ? value.trim().toLowerCase() : '';
  return STATUS_ID_PATTERN.test(id) ? id : '';
}

function normalizeStatusColor(value, fallback = '#6D28D9') {
  const color = typeof value === 'string' ? value.trim() : '';
  return HEX_COLOR_PATTERN.test(color) ? color.toUpperCase() : fallback;
}

export function normalizeStatusCategories(categories) {
  const rawCategories = Array.isArray(categories) && categories.length
    ? categories
    : DEFAULT_STATUS_CATEGORIES;
  const defaultsById = new Map(DEFAULT_STATUS_CATEGORIES.map((category) => [category.id, category]));
  const seenIds = new Set();
  const normalized = [];

  rawCategories.forEach((category = {}, index) => {
    const id = normalizeStatusCategoryId(category.id);
    if (!id || seenIds.has(id)) {
      return;
    }

    const defaults = defaultsById.get(id);
    const rawRank = Number(category.rank);
    const rank = Number.isInteger(rawRank) && rawRank >= 0 && rawRank <= 100
      ? rawRank
      : defaults?.rank ?? Math.min(index, 100);
    normalized.push({
      id,
      label: cleanString(category.label, defaults?.label || id.replace(/[-_]+/g, ' ')),
      color: normalizeStatusColor(category.color, defaults?.color),
      rank,
      tone: defaults?.tone || getToneForRank(rank)
    });
    seenIds.add(id);
  });

  DEFAULT_STATUS_CATEGORIES.forEach((category) => {
    if (!seenIds.has(category.id)) {
      normalized.push({ ...category });
    }
  });

  return normalized
    .map((category, index) => ({ ...category, _order: index }))
    .sort((left, right) => left.rank - right.rank || left._order - right._order)
    .map(({ _order, ...category }) => category);
}

export function getStatusMetaMap(categories) {
  if (categories === undefined) {
    return STATUS_META;
  }
  return Object.fromEntries(
    normalizeStatusCategories(categories).map((category) => [category.id, category])
  );
}

export function getStatusDefinition(status, categories, fallbackStatus = 'operational') {
  const meta = getStatusMetaMap(categories);
  const normalized = normalizeServiceStatus(status, fallbackStatus, categories);
  return meta[normalized] || meta.operational || STATUS_META.operational;
}

export function createEmptyStatusCategory(categories = []) {
  const normalized = normalizeStatusCategories(categories);
  const highestRank = normalized.reduce((highest, category) => Math.max(highest, category.rank), 0);
  return {
    id: createRuntimeId('status'),
    label: 'New status',
    color: '#6D28D9',
    rank: Math.min(highestRank + 1, 100)
  };
}

export function normalizeServiceStatus(value, fallbackStatus = 'operational', categories) {
  const statusSet = new Set(normalizeStatusCategories(categories).map((category) => category.id));
  const status = typeof value === 'string' ? value.trim().toLowerCase() : '';
  if (statusSet.has(status)) {
    return status;
  }

  const safeFallback = typeof fallbackStatus === 'string' ? fallbackStatus.trim().toLowerCase() : '';
  return statusSet.has(safeFallback) ? safeFallback : 'operational';
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

function normalizeHistoryEntry(value, fallbackStatus, categories) {
  if (typeof value === 'string') {
    return normalizeServiceStatus(value, fallbackStatus, categories);
  }
  if (isPlainObject(value) && typeof value.status === 'string') {
    return normalizeServiceStatus(value.status, fallbackStatus, categories);
  }
  return normalizeServiceStatus(fallbackStatus, 'operational', categories);
}

export function buildStatusSegments(history = {}, segmentCount = 30, fallbackStatus = 'operational', baseDate = new Date(), categories) {
  const safeFallback = normalizeServiceStatus(fallbackStatus, 'operational', categories);
  const historyMap = isPlainObject(history) ? history : {};
  return getRecentDateKeys(segmentCount, baseDate).map((date) =>
    normalizeHistoryEntry(historyMap[date], safeFallback, categories)
  );
}

export function buildStatusTimeline(history = {}, segmentCount = 30, fallbackStatus = 'operational', baseDate = new Date(), categories) {
  const safeFallback = normalizeServiceStatus(fallbackStatus, 'operational', categories);
  const historyMap = isPlainObject(history) ? history : {};
  const statusMeta = getStatusMetaMap(categories);
  return getRecentDateKeys(segmentCount, baseDate).map((date) => {
    const status = normalizeHistoryEntry(historyMap[date], safeFallback, categories);
    const meta = statusMeta[status];
    return { date, status, label: meta.label, tone: meta.tone, color: meta.color, sources: [] };
  });
}

export function formatDateTime(value) {
  if (!isValidDate(value)) {
    return 'Not set';
  }

  const date = new Date(value);
  const local = new Intl.DateTimeFormat(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    timeZoneName: 'short'
  }).format(date);
  const standard = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'UTC',
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false
  }).format(date);
  return `${local} · ${standard} UTC`;
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

export function isIncidentResolved(incident) {
  return isValidDate(incident?.resolvedAt)
    || RESOLVED_STATUS_PATTERN.test(cleanString(incident?.status));
}

function getIncidentEnd(incident) {
  if (isValidDate(incident?.resolvedAt)) {
    return new Date(incident.resolvedAt);
  }
  if (isIncidentResolved(incident) && isValidDate(incident?.updatedAt)) {
    return new Date(incident.updatedAt);
  }
  return null;
}

export function resolveIncident(incident = {}, at = new Date()) {
  const requestedDate = at instanceof Date ? at : new Date(at);
  let resolvedDate = Number.isNaN(requestedDate.getTime()) ? new Date() : requestedDate;
  const startedAt = new Date(incident?.startedAt || incident?.updatedAt);

  // A resolution cannot precede the incident. Clamping here keeps the admin
  // action safe even when an incident was accidentally scheduled in future.
  if (!Number.isNaN(startedAt.getTime()) && resolvedDate < startedAt) {
    resolvedDate = startedAt;
  }

  const resolvedAt = resolvedDate.toISOString();
  return {
    ...incident,
    status: 'Resolved',
    updatedAt: resolvedAt,
    resolvedAt
  };
}

export function createIncidentFollowUp(incident = {}, at = new Date()) {
  return {
    ...createEmptyIncident(at),
    title: cleanString(incident.title),
    impact: cleanString(incident.impact),
    riskLevel: normalizeRiskLevel(incident.riskLevel),
    affectsAllServices: incident.affectsAllServices !== false,
    affectedServiceIds: Array.isArray(incident.affectedServiceIds)
      ? [...incident.affectedServiceIds]
      : [],
    message: cleanString(incident.message)
  };
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

function chooseWorseStatus(left, right, categories) {
  const statusMeta = getStatusMetaMap(categories);
  const leftStatus = normalizeServiceStatus(left, 'operational', categories);
  const rightStatus = normalizeServiceStatus(right, 'operational', categories);
  return statusMeta[rightStatus].rank > statusMeta[leftStatus].rank ? rightStatus : leftStatus;
}

function makeIncidentSource(incident, categories) {
  const status = getIncidentDerivedStatus(incident.riskLevel);
  const meta = getStatusDefinition(status, categories);
  return {
    kind: 'incident',
    id: incident.id,
    title: incident.title,
    message: incident.message,
    status,
    label: meta.label,
    riskLevel: normalizeRiskLevel(incident.riskLevel),
    incidentStatus: incident.status,
    startedAt: incident.startedAt,
    endedAt: getIncidentEnd(incident)?.toISOString() || '',
    updatedAt: incident.updatedAt,
    updates: incident.updates || []
  };
}

function makeMaintenanceSource(item, categories) {
  const end = getMaintenanceEnd(item);
  const meta = getStatusDefinition('maintenance', categories);
  return {
    kind: 'maintenance',
    id: item.id,
    title: item.title,
    message: item.message,
    status: 'maintenance',
    label: meta.label,
    startedAt: item.scheduledFor,
    endedAt: end?.toISOString() || '',
    duration: item.duration,
    updates: item.updates || []
  };
}

export function buildServiceTimeline(
  service,
  incidents = [],
  maintenance = [],
  segmentCount = 30,
  baseDate = new Date(),
  categories
) {
  const safeService = service || {};
  const serviceId = cleanString(safeService.id, slugify(safeService.name));
  const history = isPlainObject(safeService.history) ? safeService.history : {};
  const todayKey = getDateKey(baseDate);
  const activeEnd = baseDate instanceof Date ? baseDate : new Date(baseDate);
  const safeActiveEnd = Number.isNaN(activeEnd.getTime()) ? new Date() : activeEnd;

  return getRecentDateKeys(segmentCount, safeActiveEnd).map((date) => {
    const explicitHistory = Object.prototype.hasOwnProperty.call(history, date);
    const fallback = date === todayKey
      ? normalizeServiceStatus(safeService.status, 'operational', categories)
      : 'operational';
    let status = normalizeHistoryEntry(history[date], fallback, categories);
    const sources = [];

    if (explicitHistory) {
      sources.push({
        kind: 'manual',
        title: 'Manual history entry',
        message: 'This date was set manually in the status editor.',
        status,
        label: getStatusDefinition(status, categories).label
      });
    } else if (date === todayKey && status !== 'operational') {
      sources.push({
        kind: 'current',
        title: 'Current service status',
        message: 'This state comes from the service’s current status setting.',
        status,
        label: getStatusDefinition(status, categories).label
      });
    }

    const maintenanceList = Array.isArray(maintenance) ? maintenance : [];
    maintenanceList.forEach((item) => {
      const end = getMaintenanceEnd(item);
      if (
        eventAffectsService(item, serviceId)
        && eventOverlapsDate(item.scheduledFor, end?.toISOString(), date)
      ) {
        const source = makeMaintenanceSource(item, categories);
        status = chooseWorseStatus(status, source.status, categories);
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
        const source = makeIncidentSource(incident, categories);
        status = chooseWorseStatus(status, source.status, categories);
        sources.push(source);
      }
    });

    const statusMeta = getStatusMetaMap(categories);
    sources.sort((left, right) => statusMeta[right.status].rank - statusMeta[left.status].rank);
    const meta = statusMeta[status];
    return {
      date,
      status,
      label: meta.label,
      tone: meta.tone,
      color: meta.color,
      isToday: date === todayKey,
      isAutomatic: sources.some((source) => source.kind === 'incident' || source.kind === 'maintenance'),
      sources
    };
  });
}

export function getEffectiveServiceStatus(service, incidents = [], maintenance = [], at = new Date(), categories) {
  const serviceId = cleanString(service?.id, slugify(service?.name));
  let status = normalizeServiceStatus(service?.status, 'operational', categories);

  const maintenanceList = Array.isArray(maintenance) ? maintenance : [];
  maintenanceList.forEach((item) => {
    if (eventAffectsService(item, serviceId) && isMaintenanceActiveAt(item, at)) {
      status = chooseWorseStatus(status, 'maintenance', categories);
    }
  });

  const incidentList = Array.isArray(incidents) ? incidents : [];
  incidentList.forEach((incident) => {
    if (eventAffectsService(incident, serviceId) && isIncidentActiveAt(incident, at)) {
      status = chooseWorseStatus(status, getIncidentDerivedStatus(incident.riskLevel), categories);
    }
  });

  return status;
}

export function getEffectiveServices(services = [], incidents = [], maintenance = [], at = new Date(), categories) {
  const serviceList = Array.isArray(services) ? services : [];
  return serviceList.map((service) => ({
    ...service,
    configuredStatus: normalizeServiceStatus(service.status, 'operational', categories),
    status: getEffectiveServiceStatus(service, incidents, maintenance, at, categories)
  }));
}

export function getActiveIncidents(incidents = [], at = new Date()) {
  const incidentList = Array.isArray(incidents) ? incidents : [];
  return incidentList
    .filter((incident) => isIncidentActiveAt(incident, at))
    .sort((left, right) => new Date(right.updatedAt) - new Date(left.updatedAt));
}

export function getResolvedIncidents(incidents = [], at = new Date(), lookbackDays = 30) {
  const instant = at instanceof Date ? at : new Date(at);
  if (Number.isNaN(instant.getTime())) {
    return [];
  }

  const safeLookback = Number.isFinite(lookbackDays) && lookbackDays > 0
    ? Math.min(Math.floor(lookbackDays), 3660)
    : 30;
  const cutoff = new Date(instant.getTime() - safeLookback * DAY_MS);
  const incidentList = Array.isArray(incidents) ? incidents : [];

  return incidentList
    .map((incident) => ({ incident, endedAt: getIncidentEnd(incident) }))
    .filter(({ endedAt }) => endedAt && endedAt <= instant && endedAt >= cutoff)
    .sort((left, right) => right.endedAt - left.endedAt)
    .map(({ incident }) => incident);
}

export function getVisibleMaintenance(maintenance = [], at = new Date(), lookbackDays = REPORT_RETENTION_DAYS) {
  const instant = at instanceof Date ? at : new Date(at);
  if (Number.isNaN(instant.getTime())) {
    return [];
  }
  const safeLookback = Number.isFinite(lookbackDays) && lookbackDays > 0
    ? Math.min(Math.floor(lookbackDays), 3660)
    : REPORT_RETENTION_DAYS;
  const cutoff = new Date(instant.getTime() - safeLookback * DAY_MS);
  const maintenanceList = Array.isArray(maintenance) ? maintenance : [];
  return maintenanceList
    .filter((item) => {
      const end = getMaintenanceEnd(item);
      return end && end >= cutoff;
    })
    .sort((left, right) => {
      const leftActive = isMaintenanceActiveAt(left, instant);
      const rightActive = isMaintenanceActiveAt(right, instant);
      if (leftActive !== rightActive) return leftActive ? -1 : 1;
      const leftEnd = getMaintenanceEnd(left);
      const rightEnd = getMaintenanceEnd(right);
      const leftPast = leftEnd < instant;
      const rightPast = rightEnd < instant;
      if (leftPast !== rightPast) return leftPast ? 1 : -1;
      return leftPast
        ? rightEnd - leftEnd
        : new Date(left.scheduledFor) - new Date(right.scheduledFor);
    });
}

export function pruneExpiredReports(config = {}, at = new Date(), retentionDays = REPORT_RETENTION_DAYS) {
  const instant = at instanceof Date ? at : new Date(at);
  if (Number.isNaN(instant.getTime())) {
    return config;
  }
  const safeRetention = Number.isFinite(retentionDays) && retentionDays > 0
    ? Math.min(Math.floor(retentionDays), 3660)
    : REPORT_RETENTION_DAYS;
  const cutoff = new Date(instant.getTime() - safeRetention * DAY_MS);

  return {
    ...config,
    incidents: (Array.isArray(config.incidents) ? config.incidents : []).filter((incident) => {
      const endedAt = getIncidentEnd(incident);
      return !endedAt || endedAt >= cutoff;
    }),
    maintenance: (Array.isArray(config.maintenance) ? config.maintenance : []).filter((item) => {
      const endedAt = getMaintenanceEnd(item);
      return !endedAt || endedAt >= cutoff;
    })
  };
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

export function getWorstServiceStatus(services = [], categories) {
  const serviceList = Array.isArray(services) ? services : [];
  const statusMeta = getStatusMetaMap(categories);
  return serviceList.reduce((worst, service) => {
    const status = normalizeServiceStatus(service?.status, 'outage', categories);
    const current = statusMeta[status];
    return !worst || current.rank > worst.rank ? current : worst;
  }, null) || statusMeta.operational;
}

export function summarizeServices(services = [], categories) {
  const statusCategories = normalizeStatusCategories(categories);
  const summary = Object.fromEntries(statusCategories.map((category) => [category.id, 0]));
  const serviceList = Array.isArray(services) ? services : [];

  return serviceList.reduce((accumulator, service) => {
    const status = normalizeServiceStatus(service?.status, 'outage', categories);
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
    showHistory: true,
    historyDays: DEFAULT_HISTORY_DAYS,
    history: {}
  };
}

export function createEmptyIncident(at = new Date()) {
  const requestedDate = at instanceof Date ? at : new Date(at);
  const now = (Number.isNaN(requestedDate.getTime()) ? new Date() : requestedDate).toISOString();
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
    message: '',
    updates: []
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
    message: '',
    updates: []
  };
}

export function createEventUpdate({ status = '', riskLevel = '', at = new Date() } = {}) {
  const requestedDate = at instanceof Date ? at : new Date(at);
  const createdAt = (Number.isNaN(requestedDate.getTime()) ? new Date() : requestedDate).toISOString();
  const normalizedRiskLevel = typeof riskLevel === 'string' ? riskLevel.trim().toLowerCase() : '';
  return {
    id: createRuntimeId('update'),
    status: cleanString(status),
    ...(RISK_LEVEL_SET.has(normalizedRiskLevel) ? { riskLevel: normalizedRiskLevel } : {}),
    message: '',
    createdAt
  };
}

function normalizeUpdates(updates, fallbackStatus = '', fallbackRiskLevel = '') {
  const usedIds = new Set();
  const includeRiskLevel = RISK_LEVEL_SET.has(fallbackRiskLevel);
  return (Array.isArray(updates) ? updates : [])
    .map((update = {}, index) => ({
      id: createStableId('update', update.id, update.message, index, usedIds),
      status: cleanString(update.status, fallbackStatus),
      ...(includeRiskLevel ? { riskLevel: normalizeRiskLevel(update.riskLevel, fallbackRiskLevel) } : {}),
      message: cleanString(update.message),
      createdAt: normalizeDateTime(update.createdAt, '')
    }))
    .sort((left, right) => new Date(left.createdAt) - new Date(right.createdAt));
}

function normalizeHistory(history, categories) {
  if (!isPlainObject(history)) {
    return {};
  }

  return Object.entries(history).reduce((normalized, [date, value]) => {
    if (isValidDateKey(date)) {
      normalized[date] = normalizeHistoryEntry(value, 'operational', categories);
    }
    return normalized;
  }, {});
}

function normalizeServices(services, categories) {
  const usedIds = new Set();
  return (Array.isArray(services) ? services : []).map((service = {}, index) => ({
    id: createStableId('service', service.id, service.name, index, usedIds),
    name: cleanString(service.name),
    description: cleanString(service.description),
    status: normalizeServiceStatus(service.status, 'operational', categories),
    showHistory: service.showHistory !== false,
    historyDays: Number.isInteger(service.historyDays)
      ? Math.min(MAX_HISTORY_DAYS, Math.max(MIN_HISTORY_DAYS, service.historyDays))
      : DEFAULT_HISTORY_DAYS,
    history: normalizeHistory(service.history, categories)
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
    const rawStatus = cleanString(incident.status, 'Investigating');
    const rawUpdatedAt = normalizeDateTime(incident.updatedAt, fallbackNow);
    const startedAt = normalizeDateTime(incident.startedAt, rawUpdatedAt);
    const explicitResolvedAt = normalizeDateTime(incident.resolvedAt, '');
    const resolvedAt = explicitResolvedAt || (RESOLVED_STATUS_PATTERN.test(rawStatus) ? rawUpdatedAt : '');
    const riskLevel = normalizeRiskLevel(incident.riskLevel);
    const updates = normalizeUpdates(incident.updates, rawStatus, riskLevel);
    const latestUpdateAt = updates.at(-1)?.createdAt;
    const effectiveUpdatedAt = latestUpdateAt && new Date(latestUpdateAt) > new Date(rawUpdatedAt)
      ? latestUpdateAt
      : rawUpdatedAt;
    const updatedAt = resolvedAt && new Date(resolvedAt) > new Date(effectiveUpdatedAt)
      ? resolvedAt
      : effectiveUpdatedAt;
    const status = resolvedAt ? 'Resolved' : rawStatus;

    return {
      id: createStableId('incident', incident.id, incident.title, index, usedIds),
      title: cleanString(incident.title),
      status,
      impact: cleanString(incident.impact),
      riskLevel,
      startedAt,
      updatedAt,
      resolvedAt,
      ...normalizeEventScope(incident, services),
      message: cleanString(incident.message),
      updates
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
      message: cleanString(item.message),
      updates: normalizeUpdates(item.updates)
    };
  });
}

export function normalizeStatusConfig(config = {}) {
  const page = isPlainObject(config.page) ? config.page : {};
  const statusCategories = normalizeStatusCategories(config.statusCategories);
  const services = normalizeServices(config.services, statusCategories);

  return {
    page: {
      title: cleanString(page.title, DEFAULT_PAGE.title),
      description: cleanString(page.description, DEFAULT_PAGE.description),
      supportEmail: cleanString(page.supportEmail, DEFAULT_PAGE.supportEmail)
    },
    statusCategories,
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

function validateRawStatus(value, fieldName, statusSet = STATUS_SET) {
  const status = typeof value === 'string' ? value.trim().toLowerCase() : '';
  if (!statusSet.has(status)) {
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

  if (config.statusCategories !== undefined && !Array.isArray(config.statusCategories)) {
    throw new Error('Status categories must be an array');
  }

  const rawCategories = config.statusCategories === undefined
    ? DEFAULT_STATUS_CATEGORIES
    : config.statusCategories;
  if (!rawCategories.length) {
    throw new Error('At least one status category is required');
  }

  const categoryIds = new Set();
  const categoryLabels = new Set();
  rawCategories.forEach((category, index) => {
    const number = index + 1;
    const id = normalizeStatusCategoryId(category?.id);
    if (!id || category?.id?.trim().toLowerCase() !== id) {
      throw new Error(`Status category ${number} has an invalid ID`);
    }
    if (categoryIds.has(id)) {
      throw new Error(`Status category IDs must be unique; "${id}" is repeated`);
    }
    categoryIds.add(id);
    assertNonEmptyString(category?.label, `Status category ${number} name`);
    const comparableLabel = category.label.trim().toLowerCase();
    if (categoryLabels.has(comparableLabel)) {
      throw new Error(`Status category names must be unique; "${category.label.trim()}" is repeated`);
    }
    categoryLabels.add(comparableLabel);
    if (!HEX_COLOR_PATTERN.test(category?.color || '')) {
      throw new Error(`Status category ${number} colour must be a six-digit hex value`);
    }
    if (!Number.isInteger(category?.rank) || category.rank < 0 || category.rank > 100) {
      throw new Error(`Status category ${number} severity must be an integer from 0 to 100`);
    }
  });
  CORE_STATUS_IDS.forEach((id) => {
    if (!categoryIds.has(id)) {
      throw new Error(`The "${id}" status category is required for automatic reports`);
    }
  });

  config.services.forEach((service, index) => {
    validateRawStatus(service?.status, `Service ${index + 1}`, categoryIds);
    if (service?.showHistory !== undefined && typeof service.showHistory !== 'boolean') {
      throw new Error(`Service ${index + 1} history visibility must be true or false`);
    }
    if (
      service?.historyDays !== undefined
      && (!Number.isInteger(service.historyDays)
        || service.historyDays < MIN_HISTORY_DAYS
        || service.historyDays > MAX_HISTORY_DAYS)
    ) {
      throw new Error(`Service ${index + 1} history days must be an integer from ${MIN_HISTORY_DAYS} to ${MAX_HISTORY_DAYS}`);
    }
    if (isPlainObject(service?.history)) {
      Object.entries(service.history).forEach(([date, value]) => {
        if (!isValidDateKey(date)) {
          throw new Error(`Service ${index + 1} history contains an invalid date`);
        }
        const rawStatus = isPlainObject(value) ? value.status : value;
        validateRawStatus(rawStatus, `Service ${index + 1} history on ${date}`, categoryIds);
      });
    }
  });

  config.incidents.forEach((incident, index) => {
    const rawRiskLevel = typeof incident?.riskLevel === 'string' ? incident.riskLevel.trim().toLowerCase() : '';
    if (!RISK_LEVEL_SET.has(rawRiskLevel)) {
      throw new Error(`Incident ${index + 1} has an unsupported risk level`);
    }
    (Array.isArray(incident?.updates) ? incident.updates : []).forEach((update, updateIndex) => {
      if (update?.riskLevel === undefined) {
        return;
      }
      const updateRiskLevel = typeof update.riskLevel === 'string' ? update.riskLevel.trim().toLowerCase() : '';
      if (!RISK_LEVEL_SET.has(updateRiskLevel)) {
        throw new Error(`Incident ${index + 1} update ${updateIndex + 1} has an unsupported risk level`);
      }
    });
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
    incident.updates.forEach((update, updateIndex) => {
      assertNonEmptyString(update.message, `Incident ${index + 1} update ${updateIndex + 1} message`);
      assertValidDate(update.createdAt, `Incident ${index + 1} update ${updateIndex + 1} time`);
      if (new Date(update.createdAt) < new Date(incident.startedAt)) {
        throw new Error(`Incident ${index + 1} update ${updateIndex + 1} cannot be before its start time`);
      }
    });
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
    item.updates.forEach((update, updateIndex) => {
      assertNonEmptyString(update.message, `Maintenance ${index + 1} update ${updateIndex + 1} message`);
      assertValidDate(update.createdAt, `Maintenance ${index + 1} update ${updateIndex + 1} time`);
    });
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
