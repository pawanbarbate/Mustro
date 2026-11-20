import {
  ActivePanel,
  ActiveTab,
  NarrowTab,
  Service,
  ServiceStatus,
  SystemMetrics,
  LogEntry,
  DevPulseConfig
} from '../types/index.js';
import {
  INITIAL_SERVICES,
  INITIAL_GLOBAL_LOGS,
  INITIAL_SYSTEM_METRICS
} from '../data/mockData.js';

export const FILTER_OPTIONS = [
  'All Services',
  'AUTH',
  'USER',
  'PAYMENT',
  'NOTIF',
  'GATEWAY',
  'WORKER'
];

export interface DashboardState {
  selectedIndex: number;
  activeTab: ActiveTab;
  activePanel: ActivePanel;
  narrowTab: NarrowTab;
  time: string;
  uptimeSeconds: number;
  startedAt?: number;
  metrics: SystemMetrics;
  services: Service[];
  restartingServiceId: string | null;
  globalLogs: LogEntry[];
  serviceLogScroll: number;
  globalLogScroll: number;
  isLive: boolean;
  searchQuery: string;
  isSearching: boolean;
  filterIndex: number;
  filterOptions: string[];
  showHelp: boolean;
  toastMessage?: string | null;
  toastExpiresAt?: number;
  isWrapMode: boolean;
  selectedLogIndex: number;
  serviceSelectedLogIndex: number;
  globalSelectedLogIndex: number;
  serviceSelectionAnchor: number | null;
  globalSelectionAnchor: number | null;
  serviceCharSelection: { start: number; end: number } | null;
  globalCharSelection: { start: number; end: number } | null;
  serviceJsonLineScroll: number;
  globalJsonLineScroll: number;
  expandedLogIds: Record<string | number, boolean>;
  serviceExpandedLogIds: Record<string | number, boolean>;
  globalExpandedLogIds: Record<string | number, boolean>;
  copiedLogId: string | number | null;
  mouseMode: 'interactive' | 'native';
}

export const initialDashboardState: DashboardState = {
  selectedIndex: 0,
  activeTab: 'logs',
  activePanel: 'services',
  narrowTab: 'services',
  time: '10:24:17',
  uptimeSeconds: 754,
  metrics: INITIAL_SYSTEM_METRICS,
  services: INITIAL_SERVICES,
  restartingServiceId: null,
  globalLogs: INITIAL_GLOBAL_LOGS,
  serviceLogScroll: 0,
  globalLogScroll: 0,
  isLive: true,
  searchQuery: '',
  isSearching: false,
  filterIndex: 0,
  filterOptions: FILTER_OPTIONS,
  showHelp: false,
  toastMessage: null,
  isWrapMode: false,
  selectedLogIndex: 0,
  serviceSelectedLogIndex: 0,
  globalSelectedLogIndex: 0,
  serviceSelectionAnchor: null,
  globalSelectionAnchor: null,
  serviceCharSelection: null,
  globalCharSelection: null,
  serviceJsonLineScroll: 0,
  globalJsonLineScroll: 0,
  expandedLogIds: {},
  serviceExpandedLogIds: {},
  globalExpandedLogIds: {},
  copiedLogId: null,
  mouseMode: 'interactive'
};

export function configToServices(config?: DevPulseConfig): Service[] {
  if (!config || !config.services || config.services.length === 0) {
    return [];
  }

  return config.services.map((s, idx) => ({
    id: `svc-${idx + 1}-${s.name.toLowerCase().replace(/[^a-z0-9]/g, '-')}`,
    name: s.name,
    status: s.autoStart !== false ? 'starting' : 'stopped',
    statusText: s.autoStart !== false ? 'STARTING' : 'STOPPED',
    uptime: '0s',
    uptimeSeconds: 0,
    command: Array.isArray(s.command)
      ? s.command.join(' && ')
      : (s.command || (Array.isArray(s.commands) ? s.commands.join(' && ') : '')),
    path: s.path,
    port: s.port ? `:${s.port}` : '',
    pid: '-',
    errors: 0,
    rawConfig: s,
    env: [],
    logs: [],
    errorLogs: []
  }));
}

