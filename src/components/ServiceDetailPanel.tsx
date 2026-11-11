import React from 'react';
import { Box, Text } from 'ink';
import { Service, ActiveTab, LogEntry } from '../types/index.js';
import Clickable from './common/ClickManager.js';
import { theme } from '../theme/theme.js';
import useSpinner from '../hooks/useSpinner.js';
import { parseJsonLog, formatJsonToHighlightedLines, JsonLogParseResult, calculateVisibleLogWindow } from '../utils/logFormatter.js';

export interface ServiceDetailPanelProps {
  service?: Service;
  activeTab?: ActiveTab;
  isRestarting?: boolean;
  maxLogs?: number;
  isFocused?: boolean;
  scrollOffset?: number;
  panelWidth?: number;
  height?: number;
  isUltraCompact?: boolean;
  isWrapMode?: boolean;
  selectedLogIndex?: number;
  expandedLogIds?: Record<string | number, boolean>;
  copiedLogId?: string | number | null;
  onRestart?: () => void;
  onToggleStop?: () => void;
  onSelectTab?: (tab: ActiveTab) => void;
  onToggleWrap?: () => void;
  onFocus?: () => void;
  onCopyCurrent?: () => void;
  onCopyLog?: (log: LogEntry) => void;
  onInspectLog?: (log: LogEntry) => void;
  onSelectLogIndex?: (index: number) => void;
  onToggleExpandLog?: (logId: string | number) => void;
}

const cleanPort = (p?: string | number) => {
  if (!p) return '';
  const str = String(p).trim();
  const num = str.replace(/^:+/, '');
  return `:${num}`;
};

