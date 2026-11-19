import React, { useRef } from 'react';
import { useInput } from 'ink';
import { DashboardState, DashboardAction, FILTER_OPTIONS } from '../state/dashboardReducer.js';
import { ViewportInfo, LogEntry } from '../types/index.js';
import { ClickManagerContextValue } from '../components/common/ClickManager.js';
import {
  copyToClipboard,
  formatLogEntry,
  formatServiceErrorSummary,
  formatAllErrors
} from '../utils/clipboard.js';
import {
  prettyPrintJson,
  parseJsonLog,
  formatJsonToHighlightedLines
} from '../utils/logFormatter.js';

interface UseTerminalInputProps {
  state: DashboardState;
  viewport: ViewportInfo;
  dispatch: React.Dispatch<DashboardAction>;
  exit: () => void;
  clickManagerRef?: React.RefObject<ClickManagerContextValue | null>;
  onRestart?: (index: number) => void;
  onToggleStop?: (index: number) => void;
  onSwitchConfig?: () => void;
}

export function useTerminalInput({
  state,
  viewport,
  dispatch,
  exit,
  clickManagerRef,
  onRestart,
  onToggleStop,
  onSwitchConfig
}: UseTerminalInputProps) {
  const lastServiceNavTimeRef = useRef(0);
  const lastLogScrollTimeRef = useRef(0);

  const stateRef = useRef(state);
  stateRef.current = state;

  const onRestartRef = useRef(onRestart);
  onRestartRef.current = onRestart;

  const onToggleStopRef = useRef(onToggleStop);
  onToggleStopRef.current = onToggleStop;

  const onSwitchConfigRef = useRef(onSwitchConfig);
  onSwitchConfigRef.current = onSwitchConfig;

  useInput((input, key) => {
    // -------------------------------------------------------------
    // 1. SGR Mouse Reporting Parser: [<button;x;yM or \x1b[<... or <...
    // -------------------------------------------------------------
    if (
      input &&
      (input.includes('[<') ||
        input.includes('\x1b[<') ||
        /\[?<\d+;\d+;\d+[Mm]/.test(input) ||
        input.includes('<64;') ||
        input.includes('<65;'))
    ) {
      const sgrRegex = /(?:\x1b)?\[?<(\d+);(\d+);(\d+)([Mm])/g;
      let match: RegExpExecArray | null;
      let processedMouse = false;

      while ((match = sgrRegex.exec(input)) !== null) {
        processedMouse = true;
        const button = parseInt(match[1] || '0', 10);
        const mouseX = parseInt(match[2] || '0', 10);
        const mouseY = parseInt(match[3] || '0', 10);
        const isPress = match[4] === 'M';

        // Strip modifier flags: Shift (+4), Meta/Alt (+8), Ctrl (+16) = 28
        const baseButton = button & ~28;

        // 1a. Left Click (Base Button 0 press)
        if (baseButton === 0 && isPress) {
          // First attempt dynamic dispatch to any registered <Clickable> component
          const wasHandled = clickManagerRef?.current?.dispatchClick(mouseX, mouseY);
          if (!wasHandled) {
            // Fallback: panel focus based on column/region
            if (mouseX <= viewport.leftPanelWidth + 1) {
              dispatch({ type: 'SET_ACTIVE_PANEL', panel: 'services' });
            } else {
              const detailEndRow = 1 + viewport.detailPanelHeight;
              if (mouseY <= detailEndRow) {
                dispatch({ type: 'SET_ACTIVE_PANEL', panel: 'serviceLogs' });
              } else {
                dispatch({ type: 'SET_ACTIVE_PANEL', panel: 'globalLogs' });
              }
            }
          }
        }

        // 1b. Mouse Wheel UP (Base Button 64)
        const isWheelUp = baseButton === 64;
        if (isWheelUp) {
          const now = Date.now();
          if (mouseX <= viewport.leftPanelWidth + 1) {
            if (now - lastServiceNavTimeRef.current >= 75) {
              lastServiceNavTimeRef.current = now;
              dispatch({ type: 'NAVIGATE_SERVICES', delta: -1 });
            }
          } else {
            if (now - lastLogScrollTimeRef.current >= 30) {
              lastLogScrollTimeRef.current = now;
              const detailEndRow = 1 + viewport.detailPanelHeight;
              if (mouseY <= detailEndRow) {
                const totalLogs = state.services[state.selectedIndex]?.logs?.length || 0;
                const maxScroll = Math.max(0, totalLogs - (viewport.maxServiceLogs || 6));
                dispatch({ type: 'SCROLL_SERVICE_LOGS', delta: 1, maxScroll });
              } else {
                const totalLogs = state.globalLogs.length;
                const maxScroll = Math.max(0, totalLogs - (viewport.maxGlobalLogs || 6));
                dispatch({ type: 'SCROLL_GLOBAL_LOGS', delta: 1, maxScroll });
              }
            }
          }
        }

        // 1c. Mouse Wheel DOWN (Base Button 65)
        const isWheelDown = baseButton === 65;
        if (isWheelDown) {
          const now = Date.now();
          if (mouseX <= viewport.leftPanelWidth + 1) {
            if (now - lastServiceNavTimeRef.current >= 75) {
              lastServiceNavTimeRef.current = now;
              dispatch({ type: 'NAVIGATE_SERVICES', delta: 1 });
            }
          } else {
            if (now - lastLogScrollTimeRef.current >= 30) {
              lastLogScrollTimeRef.current = now;
              const detailEndRow = 1 + viewport.detailPanelHeight;
              if (mouseY <= detailEndRow) {
                const totalLogs = state.services[state.selectedIndex]?.logs?.length || 0;
                const maxScroll = Math.max(0, totalLogs - (viewport.maxServiceLogs || 6));
                dispatch({ type: 'SCROLL_SERVICE_LOGS', delta: -1, maxScroll });
              } else {
                const totalLogs = state.globalLogs.length;
                const maxScroll = Math.max(0, totalLogs - (viewport.maxGlobalLogs || 6));
                dispatch({ type: 'SCROLL_GLOBAL_LOGS', delta: -1, maxScroll });
              }
            }
          }
        }
      }

      // Legacy mouse wheel fallback if full regex didn't trigger
      if (!processedMouse) {
        if (input.includes('<64;') || input.includes('[<64')) {
          processedMouse = true;
          if (state.activePanel === 'services') {
            dispatch({ type: 'NAVIGATE_SERVICES', delta: -1 });
          } else if (state.activePanel === 'serviceLogs') {
            const totalLogs = state.services[state.selectedIndex]?.logs?.length || 0;
            const maxScroll = Math.max(0, totalLogs - (viewport.maxServiceLogs || 6));
            dispatch({ type: 'SCROLL_SERVICE_LOGS', delta: 1, maxScroll });
          } else if (state.activePanel === 'globalLogs') {
            const totalLogs = state.globalLogs.length;
            const maxScroll = Math.max(0, totalLogs - (viewport.maxGlobalLogs || 6));
            dispatch({ type: 'SCROLL_GLOBAL_LOGS', delta: 1, maxScroll });
          }
        } else if (input.includes('<65;') || input.includes('[<65')) {
          processedMouse = true;
          if (state.activePanel === 'services') {
            dispatch({ type: 'NAVIGATE_SERVICES', delta: 1 });
          } else if (state.activePanel === 'serviceLogs') {
            const totalLogs = state.services[state.selectedIndex]?.logs?.length || 0;
            const maxScroll = Math.max(0, totalLogs - (viewport.maxServiceLogs || 6));
            dispatch({ type: 'SCROLL_SERVICE_LOGS', delta: -1, maxScroll });
          } else if (state.activePanel === 'globalLogs') {
            const totalLogs = state.globalLogs.length;
            const maxScroll = Math.max(0, totalLogs - (viewport.maxGlobalLogs || 6));
            dispatch({ type: 'SCROLL_GLOBAL_LOGS', delta: -1, maxScroll });
          }
        }
      }

      if (processedMouse) return;
    }

    // -------------------------------------------------------------
    // 2. Keyboard Handlers
    // -------------------------------------------------------------
    // If Help Modal is open
    if (state.showHelp) {
      if (key.escape || input === '?' || input === 'q') {
        dispatch({ type: 'TOGGLE_HELP', show: false });
      }
      return;
    }

    // If Search input is active
    if (state.isSearching) {
      if (key.escape || key.return) {
        dispatch({ type: 'SET_SEARCHING', isSearching: false });
      } else if (key.backspace || key.delete) {
        dispatch({ type: 'POP_SEARCH_CHAR' });
      } else if (input) {
        dispatch({ type: 'APPEND_SEARCH_CHAR', char: input });
      }
      return;
    }

    // Help Modal toggle
    if (input === '?') {
      dispatch({ type: 'TOGGLE_HELP', show: true });
      return;
    }

    // Exit application
    if (input === 'q') {
      exit();
      return;
    }

    // Tab or 't' switches active panel focus
    if (input === 't' || key.tab) {
      if (viewport.width < 72) {
        const next = state.narrowTab === 'services' ? 'detail' : state.narrowTab === 'detail' ? 'logs' : 'services';
        dispatch({ type: 'SET_NARROW_TAB', tab: next });
      } else {
        dispatch({ type: 'CYCLE_PANEL' });
      }
      return;
    }

    // Escape returns focus to services
    if (key.escape) {
      dispatch({ type: 'SET_ACTIVE_PANEL', panel: 'services' });
      return;
    }

    // Enter focuses service logs
    if (key.return) {
      if (state.activePanel === 'services') {
        dispatch({ type: 'SET_ACTIVE_PANEL', panel: 'serviceLogs' });
        return;
      }
    }

    // Helpers for calculating dynamic maxScroll bounds
    const getServiceMaxScroll = () => {
      const totalLogs = state.services[state.selectedIndex]?.logs?.length || 0;
      return Math.max(0, totalLogs - (viewport.maxServiceLogs || 6));
    };

    const getGlobalMaxScroll = () => {
      return Math.max(0, state.globalLogs.length - (viewport.maxGlobalLogs || 6));
    };

    // PageUp / PageDown or '[' / ']' for keyboard log scrolling
    if (key.pageUp || input === '[') {
      if (state.activePanel === 'globalLogs') {
        dispatch({ type: 'SCROLL_GLOBAL_LOGS', delta: 4, maxScroll: getGlobalMaxScroll() });
      } else {
        dispatch({ type: 'SCROLL_SERVICE_LOGS', delta: 4, maxScroll: getServiceMaxScroll() });
      }
      return;
    }

    if (key.pageDown || input === ']') {
      if (state.activePanel === 'globalLogs') {
        dispatch({ type: 'SCROLL_GLOBAL_LOGS', delta: -4, maxScroll: getGlobalMaxScroll() });
      } else {
        dispatch({ type: 'SCROLL_SERVICE_LOGS', delta: -4, maxScroll: getServiceMaxScroll() });
      }
      return;
    }

    if (key.home) {
      if (state.activePanel === 'globalLogs') {
        const maxScroll = getGlobalMaxScroll();
        dispatch({ type: 'SET_GLOBAL_LOG_SCROLL', value: maxScroll, maxScroll });
      } else {
        const maxScroll = getServiceMaxScroll();
        dispatch({ type: 'SET_SERVICE_LOG_SCROLL', value: maxScroll, maxScroll });
      }
      return;
    }

    if (key.end) {
      if (state.activePanel === 'globalLogs') {
        dispatch({ type: 'SET_GLOBAL_LOG_SCROLL', value: 0 });
      } else {
        dispatch({ type: 'SET_SERVICE_LOG_SCROLL', value: 0 });
      }
      return;
    }

    const getActiveLogList = (): LogEntry[] => {
      if (state.activePanel === 'globalLogs') {
        if (state.searchQuery.trim() || state.filterIndex > 0) {
          const activeFilter = state.filterOptions[state.filterIndex] || 'All Services';
          return state.globalLogs.filter(l => {
            if (activeFilter !== 'All Services' && l.service.toLowerCase() !== activeFilter.toLowerCase()) {
              return false;
            }
            if (state.searchQuery.trim()) {
              const q = state.searchQuery.toLowerCase();
              return l.message.toLowerCase().includes(q) || l.service.toLowerCase().includes(q);
            }
            return true;
          });
        }
        return state.globalLogs;
      }
      if (state.activePanel === 'serviceLogs') {
        const curSvc = state.services[state.selectedIndex];
        if (!curSvc) return [];
        return state.activeTab === 'errors' ? (curSvc.errorLogs || []) : (curSvc.logs || []);
      }
      return [];
    };

    const getVisibleLogsSlice = (): LogEntry[] => {
      const all = getActiveLogList();
      const maxLogs = state.activePanel === 'globalLogs'
        ? (viewport.maxGlobalLogs || 6)
        : (viewport.maxServiceLogs || 6);
      const scroll = state.activePanel === 'globalLogs'
        ? state.globalLogScroll
        : state.serviceLogScroll;
      const total = all.length;
      const maxScroll = Math.max(0, total - maxLogs);
      const eff = Math.max(0, Math.min(scroll, maxScroll));
      const endIdx = total - eff;
      const startIdx = Math.max(0, endIdx - maxLogs);
      return all.slice(startIdx, endIdx);
    };

    const getSelectedLog = (): LogEntry | null => {
      const visible = getVisibleLogsSlice();
      const currentIdx = state.activePanel === 'globalLogs'
        ? state.globalSelectedLogIndex
        : state.serviceSelectedLogIndex;
      return visible[currentIdx] || visible[visible.length - 1] || null;
    };

    // Arrow Up / Down or j / k behavior - Instant response, cursor tracking and smooth scrolling
    if (key.upArrow || input === 'k') {
      if (state.activePanel === 'services') {
        dispatch({ type: 'NAVIGATE_SERVICES', delta: -1 });
      } else if (state.activePanel === 'serviceLogs') {
        const curLog = getSelectedLog();
        const isExp = curLog && !!state.serviceExpandedLogIds[curLog.id];
        const jsonRes = isExp ? parseJsonLog(curLog.message) : null;
        const fullLines = jsonRes?.isJson && jsonRes.parsed ? formatJsonToHighlightedLines(jsonRes.parsed) : null;
        const maxJsonLines = Math.max(1, (viewport.contentHeight || 20) - 8);
        const maxJsonScroll = fullLines && fullLines.length > maxJsonLines ? fullLines.length - maxJsonLines : 0;

        if (isExp && state.serviceJsonLineScroll > 0) {
          dispatch({ type: 'SCROLL_JSON_LINES', delta: -1, maxScroll: maxJsonScroll, panel: 'service' });
        } else if (state.serviceSelectedLogIndex > 0) {
          dispatch({ type: 'SELECT_LOG_ROW', index: state.serviceSelectedLogIndex - 1, panel: 'service' });
        } else {
          dispatch({ type: 'SCROLL_SERVICE_LOGS', delta: 1, maxScroll: getServiceMaxScroll() });
        }
      } else if (state.activePanel === 'globalLogs') {
        const curLog = getSelectedLog();
        const isExp = curLog && !!state.globalExpandedLogIds[curLog.id];
        const jsonRes = isExp ? parseJsonLog(curLog.message) : null;
        const fullLines = jsonRes?.isJson && jsonRes.parsed ? formatJsonToHighlightedLines(jsonRes.parsed) : null;
        const maxJsonLines = Math.max(1, (viewport.contentHeight || 20) - 6);
        const maxJsonScroll = fullLines && fullLines.length > maxJsonLines ? fullLines.length - maxJsonLines : 0;

        if (isExp && state.globalJsonLineScroll > 0) {
          dispatch({ type: 'SCROLL_JSON_LINES', delta: -1, maxScroll: maxJsonScroll, panel: 'global' });
        } else if (state.globalSelectedLogIndex > 0) {
          dispatch({ type: 'SELECT_LOG_ROW', index: state.globalSelectedLogIndex - 1, panel: 'global' });
        } else {
          dispatch({ type: 'SCROLL_GLOBAL_LOGS', delta: 1, maxScroll: getGlobalMaxScroll() });
        }
      }
      return;
    }

    if (key.downArrow || input === 'j') {
      if (state.activePanel === 'services') {
        dispatch({ type: 'NAVIGATE_SERVICES', delta: 1 });
      } else if (state.activePanel === 'serviceLogs') {
        const curLog = getSelectedLog();
        const isExp = curLog && !!state.serviceExpandedLogIds[curLog.id];
        const jsonRes = isExp ? parseJsonLog(curLog.message) : null;
        const fullLines = jsonRes?.isJson && jsonRes.parsed ? formatJsonToHighlightedLines(jsonRes.parsed) : null;
        const maxJsonLines = Math.max(1, (viewport.contentHeight || 20) - 8);
        const maxJsonScroll = fullLines && fullLines.length > maxJsonLines ? fullLines.length - maxJsonLines : 0;

        if (isExp && state.serviceJsonLineScroll < maxJsonScroll) {
          dispatch({ type: 'SCROLL_JSON_LINES', delta: 1, maxScroll: maxJsonScroll, panel: 'service' });
        } else {
          const visible = getVisibleLogsSlice();
          const maxIdx = Math.max(0, visible.length - 1);
          if (state.serviceSelectedLogIndex < maxIdx) {
            dispatch({ type: 'SELECT_LOG_ROW', index: state.serviceSelectedLogIndex + 1, panel: 'service' });
          } else {
            dispatch({ type: 'SCROLL_SERVICE_LOGS', delta: -1, maxScroll: getServiceMaxScroll() });
          }
        }
      } else if (state.activePanel === 'globalLogs') {
        const curLog = getSelectedLog();
        const isExp = curLog && !!state.globalExpandedLogIds[curLog.id];
        const jsonRes = isExp ? parseJsonLog(curLog.message) : null;
        const fullLines = jsonRes?.isJson && jsonRes.parsed ? formatJsonToHighlightedLines(jsonRes.parsed) : null;
        const maxJsonLines = Math.max(1, (viewport.contentHeight || 20) - 6);
        const maxJsonScroll = fullLines && fullLines.length > maxJsonLines ? fullLines.length - maxJsonLines : 0;

        if (isExp && state.globalJsonLineScroll < maxJsonScroll) {
          dispatch({ type: 'SCROLL_JSON_LINES', delta: 1, maxScroll: maxJsonScroll, panel: 'global' });
        } else {
          const visible = getVisibleLogsSlice();
          const maxIdx = Math.max(0, visible.length - 1);
          if (state.globalSelectedLogIndex < maxIdx) {
            dispatch({ type: 'SELECT_LOG_ROW', index: state.globalSelectedLogIndex + 1, panel: 'global' });
          } else {
            dispatch({ type: 'SCROLL_GLOBAL_LOGS', delta: -1, maxScroll: getGlobalMaxScroll() });
          }
        }
      }
      return;
    }

    // Tabs switching (1-2 or left/right arrow)
    if (input === '1') { dispatch({ type: 'SET_ACTIVE_TAB', tab: 'logs' }); return; }
    if (input === '2') { dispatch({ type: 'SET_ACTIVE_TAB', tab: 'errors' }); return; }

    const tabs: ('logs' | 'errors')[] = ['logs', 'errors'];
    if (key.leftArrow) {
      const curIdx = tabs.indexOf(state.activeTab as any);
      dispatch({ type: 'SET_ACTIVE_TAB', tab: tabs[Math.max(0, curIdx - 1)]! });
      return;
    }
    if (key.rightArrow) {
      const curIdx = tabs.indexOf(state.activeTab as any);
      dispatch({ type: 'SET_ACTIVE_TAB', tab: tabs[Math.min(tabs.length - 1, curIdx + 1)]! });
      return;
    }

    // Mouse Mode toggle (m or M)
    if (input === 'm' || input === 'M') {
      const nextMode = state.mouseMode === 'interactive' ? 'native' : 'interactive';
      dispatch({ type: 'TOGGLE_MOUSE_MODE' });
      if (nextMode === 'native') {
        try { process.stdout.write('\x1b[?1000l\x1b[?1006l'); } catch {}
        dispatch({ 
          type: 'SHOW_TOAST', 
          message: '🖱️ Native Mouse: Drag trackpad to select text. Press "m" to switch back.',
          durationMs: 3500 
        });
      } else {
        try { process.stdout.write('\x1b[?1000h\x1b[?1006h'); } catch {}
        dispatch({ 
          type: 'SHOW_TOAST', 
          message: '🖱️ Interactive Mouse: Click buttons, tabs, and rows.',
          durationMs: 3000 
        });
      }
      return;
    }

    // Always restart on Shift+R
    if (input === 'R') {
      if (onRestartRef.current) onRestartRef.current(stateRef.current.selectedIndex);
      return;
    }

    // Service restart (r in services panel) or Copy Raw (r in log panels)
    if (input === 'r') {
      if (state.activePanel === 'services') {
        if (onRestartRef.current) onRestartRef.current(stateRef.current.selectedIndex);
      } else {
        const targetLog = getSelectedLog();
        if (targetLog) {
          const rawStream = targetLog.raw || targetLog.message;
          copyToClipboard(rawStream);
          dispatch({ type: 'SET_COPIED_FLASH', logId: targetLog.id });
          dispatch({ type: 'SHOW_TOAST', message: '✔ Copied raw stdout stream to clipboard!' });
        } else {
          dispatch({ type: 'SHOW_TOAST', message: 'ℹ No log line selected to copy' });
        }
      }
      return;
    }

    // Toggle service running/stopped state
    if (input === 's' || input === 'S') {
      if (onToggleStopRef.current) onToggleStopRef.current(stateRef.current.selectedIndex);
      return;
    }

    // Switch configuration profile
    if (input === 'p' || input === 'P') {
      if (onSwitchConfigRef.current) {
        onSwitchConfigRef.current();
        return;
      }
    }

    // Search and filter
    if (input === '/') {
      dispatch({ type: 'SET_SEARCHING', isSearching: true });
      return;
    }
    if (input === 'f') {
      dispatch({ type: 'CYCLE_FILTER' });
      return;
    }

    // Live toggle
    if (input === 'l') {
      dispatch({ type: 'TOGGLE_LIVE' });
      return;
    }

    // Toggle Wrap Mode (w)
    if (input === 'w' || input === 'W') {
      dispatch({ type: 'TOGGLE_WRAP_MODE' });
      return;
    }

    // Inline Expand / Collapse JSON (Enter, Space, v, or i)
    if (key.return || input === 'v' || input === 'V' || input === ' ' || input === 'i' || input === 'I') {
      if (state.activePanel === 'serviceLogs' || state.activePanel === 'globalLogs') {
        const targetLog = getSelectedLog();
        if (targetLog) {
          const jsonRes = parseJsonLog(targetLog.message);
          if (jsonRes.isJson) {
            dispatch({ 
              type: 'TOGGLE_LOG_EXPANSION', 
              logId: targetLog.id, 
              panel: state.activePanel === 'serviceLogs' ? 'service' : 'global' 
            });
            return;
          }
        }
      }
    }

    // Copy all errors of the current service (Shift+C)
    if (input === 'C') {
      const curSvc = state.services[state.selectedIndex];
      if (curSvc) {
        const text = formatAllErrors(curSvc);
        copyToClipboard(text);
        const errCount = curSvc.errorLogs?.length || (curSvc.lastError ? 1 : 0);
        dispatch({ type: 'SHOW_TOAST', message: `✔ Copied all errors (${errCount}) for "${curSvc.name}"` });
      }
      return;
    }

    // Copy focused log, error, or service summary (c or y)
    if (input === 'c' || input === 'y') {
      const curSvc = state.services[state.selectedIndex];

      if (state.activePanel === 'services') {
        if (curSvc) {
          const text = formatServiceErrorSummary(curSvc);
          copyToClipboard(text);
          dispatch({ type: 'SHOW_TOAST', message: `✔ Copied service summary for "${curSvc.name}"` });
        }
      } else {
        const targetLog = getSelectedLog();
        if (targetLog) {
          const jsonRes = parseJsonLog(targetLog.message);
          const isExpanded = !!(jsonRes.isJson && (state.expandedLogIds[targetLog.id] || state.isWrapMode));
          if (isExpanded && jsonRes.parsed) {
            const prettyText = prettyPrintJson(targetLog.message);
            copyToClipboard(prettyText);
            dispatch({ type: 'SET_COPIED_FLASH', logId: targetLog.id });
            dispatch({ type: 'SHOW_TOAST', message: '✔ Copied formatted JSON to clipboard!' });
          } else {
            const logText = formatLogEntry(targetLog, curSvc?.name);
            copyToClipboard(logText);
            dispatch({ type: 'SET_COPIED_FLASH', logId: targetLog.id });
            dispatch({ type: 'SHOW_TOAST', message: '✔ Copied selected log line to clipboard!' });
          }
        } else {
          dispatch({ type: 'SHOW_TOAST', message: 'ℹ No log selected to copy' });
        }
      }
      return;
    }
  });
}