export function createInitialDashboardState(config?: DevPulseConfig): DashboardState {
  const services = configToServices(config);
  const filterOptions = services.length > 0
    ? ['All Services', ...services.map(s => s.name)]
    : ['All Services'];

  const now = new Date().toTimeString().split(' ')[0] || '00:00:00';

  return {
    ...initialDashboardState,
    time: now,
    uptimeSeconds: 0,
    startedAt: Date.now(),
    services,
    globalLogs: [],
    filterOptions,
    metrics: {
      servicesTotal: services.length,
      servicesRunning: 0,
      uptime: '0s',
      errorsTotal: 0
    }
  };
}

export type DashboardAction =
  | { type: 'SELECT_SERVICE'; index: number }
  | { type: 'NAVIGATE_SERVICES'; delta: number }
  | { type: 'SET_ACTIVE_PANEL'; panel: ActivePanel }
  | { type: 'SET_ACTIVE_TAB'; tab: ActiveTab }
  | { type: 'SET_NARROW_TAB'; tab: NarrowTab }
  | { type: 'CYCLE_PANEL' }
  | { type: 'SCROLL_SERVICE_LOGS'; delta: number; maxScroll?: number }
  | { type: 'SET_SERVICE_LOG_SCROLL'; value: number; maxScroll?: number }
  | { type: 'SCROLL_GLOBAL_LOGS'; delta: number; maxScroll?: number }
  | { type: 'SET_GLOBAL_LOG_SCROLL'; value: number; maxScroll?: number }
  | { type: 'TOGGLE_HELP'; show?: boolean }
  | { type: 'SET_SEARCH_QUERY'; query: string }
  | { type: 'APPEND_SEARCH_CHAR'; char: string }
  | { type: 'POP_SEARCH_CHAR' }
  | { type: 'SET_SEARCHING'; isSearching: boolean }
  | { type: 'CYCLE_FILTER' }
  | { type: 'SET_FILTER_INDEX'; index: number }
  | { type: 'TOGGLE_LIVE' }
  | { type: 'START_RESTART_SERVICE'; index: number }
  | { type: 'FINISH_RESTART_SERVICE'; index: number }
  | { type: 'TOGGLE_STOP_SERVICE'; index: number }
  | { type: 'TICK_CLOCK'; time: string }
  | { type: 'APPEND_REAL_LOG'; serviceName: string; log: LogEntry }
  | { type: 'PROCESS_STATUS_CHANGED'; serviceName: string; status: ServiceStatus; pid?: number; error?: string; statusText?: string }
  | { type: 'SHOW_TOAST'; message: string; durationMs?: number }
  | { type: 'HIDE_TOAST' }
  | { type: 'TOGGLE_WRAP_MODE' }
  | { type: 'SELECT_LOG_ROW'; index: number; panel?: 'service' | 'global' }
  | { type: 'NAVIGATE_LOG_SELECTION'; delta: number; maxIndex: number; panel?: 'service' | 'global' }
  | { type: 'EXTEND_LOG_SELECTION'; delta: number; maxIndex: number; panel?: 'service' | 'global' }
  | { type: 'SET_LOG_SELECTION_RANGE'; anchorIndex: number | null; headIndex: number; panel?: 'service' | 'global' }
  | { type: 'EXTEND_CHAR_SELECTION'; delta: number; maxLen: number; panel?: 'service' | 'global' }
  | { type: 'SET_CHAR_SELECTION_RANGE'; start: number; end: number; panel?: 'service' | 'global' }
  | { type: 'CLEAR_LOG_SELECTION'; panel?: 'service' | 'global' }
  | { type: 'SCROLL_JSON_LINES'; delta: number; maxScroll: number; panel?: 'service' | 'global' }
  | { type: 'RESET_JSON_LINE_SCROLL'; panel?: 'service' | 'global' }
  | { type: 'TOGGLE_LOG_EXPANSION'; logId: string | number; panel?: 'service' | 'global' }
  | { type: 'TOGGLE_ALL_JSON_EXPANSION'; forceState?: boolean }
  | { type: 'TOGGLE_MOUSE_MODE' }
  | { type: 'SET_COPIED_FLASH'; logId: string | number | null };

