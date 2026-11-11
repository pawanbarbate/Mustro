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
import {
  copyToClipboard,
  formatLogEntry,
  formatServiceErrorSummary,
  formatAllErrors
} from './utils/clipboard.js';
import { prettyPrintJson, parseJsonLog } from './utils/logFormatter.js';

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
  const viewport = useTerminalViewport(width, height);
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

  // Mouse Mode effect
  useEffect(() => {
    if (state.mouseMode === 'native') {
      try { process.stdout.write('\x1b[?1000l\x1b[?1006l'); } catch {}
    } else {
      try { process.stdout.write('\x1b[?1000h\x1b[?1006h'); } catch {}
    }
  }, [state.mouseMode]);

  const handleToggleMouseMode = () => {
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
  };

  // Copy helpers
  const handleCopyCurrent = () => {
    if (state.activeTab === 'errors' && selectedService) {
      const errs = selectedService.errorLogs || [];
      const err = errs[state.selectedLogIndex] || errs[errs.length - 1];
      if (err) {
        copyToClipboard(err.message);
        dispatch({ type: 'SET_COPIED_FLASH', logId: err.id });
        dispatch({ type: 'SHOW_TOAST', message: `✔ Copied error from "${selectedService.name}"` });
      } else if (selectedService.lastError) {
        copyToClipboard(selectedService.lastError);
        dispatch({ type: 'SHOW_TOAST', message: `✔ Copied error from "${selectedService.name}"` });
      } else {
        dispatch({ type: 'SHOW_TOAST', message: `ℹ No errors to copy for "${selectedService.name}"` });
      }
    } else if (selectedService) {
      const logs = selectedService.logs || [];
      const log = logs[state.selectedLogIndex] || logs[logs.length - 1];
      if (log) {
        const jsonRes = parseJsonLog(log.message);
        const isExpanded = !!(jsonRes.isJson && (state.expandedLogIds[log.id] || state.isWrapMode));
        if (isExpanded && jsonRes.parsed) {
          copyToClipboard(prettyPrintJson(log.message));
          dispatch({ type: 'SET_COPIED_FLASH', logId: log.id });
          dispatch({ type: 'SHOW_TOAST', message: `✔ Copied formatted JSON from "${selectedService.name}"` });
        } else {
          copyToClipboard(formatLogEntry(log, selectedService.name));
          dispatch({ type: 'SET_COPIED_FLASH', logId: log.id });
          dispatch({ type: 'SHOW_TOAST', message: `✔ Copied log from "${selectedService.name}"` });
        }
      } else {
        const text = formatServiceErrorSummary(selectedService);
        copyToClipboard(text);
        dispatch({ type: 'SHOW_TOAST', message: `✔ Copied summary for "${selectedService.name}"` });
      }
    }
  };

  const handleCopyLog = (log: LogEntry) => {
    copyToClipboard(log.message);
    dispatch({ type: 'SET_COPIED_FLASH', logId: log.id });
    dispatch({ type: 'SHOW_TOAST', message: `✔ Copied log from "${log.service || selectedService?.name || 'service'}"` });
  };

  const handleInspectLog = (log: LogEntry) => {
    dispatch({ type: 'TOGGLE_LOG_EXPANSION', logId: log.id });
  };

  const handleCopyGlobalCurrent = () => {
    const log = state.globalLogs[state.selectedLogIndex] || state.globalLogs[state.globalLogs.length - 1];
    if (log) {
      const jsonRes = parseJsonLog(log.message);
      const isExpanded = !!(jsonRes.isJson && (state.expandedLogIds[log.id] || state.isWrapMode));
      if (isExpanded && jsonRes.parsed) {
        copyToClipboard(prettyPrintJson(log.message));
        dispatch({ type: 'SET_COPIED_FLASH', logId: log.id });
        dispatch({ type: 'SHOW_TOAST', message: '✔ Copied formatted global JSON' });
      } else {
        copyToClipboard(formatLogEntry(log));
        dispatch({ type: 'SET_COPIED_FLASH', logId: log.id });
        dispatch({ type: 'SHOW_TOAST', message: '✔ Copied selected global log' });
      }
    } else {
      dispatch({ type: 'SHOW_TOAST', message: 'ℹ No global logs to copy' });
    }
  };

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
        {viewport.isUltraNarrow ? (
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
                selectedLogIndex={state.selectedLogIndex}
                expandedLogIds={state.expandedLogIds}
                copiedLogId={state.copiedLogId}
                onRestart={() => handleRestart(state.selectedIndex)}
                onToggleStop={() => handleToggleStop(state.selectedIndex)}
                onSelectTab={(tab) => dispatch({ type: 'SET_ACTIVE_TAB', tab })}
                onToggleWrap={() => dispatch({ type: 'TOGGLE_WRAP_MODE' })}
                onFocus={() => dispatch({ type: 'SET_ACTIVE_PANEL', panel: 'serviceLogs' })}
                onCopyCurrent={handleCopyCurrent}
                onCopyLog={handleCopyLog}
                onInspectLog={handleInspectLog}
                onSelectLogIndex={(index) => dispatch({ type: 'SELECT_LOG_ROW', index })}
                onToggleExpandLog={(logId) => dispatch({ type: 'TOGGLE_LOG_EXPANSION', logId })}
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
                selectedLogIndex={state.selectedLogIndex}
                expandedLogIds={state.expandedLogIds}
                copiedLogId={state.copiedLogId}
                onToggleSearch={() => dispatch({ type: 'SET_SEARCHING', isSearching: !state.isSearching })}
                onCycleFilter={() => dispatch({ type: 'CYCLE_FILTER' })}
                onToggleLive={() => dispatch({ type: 'TOGGLE_LIVE' })}
                onToggleWrap={() => dispatch({ type: 'TOGGLE_WRAP_MODE' })}
                onFocus={() => dispatch({ type: 'SET_ACTIVE_PANEL', panel: 'globalLogs' })}
                onCopyCurrent={handleCopyGlobalCurrent}
                onCopyLog={handleCopyLog}
                onInspectLog={handleInspectLog}
                onSelectLogIndex={(index) => dispatch({ type: 'SELECT_LOG_ROW', index })}
                onToggleExpandLog={(logId) => dispatch({ type: 'TOGGLE_LOG_EXPANSION', logId })}
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
            <Box flexDirection="column" width={viewport.rightPanelWidth} height={viewport.contentHeight} backgroundColor={theme.colors.canvas}>
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
                selectedLogIndex={state.selectedLogIndex}
                expandedLogIds={state.expandedLogIds}
                copiedLogId={state.copiedLogId}
                onRestart={() => handleRestart(state.selectedIndex)}
                onToggleStop={() => handleToggleStop(state.selectedIndex)}
                onSelectTab={(tab) => dispatch({ type: 'SET_ACTIVE_TAB', tab })}
                onToggleWrap={() => dispatch({ type: 'TOGGLE_WRAP_MODE' })}
                onFocus={() => dispatch({ type: 'SET_ACTIVE_PANEL', panel: 'serviceLogs' })}
                onCopyCurrent={handleCopyCurrent}
                onCopyLog={handleCopyLog}
                onInspectLog={handleInspectLog}
                onSelectLogIndex={(index) => dispatch({ type: 'SELECT_LOG_ROW', index })}
                onToggleExpandLog={(logId) => dispatch({ type: 'TOGGLE_LOG_EXPANSION', logId })}
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
                selectedLogIndex={state.selectedLogIndex}
                expandedLogIds={state.expandedLogIds}
                copiedLogId={state.copiedLogId}
                onToggleSearch={() => dispatch({ type: 'SET_SEARCHING', isSearching: !state.isSearching })}
                onCycleFilter={() => dispatch({ type: 'CYCLE_FILTER' })}
                onToggleLive={() => dispatch({ type: 'TOGGLE_LIVE' })}
                onToggleWrap={() => dispatch({ type: 'TOGGLE_WRAP_MODE' })}
                onFocus={() => dispatch({ type: 'SET_ACTIVE_PANEL', panel: 'globalLogs' })}
                onCopyCurrent={handleCopyGlobalCurrent}
                onCopyLog={handleCopyLog}
                onInspectLog={handleInspectLog}
                onSelectLogIndex={(index) => dispatch({ type: 'SELECT_LOG_ROW', index })}
                onToggleExpandLog={(logId) => dispatch({ type: 'TOGGLE_LOG_EXPANSION', logId })}
              />
            </Box>
          </Box>
        )}

        {/* 3. Footer Bar (Bottom Row, guaranteed 1 line) */}
        <Footer 
          isConnected={true} 
          activePanel={state.activePanel} 
          width={viewport.width} 
          mouseMode={state.mouseMode}
          onToggleHelp={() => dispatch({ type: 'TOGGLE_HELP', show: !state.showHelp })}
          onSwitchConfig={onSwitchConfig}
          onToggleMouseMode={handleToggleMouseMode}
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
