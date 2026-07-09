export const STATUS_META = {
  operational: {
    label: 'Operational',
    rank: 0,
    tone: 'good'
  },
  degraded: {
    label: 'Degraded Performance',
    rank: 1,
    tone: 'warn'
  },
  maintenance: {
    label: 'Maintenance',
    rank: 2,
    tone: 'info'
  },
  outage: {
    label: 'Major Outage',
    rank: 3,
    tone: 'bad'
  }
};

export const SERVICE_STATUSES = Object.keys(STATUS_META);

export const RISK_LEVELS = ['minor', 'major', 'critical'];

export const RISK_LEVEL_META = {
  minor: { label: 'Minor', tone: 'warn' },
  major: { label: 'Major', tone: 'bad' },
  critical: { label: 'Critical', tone: 'bad' }
};

function normalizeStatusValue(value, fallbackStatus) {
  if (typeof value === 'string') {
    return value;
  }

  if (value && typeof value === 'object' && typeof value.status === 'string') {
    return value.status;
  }

  return fallbackStatus;
}

export function buildStatusSegments(history = [], segmentCount = 30, fallbackStatus = 'operational') {
  const normalizedHistory = Array.isArray(history)
    ? history.map((value) => normalizeStatusValue(value, fallbackStatus)).filter(Boolean)
    : [];

  if (!normalizedHistory.length) {
    return Array.from({ length: segmentCount }, () => fallbackStatus);
  }

  return Array.from({ length: segmentCount }, (_segment, index) => {
    const historyIndex = Math.min(
      normalizedHistory.length - 1,
      Math.floor((index / segmentCount) * normalizedHistory.length)
    );

    return normalizedHistory[historyIndex];
  });
}

export function formatDateTime(value) {
  if (!value) {
    return 'Not set';
  }

  return new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short'
  }).format(new Date(value));
}

export function getWorstServiceStatus(services = []) {
  return services.reduce((worst, service) => {
    const current = STATUS_META[service.status] ?? STATUS_META.outage;
    return current.rank > worst.rank ? current : worst;
  }, STATUS_META.operational);
}

export function createEmptyService() {
  return {
    name: '',
    description: '',
    status: 'operational',
    history: []
  };
}

export function createEmptyIncident() {
  return {
    title: '',
    status: 'Investigating',
    impact: 'minor',
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
