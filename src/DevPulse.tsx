import React, { useReducer, useEffect, useRef } from 'react';
import { Box, Text, useApp } from 'ink';
import Header from './components/Header.js';
import ServicesPanel from './components/ServicesPanel.js';
import ServiceDetailPanel from './components/ServiceDetailPanel.js';
import GlobalLogsPanel from './components/GlobalLogsPanel.js';
import Footer from './components/Footer.js';
import HelpModal from './components/HelpModal.js';
import { createInitialDashboardState, dashboardReducer } from './state/dashboardReducer.js';
import { useTerminalViewport } from './hooks/useTerminalViewport.js';
import { useTerminalInput } from './hooks/useTerminalInput.js';
import { useProcessRunner } from './hooks/useProcessRunner.js';
import { ClickProvider, Clickable, ClickManagerContextValue } from './components/common/ClickManager.js';
import { theme } from './theme/theme.js';
import { DevPulseConfig } from './types/config.js';
import { LogEntry } from './types/index.js';
import { stripAnsiEscapeCodes, truncateAnsiText } from './utils/ansi.js';
import {
  copyToClipboardDetailed,
  getCopyFeedbackMessage,
  formatLogEntry,
  formatServiceErrorSummary,
  formatAllErrors
} from './utils/clipboard.js';
import { prettyPrintJson, parseJsonLog, formatJsonToHighlightedLines, filterGlobalLogs, calculateVisibleLogWindow, getLogWindowAnchorId, getLogDisplayText, getSelectedJsonText } from './utils/logFormatter.js';

export interface DevPulseProps {
  config?: DevPulseConfig;
  onOpenConfig?: () => void;
  onSwitchConfig?: () => void;
  width?: number;
  height?: number;
}