export function dashboardReducer(state: DashboardState, action: DashboardAction): DashboardState {
  switch (action.type) {
    case 'SELECT_SERVICE': {
      const clamped = Math.max(0, Math.min(state.services.length - 1, action.index));
      return {
        ...state,
        selectedIndex: clamped,
        activePanel: 'services',
        serviceLogScroll: 0,
        selectedLogIndex: 0,
        serviceSelectedLogIndex: 0,
        serviceSelectionAnchor: null,
        globalSelectionAnchor: null,
        serviceCharSelection: null,
        globalCharSelection: null,
        serviceJsonLineScroll: 0,
        globalJsonLineScroll: 0,
        serviceExpandedLogIds: {}
      };
    }

    case 'NAVIGATE_SERVICES': {
      const nextIndex = Math.max(0, Math.min(state.services.length - 1, state.selectedIndex + action.delta));
      return {
        ...state,
        selectedIndex: nextIndex,
        activePanel: 'services',
        serviceLogScroll: 0,
        selectedLogIndex: 0,
        serviceSelectedLogIndex: 0,
        serviceSelectionAnchor: null,
        globalSelectionAnchor: null,
        serviceCharSelection: null,
        globalCharSelection: null,
        serviceJsonLineScroll: 0,
        globalJsonLineScroll: 0,
        serviceExpandedLogIds: {}
      };
    }

    case 'SET_ACTIVE_PANEL':
      return {
        ...state,
        activePanel: action.panel
      };

    case 'SET_ACTIVE_TAB':
      return {
        ...state,
        activeTab: action.tab,
        activePanel: 'serviceLogs',
        serviceLogScroll: 0,
        selectedLogIndex: 0,
        serviceSelectedLogIndex: 0,
        serviceSelectionAnchor: null,
        globalSelectionAnchor: null,
        serviceCharSelection: null,
        globalCharSelection: null,
        serviceJsonLineScroll: 0,
        globalJsonLineScroll: 0,
        serviceExpandedLogIds: {}
      };

    case 'SET_NARROW_TAB':
      return {
        ...state,
        narrowTab: action.tab,
        activePanel: action.tab === 'services' ? 'services' : action.tab === 'detail' ? 'serviceLogs' : 'globalLogs'
      };

    case 'CYCLE_PANEL': {
      let nextPanel: ActivePanel = 'services';
      if (state.activePanel === 'services') nextPanel = 'serviceLogs';
      else if (state.activePanel === 'serviceLogs') nextPanel = 'globalLogs';
      return {
        ...state,
        activePanel: nextPanel
      };
    }

    case 'SCROLL_SERVICE_LOGS': {
      const selectedService = state.services[state.selectedIndex];
      const totalLogs = selectedService?.logs?.length || 0;
      const maxScroll = action.maxScroll !== undefined 
        ? Math.max(0, action.maxScroll) 
        : Math.max(0, totalLogs);

      const baseScroll = state.serviceLogScroll > maxScroll 
        ? maxScroll 
        : state.serviceLogScroll;
      const nextScroll = Math.max(0, Math.min(maxScroll, baseScroll + action.delta));

      return {
        ...state,
        serviceLogScroll: nextScroll
      };
    }

    case 'SET_SERVICE_LOG_SCROLL': {
      const selectedService = state.services[state.selectedIndex];
      const totalLogs = selectedService?.logs?.length || 0;
      const maxScroll = action.maxScroll !== undefined 
        ? Math.max(0, action.maxScroll) 
        : Math.max(0, totalLogs);

      return {
        ...state,
        serviceLogScroll: Math.max(0, Math.min(maxScroll, action.value))
      };
    }

    case 'SCROLL_GLOBAL_LOGS': {
      const totalLogs = state.globalLogs.length;
      const maxScroll = action.maxScroll !== undefined 
        ? Math.max(0, action.maxScroll) 
        : Math.max(0, totalLogs);

      const baseScroll = state.globalLogScroll > maxScroll 
        ? maxScroll 
        : state.globalLogScroll;
      const nextScroll = Math.max(0, Math.min(maxScroll, baseScroll + action.delta));

      return {
        ...state,
        globalLogScroll: nextScroll
      };
    }

    case 'SET_GLOBAL_LOG_SCROLL': {
      const totalLogs = state.globalLogs.length;
      const maxScroll = action.maxScroll !== undefined 
        ? Math.max(0, action.maxScroll) 
        : Math.max(0, totalLogs);

      return {
        ...state,
        globalLogScroll: Math.max(0, Math.min(maxScroll, action.value))
      };
    }

    case 'TOGGLE_HELP':
      return {
        ...state,
        showHelp: action.show !== undefined ? action.show : !state.showHelp
      };

    case 'SET_SEARCH_QUERY':
      return {
        ...state,
        searchQuery: action.query
      };

    case 'APPEND_SEARCH_CHAR':
      return {
        ...state,
        searchQuery: state.searchQuery + action.char
      };

    case 'POP_SEARCH_CHAR':
      return {
        ...state,
        searchQuery: state.searchQuery.slice(0, -1)
      };

    case 'SET_SEARCHING':
      return {
        ...state,
        isSearching: action.isSearching
      };

    case 'CYCLE_FILTER':
      return {
        ...state,
        filterIndex: (state.filterIndex + 1) % state.filterOptions.length
      };

    case 'SET_FILTER_INDEX':
      return {
        ...state,
        filterIndex: action.index
      };

    case 'TOGGLE_LIVE':
      return {
        ...state,
        isLive: !state.isLive
      };

    case 'START_RESTART_SERVICE': {
      const target = state.services[action.index];
      if (!target) return state;
      return {
        ...state,
        restartingServiceId: target.id,
        services: state.services.map((s, i) =>
          i === action.index ? { ...s, status: 'starting', statusText: 'STARTING' } : s
        )
      };
    }

    case 'FINISH_RESTART_SERVICE':
      return {
        ...state,
        restartingServiceId: null,
        services: state.services.map((s, i) =>
          i === action.index ? { ...s, status: 'running', statusText: 'RUNNING' } : s
        )
      };

    case 'TOGGLE_STOP_SERVICE':
      return {
        ...state,
        services: state.services.map((s, i) =>
          i === action.index
            ? {
                ...s,
                status: s.status === 'running' ? 'stopped' : 'starting',
                statusText: s.status === 'running' ? 'STOPPED' : 'STARTING'
              }
            : s
        )
      };

    case 'TICK_CLOCK': {
      const now = Date.now();
      const nextUptime = state.startedAt
        ? Math.max(0, Math.floor((now - state.startedAt) / 1000))
        : state.uptimeSeconds + 1;
      const mins = Math.floor(nextUptime / 60);
      const secs = nextUptime % 60;
      const uptimeStr = mins > 0 ? `${mins}m ${secs}s` : `${secs}s`;

      const updatedServices = state.services.map(s => {
        if (s.status === 'running') {
          const u = s.startedAt
            ? Math.max(0, Math.floor((now - s.startedAt) / 1000))
            : (s.uptimeSeconds || 0) + 1;
          const m = Math.floor(u / 60);
          const sc = u % 60;
          return {
            ...s,
            uptimeSeconds: u,
            uptime: m > 0 ? `${m}m ${sc}s` : `${sc}s`
          };
        }
        return s;
      });

      const totalErrors = updatedServices.reduce((acc, s) => acc + (s.errors || 0), 0);
      const runningCount = updatedServices.filter(s => s.status === 'running').length;

      let toastMessage = state.toastMessage;
      let toastExpiresAt = state.toastExpiresAt;
      if (toastExpiresAt && now >= toastExpiresAt) {
        toastMessage = null;
        toastExpiresAt = undefined;
      }

      return {
        ...state,
        time: action.time,
        uptimeSeconds: nextUptime,
        services: updatedServices,
        toastMessage,
        toastExpiresAt,
        metrics: {
          ...state.metrics,
          uptime: uptimeStr,
          servicesRunning: runningCount,
          servicesTotal: updatedServices.length,
          errorsTotal: totalErrors
        }
      };
    }

    case 'APPEND_REAL_LOG': {
      const nextGlobal = [...state.globalLogs.slice(-200), action.log];
      const isError = action.log.level === 'error' || action.log.level === 'ERROR';

      let totalErrors = 0;
      const nextServices = state.services.map(s => {
        if (s.name.toLowerCase() === action.serviceName.toLowerCase()) {
          const nextLogs = [...(s.logs || []).slice(-200), action.log];
          const nextErrors = isError
            ? [...(s.errorLogs || []).slice(-100), action.log]
            : (s.errorLogs || []);
          const updatedErrors = s.errors + (isError ? 1 : 0);
          totalErrors += updatedErrors;
          return {
            ...s,
            logs: nextLogs,
            errorLogs: nextErrors,
            errors: updatedErrors,
            lastError: isError ? action.log.message : s.lastError
          };
        }
        totalErrors += (s.errors || 0);
        return s;
      });

      return {
        ...state,
        globalLogs: nextGlobal,
        services: nextServices,
        metrics: {
          ...state.metrics,
          errorsTotal: totalErrors
        }
      };
    }

    case 'PROCESS_STATUS_CHANGED': {
      const nextServices = state.services.map(s => {
        if (s.name.toLowerCase() === action.serviceName.toLowerCase()) {
          const isNowRunning = action.status === 'running';
          const wasRunning = s.status === 'running';
          const startedAt = isNowRunning
            ? (wasRunning ? (s.startedAt || Date.now()) : Date.now())
            : undefined;
          return {
            ...s,
            status: action.status,
            statusText: action.statusText || action.status.toUpperCase(),
            pid: action.pid ? String(action.pid) : (action.status === 'stopped' ? '-' : s.pid),
            startedAt,
            uptime: isNowRunning ? (wasRunning ? s.uptime : '0s') : '0s',
            uptimeSeconds: isNowRunning ? (wasRunning ? (s.uptimeSeconds || 0) : 0) : 0,
            lastError: action.error || s.lastError,
            restarts: (action.status === 'starting' && wasRunning) ? (s.restarts || 0) + 1 : s.restarts,
            restartingServiceId: action.status === 'running' && state.restartingServiceId === s.id
              ? null
              : state.restartingServiceId
          };
        }
        return s;
      });

      const runningCount = nextServices.filter(s => s.status === 'running').length;
      return {
        ...state,
        restartingServiceId: action.status === 'running' ? null : state.restartingServiceId,
        services: nextServices,
        metrics: {
          ...state.metrics,
          servicesRunning: runningCount
        }
      };
    }

    case 'SHOW_TOAST': {
      return {
        ...state,
        toastMessage: action.message,
        toastExpiresAt: Date.now() + (action.durationMs ?? 2500)
      };
    }

    case 'HIDE_TOAST': {
      return {
        ...state,
        toastMessage: null,
        toastExpiresAt: undefined
      };
    }

    case 'TOGGLE_WRAP_MODE': {
      return {
        ...state,
        isWrapMode: !state.isWrapMode
      };
    }

    case 'SELECT_LOG_ROW': {
      const panel = action.panel || (state.activePanel === 'serviceLogs' ? 'service' : 'global');
      const idx = Math.max(0, action.index);
      if (panel === 'service') {
        return {
          ...state,
          serviceSelectedLogIndex: idx,
          selectedLogIndex: idx,
          serviceSelectionAnchor: null,
          serviceCharSelection: null,
          serviceJsonLineScroll: 0
        };
      } else {
        return {
          ...state,
          globalSelectedLogIndex: idx,
          selectedLogIndex: idx,
          globalSelectionAnchor: null,
          globalCharSelection: null,
          globalJsonLineScroll: 0
        };
      }
    }

    case 'NAVIGATE_LOG_SELECTION': {
      const panel = action.panel || (state.activePanel === 'serviceLogs' ? 'service' : 'global');
      if (panel === 'service') {
        const nextIndex = Math.max(0, Math.min(action.maxIndex, state.serviceSelectedLogIndex + action.delta));
        return {
          ...state,
          serviceSelectedLogIndex: nextIndex,
          selectedLogIndex: nextIndex,
          serviceSelectionAnchor: null,
          serviceCharSelection: null,
          serviceJsonLineScroll: 0
        };
      } else {
        const nextIndex = Math.max(0, Math.min(action.maxIndex, state.globalSelectedLogIndex + action.delta));
        return {
          ...state,
          globalSelectedLogIndex: nextIndex,
          selectedLogIndex: nextIndex,
          globalSelectionAnchor: null,
          globalCharSelection: null,
          globalJsonLineScroll: 0
        };
      }
    }

    case 'EXTEND_LOG_SELECTION': {
      const panel = action.panel || (state.activePanel === 'serviceLogs' ? 'service' : 'global');
      if (panel === 'service') {
        const anchor = state.serviceSelectionAnchor !== null ? state.serviceSelectionAnchor : state.serviceSelectedLogIndex;
        const nextIndex = Math.max(0, Math.min(action.maxIndex, state.serviceSelectedLogIndex + action.delta));
        return {
          ...state,
          serviceSelectionAnchor: anchor,
          serviceSelectedLogIndex: nextIndex,
          selectedLogIndex: nextIndex,
          serviceCharSelection: null,
          serviceJsonLineScroll: 0
        };
      } else {
        const anchor = state.globalSelectionAnchor !== null ? state.globalSelectionAnchor : state.globalSelectedLogIndex;
        const nextIndex = Math.max(0, Math.min(action.maxIndex, state.globalSelectedLogIndex + action.delta));
        return {
          ...state,
          globalSelectionAnchor: anchor,
          globalSelectedLogIndex: nextIndex,
          selectedLogIndex: nextIndex,
          globalCharSelection: null,
          globalJsonLineScroll: 0
        };
      }
    }

    case 'SET_LOG_SELECTION_RANGE': {
      const panel = action.panel || (state.activePanel === 'serviceLogs' ? 'service' : 'global');
      const head = Math.max(0, action.headIndex);
      if (panel === 'service') {
        return {
          ...state,
          serviceSelectionAnchor: action.anchorIndex,
          serviceSelectedLogIndex: head,
          selectedLogIndex: head,
          serviceCharSelection: null,
          serviceJsonLineScroll: 0
        };
      } else {
        return {
          ...state,
          globalSelectionAnchor: action.anchorIndex,
          globalSelectedLogIndex: head,
          selectedLogIndex: head,
          globalCharSelection: null,
          globalJsonLineScroll: 0
        };
      }
    }

    case 'EXTEND_CHAR_SELECTION': {
      const panel = action.panel || (state.activePanel === 'serviceLogs' ? 'service' : 'global');
      if (panel === 'service') {
        const cur = state.serviceCharSelection;
        let nextRange: { start: number; end: number } | null = null;
        if (!cur) {
          if (action.delta > 0) {
            nextRange = { start: 0, end: Math.min(action.maxLen, action.delta) };
          }
        } else {
          const nextEnd = Math.max(0, Math.min(action.maxLen, cur.end + action.delta));
          if (nextEnd <= cur.start) {
            nextRange = null;
          } else {
            nextRange = { start: cur.start, end: nextEnd };
          }
        }
        return {
          ...state,
          serviceSelectionAnchor: null,
          serviceCharSelection: nextRange
        };
      } else {
        const cur = state.globalCharSelection;
        let nextRange: { start: number; end: number } | null = null;
        if (!cur) {
          if (action.delta > 0) {
            nextRange = { start: 0, end: Math.min(action.maxLen, action.delta) };
          }
        } else {
          const nextEnd = Math.max(0, Math.min(action.maxLen, cur.end + action.delta));
          if (nextEnd <= cur.start) {
            nextRange = null;
          } else {
            nextRange = { start: cur.start, end: nextEnd };
          }
        }
        return {
          ...state,
          globalSelectionAnchor: null,
          globalCharSelection: nextRange
        };
      }
    }

    case 'SET_CHAR_SELECTION_RANGE': {
      const panel = action.panel || (state.activePanel === 'serviceLogs' ? 'service' : 'global');
      const start = Math.max(0, Math.min(action.start, action.end));
      const end = Math.max(0, Math.max(action.start, action.end));
      const range = end > start ? { start, end } : null;
      if (panel === 'service') {
        return {
          ...state,
          serviceSelectionAnchor: null,
          serviceCharSelection: range
        };
      } else {
        return {
          ...state,
          globalSelectionAnchor: null,
          globalCharSelection: range
        };
      }
    }

    case 'CLEAR_LOG_SELECTION': {
      const panel = action.panel || (state.activePanel === 'serviceLogs' ? 'service' : 'global');
      if (panel === 'service') {
        return {
          ...state,
          serviceSelectionAnchor: null,
          serviceCharSelection: null
        };
      } else {
        return {
          ...state,
          globalSelectionAnchor: null,
          globalCharSelection: null
        };
      }
    }

    case 'SCROLL_JSON_LINES': {
      const panel = action.panel || (state.activePanel === 'serviceLogs' ? 'service' : 'global');
      if (panel === 'service') {
        const nextOffset = Math.max(0, Math.min(action.maxScroll, state.serviceJsonLineScroll + action.delta));
        return {
          ...state,
          serviceJsonLineScroll: nextOffset
        };
      } else {
        const nextOffset = Math.max(0, Math.min(action.maxScroll, state.globalJsonLineScroll + action.delta));
        return {
          ...state,
          globalJsonLineScroll: nextOffset
        };
      }
    }

    case 'RESET_JSON_LINE_SCROLL': {
      const panel = action.panel || (state.activePanel === 'serviceLogs' ? 'service' : 'global');
      if (panel === 'service') {
        return {
          ...state,
          serviceJsonLineScroll: 0
        };
      } else {
        return {
          ...state,
          globalJsonLineScroll: 0
        };
      }
    }

    case 'TOGGLE_LOG_EXPANSION': {
      const panel = action.panel || (state.activePanel === 'serviceLogs' ? 'service' : 'global');
      if (panel === 'service') {
        const isCurrentlyExpanded = !!state.serviceExpandedLogIds[action.logId];
        const nextServiceExpanded = {
          ...state.serviceExpandedLogIds,
          [action.logId]: !isCurrentlyExpanded
        };
        return {
          ...state,
          serviceExpandedLogIds: nextServiceExpanded,
          expandedLogIds: nextServiceExpanded
        };
      } else {
        const isCurrentlyExpanded = !!state.globalExpandedLogIds[action.logId];
        // Accordion in global logs: expanding a log collapses any prior expanded log in the global stream
        // This guarantees that multiple bulky JSON trees never crowd out logs from other services
        const nextGlobalExpanded = isCurrentlyExpanded ? { [action.logId]: false } : { [action.logId]: true };
        return {
          ...state,
          globalExpandedLogIds: nextGlobalExpanded,
          expandedLogIds: nextGlobalExpanded
        };
      }
    }

    case 'TOGGLE_ALL_JSON_EXPANSION': {
      return {
        ...state,
        expandedLogIds: action.forceState !== undefined
          ? (action.forceState ? state.expandedLogIds : {})
          : {}
      };
    }

    case 'TOGGLE_MOUSE_MODE': {
      return {
        ...state,
        mouseMode: state.mouseMode === 'interactive' ? 'native' : 'interactive'
      };
    }

    case 'SET_COPIED_FLASH': {
      return {
        ...state,
        copiedLogId: action.logId
      };
    }

    default:
      return state;
  }
}

