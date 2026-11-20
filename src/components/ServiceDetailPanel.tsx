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
  selectionAnchor?: number | null;
  charSelection?: { start: number; end: number } | null;
  jsonLineScroll?: number;
  expandedLogIds?: Record<string | number, boolean>;
  copiedLogId?: string | number | null;
  onRestart?: () => void;
  onToggleStop?: () => void;
  onSelectTab?: (tab: ActiveTab) => void;
  onToggleWrap?: () => void;
  onFocus?: () => void;
  onCopyCurrent?: () => void;
  onCopyLog?: (log: LogEntry) => void;
  onSelectLogIndex?: (index: number, isShift?: boolean) => void;
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
  selectionAnchor = null,
  charSelection = null,
  jsonLineScroll = 0,
  expandedLogIds = {},
  copiedLogId = null,
  onRestart,
  onToggleStop,
  onSelectTab,
  onToggleWrap,
  onFocus,
  onCopyCurrent,
  onCopyLog,
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

  const renderLogMessage = (msg: string, jsonResult?: JsonLogParseResult, isBadgeShown?: boolean, isCharSelected?: boolean) => {
    // 0. Character selection active on this row
    if (isCharSelected && charSelection) {
      const s = Math.max(0, Math.min(msg.length, charSelection.start));
      const e = Math.max(s, Math.min(msg.length, charSelection.end));
      const before = msg.slice(0, s);
      const selected = msg.slice(s, e);
      const after = msg.slice(e);
      return (
        <Text wrap={isWrapMode ? 'wrap' : undefined}>
          <Text color={theme.colors.textPrimary}>{before}</Text>
          <Text backgroundColor="#0284C7" color="#FFFFFF" bold>{selected}</Text>
          <Text color={theme.colors.textPrimary}>{after}</Text>
        </Text>
      );
    }

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
  // Overhead: Border (2) + Header (1) + Subheader (1) + Hairline (1) = 5 lines.
  // When !isUltraCompact, add Tabs row (1) + Hairline (1) = 2 lines. Total = 7 lines.
  const overheadLines = isUltraCompact ? 5 : 7;
  const availableLogLines = Math.max(1, (height || 10) - overheadLines);
  const activeExpandedLogId = Object.keys(expandedLogIds).find(k => expandedLogIds[k]);

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
    isWrapMode,
    anchorLogId: activeExpandedLogId || null
  });

  const safeSelectedIndex = Math.min(selectedLogIndex, Math.max(0, visibleLogs.length - 1));
  const hasRangeSelection = isFocused && selectionAnchor !== null && selectionAnchor !== safeSelectedIndex;
  const rangeMin = selectionAnchor !== null ? Math.min(selectionAnchor, safeSelectedIndex) : safeSelectedIndex;
  const rangeMax = selectionAnchor !== null ? Math.max(selectionAnchor, safeSelectedIndex) : safeSelectedIndex;
  const selectedLinesCount = hasRangeSelection ? rangeMax - rangeMin + 1 : 1;

  let selectedCharsCount = 0;
  if (charSelection) {
    selectedCharsCount = Math.max(0, charSelection.end - charSelection.start);
  } else if (hasRangeSelection) {
    for (let i = rangeMin; i <= rangeMax && i < visibleLogs.length; i++) {
      selectedCharsCount += (visibleLogs[i]?.message || '').length;
    }
  }

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

        {charSelection ? (
          <Box backgroundColor="#0369A1" paddingX={1} flexShrink={0}>
            <Text color="#FFFFFF" bold>
              ▰ {selectedCharsCount} chars selected [c: Copy | Esc: Clear]
            </Text>
          </Box>
        ) : hasRangeSelection ? (
          <Box backgroundColor="#0369A1" paddingX={1} flexShrink={0}>
            <Text color="#FFFFFF" bold>
              ▰ {selectedLinesCount} lines selected ({selectedCharsCount} chars) [c: Copy | Esc: Clear]
            </Text>
          </Box>
        ) : effectiveOffset > 0 ? (
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
            const isInRange = isFocused && index >= rangeMin && index <= rangeMax;
            const isCursor = isSelected;
            const isCopied = copiedLogId === log.id;
            const jsonResult = parseJsonLog(log.message);
            // Decouple Wrap Mode from JSON expansion: wrap mode only wraps text strings
            const isExpanded = !!(jsonResult.isJson && expandedLogIds[log.id]);

            let highlightedLines: { tokens: any[] }[] = [];
            let jsonScrollInfo: { start: number; end: number; total: number } | null = null;
            if (isExpanded && jsonResult.parsed && maxJsonLines > 0) {
              const fullLines = formatJsonToHighlightedLines(jsonResult.parsed);
              if (fullLines.length <= maxJsonLines) {
                highlightedLines = fullLines;
              } else {
                const maxScroll = fullLines.length - maxJsonLines;
                const offset = Math.max(0, Math.min(maxScroll, jsonLineScroll || 0));
                highlightedLines = fullLines.slice(offset, offset + maxJsonLines);
                jsonScrollInfo = {
                  start: offset + 1,
                  end: Math.min(fullLines.length, offset + maxJsonLines),
                  total: fullLines.length
                };
              }
            }

            return (
              <Box
                key={log.id || index}
                flexDirection="column"
                backgroundColor={isInRange ? '#1E293B' : undefined}
                paddingX={0}
                marginBottom={0}
              >
                {/* 1. Clickable Row Header: selects row & focuses panel */}
                <Clickable
                  id={`service-log-row-${index}`}
                  textStartX={jsonResult.isJson ? 38 : 19}
                  width="100%"
                  onClick={(ev) => {
                    onFocus?.();
                    onSelectLogIndex?.(index, ev?.shiftKey);
                  }}
                >
                  <Box flexDirection="row" alignItems="center" flexWrap="nowrap" width="100%">
                    {/* Visual Selector Indicator */}
                    <Box width={2} flexShrink={0}>
                      {isCursor ? (
                        <Text color={theme.colors.accent} bold>▶ </Text>
                      ) : isInRange ? (
                        <Text color={theme.colors.accent} bold>┃ </Text>
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

                    {/* Inline Expand Toggle for JSON (100% in-place) */}
                    {jsonResult.isJson && (
                      <Box flexDirection="row" alignItems="center" flexShrink={0} marginRight={1}>
                        <Clickable
                          onClick={() => {
                            onFocus?.();
                            onSelectLogIndex?.(index);
                            onToggleExpandLog?.(log.id);
                          }}
                        >
                          <Box flexShrink={0} backgroundColor={theme.colors.card} paddingX={1}>
                            <Text color={theme.colors.accent} bold>
                              {isExpanded ? '▼ JSON (collapse)' : '▶ JSON (expand)'}
                            </Text>
                          </Box>
                        </Clickable>
                        {isExpanded && jsonScrollInfo && (
                          <Box backgroundColor={theme.colors.card} paddingX={1} marginLeft={1}>
                            <Text color={theme.colors.warning} bold>
                              [{jsonScrollInfo.start}-{jsonScrollInfo.end}/{jsonScrollInfo.total} lines ↑↓]
                            </Text>
                          </Box>
                        )}
                      </Box>
                    )}

                    <Box flexGrow={1} flexShrink={1}>
                      {renderLogMessage(log.message, jsonResult, jsonResult.isJson, isCursor)}
                    </Box>

                    {/* Inline Copy Confirmation Badge */}
                    {isCopied && (
                      <Box backgroundColor={theme.colors.runningBg} paddingX={1} flexShrink={0} marginLeft={1}>
                        <Text color={theme.colors.running} bold>✔ COPIED</Text>
                      </Box>
                    )}
                  </Box>
                </Clickable>

                {/* 2. Inline Expanded JSON View: Pure un-intercepted Box so mouse/trackpad selection highlight works! */}
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
              const isInRange = isFocused && i >= rangeMin && i <= rangeMax;
              const isCursor = isSelected;
              const isCopied = copiedLogId === err.id;

              return (
                <Clickable
                  key={err.id || i}
                  id={`service-log-row-${i}`}
                  textStartX={19}
                  width="100%"
                  onClick={(ev) => {
                    onFocus?.();
                    onSelectLogIndex?.(i, ev?.shiftKey);
                  }}
                >
                  <Box 
                    flexDirection="row" 
                    alignItems="center" 
                    flexWrap="nowrap"
                    width="100%"
                    backgroundColor={isInRange ? '#1E293B' : undefined}
                  >
                    {/* Visual Selector Indicator */}
                    <Box width={2} flexShrink={0}>
                      {isCursor ? (
                        <Text color={theme.colors.stopped} bold>▶ </Text>
                      ) : isInRange ? (
                        <Text color={theme.colors.stopped} bold>┃ </Text>
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
                      {charSelection && isCursor ? (
                        (() => {
                          const s = Math.max(0, Math.min(err.message.length, charSelection.start));
                          const e = Math.max(s, Math.min(err.message.length, charSelection.end));
                          const before = err.message.slice(0, s);
                          const sel = err.message.slice(s, e);
                          const after = err.message.slice(e);
                          return (
                            <Text wrap={isWrapMode ? 'wrap' : undefined}>
                              <Text color={theme.colors.stopped}>{before}</Text>
                              <Text backgroundColor="#0284C7" color="#FFFFFF" bold>{sel}</Text>
                              <Text color={theme.colors.stopped}>{after}</Text>
                            </Text>
                          );
                        })()
                      ) : (
                        <Text color={theme.colors.stopped}>{err.message.slice(0, maxMsgLen)}</Text>
                      )}
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