export const ServiceDetailPanel: React.FC<ServiceDetailPanelProps> = React.memo(({ 
  service, 
  activeTab = 'logs', 
  isRestarting = false, 
  maxLogs = 6,
  isFocused = false,
  scrollOffset = 0,
  panelWidth = 53,
  height,
  isUltraCompact = false,
  isWrapMode = false,
  selectedLogIndex = 0,
  expandedLogIds = {},
  copiedLogId = null,
  onRestart,
  onToggleStop,
  onSelectTab,
  onToggleWrap,
  onFocus,
  onCopyCurrent,
  onCopyLog,
  onInspectLog,
  onSelectLogIndex,
  onToggleExpandLog
}) => {
  if (!service) {
    return (
      <Box 
        borderStyle="round" 
        borderColor={theme.colors.borderDefault} 
        borderBackgroundColor={theme.colors.canvas}
        backgroundColor={theme.colors.surface}
        flexDirection="column" 
        justifyContent="center"
        alignItems="center"
        paddingX={2}
        width={panelWidth}
        height={height}
        marginBottom={1}
      >
        <Text color={theme.colors.textMuted}>No service selected</Text>
      </Box>
    );
  }

  const isNarrow = panelWidth < 65;
  const innerWidth = Math.max(20, panelWidth - 4);
  const maxMsgLen = Math.max(12, innerWidth - 22);

  const isRunning = service.status === 'running';
  const isBooting = isRestarting || service.status === 'starting';
  const spinner = useSpinner(isBooting, 80);

  const getStatusInfo = () => {
    if (isRestarting || service.status === 'starting') {
      return { 
        bg: theme.colors.card, 
        fg: theme.colors.accent, 
        text: isRestarting ? `${spinner} RESTARTING` : `${spinner} ${service.statusText || 'STARTING'}`, 
        dot: theme.colors.accent 
      };
    }
    switch (service.status) {
      case 'running':
        return { 
          bg: theme.colors.runningBg, 
          fg: theme.colors.running, 
          text: 'RUNNING', 
          dot: theme.colors.running 
        };
      case 'stopped':
        return { 
          bg: theme.colors.stoppedBg, 
          fg: theme.colors.stopped, 
          text: 'STOPPED', 
          dot: theme.colors.stopped 
        };
      case 'warning':
        return { 
          bg: theme.colors.warningBg, 
          fg: theme.colors.warning, 
          text: 'WARN', 
          dot: theme.colors.warning 
        };
      case 'waiting':
        return { 
          bg: theme.colors.warningBg, 
          fg: theme.colors.warning, 
          text: `⏳ ${service.statusText || 'WAITING'}`, 
          dot: theme.colors.warning 
        };
      case 'blocked':
        return { 
          bg: theme.colors.stoppedBg, 
          fg: theme.colors.stopped, 
          text: service.statusText || 'BLOCKED', 
          dot: theme.colors.stopped 
        };
      default:
        return { 
          bg: theme.colors.card, 
          fg: theme.colors.textMuted, 
          text: 'OFFLINE', 
          dot: theme.colors.textMuted 
        };
    }
  };

  const status = getStatusInfo();

  const renderLogMessage = (msg: string, jsonResult?: JsonLogParseResult, isBadgeShown?: boolean) => {
    // 1. Smart Structured JSON log rendering
    const res = jsonResult || parseJsonLog(msg);
    if (res.isJson) {
      const isJsonErr = res.error || res.level?.toLowerCase() === 'error';
      const isJsonWarn = res.level?.toLowerCase() === 'warn';
      const msgColor = isJsonErr ? theme.colors.stopped : isJsonWarn ? theme.colors.warning : theme.colors.textPrimary;

      const eventMsg = res.canonicalMsg || (res.extraPairs && res.extraPairs.length > 0
        ? res.extraPairs.map(p => `${p.key}: ${p.val}`).join(' | ')
        : (res.error || 'Structured payload'));

      const displayMsg = isWrapMode ? eventMsg : (eventMsg.length > maxMsgLen ? eventMsg.slice(0, maxMsgLen - 1) + '…' : eventMsg);

      return (
        <Text wrap={isWrapMode ? 'wrap' : undefined}>
          {!isBadgeShown && <Text color={theme.colors.accent} bold>[JSON] </Text>}
          {res.method && (
            <Text color={theme.colors.borderFocus} bold>{res.method} </Text>
          )}
          {res.path && (
            <Text color={theme.colors.textPrimary}>{res.path} </Text>
          )}
          {res.status && (
            <Text color={String(res.status).startsWith('2') ? theme.colors.running : theme.colors.stopped} bold>
              [{res.status}] 
            </Text>
          )}
          {res.latency && (
            <Text color={theme.colors.textMuted}>({res.latency}) </Text>
          )}
          <Text color={msgColor}>{displayMsg}</Text>
        </Text>
      );
    }

    // 2. Standard log message rendering
    const displayStr = isWrapMode ? msg : (msg.length > maxMsgLen ? msg.slice(0, maxMsgLen - 1) + '…' : msg);

    if (displayStr.includes('✖')) {
      return (
        <Text wrap={isWrapMode ? 'wrap' : undefined}>
          <Text color={theme.colors.stopped} bold>✖ </Text>
          <Text color={theme.colors.stopped}>{displayStr.replace('✖', '').trim()}</Text>
        </Text>
      );
    }

    const httpRegex = /^(POST|GET|PUT|DELETE)\s+(\S+)\s+(\d{3})\s+(\([^)]+\))$/;
    const httpMatch = displayStr.trim().match(httpRegex);
    if (httpMatch) {
      const [, method, path, statusCode, latency] = httpMatch;
      const statusCodeColor = (statusCode || '').startsWith('2') ? theme.colors.running : theme.colors.stopped;
      return (
        <Text wrap={isWrapMode ? 'wrap' : undefined}>
          <Text color={theme.colors.accent} bold>{method} </Text>
          <Text color={theme.colors.textPrimary}>{path}  </Text>
          <Text color={statusCodeColor} bold>{statusCode}  </Text>
          <Text color={theme.colors.textMuted}>{latency}</Text>
        </Text>
      );
    }

    if (displayStr.includes('http://')) {
      const [before, url] = displayStr.split('http://');
      return (
        <Text wrap={isWrapMode ? 'wrap' : undefined}>
          <Text color={theme.colors.textPrimary}>{before}</Text>
          <Text color={theme.colors.accent} underline>http://{url}</Text>
        </Text>
      );
    }

    return <Text color={theme.colors.textPrimary} wrap={isWrapMode ? 'wrap' : undefined}>{displayStr}</Text>;
  };

  const currentLogs: LogEntry[] = activeTab === 'errors'
    ? (service.errorLogs || [])
    : (service.logs || []);
  const totalLogs = currentLogs.length;

  // Strict Line Budgeting:
  // Overhead: Border (2) + Header (1) + Hairline (1) + Subheader (1) + Hairline (1) = 6 lines.
  // When !isUltraCompact, add Tabs row (1) + Hairline (1) = 2 lines. Total = 8 lines.
  const overheadLines = isUltraCompact ? 6 : 8;
  const availableLogLines = Math.max(1, (height || 10) - overheadLines);

  const {
    visibleLogs,
    startIdx,
    endIdx,
    effectiveOffset,
    maxJsonLines
  } = calculateVisibleLogWindow({
    logs: currentLogs,
    availableLines: availableLogLines,
    scrollOffset,
    expandedLogIds,
    isWrapMode
  });

  const safeSelectedIndex = Math.min(selectedLogIndex, Math.max(0, visibleLogs.length - 1));

  return (
    <Clickable 
      onClick={() => onFocus?.()}
      borderStyle="round" 
      borderColor={isFocused ? theme.colors.borderFocus : theme.colors.borderDefault} 
      borderBackgroundColor={theme.colors.canvas}
      backgroundColor={theme.colors.surface}
      flexDirection="column" 
      paddingX={1}
      paddingY={0}
      width={panelWidth}
      height={height}
      overflow="hidden"
      marginBottom={1}
    >
      {/* 1. Header: Service Name, Status Badge & Boxed Action Buttons (Guaranteed 1 line) */}
      <Box 
        flexDirection="row" 
        justifyContent="space-between" 
        alignItems="center" 
        flexWrap="nowrap" 
        height={1}
        flexShrink={0}
        overflow="hidden"
        marginBottom={0}
      >
        {/* Left: Name and Framed Status Pill */}
        <Box flexDirection="row" alignItems="center" flexShrink={0}>
          <Text color={status.dot}>● </Text>
          <Text color={theme.colors.textPrimary} bold>{service.name} </Text>
          <Box backgroundColor={status.bg} paddingX={1}>
            <Text color={status.fg} bold>[{status.text}]</Text>
          </Box>
        </Box>

        {/* Right: Modern Boxed Action Buttons */}
        <Box flexDirection="row" alignItems="center" flexShrink={0}>
          <Clickable onClick={() => onRestart?.()}>
            <Box backgroundColor={theme.colors.card} paddingX={1}>
              <Text color={theme.colors.accent} bold>
                [ ↻ {isNarrow ? 'R' : 'Restart'} ]
              </Text>
            </Box>
          </Clickable>
          <Text> </Text>
          <Clickable onClick={() => onToggleStop?.()}>
            <Box 
              backgroundColor={isRunning ? theme.colors.stoppedBg : theme.colors.runningBg} 
              paddingX={1}
            >
              <Text color={isRunning ? theme.colors.stopped : theme.colors.running} bold>
                [ {isRunning ? (isNarrow ? '■ S' : '■ Stop') : (isNarrow ? '▶ R' : '▶ Run')} ]
              </Text>
            </Box>
          </Clickable>
          <Text> </Text>
          <Clickable onClick={() => onCopyCurrent?.()}>
            <Box backgroundColor={theme.colors.card} paddingX={1}>
              <Text color={theme.colors.accent} bold>
                [ 📋 {isNarrow ? 'C' : (activeTab === 'errors' ? 'Copy Error' : 'Copy')} ]
              </Text>
            </Box>
          </Clickable>
        </Box>
      </Box>
      
      {/* Hairline Separator under Header Controls */}
      <Box width="100%" height={1} overflow="hidden" flexShrink={0}>
        <Text color={theme.colors.borderSubtle}>{'─'.repeat(innerWidth)}</Text>
      </Box>

      {/* 2. Subheader Metadata: Distinct Boxed Badges (1 line) */}
      <Box 
        flexDirection="row" 
        justifyContent="space-between" 
        alignItems="center" 
        height={1}
        flexShrink={0}
        overflow="hidden"
        marginTop={0} 
        marginBottom={0} 
        flexWrap="nowrap"
      >
        <Box flexDirection="row" alignItems="center" flexShrink={1}>
          {/* Command Pill */}
          <Box backgroundColor={theme.colors.card} paddingX={1} marginRight={1} flexShrink={1}>
            <Text color={theme.colors.textSecondary} wrap="truncate-end">
              [ ↓ {Array.isArray(service.command) ? (service.command as string[]).join(' && ') : service.command} ]
            </Text>
          </Box>

          {/* Dependencies Pill (if defined) */}
          {service.rawConfig?.dependsOn && service.rawConfig.dependsOn.length > 0 ? (
            <Box backgroundColor={theme.colors.card} paddingX={1} marginRight={1} flexShrink={0}>
              <Text color={theme.colors.textDim}>[ needs: </Text>
              <Text color={theme.colors.accent}>{service.rawConfig.dependsOn.join(', ')}</Text>
              <Text color={theme.colors.textDim}> ]</Text>
            </Box>
          ) : null}

          {/* PID Pill */}
          <Box backgroundColor={theme.colors.card} paddingX={1} marginRight={1} flexShrink={0}>
            <Text color={theme.colors.textDim}>[ PID: </Text>
            <Text color={theme.colors.textPrimary} bold>{service.pid}</Text>
            <Text color={theme.colors.textDim}> ]</Text>
          </Box>

          {/* Port Pill */}
          {cleanPort(service.port) ? (
            <Box backgroundColor={theme.colors.accentDark} paddingX={1} flexShrink={0}>
              <Text color={theme.colors.accent} bold>
                [ {cleanPort(service.port)} ]
              </Text>
            </Box>
          ) : null}
        </Box>

        {effectiveOffset > 0 ? (
          <Box backgroundColor={theme.colors.card} paddingX={1} flexShrink={0}>
            <Text color={theme.colors.warning} bold>
              ▲ (+{effectiveOffset}) [{startIdx + 1}-{endIdx}/{totalLogs}]
            </Text>
          </Box>
        ) : isFocused ? (
          <Box backgroundColor={theme.colors.card} paddingX={1} flexShrink={0}>
            <Text color={theme.colors.accent}>[↑↓ Scroll]</Text>
          </Box>
        ) : null}
      </Box>

      {/* Hairline Separator under Subheader Controls */}
      <Box width="100%" height={1} overflow="hidden" flexShrink={0}>
        <Text color={theme.colors.borderSubtle}>{'─'.repeat(innerWidth)}</Text>
      </Box>

      {/* 3. Boxed Tabs Row & Hairline Separator (Hidden in ultra-compact height <= 17 rows) */}
      {!isUltraCompact && (
        <Box flexDirection="column" height={2} flexShrink={0} overflow="hidden" marginTop={0} marginBottom={0}>
          <Box flexDirection="row" alignItems="center" flexWrap="nowrap" height={1} flexShrink={0} overflow="hidden" marginTop={0} marginBottom={0}>
            {/* Logs Tab */}
            <Clickable 
              onClick={() => {
                onFocus?.();
                onSelectTab?.('logs');
              }}
            >
              <Box 
                backgroundColor={activeTab === 'logs' ? theme.colors.card : theme.colors.surface} 
                paddingX={1}
                marginRight={1}
              >
                <Text color={activeTab === 'logs' ? theme.colors.accent : theme.colors.textMuted} bold={activeTab === 'logs'}>
                  [ Logs ]
                </Text>
              </Box>
            </Clickable>

            {/* Errors Tab */}
            <Clickable 
              onClick={() => {
                onFocus?.();
                onSelectTab?.('errors');
              }}
            >
              <Box 
                backgroundColor={activeTab === 'errors' ? theme.colors.card : theme.colors.surface} 
                paddingX={1}
              >
                <Text color={activeTab === 'errors' ? theme.colors.accent : theme.colors.textMuted} bold={activeTab === 'errors'}>
                  [ Errors{' '}
                </Text>
                <Text color={service.errors > 0 ? theme.colors.stopped : theme.colors.textMuted} bold>
                  ({service.errors || 0})
                </Text>
                <Text color={activeTab === 'errors' ? theme.colors.accent : theme.colors.textMuted} bold={activeTab === 'errors'}>
                  {' ]'}
                </Text>
              </Box>
            </Clickable>

            {/* Wrap Mode Toggle Button */}
            <Clickable onClick={() => onToggleWrap?.()}>
              <Box 
                backgroundColor={isWrapMode ? theme.colors.accentDark : theme.colors.surface} 
                paddingX={1}
                marginLeft={1}
              >
                <Text color={isWrapMode ? theme.colors.accent : theme.colors.textMuted} bold={isWrapMode}>
                  [ w: {isWrapMode ? 'Wrap On' : 'Wrap Off'} ]
                </Text>
              </Box>
            </Clickable>
          </Box>

          {/* Hairline Divider under Tabs */}
          <Box width="100%" height={1} overflow="hidden" flexShrink={0}>
            <Text color={theme.colors.borderSubtle}>{'─'.repeat(innerWidth)}</Text>
          </Box>
        </Box>
      )}

      {/* 5. Tab Content with Line Budgeting & Strict Overflow Containment */}
      {activeTab === 'logs' && (
        <Box 
          height={availableLogLines} 
          overflow="hidden" 
          flexShrink={0} 
          flexDirection="column"
        >
          {visibleLogs.map((log, index) => {
            const lvl = (log.level || 'info').toUpperCase();
            const lvlText = lvl === 'ERROR' ? 'ERROR' : lvl === 'WARN' ? 'WARN ' : 'INFO ';
            const lvlColor = lvl === 'ERROR' ? theme.colors.stopped : lvl === 'WARN' ? theme.colors.warning : theme.colors.accent;
            const isSelected = isFocused && safeSelectedIndex === index;
            const isCopied = copiedLogId === log.id;
            const jsonResult = parseJsonLog(log.message);
            const isExpanded = !!(jsonResult.isJson && (
              expandedLogIds[log.id] !== undefined
                ? expandedLogIds[log.id]
                : isWrapMode
            ));

            let highlightedLines: { tokens: any[] }[] = [];
            if (isExpanded && jsonResult.parsed) {
              const fullLines = formatJsonToHighlightedLines(jsonResult.parsed);
              highlightedLines = fullLines.slice(0, maxJsonLines);
              if (fullLines.length > maxJsonLines) {
                highlightedLines.push({
                  tokens: [{ text: `  ... (+${fullLines.length - maxJsonLines} more lines)`, color: theme.colors.textMuted, dim: true }]
                });
              }
            }

            return (
              <Clickable
                key={log.id || index}
                onClick={() => {
                  onFocus?.();
                  onSelectLogIndex?.(index);
                  if (jsonResult.isJson) {
                    onToggleExpandLog?.(log.id);
                  }
                }}
              >
                <Box
                  flexDirection="column"
                  backgroundColor={isSelected ? '#1E293B' : undefined}
                  paddingX={0}
                  marginBottom={0}
                >
                  <Box flexDirection="row" alignItems="center" flexWrap="nowrap">
                    {/* Visual Selector Indicator */}
                    <Box width={2} flexShrink={0}>
                      {isSelected ? (
                        <Text color={theme.colors.accent} bold>▶ </Text>
                      ) : (
                        <Text color={theme.colors.textDim}>  </Text>
                      )}
                    </Box>

                    <Box width={9} flexShrink={0}>
                      <Text color={theme.colors.textMuted}>{log.timestamp} </Text>
                    </Box>

                    <Box flexShrink={0} marginRight={1}>
                      <Text color={theme.colors.textDim}>[</Text>
                      <Text color={lvlColor} bold>{lvlText}</Text>
                      <Text color={theme.colors.textDim}>] </Text>
                    </Box>

                    {/* Inline Expand Toggle for JSON */}
                    {jsonResult.isJson && (
                      <Clickable
                        onClick={() => {
                          onFocus?.();
                          onSelectLogIndex?.(index);
                          onToggleExpandLog?.(log.id);
                        }}
                      >
                        <Box flexShrink={0} marginRight={1} backgroundColor={theme.colors.card} paddingX={1}>
                          <Text color={theme.colors.accent} bold>
                            {isExpanded ? '▼ JSON (collapse)' : '▶ JSON (expand)'}
                          </Text>
                        </Box>
                      </Clickable>
                    )}

                    <Box flexGrow={1} flexShrink={1}>
                      {renderLogMessage(log.message, jsonResult, jsonResult.isJson)}
                    </Box>

                    {/* Inline Copy Confirmation Badge */}
                    {isCopied && (
                      <Box backgroundColor={theme.colors.runningBg} paddingX={1} flexShrink={0} marginLeft={1}>
                        <Text color={theme.colors.running} bold>✔ COPIED</Text>
                      </Box>
                    )}
                  </Box>

                  {/* Inline Expanded JSON View */}
                  {isExpanded && highlightedLines.length > 0 && (
                    <Box flexDirection="column" paddingLeft={12} marginTop={0} marginBottom={0}>
                      {highlightedLines.map((hl, hlIdx) => (
                        <Box key={hlIdx} flexDirection="row">
                          {hl.tokens.map((tok, tokIdx) => (
                            <Text
                              key={tokIdx}
                              color={tok.color}
                              bold={tok.bold}
                              dimColor={tok.dim}
                            >
                              {tok.text}
                            </Text>
                          ))}
                        </Box>
                      ))}
                    </Box>
                  )}
                </Box>
              </Clickable>
            );
          })}
        </Box>
      )}

      {activeTab === 'errors' && (
        <Box 
          height={availableLogLines} 
          overflow="hidden" 
          flexShrink={0} 
          flexDirection="column"
        >
          {visibleLogs && visibleLogs.length > 0 ? (
            visibleLogs.map((err, i) => {
              const isSelected = isFocused && safeSelectedIndex === i;
              const isCopied = copiedLogId === err.id;

              return (
                <Clickable
                  key={err.id || i}
                  onClick={() => {
                    onFocus?.();
                    onSelectLogIndex?.(i);
                  }}
                >
                  <Box 
                    flexDirection="row" 
                    alignItems="center" 
                    flexWrap="nowrap"
                    backgroundColor={isSelected ? '#1E293B' : undefined}
                  >
                    {/* Visual Selector Indicator */}
                    <Box width={2} flexShrink={0}>
                      {isSelected ? (
                        <Text color={theme.colors.stopped} bold>▶ </Text>
                      ) : (
                        <Text color={theme.colors.textDim}>  </Text>
                      )}
                    </Box>
                    <Box width={9} flexShrink={0}>
                      <Text color={theme.colors.textMuted}>{err.timestamp} </Text>
                    </Box>
                    <Box flexShrink={0} marginRight={1}>
                      <Text color={theme.colors.textDim}>[</Text>
                      <Text color={theme.colors.stopped} bold>ERROR</Text>
                      <Text color={theme.colors.textDim}>] </Text>
                    </Box>
                    <Box flexGrow={1} flexShrink={1}>
                      <Text color={theme.colors.stopped}>{err.message.slice(0, maxMsgLen)}</Text>
                    </Box>
                    {/* Inline Copy Confirmation Badge */}
                    {isCopied && (
                      <Box backgroundColor={theme.colors.runningBg} paddingX={1} flexShrink={0} marginLeft={1}>
                        <Text color={theme.colors.running} bold>✔ COPIED</Text>
                      </Box>
                    )}
                  </Box>
                </Clickable>
              );
            })
          ) : (
            <Box>
              <Text color={theme.colors.running}>✔ No active errors logged for {service.name}</Text>
            </Box>
          )}
        </Box>
      )}
    </Clickable>
  );
});

export default ServiceDetailPanel;
