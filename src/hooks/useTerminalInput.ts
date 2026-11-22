import React, { useRef } from 'react';
import { useInput } from 'ink';
import { DashboardState, DashboardAction, FILTER_OPTIONS } from '../state/dashboardReducer.js';
import { ViewportInfo, JsonTextSelection, LogEntry } from '../types/index.js';
import { ClickManagerContextValue } from '../components/common/ClickManager.js';
import { stripAnsiEscapeCodes, truncateAnsiText } from '../utils/ansi.js';
import {
  copyToClipboardDetailed,
  getCopyFeedbackMessage,
  formatLogEntry,
  formatServiceErrorSummary,
  formatAllErrors
} from '../utils/clipboard.js';
import {
  prettyPrintJson,
  parseJsonLog,
  formatJsonToHighlightedLines,
  calculateVisibleLogWindow,
  filterGlobalLogs,
  getLogDisplayText,
  getLogWindowAnchorId,
  getSelectedJsonText
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
  const dragStartRef = useRef<{
    x: number;
    y: number;
    rowIdx: number;
    charIdx: number;
    textCol: number;
    msgLen: number;
    logId: string | number;
    panel: 'service' | 'global';
  } | null>(null);
  const jsonDragStartRef = useRef<{
    lineIdx: number;
    charIdx: number;
    logId: string | number;
    panel: 'service' | 'global';
  } | null>(null);

  const stateRef = useRef(state);
  stateRef.current = state;

  const onRestartRef = useRef(onRestart);
  onRestartRef.current = onRestart;

  const onToggleStopRef = useRef(onToggleStop);
  onToggleStopRef.current = onToggleStop;

  const onSwitchConfigRef = useRef(onSwitchConfig);
  onSwitchConfigRef.current = onSwitchConfig;

  useInput((input, key) => {
    const getLogWindow = (panel: 'service' | 'global') => {
      const curState = stateRef.current;
      const logs = panel === 'global'
        ? filterGlobalLogs(
            curState.globalLogs,
            curState.searchQuery,
            curState.filterOptions[curState.filterIndex] || 'All Services'
          )
        : (() => {
            const service = curState.services[curState.selectedIndex];
            return service
              ? (curState.activeTab === 'errors' ? service.errorLogs || [] : service.logs || [])
              : [];
          })();
      const isMaximized = curState.maximizedPanel === (panel === 'service' ? 'serviceLogs' : 'globalLogs');
      const isNarrow = viewport.width < 72 && curState.maximizedPanel === 'none';
      const panelHeight = isMaximized
        ? viewport.contentHeight
        : isNarrow
          ? viewport.contentHeight - 1
          : panel === 'service'
            ? viewport.detailPanelHeight
            : viewport.globalLogsPanelHeight;
      const overhead = panel === 'global'
        ? 4
        : !isMaximized && !isNarrow && viewport.isUltraCompactHeight ? 5 : 7;
      const availableLines = Math.max(panel === 'global' ? 2 : 1, panelHeight - overhead);
      const expandedLogIds = panel === 'service' ? curState.serviceExpandedLogIds : curState.globalExpandedLogIds;
      const selectedLogId = panel === 'service' ? curState.serviceSelectedLogId : curState.globalSelectedLogId;
      const selectionAnchorLogId = panel === 'service' ? curState.serviceSelectionAnchorLogId : curState.globalSelectionAnchorLogId;
      const anchorLogId = getLogWindowAnchorId(logs, selectedLogId, expandedLogIds, selectionAnchorLogId);
      return calculateVisibleLogWindow({
        logs,
        availableLines,
        scrollOffset: panel === 'service' ? curState.serviceLogScroll : curState.globalLogScroll,
        expandedLogIds,
        isWrapMode: curState.isWrapMode,
        anchorLogId
      });
    };

    const getActiveExpandedLog = (panel: 'service' | 'global'): LogEntry | null => {
      const curState = stateRef.current;
      const selectedLogId = panel === 'service' ? curState.serviceSelectedLogId : curState.globalSelectedLogId;
      const expandedLogIds = panel === 'service' ? curState.serviceExpandedLogIds : curState.globalExpandedLogIds;
      const visibleLogs = getLogWindow(panel).visibleLogs;
      const selectedIndex = panel === 'service' ? curState.serviceSelectedLogIndex : curState.globalSelectedLogIndex;
      const selectedLog = selectedLogId !== null
        ? visibleLogs.find(log => String(log.id) === String(selectedLogId))
        : visibleLogs[selectedIndex];
      return selectedLog && expandedLogIds[selectedLog.id] ? selectedLog : null;
    };

    const getJsonScrollBounds = (panel: 'service' | 'global', log: LogEntry) => {
      const jsonRes = parseJsonLog(log.message);
      if (!jsonRes.isJson || !jsonRes.parsed) return { maxScroll: 0, maxJsonLines: 1, totalLines: 0 };
      const fullLines = formatJsonToHighlightedLines(jsonRes.parsed);
      const maxJsonLines = getLogWindow(panel).maxJsonLines;
      const maxScroll = Math.max(0, fullLines.length - maxJsonLines);
      return { maxScroll, maxJsonLines, totalLines: fullLines.length };
    };

    const getJsonScrollOffset = (panel: 'service' | 'global', log: LogEntry) => panel === 'service'
      ? stateRef.current.serviceJsonLineScrollById[log.id] || 0
      : stateRef.current.globalJsonLineScroll;

    const getVisibleLogsSlice = (requestedPanel?: 'service' | 'global'): LogEntry[] => {
      const panel = requestedPanel || (stateRef.current.activePanel === 'globalLogs' ? 'global' : 'service');
      return getLogWindow(panel).visibleLogs;
    };

    const getSelectedLog = (specificIdx?: number, requestedPanel?: 'service' | 'global'): LogEntry | null => {
      const panel = requestedPanel || (stateRef.current.activePanel === 'globalLogs' ? 'global' : 'service');
      const visible = getVisibleLogsSlice(panel);
      const currentIdx = specificIdx !== undefined
        ? specificIdx
        : (panel === 'global'
            ? stateRef.current.globalSelectedLogIndex
            : stateRef.current.serviceSelectedLogIndex);
      const selectedId = panel === 'global' ? stateRef.current.globalSelectedLogId : stateRef.current.serviceSelectedLogId;
      if (specificIdx === undefined && selectedId !== null) {
        return visible.find(log => String(log.id) === String(selectedId)) || null;
      }
      return visible[currentIdx] || visible[visible.length - 1] || null;
    };

    const getSelectedVisibleIndex = (panel: 'service' | 'global') => {
      const visible = getVisibleLogsSlice(panel);
      const selectedId = panel === 'global' ? stateRef.current.globalSelectedLogId : stateRef.current.serviceSelectedLogId;
      const byId = selectedId === null ? -1 : visible.findIndex(log => String(log.id) === String(selectedId));
      const fallback = panel === 'global' ? stateRef.current.globalSelectedLogIndex : stateRef.current.serviceSelectedLogIndex;
      return byId >= 0 ? byId : Math.min(fallback, Math.max(0, visible.length - 1));
    };

    const getMessageDisplayText = (log: LogEntry, panel: 'service' | 'global') => {
      const curState = stateRef.current;
      const panelWidth = curState.maximizedPanel === (panel === 'service' ? 'serviceLogs' : 'globalLogs') || viewport.width < 72
        ? viewport.width
        : viewport.rightPanelWidth;
      const maxMessageLength = Math.max(12, Math.max(20, panelWidth - 4) - 22);
      if (panel === 'service' && curState.activeTab === 'errors') {
        const text = curState.isWrapMode ? log.message : truncateAnsiText(log.message, maxMessageLength);
        return stripAnsiEscapeCodes(text);
      }
      return stripAnsiEscapeCodes(getLogDisplayText(log, maxMessageLength, curState.isWrapMode));
    };

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
        const hasShift = (button & 4) !== 0;
        const isMotion = (button & 32) !== 0;
        const baseButton = button & ~28;

        // 1a. Left Click (Base Button 0 press)
        if (baseButton === 0 && isPress) {
          // Check if clicking on a log row to initialize drag tracking
          let rowRegion = clickManagerRef?.current?.findRegionAt(mouseX, mouseY);
          if (!rowRegion) {
            rowRegion = clickManagerRef?.current?.findRowRegionAt?.(mouseY, 'service-log-row') ||
                        clickManagerRef?.current?.findRowRegionAt?.(mouseY, 'global-log-row') || null;
          }
          const jsonLineMatch = rowRegion?.id.match(/^(service|global)-json-line-(\d+)-(\d+)$/);
          jsonDragStartRef.current = null;
          dragStartRef.current = null;
          if (jsonLineMatch) {
            const panel = jsonLineMatch[1] as 'service' | 'global';
            const rowIdx = parseInt(jsonLineMatch[2]!, 10);
            const lineIdx = parseInt(jsonLineMatch[3]!, 10);
            const log = getSelectedLog(rowIdx, panel);
            const parsed = log ? parseJsonLog(log.message) : null;
            const lines = parsed?.isJson && parsed.parsed ? formatJsonToHighlightedLines(parsed.parsed) : [];
            const lineText = lines[lineIdx]?.tokens.map(token => token.text).join('');
            if (log && rowRegion && lineText) {
              jsonDragStartRef.current = {
                lineIdx,
                charIdx: Math.max(0, Math.min(lineText.length - 1, mouseX - rowRegion.minX)),
                logId: log.id,
                panel
              };
            }
          } else if (rowRegion && rowRegion.id) {
            const matchSvc = rowRegion.id.match(/^service-log-row-(\d+)$/);
            const matchGlb = rowRegion.id.match(/^global-log-row-(\d+)$/);
            if (matchSvc) {
              const rowIdx = parseInt(matchSvc[1]!, 10);
              const textStart = rowRegion.textStartX || 19;
              const textCol = rowRegion.minX + textStart;
              const curLog = getSelectedLog(rowIdx, 'service');
              const msgLen = curLog ? getMessageDisplayText(curLog, 'service').length : 120;
              const charIdx = Math.max(0, Math.min(msgLen, mouseX - textCol));
              dragStartRef.current = {
                x: mouseX,
                y: mouseY,
                rowIdx,
                charIdx,
                textCol,
                msgLen,
                logId: curLog?.id ?? '',
                panel: 'service'
              };
            } else if (matchGlb) {
              const rowIdx = parseInt(matchGlb[1]!, 10);
              const textStart = rowRegion.textStartX || 23;
              const textCol = rowRegion.minX + textStart;
              const curLog = getSelectedLog(rowIdx, 'global');
              const msgLen = curLog ? getMessageDisplayText(curLog, 'global').length : 120;
              const charIdx = Math.max(0, Math.min(msgLen, mouseX - textCol));
              dragStartRef.current = {
                x: mouseX,
                y: mouseY,
                rowIdx,
                charIdx,
                textCol,
                msgLen,
                logId: curLog?.id ?? '',
                panel: 'global'
              };
            }
          } else {
            dragStartRef.current = null;
          }

          // First attempt dynamic dispatch to any registered <Clickable> component
          const wasHandled = clickManagerRef?.current?.dispatchClick(mouseX, mouseY, hasShift);
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

        // 1a-2. Motion with Button 0 down (Mouse Drag)
        if ((baseButton === 32 || isMotion) && isPress) {
          const jsonDrag = jsonDragStartRef.current;
          if (jsonDrag) {
            const curRegion = clickManagerRef?.current?.findRegionAt(mouseX, mouseY);
            const lineMatch = curRegion?.id.match(/^(service|global)-json-line-(\d+)-(\d+)$/);
            if (lineMatch && lineMatch[1] === jsonDrag.panel) {
              const rowIdx = parseInt(lineMatch[2]!, 10);
              const lineIdx = parseInt(lineMatch[3]!, 10);
              const visible = getVisibleLogsSlice(jsonDrag.panel);
              const log = visible[rowIdx];
              const parsed = log ? parseJsonLog(log.message) : null;
              const lines = parsed?.isJson && parsed.parsed ? formatJsonToHighlightedLines(parsed.parsed) : [];
              const lineRegion = curRegion;
              const lineText = lines[lineIdx]?.tokens.map(token => token.text).join('');
              if (log && String(log.id) === String(jsonDrag.logId) && lineRegion && lineText) {
                const selection: JsonTextSelection = {
                  logId: jsonDrag.logId,
                  anchorLine: jsonDrag.lineIdx,
                  anchorChar: jsonDrag.charIdx,
                  headLine: lineIdx,
                  headChar: Math.max(0, Math.min(lineText.length - 1, mouseX - lineRegion.minX))
                };
                dispatch({ type: 'SET_JSON_TEXT_SELECTION', selection, panel: jsonDrag.panel });
              }
            }
          } else {
            const drag = dragStartRef.current;
            if (drag) {
              let curRegion = clickManagerRef?.current?.findRegionAt(mouseX, mouseY);
              if (!curRegion) {
                curRegion = clickManagerRef?.current?.findRowRegionAt?.(mouseY, drag.panel === 'service' ? 'service-log-row' : 'global-log-row') || null;
              }
              const matchSvc = curRegion?.id?.match(/^service-log-row-(\d+)$/);
              const matchGlb = curRegion?.id?.match(/^global-log-row-(\d+)$/);
              const rowMatch = drag.panel === 'service' ? matchSvc : matchGlb;
              const curRowIdx = rowMatch ? parseInt(rowMatch[1]!, 10) : drag.rowIdx;

              if (curRowIdx === drag.rowIdx) {
                // Horizontal drag on the same log line -> Partial Character Selection!
                const curChar = Math.max(0, Math.min(Math.max(0, drag.msgLen - 1), mouseX - drag.textCol));
                const startChar = Math.min(drag.charIdx, curChar);
                const endChar = Math.min(drag.msgLen, Math.max(drag.charIdx, curChar) + 1);
                if (endChar > startChar) {
                  dispatch({
                    type: 'SET_CHAR_SELECTION_RANGE',
                    start: startChar,
                    end: endChar,
                    logId: drag.logId,
                    panel: drag.panel
                  });
                }
              } else {
                // Vertical drag across different lines -> Multi-line Range Selection!
                const visible = getVisibleLogsSlice(drag.panel);
                dispatch({
                  type: 'SET_LOG_SELECTION_RANGE',
                  anchorIndex: drag.rowIdx,
                  headIndex: curRowIdx,
                  anchorLogId: visible[drag.rowIdx]?.id,
                  headLogId: visible[curRowIdx]?.id,
                  panel: drag.panel
                });
              }
            }
          }
        }

        // 1a-3. Left Click Release (Base Button 0 release)
        if (baseButton === 0 && !isPress) {
          dragStartRef.current = null;
          jsonDragStartRef.current = null;
        }

        // 1b. Mouse Wheel UP (Base Button 64)
        const isWheelUp = baseButton === 64;
        if (isWheelUp) {
          const now = Date.now();
          const isLeftPanel = state.maximizedPanel === 'services'
            || (state.maximizedPanel === 'none' && (viewport.width < 72 ? state.narrowTab === 'services' : mouseX <= viewport.leftPanelWidth + 1));
          if (isLeftPanel) {
            if (now - lastServiceNavTimeRef.current >= 75) {
              lastServiceNavTimeRef.current = now;
              dispatch({ type: 'NAVIGATE_SERVICES', delta: -1 });
            }
          } else {
            if (now - lastLogScrollTimeRef.current >= 30) {
              lastLogScrollTimeRef.current = now;
              const detailEndRow = 1 + viewport.detailPanelHeight;
              const isDetailTarget = state.maximizedPanel === 'serviceLogs'
                || (state.maximizedPanel === 'none' && (viewport.width < 72 ? state.narrowTab === 'detail' : mouseY <= detailEndRow));
              if (isDetailTarget) {
                const expLog = getActiveExpandedLog('service');
                const bounds = expLog ? getJsonScrollBounds('service', expLog) : { maxScroll: 0 };
                const jsonOffset = expLog ? state.serviceJsonLineScrollById[expLog.id] || 0 : 0;
                if (expLog && bounds.maxScroll > 0 && jsonOffset > 0) {
                  dispatch({ type: 'SCROLL_JSON_LINES', delta: -1, maxScroll: bounds.maxScroll, logId: expLog.id, panel: 'service' });
                } else {
                  const totalLogs = state.services[state.selectedIndex]?.logs?.length || 0;
                  const maxScroll = Math.max(0, totalLogs - (viewport.maxServiceLogs || 6));
                  dispatch({ type: 'SCROLL_SERVICE_LOGS', delta: 1, maxScroll });
                }
              } else {
                const expLog = getActiveExpandedLog('global');
                const bounds = expLog ? getJsonScrollBounds('global', expLog) : { maxScroll: 0 };
                if (expLog && bounds.maxScroll > 0 && getJsonScrollOffset('global', expLog) > 0) {
                  dispatch({ type: 'SCROLL_JSON_LINES', delta: -1, maxScroll: bounds.maxScroll, logId: expLog.id, panel: 'global' });
                } else {
                  const totalLogs = state.globalLogs.length;
                  const maxScroll = Math.max(0, totalLogs - (viewport.maxGlobalLogs || 6));
                  dispatch({ type: 'SCROLL_GLOBAL_LOGS', delta: 1, maxScroll });
                }
              }
            }
          }
        }

        // 1c. Mouse Wheel DOWN (Base Button 65)
        const isWheelDown = baseButton === 65;
        if (isWheelDown) {
          const now = Date.now();
          const isLeftPanel = state.maximizedPanel === 'services'
            || (state.maximizedPanel === 'none' && (viewport.width < 72 ? state.narrowTab === 'services' : mouseX <= viewport.leftPanelWidth + 1));
          if (isLeftPanel) {
            if (now - lastServiceNavTimeRef.current >= 75) {
              lastServiceNavTimeRef.current = now;
              dispatch({ type: 'NAVIGATE_SERVICES', delta: 1 });
            }
          } else {
            if (now - lastLogScrollTimeRef.current >= 30) {
              lastLogScrollTimeRef.current = now;
              const detailEndRow = 1 + viewport.detailPanelHeight;
              const isDetailTarget = state.maximizedPanel === 'serviceLogs'
                || (state.maximizedPanel === 'none' && (viewport.width < 72 ? state.narrowTab === 'detail' : mouseY <= detailEndRow));
              if (isDetailTarget) {
                const expLog = getActiveExpandedLog('service');
                const bounds = expLog ? getJsonScrollBounds('service', expLog) : { maxScroll: 0 };
                const jsonOffset = expLog ? state.serviceJsonLineScrollById[expLog.id] || 0 : 0;
                if (expLog && bounds.maxScroll > 0 && jsonOffset < bounds.maxScroll) {
                  dispatch({ type: 'SCROLL_JSON_LINES', delta: 1, maxScroll: bounds.maxScroll, logId: expLog.id, panel: 'service' });
                } else {
                  const totalLogs = state.services[state.selectedIndex]?.logs?.length || 0;
                  const maxScroll = Math.max(0, totalLogs - (viewport.maxServiceLogs || 6));
                  dispatch({ type: 'SCROLL_SERVICE_LOGS', delta: -1, maxScroll });
                }
              } else {
                const expLog = getActiveExpandedLog('global');
                const bounds = expLog ? getJsonScrollBounds('global', expLog) : { maxScroll: 0 };
                if (expLog && bounds.maxScroll > 0 && getJsonScrollOffset('global', expLog) < bounds.maxScroll) {
                  dispatch({ type: 'SCROLL_JSON_LINES', delta: 1, maxScroll: bounds.maxScroll, logId: expLog.id, panel: 'global' });
                } else {
                  const totalLogs = state.globalLogs.length;
                  const maxScroll = Math.max(0, totalLogs - (viewport.maxGlobalLogs || 6));
                  dispatch({ type: 'SCROLL_GLOBAL_LOGS', delta: -1, maxScroll });
                }
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

    // Escape returns focus to services (or clears selection / restores zoom if active)
    if (key.escape) {
      if (
        state.serviceSelectionAnchor !== null ||
        state.globalSelectionAnchor !== null ||
        state.serviceCharSelection !== null ||
        state.globalCharSelection !== null
      ) {
        dispatch({ type: 'CLEAR_LOG_SELECTION' });
        return;
      }
      if (state.maximizedPanel !== 'none') {
        dispatch({ type: 'TOGGLE_MAXIMIZE_PANEL' });
        return;
      }
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

    // PageUp / PageDown or '[' / ']' for keyboard log scrolling & JSON fast paging
    if (key.pageUp || input === '[') {
      if (state.activePanel === 'globalLogs') {
        const expLog = getActiveExpandedLog('global');
        const bounds = expLog ? getJsonScrollBounds('global', expLog) : { maxScroll: 0 };
        if (expLog && bounds.maxScroll > 0 && getJsonScrollOffset('global', expLog) > 0) {
          dispatch({ type: 'SCROLL_JSON_LINES', delta: -5, maxScroll: bounds.maxScroll, logId: expLog.id, panel: 'global' });
        } else {
          dispatch({ type: 'SCROLL_GLOBAL_LOGS', delta: 4, maxScroll: getGlobalMaxScroll() });
        }
      } else {
        const expLog = getActiveExpandedLog('service');
        const bounds = expLog ? getJsonScrollBounds('service', expLog) : { maxScroll: 0 };
        if (expLog && bounds.maxScroll > 0 && getJsonScrollOffset('service', expLog) > 0) {
          dispatch({ type: 'SCROLL_JSON_LINES', delta: -5, maxScroll: bounds.maxScroll, logId: expLog.id, panel: 'service' });
        } else {
          dispatch({ type: 'SCROLL_SERVICE_LOGS', delta: 4, maxScroll: getServiceMaxScroll() });
        }
      }
      return;
    }

    if (key.pageDown || input === ']') {
      if (state.activePanel === 'globalLogs') {
        const expLog = getActiveExpandedLog('global');
        const bounds = expLog ? getJsonScrollBounds('global', expLog) : { maxScroll: 0 };
        if (expLog && bounds.maxScroll > 0 && getJsonScrollOffset('global', expLog) < bounds.maxScroll) {
          dispatch({ type: 'SCROLL_JSON_LINES', delta: 5, maxScroll: bounds.maxScroll, logId: expLog.id, panel: 'global' });
        } else {
          dispatch({ type: 'SCROLL_GLOBAL_LOGS', delta: -4, maxScroll: getGlobalMaxScroll() });
        }
      } else {
        const expLog = getActiveExpandedLog('service');
        const bounds = expLog ? getJsonScrollBounds('service', expLog) : { maxScroll: 0 };
        if (expLog && bounds.maxScroll > 0 && getJsonScrollOffset('service', expLog) < bounds.maxScroll) {
          dispatch({ type: 'SCROLL_JSON_LINES', delta: 5, maxScroll: bounds.maxScroll, logId: expLog.id, panel: 'service' });
        } else {
          dispatch({ type: 'SCROLL_SERVICE_LOGS', delta: -4, maxScroll: getServiceMaxScroll() });
        }
      }
      return;
    }

    if (key.home) {
      if (state.activePanel === 'globalLogs') {
        const expLog = getActiveExpandedLog('global');
        if (expLog && getJsonScrollOffset('global', expLog) > 0) {
          dispatch({ type: 'RESET_JSON_LINE_SCROLL', logId: expLog.id, panel: 'global' });
        } else {
          const maxScroll = getGlobalMaxScroll();
          dispatch({ type: 'SET_GLOBAL_LOG_SCROLL', value: maxScroll, maxScroll });
        }
      } else {
        const expLog = getActiveExpandedLog('service');
        if (expLog && getJsonScrollOffset('service', expLog) > 0) {
          dispatch({ type: 'RESET_JSON_LINE_SCROLL', logId: expLog.id, panel: 'service' });
        } else {
          const maxScroll = getServiceMaxScroll();
          dispatch({ type: 'SET_SERVICE_LOG_SCROLL', value: maxScroll, maxScroll });
        }
      }
      return;
    }

    if (key.end) {
      if (state.activePanel === 'globalLogs') {
        const expLog = getActiveExpandedLog('global');
        const bounds = expLog ? getJsonScrollBounds('global', expLog) : { maxScroll: 0 };
        if (expLog && bounds.maxScroll > 0 && getJsonScrollOffset('global', expLog) < bounds.maxScroll) {
          dispatch({ type: 'SCROLL_JSON_LINES', delta: bounds.maxScroll, maxScroll: bounds.maxScroll, logId: expLog.id, panel: 'global' });
        } else {
          dispatch({ type: 'SET_GLOBAL_LOG_SCROLL', value: 0 });
        }
      } else {
        const expLog = getActiveExpandedLog('service');
        const bounds = expLog ? getJsonScrollBounds('service', expLog) : { maxScroll: 0 };
        if (expLog && bounds.maxScroll > 0 && getJsonScrollOffset('service', expLog) < bounds.maxScroll) {
          dispatch({ type: 'SCROLL_JSON_LINES', delta: bounds.maxScroll, maxScroll: bounds.maxScroll, logId: expLog.id, panel: 'service' });
        } else {
          dispatch({ type: 'SET_SERVICE_LOG_SCROLL', value: 0 });
        }
      }
      return;
    }


    // Arrow Up / Down or j / k behavior - Instant response, cursor tracking and smooth scrolling
    if (key.upArrow || input === 'k' || (key.shift && input === 'K')) {
      const isShift = key.shift || input === 'K';
      if (state.activePanel === 'services') {
        dispatch({ type: 'NAVIGATE_SERVICES', delta: -1 });
      } else if (state.activePanel === 'serviceLogs') {
        const expLog = getActiveExpandedLog('service');
        const bounds = expLog ? getJsonScrollBounds('service', expLog) : { maxScroll: 0 };

        if (!isShift && expLog && bounds.maxScroll > 0 && getJsonScrollOffset('service', expLog) > 0) {
          dispatch({ type: 'SCROLL_JSON_LINES', delta: -1, maxScroll: bounds.maxScroll, logId: expLog.id, panel: 'service' });
        } else if (isShift) {
          const visible = getVisibleLogsSlice();
          const maxIdx = Math.max(0, visible.length - 1);
          const nextIdx = Math.max(0, Math.min(maxIdx, getSelectedVisibleIndex('service') - 1));
          dispatch({ type: 'EXTEND_LOG_SELECTION', delta: nextIdx - getSelectedVisibleIndex('service'), maxIndex: maxIdx, headIndex: nextIdx, anchorLogId: visible[getSelectedVisibleIndex('service')]?.id, headLogId: visible[nextIdx]?.id, panel: 'service' });
        } else if (getSelectedVisibleIndex('service') > 0) {
          const nextIdx = getSelectedVisibleIndex('service') - 1;
          dispatch({ type: 'SELECT_LOG_ROW', index: nextIdx, logId: getVisibleLogsSlice('service')[nextIdx]?.id, panel: 'service' });
        } else {
          dispatch({ type: 'SCROLL_SERVICE_LOGS', delta: 1, maxScroll: getServiceMaxScroll() });
        }
      } else if (state.activePanel === 'globalLogs') {
        const expLog = getActiveExpandedLog('global');
        const bounds = expLog ? getJsonScrollBounds('global', expLog) : { maxScroll: 0 };

        if (!isShift && expLog && bounds.maxScroll > 0 && getJsonScrollOffset('global', expLog) > 0) {
          dispatch({ type: 'SCROLL_JSON_LINES', delta: -1, maxScroll: bounds.maxScroll, logId: expLog.id, panel: 'global' });
        } else if (isShift) {
          const visible = getVisibleLogsSlice();
          const maxIdx = Math.max(0, visible.length - 1);
          const nextIdx = Math.max(0, Math.min(maxIdx, getSelectedVisibleIndex('global') - 1));
          dispatch({ type: 'EXTEND_LOG_SELECTION', delta: nextIdx - getSelectedVisibleIndex('global'), maxIndex: maxIdx, headIndex: nextIdx, anchorLogId: visible[getSelectedVisibleIndex('global')]?.id, headLogId: visible[nextIdx]?.id, panel: 'global' });
        } else if (getSelectedVisibleIndex('global') > 0) {
          const nextIdx = getSelectedVisibleIndex('global') - 1;
          dispatch({ type: 'SELECT_LOG_ROW', index: nextIdx, logId: getVisibleLogsSlice('global')[nextIdx]?.id, panel: 'global' });
        } else {
          dispatch({ type: 'SCROLL_GLOBAL_LOGS', delta: 1, maxScroll: getGlobalMaxScroll() });
        }
      }
      return;
    }

    if (key.downArrow || input === 'j' || (key.shift && input === 'J')) {
      const isShift = key.shift || input === 'J';
      if (state.activePanel === 'services') {
        dispatch({ type: 'NAVIGATE_SERVICES', delta: 1 });
      } else if (state.activePanel === 'serviceLogs') {
        const expLog = getActiveExpandedLog('service');
        const bounds = expLog ? getJsonScrollBounds('service', expLog) : { maxScroll: 0 };

        if (!isShift && expLog && bounds.maxScroll > 0 && getJsonScrollOffset('service', expLog) < bounds.maxScroll) {
          dispatch({ type: 'SCROLL_JSON_LINES', delta: 1, maxScroll: bounds.maxScroll, logId: expLog.id, panel: 'service' });
        } else if (isShift) {
          const visible = getVisibleLogsSlice();
          const maxIdx = Math.max(0, visible.length - 1);
          const nextIdx = Math.max(0, Math.min(maxIdx, getSelectedVisibleIndex('service') + 1));
          dispatch({ type: 'EXTEND_LOG_SELECTION', delta: nextIdx - getSelectedVisibleIndex('service'), maxIndex: maxIdx, headIndex: nextIdx, anchorLogId: visible[getSelectedVisibleIndex('service')]?.id, headLogId: visible[nextIdx]?.id, panel: 'service' });
        } else {
          const visible = getVisibleLogsSlice();
          const maxIdx = Math.max(0, visible.length - 1);
          if (getSelectedVisibleIndex('service') < maxIdx) {
            const nextIdx = getSelectedVisibleIndex('service') + 1;
            dispatch({ type: 'SELECT_LOG_ROW', index: nextIdx, logId: visible[nextIdx]?.id, panel: 'service' });
          } else {
            dispatch({ type: 'SCROLL_SERVICE_LOGS', delta: -1, maxScroll: getServiceMaxScroll() });
          }
        }
      } else if (state.activePanel === 'globalLogs') {
        const expLog = getActiveExpandedLog('global');
        const bounds = expLog ? getJsonScrollBounds('global', expLog) : { maxScroll: 0 };

        if (!isShift && expLog && bounds.maxScroll > 0 && getJsonScrollOffset('global', expLog) < bounds.maxScroll) {
          dispatch({ type: 'SCROLL_JSON_LINES', delta: 1, maxScroll: bounds.maxScroll, logId: expLog.id, panel: 'global' });
        } else if (isShift) {
          const visible = getVisibleLogsSlice();
          const maxIdx = Math.max(0, visible.length - 1);
          const nextIdx = Math.max(0, Math.min(maxIdx, getSelectedVisibleIndex('global') + 1));
          dispatch({ type: 'EXTEND_LOG_SELECTION', delta: nextIdx - getSelectedVisibleIndex('global'), maxIndex: maxIdx, headIndex: nextIdx, anchorLogId: visible[getSelectedVisibleIndex('global')]?.id, headLogId: visible[nextIdx]?.id, panel: 'global' });
        } else {
          const visible = getVisibleLogsSlice();
          const maxIdx = Math.max(0, visible.length - 1);
          if (getSelectedVisibleIndex('global') < maxIdx) {
            const nextIdx = getSelectedVisibleIndex('global') + 1;
            dispatch({ type: 'SELECT_LOG_ROW', index: nextIdx, logId: visible[nextIdx]?.id, panel: 'global' });
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
      if (key.shift && (state.activePanel === 'serviceLogs' || state.activePanel === 'globalLogs')) {
        const curLog = getSelectedLog();
        const panel = state.activePanel === 'serviceLogs' ? 'service' : 'global';
        const maxLen = curLog ? getMessageDisplayText(curLog, panel).length : 100;
        dispatch({ type: 'EXTEND_CHAR_SELECTION', delta: -1, maxLen, panel });
        return;
      }
      dispatch({ type: 'CLEAR_LOG_SELECTION' });
      const curIdx = tabs.indexOf(state.activeTab as any);
      dispatch({ type: 'SET_ACTIVE_TAB', tab: tabs[Math.max(0, curIdx - 1)]! });
      return;
    }
    if (key.rightArrow) {
      if (key.shift && (state.activePanel === 'serviceLogs' || state.activePanel === 'globalLogs')) {
        const curLog = getSelectedLog();
        const panel = state.activePanel === 'serviceLogs' ? 'service' : 'global';
        const maxLen = curLog ? getMessageDisplayText(curLog, panel).length : 100;
        dispatch({ type: 'EXTEND_CHAR_SELECTION', delta: 1, maxLen, panel });
        return;
      }
      dispatch({ type: 'CLEAR_LOG_SELECTION' });
      const curIdx = tabs.indexOf(state.activeTab as any);
      dispatch({ type: 'SET_ACTIVE_TAB', tab: tabs[Math.min(tabs.length - 1, curIdx + 1)]! });
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
          copyToClipboardDetailed(rawStream).then(res => {
            dispatch({ type: 'SET_COPIED_FLASH', logId: targetLog.id });
            dispatch({ type: 'SHOW_TOAST', message: getCopyFeedbackMessage(res, '✔ Copied raw stdout stream to clipboard!') });
          });
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

    // Toggle Maximize / Zoom Panel (z / Z)
    if (input === 'z' || input === 'Z') {
      dispatch({ type: 'TOGGLE_MAXIMIZE_PANEL' });
      return;
    }

    // Inline Expand / Collapse JSON (Enter, Space, v, or i)
    if (key.return || input === 'v' || input === 'V' || input === ' ' || input === 'i' || input === 'I') {
      if (state.activePanel === 'serviceLogs' || state.activePanel === 'globalLogs') {
        const targetLog = getSelectedLog();
        if (targetLog) {
          const jsonRes = parseJsonLog(targetLog.message);
          if (jsonRes.isJson) {
            const panel = state.activePanel === 'serviceLogs' ? 'service' : 'global';
            const selectedIndex = getSelectedVisibleIndex(panel);
            dispatch({
              type: 'SELECT_LOG_ROW',
              index: selectedIndex,
              logId: targetLog.id,
              panel
            });
            dispatch({ 
              type: 'TOGGLE_LOG_EXPANSION', 
              logId: targetLog.id, 
              panel
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
        const errCount = curSvc.errorLogs?.length || (curSvc.lastError ? 1 : 0);
        copyToClipboardDetailed(text).then(res => {
          dispatch({ type: 'SHOW_TOAST', message: getCopyFeedbackMessage(res, `✔ Copied all errors (${errCount}) for "${curSvc.name}"`) });
        });
      }
      return;
    }

    // Copy focused log, error, or service summary (c or y)
    if (input === 'c' || input === 'y') {
      const curSvc = state.services[state.selectedIndex];

      if (state.activePanel === 'services') {
        if (curSvc) {
          const text = formatServiceErrorSummary(curSvc);
          copyToClipboardDetailed(text).then(res => {
            dispatch({ type: 'SHOW_TOAST', message: getCopyFeedbackMessage(res, `✔ Copied service summary for "${curSvc.name}"`) });
          });
        }
      } else {
        const panel = state.activePanel === 'serviceLogs' ? 'service' : 'global';
        const charSel = panel === 'service' ? state.serviceCharSelection : state.globalCharSelection;
        const jsonTextSelection = panel === 'service' ? state.serviceJsonTextSelection : state.globalJsonTextSelection;
        const anchorId = panel === 'service' ? state.serviceSelectionAnchorLogId : state.globalSelectionAnchorLogId;
        const anchorIndex = panel === 'service' ? state.serviceSelectionAnchor : state.globalSelectionAnchor;
        const visible = getVisibleLogsSlice(panel);
        const anchorById = anchorId === null ? -1 : visible.findIndex(log => String(log.id) === String(anchorId));
        const anchor = anchorId !== null ? anchorById : anchorIndex;
        const targetLog = getSelectedLog();
        const jsonSelectionLog = jsonTextSelection
          ? visible.find(log => String(log.id) === String(jsonTextSelection.logId))
          : undefined;
        const currentIdx = targetLog
          ? visible.findIndex(log => String(log.id) === String(targetLog.id))
          : -1;

        if (jsonTextSelection) {
          if (!jsonSelectionLog) {
            dispatch({ type: 'SHOW_TOAST', message: 'ℹ Selected JSON text is no longer visible' });
          } else {
            const jsonRes = parseJsonLog(jsonSelectionLog.message);
            const selectedText = jsonRes.isJson && jsonRes.parsed
              ? getSelectedJsonText(formatJsonToHighlightedLines(jsonRes.parsed), jsonTextSelection)
              : null;
            if (selectedText === null) {
              dispatch({ type: 'SHOW_TOAST', message: 'ℹ Selected JSON text is no longer available' });
            } else {
              copyToClipboardDetailed(selectedText).then(res => {
                dispatch({ type: 'SET_COPIED_FLASH', logId: jsonSelectionLog.id });
                dispatch({ type: 'SHOW_TOAST', message: getCopyFeedbackMessage(res, `✔ Copied ${selectedText.length} selected JSON characters!`) });
              });
            }
          }
        } else if (charSel && targetLog) {
          const displayedMessage = getMessageDisplayText(targetLog, panel);
          const s = Math.max(0, Math.min(displayedMessage.length, charSel.start));
          const e = Math.max(s, Math.min(displayedMessage.length, charSel.end));
          const snippet = displayedMessage.slice(s, e);
          copyToClipboardDetailed(snippet).then(res => {
            dispatch({ type: 'SET_COPIED_FLASH', logId: targetLog.id });
            dispatch({ type: 'SHOW_TOAST', message: getCopyFeedbackMessage(res, `✔ Copied ${snippet.length} selected characters to clipboard!`) });
          });
        } else if (anchor !== null && anchor >= 0 && currentIdx >= 0 && anchor !== currentIdx) {
          const rMin = Math.min(anchor, currentIdx);
          const rMax = Math.max(anchor, currentIdx);
          const selectedEntries = visible.slice(rMin, rMax + 1);
          const formattedText = selectedEntries.map(l => formatLogEntry(l, panel === 'service' ? curSvc?.name : undefined)).join('\n');
          copyToClipboardDetailed(formattedText).then(res => {
            dispatch({ type: 'SET_COPIED_FLASH', logId: targetLog?.id || null });
            dispatch({ type: 'SHOW_TOAST', message: getCopyFeedbackMessage(res, `✔ Copied ${selectedEntries.length} selected log lines to clipboard!`) });
          });
        } else if (targetLog) {
          const jsonRes = parseJsonLog(targetLog.message);
          const isExpanded = !!(jsonRes.isJson && (panel === 'service' ? state.serviceExpandedLogIds[targetLog.id] : state.globalExpandedLogIds[targetLog.id]));
          if (isExpanded && jsonRes.parsed) {
            const prettyText = prettyPrintJson(targetLog.message);
            copyToClipboardDetailed(prettyText).then(res => {
              dispatch({ type: 'SET_COPIED_FLASH', logId: targetLog.id });
              dispatch({ type: 'SHOW_TOAST', message: getCopyFeedbackMessage(res, '✔ Copied formatted JSON to clipboard!') });
            });
          } else {
            const logText = formatLogEntry(targetLog, panel === 'service' ? curSvc?.name : undefined);
            copyToClipboardDetailed(logText).then(res => {
              dispatch({ type: 'SET_COPIED_FLASH', logId: targetLog.id });
              dispatch({ type: 'SHOW_TOAST', message: getCopyFeedbackMessage(res, '✔ Copied selected log line to clipboard!') });
            });
          }
        } else {
          dispatch({ type: 'SHOW_TOAST', message: 'ℹ No log selected to copy' });
        }
      }
      return;
    }
  });
}
