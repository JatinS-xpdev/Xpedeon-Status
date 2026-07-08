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
    status: 'operational'
  };
}

export function createEmptyIncident() {
  return {
    title: '',
    status: 'Investigating',
    impact: 'minor',
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