export const DevPulse: React.FC<DevPulseProps> = ({ config, onOpenConfig, onSwitchConfig, width, height }) => {
  const { exit } = useApp();
  const [state, dispatch] = useReducer(dashboardReducer, config, createInitialDashboardState);
  const viewport = useTerminalViewport(width, height, state.maximizedPanel);
  const clickManagerRef = useRef<ClickManagerContextValue | null>(null);

  // Real OS Process Manager Orchestration
  const { handleRestart, handleToggleStop } = useProcessRunner({
    config,
    state,
    dispatch
  });

  // Keyboard navigation & hotkeys hook
  useTerminalInput({
    state,
    dispatch,
    viewport,
    exit,
    clickManagerRef,
    onRestart: handleRestart,
    onToggleStop: handleToggleStop,
    onSwitchConfig
  });

  // Time updater
  useEffect(() => {
    const timer = setInterval(() => {
      const now = new Date().toTimeString().split(' ')[0] || '12:00:00';
      dispatch({ type: 'TICK_CLOCK', time: now });
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  const selectedService = state.services[state.selectedIndex] || state.services[0];
  const activeFilter = state.filterOptions[state.filterIndex] || 'All Services';
  const handleSelectServiceLog = (index: number, isShift?: boolean, logId?: string | number) => {
    if (isShift) {
      const anchor = state.serviceSelectionAnchor !== null ? state.serviceSelectionAnchor : state.serviceSelectedLogIndex;
      const visibleLogs = getVisiblePanelLogs('service').visibleLogs;
      dispatch({
        type: 'SET_LOG_SELECTION_RANGE',
        anchorIndex: anchor,
        headIndex: index,
        anchorLogId: state.serviceSelectionAnchorLogId ?? state.serviceSelectedLogId ?? visibleLogs[anchor]?.id,
        headLogId: logId,
        panel: 'service'
      });
    } else {
      dispatch({ type: 'SELECT_LOG_ROW', index, logId, panel: 'service' });
    }
  };
  const handleSelectGlobalLog = (index: number, isShift?: boolean, logId?: string | number) => {
    if (isShift) {
      const anchor = state.globalSelectionAnchor !== null ? state.globalSelectionAnchor : state.globalSelectedLogIndex;
      const visibleLogs = getVisiblePanelLogs('global').visibleLogs;
      dispatch({
        type: 'SET_LOG_SELECTION_RANGE',
        anchorIndex: anchor,
        headIndex: index,
        anchorLogId: state.globalSelectionAnchorLogId ?? state.globalSelectedLogId ?? visibleLogs[anchor]?.id,
        headLogId: logId,
        panel: 'global'
      });
    } else {
      dispatch({ type: 'SELECT_LOG_ROW', index, logId, panel: 'global' });
    }
  };
  const getVisiblePanelLogs = (panel: 'service' | 'global') => {
    const logs = panel === 'global'
      ? filterGlobalLogs(state.globalLogs, state.searchQuery, activeFilter)
      : selectedService
        ? (state.activeTab === 'errors' ? selectedService.errorLogs || [] : selectedService.logs || [])
        : [];
    const isMaximized = state.maximizedPanel === (panel === 'service' ? 'serviceLogs' : 'globalLogs');
    const isNarrow = viewport.width < 72 && state.maximizedPanel === 'none';
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
    const expandedLogIds = panel === 'service' ? state.serviceExpandedLogIds : state.globalExpandedLogIds;
    const selectedLogId = panel === 'service' ? state.serviceSelectedLogId : state.globalSelectedLogId;
    const selectionAnchorLogId = panel === 'service' ? state.serviceSelectionAnchorLogId : state.globalSelectionAnchorLogId;
    const anchorLogId = getLogWindowAnchorId(logs, selectedLogId, expandedLogIds, selectionAnchorLogId);
    return calculateVisibleLogWindow({
      logs,
      availableLines,
      scrollOffset: panel === 'service' ? state.serviceLogScroll : state.globalLogScroll,
      expandedLogIds,
      isWrapMode: state.isWrapMode,
      anchorLogId
    });
  };
  const getPanelJsonSelectionText = (panel: 'service' | 'global'): string | null => {
    const selection = panel === 'service' ? state.serviceJsonTextSelection : state.globalJsonTextSelection;
    if (!selection) return null;
    const log = getVisiblePanelLogs(panel).visibleLogs.find(entry => String(entry.id) === String(selection.logId));
    if (!log) return null;
    const jsonResult = parseJsonLog(log.message);
    if (!jsonResult.isJson || !jsonResult.parsed) return null;
    return getSelectedJsonText(formatJsonToHighlightedLines(jsonResult.parsed), selection);
  };
  const copyPanelSelection = (panel: 'service' | 'global'): boolean => {
    const jsonSelection = panel === 'service' ? state.serviceJsonTextSelection : state.globalJsonTextSelection;
    if (jsonSelection) {
      const text = getPanelJsonSelectionText(panel);
      if (text === null) {
        dispatch({ type: 'SHOW_TOAST', message: 'ℹ Selected JSON text is no longer visible' });
        return true;
      }
      copyToClipboardDetailed(text).then(result => {
        dispatch({ type: 'SET_COPIED_FLASH', logId: jsonSelection.logId });
        dispatch({ type: 'SHOW_TOAST', message: getCopyFeedbackMessage(result, `✔ Copied ${text.length} selected JSON characters!`) });
      });
      return true;
    }

    const charSelection = panel === 'service' ? state.serviceCharSelection : state.globalCharSelection;
    const selectionAnchor = panel === 'service' ? state.serviceSelectionAnchorLogId : state.globalSelectionAnchorLogId;
    const selectedLogId = panel === 'service' ? state.serviceSelectedLogId : state.globalSelectedLogId;
    const visibleLogs = getVisiblePanelLogs(panel).visibleLogs;
    const selectedLog = selectedLogId === null
      ? undefined
      : visibleLogs.find(log => String(log.id) === String(selectedLogId));

    if (charSelection) {
      if (!selectedLog) {
        dispatch({ type: 'SHOW_TOAST', message: 'ℹ Selected text is no longer visible' });
        return true;
      }
      const panelWidth = state.maximizedPanel === (panel === 'service' ? 'serviceLogs' : 'globalLogs') || viewport.width < 72
        ? viewport.width
        : viewport.rightPanelWidth;
      const maxMessageLength = Math.max(12, Math.max(20, panelWidth - 4) - 22);
      const displayMessage = stripAnsiEscapeCodes(
        panel === 'service' && state.activeTab === 'errors'
          ? state.isWrapMode ? selectedLog.message : truncateAnsiText(selectedLog.message, maxMessageLength)
          : getLogDisplayText(selectedLog, maxMessageLength, state.isWrapMode)
      );
      const start = Math.max(0, Math.min(displayMessage.length, charSelection.start));
      const end = Math.max(start, Math.min(displayMessage.length, charSelection.end));
      const text = displayMessage.slice(start, end);
      copyToClipboardDetailed(text).then(result => {
        dispatch({ type: 'SET_COPIED_FLASH', logId: selectedLog.id });
        dispatch({ type: 'SHOW_TOAST', message: getCopyFeedbackMessage(result, `✔ Copied ${text.length} selected characters to clipboard!`) });
      });
      return true;
    }

    if (selectionAnchor !== null && selectedLogId !== null) {
      const anchorIndex = visibleLogs.findIndex(log => String(log.id) === String(selectionAnchor));
      const headIndex = visibleLogs.findIndex(log => String(log.id) === String(selectedLogId));
      if (anchorIndex < 0 || headIndex < 0) {
        dispatch({ type: 'SHOW_TOAST', message: 'ℹ Selected log range is no longer visible' });
        return true;
      }
      if (anchorIndex === headIndex) return false;
      const selectedEntries = visibleLogs.slice(Math.min(anchorIndex, headIndex), Math.max(anchorIndex, headIndex) + 1);
      const serviceName = panel === 'service' ? selectedService?.name : undefined;
      const text = selectedEntries.map(log => formatLogEntry(log, serviceName)).join('\n');
      copyToClipboardDetailed(text).then(result => {
        dispatch({ type: 'SET_COPIED_FLASH', logId: selectedLogId });
        dispatch({ type: 'SHOW_TOAST', message: getCopyFeedbackMessage(result, `✔ Copied ${selectedEntries.length} selected log lines to clipboard!`) });
      });
      return true;
    }

    return false;
  };

  // Dynamically derive honest system status for Header
  const runningCount = state.services.filter(s => s.status === 'running').length;
  const startingCount = state.services.filter(s => s.status === 'starting').length;
  const totalCount = state.services.length;

  let headerStatus = 'All Systems Running';
  let headerColor: string = theme.colors.running;

  if (totalCount === 0) {
    headerStatus = 'No Services Configured';
    headerColor = theme.colors.textMuted;
  } else if (startingCount > 0) {
    headerStatus = 'Booting Services';
    headerColor = theme.colors.accent;
  } else if (runningCount === 0) {
    headerStatus = 'All Services Stopped';
    headerColor = theme.colors.stopped;
  } else if (runningCount < totalCount) {
    headerStatus = `${runningCount}/${totalCount} Services Active`;
    headerColor = theme.colors.warning;
  }

  // Flash cleanup timer for inline copied indicator
  useEffect(() => {
    if (state.copiedLogId) {
      const timer = setTimeout(() => {
        dispatch({ type: 'SET_COPIED_FLASH', logId: null });
      }, 1200);
      return () => clearTimeout(timer);
    }
  }, [state.copiedLogId]);

  // Permanent SGR Mouse Reporting (clicks + drag selection + mouse wheel)
  useEffect(() => {
    try { process.stdout.write('\x1b[?1000h\x1b[?1002h\x1b[?1006h'); } catch {}
    return () => {
      try { process.stdout.write('\x1b[?1000l\x1b[?1002l\x1b[?1006l'); } catch {}
    };
  }, []);

  // Copy helpers
  const handleCopyCurrent = () => {
    if (copyPanelSelection('service')) return;
    if (state.activeTab === 'errors' && selectedService) {
      const errs = getVisiblePanelLogs('service').visibleLogs;
      const err = errs.find(log => String(log.id) === String(state.serviceSelectedLogId))
        || (state.serviceSelectedLogId === null ? errs[state.serviceSelectedLogIndex] : undefined);
      if (err) {
        copyToClipboardDetailed(err.message).then(res => {
          dispatch({ type: 'SET_COPIED_FLASH', logId: err.id });
          dispatch({ type: 'SHOW_TOAST', message: getCopyFeedbackMessage(res, `✔ Copied error from "${selectedService.name}"`) });
        });
      } else if (state.serviceSelectedLogId === null && selectedService.lastError) {
        copyToClipboardDetailed(selectedService.lastError).then(res => {
          dispatch({ type: 'SHOW_TOAST', message: getCopyFeedbackMessage(res, `✔ Copied error from "${selectedService.name}"`) });
        });
      } else if (state.serviceSelectedLogId !== null) {
        dispatch({ type: 'SHOW_TOAST', message: `ℹ Selected error is not visible for "${selectedService.name}"` });
      } else {
        dispatch({ type: 'SHOW_TOAST', message: `ℹ No errors to copy for "${selectedService.name}"` });
      }
    } else if (selectedService) {
      const logs = getVisiblePanelLogs('service').visibleLogs;
      const log = logs.find(entry => String(entry.id) === String(state.serviceSelectedLogId))
        || (state.serviceSelectedLogId === null ? logs[state.serviceSelectedLogIndex] : undefined);
      if (log) {
        const jsonRes = parseJsonLog(log.message);
        const isExpanded = !!(jsonRes.isJson && (state.serviceExpandedLogIds[log.id] || state.isWrapMode));
        if (isExpanded && jsonRes.parsed) {
          copyToClipboardDetailed(prettyPrintJson(log.message)).then(res => {
            dispatch({ type: 'SET_COPIED_FLASH', logId: log.id });
            dispatch({ type: 'SHOW_TOAST', message: getCopyFeedbackMessage(res, `✔ Copied formatted JSON from "${selectedService.name}"`) });
          });
        } else {
          copyToClipboardDetailed(formatLogEntry(log, selectedService.name)).then(res => {
            dispatch({ type: 'SET_COPIED_FLASH', logId: log.id });
            dispatch({ type: 'SHOW_TOAST', message: getCopyFeedbackMessage(res, `✔ Copied log from "${selectedService.name}"`) });
          });
        }
      } else {
        if (state.serviceSelectedLogId !== null) {
          dispatch({ type: 'SHOW_TOAST', message: `ℹ Selected log is not visible for "${selectedService.name}"` });
        } else {
          const text = formatServiceErrorSummary(selectedService);
          copyToClipboardDetailed(text).then(res => {
            dispatch({ type: 'SHOW_TOAST', message: getCopyFeedbackMessage(res, `✔ Copied summary for "${selectedService.name}"`) });
          });
        }
      }
    }
  };

  const handleCopyLog = (log: LogEntry) => {
    copyToClipboardDetailed(log.message).then(res => {
      dispatch({ type: 'SET_COPIED_FLASH', logId: log.id });
      dispatch({ type: 'SHOW_TOAST', message: getCopyFeedbackMessage(res, `✔ Copied log from "${log.service || selectedService?.name || 'service'}"`) });
    });
  };

  const handleCopyGlobalCurrent = () => {
    if (copyPanelSelection('global')) return;
    const visibleLogs = getVisiblePanelLogs('global').visibleLogs;
    const log = visibleLogs.find(entry => String(entry.id) === String(state.globalSelectedLogId))
      || (state.globalSelectedLogId === null ? visibleLogs[state.globalSelectedLogIndex] : undefined);
    if (log) {
      const jsonRes = parseJsonLog(log.message);
      const isExpanded = !!(jsonRes.isJson && (state.globalExpandedLogIds[log.id] || state.isWrapMode));
      if (isExpanded && jsonRes.parsed) {
        copyToClipboardDetailed(prettyPrintJson(log.message)).then(res => {
          dispatch({ type: 'SET_COPIED_FLASH', logId: log.id });
          dispatch({ type: 'SHOW_TOAST', message: getCopyFeedbackMessage(res, '✔ Copied formatted global JSON') });
        });
      } else {
        copyToClipboardDetailed(formatLogEntry(log)).then(res => {
          dispatch({ type: 'SET_COPIED_FLASH', logId: log.id });
          dispatch({ type: 'SHOW_TOAST', message: getCopyFeedbackMessage(res, '✔ Copied selected global log') });
        });
      }
    } else {
      dispatch({ type: 'SHOW_TOAST', message: 'ℹ No global logs to copy' });
    }
  };

  const handleScrollServiceJson = (delta: number, logId?: string | number) => {
    const logs = state.activeTab === 'errors' ? (selectedService?.errorLogs || []) : (selectedService?.logs || []);
    const curLog = logId !== undefined
      ? logs.find(log => String(log.id) === String(logId))
      : logs.find(log => String(log.id) === String(state.serviceSelectedLogId)) || logs[state.serviceSelectedLogIndex];
    if (!curLog) return;
    const jsonRes = parseJsonLog(curLog.message);
    const fullLines = jsonRes.isJson && jsonRes.parsed ? formatJsonToHighlightedLines(jsonRes.parsed) : [];
    const maxJsonLines = getVisiblePanelLogs('service').maxJsonLines;
    const maxScroll = Math.max(0, fullLines.length - maxJsonLines);
    dispatch({ type: 'SCROLL_JSON_LINES', delta, maxScroll, logId: curLog.id, panel: 'service' });
  };

  const handleScrollGlobalJson = (delta: number, logId?: string | number) => {
    const visibleLogs = getVisiblePanelLogs('global').visibleLogs;
    const curLog = logId !== undefined
      ? visibleLogs.find(log => String(log.id) === String(logId))
      : visibleLogs.find(log => String(log.id) === String(state.globalSelectedLogId)) || visibleLogs[state.globalSelectedLogIndex];
    if (!curLog) return;
    const jsonRes = parseJsonLog(curLog.message);
    const fullLines = jsonRes.isJson && jsonRes.parsed ? formatJsonToHighlightedLines(jsonRes.parsed) : [];
    const maxJsonLines = getVisiblePanelLogs('global').maxJsonLines;
    const maxScroll = Math.max(0, fullLines.length - maxJsonLines);
    dispatch({ type: 'SCROLL_JSON_LINES', delta, maxScroll, logId: curLog.id, panel: 'global' });
  };

  // Calculate active selection summary for Footer
  let selectionText: string | null = null;
  if (state.activePanel === 'serviceLogs') {
    const jsonText = getPanelJsonSelectionText('service');
    if (state.serviceJsonTextSelection) {
      selectionText = jsonText === null ? 'JSON text' : `${jsonText.length} JSON chars`;
    } else if (state.serviceCharSelection) {
      const chars = Math.max(0, state.serviceCharSelection.end - state.serviceCharSelection.start);
      selectionText = `${chars} chars`;
    } else if (state.serviceSelectionAnchor !== null && state.serviceSelectionAnchor !== state.serviceSelectedLogIndex) {
      const lines = Math.abs(state.serviceSelectedLogIndex - state.serviceSelectionAnchor) + 1;
      selectionText = `${lines} lines`;
    }
  } else if (state.activePanel === 'globalLogs') {
    const jsonText = getPanelJsonSelectionText('global');
    if (state.globalJsonTextSelection) {
      selectionText = jsonText === null ? 'JSON text' : `${jsonText.length} JSON chars`;
    } else if (state.globalCharSelection) {
      const chars = Math.max(0, state.globalCharSelection.end - state.globalCharSelection.start);
      selectionText = `${chars} chars`;
    } else if (state.globalSelectionAnchor !== null && state.globalSelectionAnchor !== state.globalSelectedLogIndex) {
      const lines = Math.abs(state.globalSelectedLogIndex - state.globalSelectionAnchor) + 1;
      selectionText = `${lines} lines`;
    }
  }

  return (
    <ClickProvider clickManagerRef={clickManagerRef}>
      <Box 
        flexDirection="column" 
        width={viewport.width} 
        height={viewport.height}
        backgroundColor={theme.colors.canvas}
        justifyContent="space-between"
        paddingX={0}
        paddingY={0}
      >
        {/* 1. Header Bar (Row 1, guaranteed 1 line) */}
        <Header 
          time={state.time} 
          systemStatus={headerStatus} 
          statusColor={headerColor}
          width={viewport.width}
          toastMessage={state.toastMessage}
        />

        {/* 2. Main Content Area */}
        {state.maximizedPanel === 'serviceLogs' ? (
          /* Maximized Focus Mode: Service Detail Panel Full Screen */
          <Box flexDirection="column" width={viewport.width} height={viewport.contentHeight}>
            <ServiceDetailPanel 
              service={selectedService} 
              activeTab={state.activeTab}
              isRestarting={state.restartingServiceId === selectedService?.id}
              maxLogs={viewport.maxServiceLogs}
              isFocused={true}
              scrollOffset={state.serviceLogScroll}
              panelWidth={viewport.width}
              height={viewport.contentHeight}
              isWrapMode={state.isWrapMode}
              isMaximized={true}
              selectedLogIndex={state.serviceSelectedLogIndex}
              selectedLogId={state.serviceSelectedLogId}
              selectionAnchor={state.serviceSelectionAnchor}
              selectionAnchorLogId={state.serviceSelectionAnchorLogId}
              charSelection={state.serviceCharSelection}
              jsonTextSelection={state.serviceJsonTextSelection}
              jsonLineScroll={state.serviceJsonLineScroll}
              jsonLineScrollById={state.serviceJsonLineScrollById}
              expandedLogIds={state.serviceExpandedLogIds}
              copiedLogId={state.copiedLogId}
              onRestart={() => handleRestart(state.selectedIndex)}
              onToggleStop={() => handleToggleStop(state.selectedIndex)}
              onSelectTab={(tab) => dispatch({ type: 'SET_ACTIVE_TAB', tab })}
              onToggleWrap={() => dispatch({ type: 'TOGGLE_WRAP_MODE' })}
              onToggleMaximize={() => dispatch({ type: 'TOGGLE_MAXIMIZE_PANEL' })}
              onScrollJson={handleScrollServiceJson}
              onFocus={() => dispatch({ type: 'SET_ACTIVE_PANEL', panel: 'serviceLogs' })}
              onCopyCurrent={handleCopyCurrent}
              onCopyLog={handleCopyLog}
              onSelectLogIndex={handleSelectServiceLog}
              onToggleExpandLog={(logId) => dispatch({ type: 'TOGGLE_LOG_EXPANSION', logId, panel: 'service' })}
            />
          </Box>
        ) : state.maximizedPanel === 'globalLogs' ? (
          /* Maximized Focus Mode: Global Logs Panel Full Screen */
          <Box flexDirection="column" width={viewport.width} height={viewport.contentHeight}>
            <GlobalLogsPanel 
              logs={state.globalLogs}
              searchQuery={state.searchQuery}
              isSearching={state.isSearching}
              activeFilter={activeFilter}
              isLive={state.isLive}
              maxLogs={viewport.maxGlobalLogs}
              isFocused={true}
              scrollOffset={state.globalLogScroll}
              panelWidth={viewport.width}
              height={viewport.contentHeight}
              isWrapMode={state.isWrapMode}
              isMaximized={true}
              selectedLogIndex={state.globalSelectedLogIndex}
              selectedLogId={state.globalSelectedLogId}
              selectionAnchor={state.globalSelectionAnchor}
              selectionAnchorLogId={state.globalSelectionAnchorLogId}
              charSelection={state.globalCharSelection}
              jsonTextSelection={state.globalJsonTextSelection}
              jsonLineScroll={state.globalJsonLineScroll}
              expandedLogIds={state.globalExpandedLogIds}
              copiedLogId={state.copiedLogId}
              onToggleSearch={() => dispatch({ type: 'SET_SEARCHING', isSearching: !state.isSearching })}
              onCycleFilter={() => dispatch({ type: 'CYCLE_FILTER' })}
              onToggleLive={() => dispatch({ type: 'TOGGLE_LIVE' })}
              onToggleWrap={() => dispatch({ type: 'TOGGLE_WRAP_MODE' })}
              onToggleMaximize={() => dispatch({ type: 'TOGGLE_MAXIMIZE_PANEL' })}
              onScrollJson={handleScrollGlobalJson}
              onFocus={() => dispatch({ type: 'SET_ACTIVE_PANEL', panel: 'globalLogs' })}
              onCopyCurrent={handleCopyGlobalCurrent}
              onCopyLog={handleCopyLog}
              onSelectLogIndex={handleSelectGlobalLog}
              onToggleExpandLog={(logId) => dispatch({ type: 'TOGGLE_LOG_EXPANSION', logId, panel: 'global' })}
            />
          </Box>
        ) : state.maximizedPanel === 'services' ? (
          /* Maximized Focus Mode: Services List Full Screen */
          <Box flexDirection="column" width={viewport.width} height={viewport.contentHeight}>
            <ServicesPanel 
              services={state.services} 
              selectedIndex={state.selectedIndex}
              isFocused={true}
              isCompactHeight={false}
              panelWidth={viewport.width}
              height={viewport.contentHeight}
              onSelectService={(idx) => dispatch({ type: 'SELECT_SERVICE', index: idx })}
              onFocus={() => dispatch({ type: 'SET_ACTIVE_PANEL', panel: 'services' })}
            />
          </Box>
        ) : viewport.isUltraNarrow ? (
          /* Ultra-Narrow Single Column View with Top Switcher */
          <Box flexDirection="column" width={viewport.width} height={viewport.contentHeight}>
            <Box flexDirection="row" marginBottom={0} paddingX={1} flexWrap="nowrap">
              <Clickable onClick={() => dispatch({ type: 'SET_NARROW_TAB', tab: 'services' })}>
                <Text color={state.narrowTab === 'services' ? theme.colors.accent : theme.colors.textMuted} bold={state.narrowTab === 'services'}>
                  [1: Services]{' '}
                </Text>
              </Clickable>
              <Clickable onClick={() => dispatch({ type: 'SET_NARROW_TAB', tab: 'detail' })}>
                <Text color={state.narrowTab === 'detail' ? theme.colors.accent : theme.colors.textMuted} bold={state.narrowTab === 'detail'}>
                  [2: Detail]{' '}
                </Text>
              </Clickable>
              <Clickable onClick={() => dispatch({ type: 'SET_NARROW_TAB', tab: 'logs' })}>
                <Text color={state.narrowTab === 'logs' ? theme.colors.accent : theme.colors.textMuted} bold={state.narrowTab === 'logs'}>
                  [3: Global Logs]
                </Text>
              </Clickable>
            </Box>
            {state.narrowTab === 'services' && (
              <Box flexDirection="column" width={viewport.width} height={viewport.contentHeight - 1}>
                <ServicesPanel 
                  services={state.services} 
                  selectedIndex={state.selectedIndex}
                  isFocused={state.activePanel === 'services'}
                  isCompactHeight={true}
                  panelWidth={viewport.width}
                  height={viewport.servicesPanelHeight}
                  onSelectService={(idx) => dispatch({ type: 'SELECT_SERVICE', index: idx })}
                  onFocus={() => dispatch({ type: 'SET_ACTIVE_PANEL', panel: 'services' })}
                />
              </Box>
            )}
            {state.narrowTab === 'detail' && (
              <ServiceDetailPanel 
                service={selectedService} 
                activeTab={state.activeTab}
                isRestarting={state.restartingServiceId === selectedService?.id}
                maxLogs={Math.max(4, viewport.contentHeight - 6)}
                isFocused={true}
                scrollOffset={state.serviceLogScroll}
                panelWidth={viewport.width}
                height={viewport.contentHeight - 1}
                isWrapMode={state.isWrapMode}
                selectedLogIndex={state.serviceSelectedLogIndex}
                selectedLogId={state.serviceSelectedLogId}
                selectionAnchor={state.serviceSelectionAnchor}
                selectionAnchorLogId={state.serviceSelectionAnchorLogId}
                charSelection={state.serviceCharSelection}
                jsonTextSelection={state.serviceJsonTextSelection}
                jsonLineScroll={state.serviceJsonLineScroll}
                jsonLineScrollById={state.serviceJsonLineScrollById}
                expandedLogIds={state.serviceExpandedLogIds}
                copiedLogId={state.copiedLogId}
                onRestart={() => handleRestart(state.selectedIndex)}
                onToggleStop={() => handleToggleStop(state.selectedIndex)}
                onSelectTab={(tab) => dispatch({ type: 'SET_ACTIVE_TAB', tab })}
                onToggleWrap={() => dispatch({ type: 'TOGGLE_WRAP_MODE' })}
                onToggleMaximize={() => dispatch({ type: 'TOGGLE_MAXIMIZE_PANEL' })}
                onScrollJson={handleScrollServiceJson}
                onFocus={() => dispatch({ type: 'SET_ACTIVE_PANEL', panel: 'serviceLogs' })}
                onCopyCurrent={handleCopyCurrent}
                onCopyLog={handleCopyLog}
                onSelectLogIndex={handleSelectServiceLog}
                onToggleExpandLog={(logId) => dispatch({ type: 'TOGGLE_LOG_EXPANSION', logId, panel: 'service' })}
              />
            )}
            {state.narrowTab === 'logs' && (
              <GlobalLogsPanel 
                logs={state.globalLogs}
                searchQuery={state.searchQuery}
                isSearching={state.isSearching}
                activeFilter={activeFilter}
                isLive={state.isLive}
                maxLogs={Math.max(4, viewport.contentHeight - 4)}
                isFocused={true}
                scrollOffset={state.globalLogScroll}
                panelWidth={viewport.width}
                height={viewport.contentHeight - 1}
                isWrapMode={state.isWrapMode}
                selectedLogIndex={state.globalSelectedLogIndex}
                selectedLogId={state.globalSelectedLogId}
                selectionAnchor={state.globalSelectionAnchor}
                selectionAnchorLogId={state.globalSelectionAnchorLogId}
                charSelection={state.globalCharSelection}
                jsonTextSelection={state.globalJsonTextSelection}
                jsonLineScroll={state.globalJsonLineScroll}
                expandedLogIds={state.globalExpandedLogIds}
                copiedLogId={state.copiedLogId}
                onToggleSearch={() => dispatch({ type: 'SET_SEARCHING', isSearching: !state.isSearching })}
                onCycleFilter={() => dispatch({ type: 'CYCLE_FILTER' })}
                onToggleLive={() => dispatch({ type: 'TOGGLE_LIVE' })}
                onToggleWrap={() => dispatch({ type: 'TOGGLE_WRAP_MODE' })}
                onToggleMaximize={() => dispatch({ type: 'TOGGLE_MAXIMIZE_PANEL' })}
                onScrollJson={handleScrollGlobalJson}
                onFocus={() => dispatch({ type: 'SET_ACTIVE_PANEL', panel: 'globalLogs' })}
                onCopyCurrent={handleCopyGlobalCurrent}
                onCopyLog={handleCopyLog}
                onSelectLogIndex={handleSelectGlobalLog}
                onToggleExpandLog={(logId) => dispatch({ type: 'TOGGLE_LOG_EXPANSION', logId, panel: 'global' })}
              />
            )}
          </Box>
        ) : (
          /* Standard 2-Column Responsive Dashboard */
          <Box flexDirection="row" width={viewport.width} height={viewport.contentHeight} backgroundColor={theme.colors.canvas}>
            {/* Left Column (Services Panel Full Height) */}
            <Box flexDirection="column" width={viewport.leftPanelWidth} height={viewport.contentHeight} marginRight={1} backgroundColor={theme.colors.canvas}>
              <ServicesPanel 
                services={state.services} 
                selectedIndex={state.selectedIndex}
                isFocused={state.activePanel === 'services'}
                isCompactHeight={viewport.isCompactHeight}
                panelWidth={viewport.leftPanelWidth}
                height={viewport.servicesPanelHeight}
                onSelectService={(idx) => dispatch({ type: 'SELECT_SERVICE', index: idx })}
                onFocus={() => dispatch({ type: 'SET_ACTIVE_PANEL', panel: 'services' })}
              />
            </Box>

            {/* Right Column (Service Detail & Global Logs) */}
            <Box 
              flexDirection="column" 
              width={viewport.rightPanelWidth} 
              height={viewport.contentHeight} 
              overflow="hidden"
              flexShrink={0}
              backgroundColor={theme.colors.canvas}
            >
              <ServiceDetailPanel 
                service={selectedService} 
                activeTab={state.activeTab}
                isRestarting={state.restartingServiceId === selectedService?.id}
                maxLogs={viewport.maxServiceLogs}
                isFocused={state.activePanel === 'serviceLogs'}
                scrollOffset={state.serviceLogScroll}
                panelWidth={viewport.rightPanelWidth}
                height={viewport.detailPanelHeight}
                isUltraCompact={viewport.isUltraCompactHeight}
                isWrapMode={state.isWrapMode}
                selectedLogIndex={state.serviceSelectedLogIndex}
                selectedLogId={state.serviceSelectedLogId}
                selectionAnchor={state.serviceSelectionAnchor}
                selectionAnchorLogId={state.serviceSelectionAnchorLogId}
                charSelection={state.serviceCharSelection}
                jsonTextSelection={state.serviceJsonTextSelection}
                jsonLineScroll={state.serviceJsonLineScroll}
                jsonLineScrollById={state.serviceJsonLineScrollById}
                expandedLogIds={state.serviceExpandedLogIds}
                copiedLogId={state.copiedLogId}
                onRestart={() => handleRestart(state.selectedIndex)}
                onToggleStop={() => handleToggleStop(state.selectedIndex)}
                onSelectTab={(tab) => dispatch({ type: 'SET_ACTIVE_TAB', tab })}
                onToggleWrap={() => dispatch({ type: 'TOGGLE_WRAP_MODE' })}
                onToggleMaximize={() => dispatch({ type: 'TOGGLE_MAXIMIZE_PANEL' })}
                onScrollJson={handleScrollServiceJson}
                onFocus={() => dispatch({ type: 'SET_ACTIVE_PANEL', panel: 'serviceLogs' })}
                onCopyCurrent={handleCopyCurrent}
                onCopyLog={handleCopyLog}
                onSelectLogIndex={handleSelectServiceLog}
                onToggleExpandLog={(logId) => dispatch({ type: 'TOGGLE_LOG_EXPANSION', logId, panel: 'service' })}
              />
              <GlobalLogsPanel 
                logs={state.globalLogs}
                searchQuery={state.searchQuery}
                isSearching={state.isSearching}
                activeFilter={activeFilter}
                isLive={state.isLive}
                maxLogs={viewport.maxGlobalLogs}
                isFocused={state.activePanel === 'globalLogs'}
                scrollOffset={state.globalLogScroll}
                panelWidth={viewport.rightPanelWidth}
                height={viewport.globalLogsPanelHeight}
                isWrapMode={state.isWrapMode}
                selectedLogIndex={state.globalSelectedLogIndex}
                selectedLogId={state.globalSelectedLogId}
                selectionAnchor={state.globalSelectionAnchor}
                selectionAnchorLogId={state.globalSelectionAnchorLogId}
                charSelection={state.globalCharSelection}
                jsonTextSelection={state.globalJsonTextSelection}
                jsonLineScroll={state.globalJsonLineScroll}
                expandedLogIds={state.globalExpandedLogIds}
                copiedLogId={state.copiedLogId}
                onToggleSearch={() => dispatch({ type: 'SET_SEARCHING', isSearching: !state.isSearching })}
                onCycleFilter={() => dispatch({ type: 'CYCLE_FILTER' })}
                onToggleLive={() => dispatch({ type: 'TOGGLE_LIVE' })}
                onToggleWrap={() => dispatch({ type: 'TOGGLE_WRAP_MODE' })}
                onToggleMaximize={() => dispatch({ type: 'TOGGLE_MAXIMIZE_PANEL' })}
                onScrollJson={handleScrollGlobalJson}
                onFocus={() => dispatch({ type: 'SET_ACTIVE_PANEL', panel: 'globalLogs' })}
                onCopyCurrent={handleCopyGlobalCurrent}
                onCopyLog={handleCopyLog}
                onSelectLogIndex={handleSelectGlobalLog}
                onToggleExpandLog={(logId) => dispatch({ type: 'TOGGLE_LOG_EXPANSION', logId, panel: 'global' })}
              />
            </Box>
          </Box>
        )}

        {/* 3. Footer Bar (Bottom Row, guaranteed 1 line) */}
        <Footer 
          isConnected={true} 
          activePanel={state.activePanel} 
          width={viewport.width} 
          isMaximized={state.maximizedPanel !== 'none'}
          selectionText={selectionText}
          onToggleHelp={() => dispatch({ type: 'TOGGLE_HELP', show: !state.showHelp })}
          onSwitchConfig={onSwitchConfig}
          onToggleMaximize={() => dispatch({ type: 'TOGGLE_MAXIMIZE_PANEL' })}
        />

        {/* 4. Optional Help Overlay Modal */}
        {state.showHelp && (
          <Box 
            position="absolute" 
            width={viewport.width} 
            height={viewport.height} 
            alignItems="center" 
            justifyContent="center"
          >
            <HelpModal 
              onClose={() => dispatch({ type: 'TOGGLE_HELP', show: false })} 
              width={viewport.width}
              height={viewport.height}
            />
          </Box>
        )}
      </Box>
    </ClickProvider>
  );
};

export default DevPulse;
