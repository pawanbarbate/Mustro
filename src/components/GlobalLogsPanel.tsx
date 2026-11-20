import React from 'react';
import { Box, Text } from 'ink';
import { LogEntry } from '../types/index.js';
import Clickable from './common/ClickManager.js';
import { theme, getServiceBadgeStyle } from '../theme/theme.js';
import { parseJsonLog, formatJsonToHighlightedLines, JsonLogParseResult, calculateVisibleLogWindow } from '../utils/logFormatter.js';

export interface GlobalLogsPanelProps {
  logs?: LogEntry[];
  searchQuery?: string;
  isSearching?: boolean;
  activeFilter?: string;
  isLive?: boolean;
  maxLogs?: number;
  isFocused?: boolean;
  scrollOffset?: number;
  panelWidth?: number;
  height?: number;
  isWrapMode?: boolean;
  selectedLogIndex?: number;
  selectionAnchor?: number | null;
  charSelection?: { start: number; end: number } | null;
  jsonLineScroll?: number;
  expandedLogIds?: Record<string | number, boolean>;
  copiedLogId?: string | number | null;
  onToggleSearch?: () => void;
  onCycleFilter?: () => void;
  onToggleLive?: () => void;
  onToggleWrap?: () => void;
  onFocus?: () => void;
  onCopyCurrent?: () => void;
  onCopyLog?: (log: LogEntry) => void;
  onSelectLogIndex?: (index: number, isShift?: boolean) => void;
  onToggleExpandLog?: (logId: string | number) => void;
}

export const GlobalLogsPanel: React.FC<GlobalLogsPanelProps> = React.memo(({ 
  logs = [], 
  searchQuery = '', 
  isSearching = false, 
  activeFilter = 'All Services', 
  isLive = true,
  maxLogs = 6,
  isFocused = false,
  scrollOffset = 0,
  panelWidth = 53,
  height,
  isWrapMode = false,
  selectedLogIndex = 0,
  selectionAnchor = null,
  charSelection = null,
  jsonLineScroll = 0,
  expandedLogIds = {},
  copiedLogId = null,
  onToggleSearch,
  onCycleFilter,
  onToggleLive,
  onToggleWrap,
  onFocus,
  onCopyCurrent,
  onCopyLog,
  onSelectLogIndex,
  onToggleExpandLog
}) => {
  const isNarrow = panelWidth < 65;
  const innerWidth = Math.max(20, panelWidth - 4);
  const maxMsgLen = Math.max(12, innerWidth - 22);

  const renderMessage = (log: LogEntry, jsonResult?: JsonLogParseResult, isBadgeShown?: boolean, isCharSelected?: boolean) => {
    const rawMsg = log.message;

    // 0. Character selection active on this row
    if (isCharSelected && charSelection) {
      const s = Math.max(0, Math.min(rawMsg.length, charSelection.start));
      const e = Math.max(s, Math.min(rawMsg.length, charSelection.end));
      const before = rawMsg.slice(0, s);
      const selected = rawMsg.slice(s, e);
      const after = rawMsg.slice(e);
      return (
        <Text wrap={isWrapMode ? 'wrap' : undefined}>
          <Text color={theme.colors.textPrimary}>{before}</Text>
          <Text backgroundColor="#0284C7" color="#FFFFFF" bold>{selected}</Text>
          <Text color={theme.colors.textPrimary}>{after}</Text>
        </Text>
      );
    }

    // 1. Smart Structured JSON rendering
    const res = jsonResult || parseJsonLog(rawMsg);
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
    const msg = isWrapMode ? rawMsg : (rawMsg.length > maxMsgLen ? rawMsg.slice(0, maxMsgLen - 1) + '…' : rawMsg);

    // Red error message with cross icon
    if (msg.includes('✖') || log.level === 'error' || log.level === 'ERROR') {
      return (
        <Text wrap={isWrapMode ? 'wrap' : undefined}>
          <Text color={theme.colors.stopped} bold>✖ </Text>
          <Text color={theme.colors.stopped}>{msg.replace('✖', '').trim()}</Text>
        </Text>
      );
    }

    // Retrying warning
    if (msg.includes('Retrying') || log.level === 'warn' || log.level === 'WARN') {
      return <Text color={theme.colors.warning} wrap={isWrapMode ? 'wrap' : undefined}>{msg}</Text>;
    }

    // HTTP method and status (e.g. GET /api/auth/me  200  (12 ms))
    const httpMatch = msg.match(/^(POST|GET|PUT|DELETE)\s+(\S+)\s+(\d{3})\s+(\([^)]+\))$/);
    if (httpMatch) {
      const [, method, path, status, latency] = httpMatch;
      const statusCodeColor = (status || '').startsWith('2') ? theme.colors.running : theme.colors.stopped;
      return (
        <Text wrap={isWrapMode ? 'wrap' : undefined}>
          <Text color={theme.colors.textPrimary}>{method} {path} </Text>
          <Text color={statusCodeColor} bold>{status} </Text>
          <Text color={theme.colors.textMuted}>{latency}</Text>
        </Text>
      );
    }

    // Trailing latency (e.g. User profile fetched  (28 ms))
    const latencyMatch = msg.match(/^(.*?)\s{2,}(\([^)]+\))$/);
    if (latencyMatch) {
      const [, prefix, latency] = latencyMatch;
      return (
        <Text wrap={isWrapMode ? 'wrap' : undefined}>
          <Text color={theme.colors.textPrimary}>{prefix} </Text>
          <Text color={theme.colors.textMuted}>{latency}</Text>
        </Text>
      );
    }

    // URLs (e.g. Server listening on http://localhost:3001)
    if (msg.includes('http://')) {
      const [before, url] = msg.split('http://');
      return (
        <Text wrap={isWrapMode ? 'wrap' : undefined}>
          <Text color={theme.colors.textPrimary}>{before}</Text>
          <Text color={theme.colors.accent} underline>http://{url}</Text>
        </Text>
      );
    }

    return <Text color={theme.colors.textPrimary} wrap={isWrapMode ? 'wrap' : undefined}>{msg}</Text>;
  };

  // Filter logs if filter or search active
  const matchingLogs = logs.filter(l => {
    if (activeFilter !== 'All Services' && l.service.toLowerCase() !== activeFilter.toLowerCase()) {
      return false;
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      return l.message.toLowerCase().includes(q) || l.service.toLowerCase().includes(q);
    }
    return true;
  });

  const totalFilteredLogs = matchingLogs.length;

  // Strict Line Budgeting:
  // Overhead: Border top (1) + Border bottom (1) + Header (1) + Hairline (1) = 4 lines.
  const overheadLines = 4;
  const availableLogLines = Math.max(2, (height || 10) - overheadLines);
  const activeExpandedLogId = Object.keys(expandedLogIds).find(k => expandedLogIds[k]);

  const {
    visibleLogs,
    startIdx,
    endIdx,
    totalLogs: totalFiltered,
    effectiveOffset,
    maxJsonLines
  } = calculateVisibleLogWindow({
    logs: matchingLogs,
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
      marginTop={0}
    >
      {/* Header: Guaranteed 1 line with Boxed Controls & Persistent Scroll Indicator */}
      <Box 
        flexDirection="row" 
        justifyContent="space-between" 
        alignItems="center" 
        flexWrap="nowrap"
        height={1}
        flexShrink={0}
        overflow="hidden"
      >
        {/* Left Title & Persistent Scroll Indicator */}
        <Box flexDirection="row" alignItems="center" flexShrink={0}>
          <Text color={isFocused ? theme.colors.accent : theme.colors.textSecondary} bold>GLOBAL LOGS </Text>
          {!isNarrow && <Text color={theme.colors.textMuted}>({activeFilter === 'All Services' ? 'All' : activeFilter}) </Text>}
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
            <Clickable onClick={() => onToggleLive?.()}>
              <Box backgroundColor={theme.colors.card} paddingX={1} flexShrink={0}>
                <Text color={theme.colors.warning} bold>
                  ▲ +{effectiveOffset} [{startIdx + 1}-{endIdx}/{totalFiltered}]
                </Text>
              </Box>
            </Clickable>
          ) : isFocused ? (
            <Box backgroundColor={theme.colors.card} paddingX={1} flexShrink={0}>
              <Text color={theme.colors.accent}>[↑↓ Scroll]</Text>
            </Box>
          ) : null}
        </Box>

        {/* Right Controls: Boxed Pills */}
        <Box flexDirection="row" alignItems="center" flexShrink={0}>
          {/* Search pill */}
          <Clickable onClick={() => onToggleSearch?.()}>
            <Box 
              backgroundColor={isSearching ? theme.colors.accentDark : theme.colors.card} 
              paddingX={1}
              marginRight={1}
              flexShrink={0}
            >
              <Text color={isSearching ? theme.colors.accent : theme.colors.textSecondary}>
                {panelWidth < 68 
                  ? (isSearching ? `[ 🔍 ${searchQuery || ''} ]` : '[ 🔍 ]') 
                  : `[ 🔍 ${searchQuery || 'Search...'} ]`}
              </Text>
            </Box>
          </Clickable>

          {/* Filter dropdown pill */}
          <Clickable onClick={() => onCycleFilter?.()}>
            <Box 
              backgroundColor={theme.colors.card} 
              paddingX={1}
              marginRight={1}
              flexShrink={0}
            >
              <Text color={theme.colors.textSecondary}>
                {panelWidth < 68 
                  ? `[ ${activeFilter === 'All Services' ? 'All' : activeFilter.slice(0, 4)} ∨ ]` 
                  : `[ ${activeFilter === 'All Services' ? 'All' : activeFilter} ∨ ]`}
              </Text>
            </Box>
          </Clickable>

          {/* Live badge pill */}
          <Clickable onClick={() => onToggleLive?.()}>
            <Box 
              backgroundColor={isLive ? theme.colors.runningBg : theme.colors.warningBg} 
              paddingX={1}
              marginRight={1}
              flexShrink={0}
            >
              <Text 
                color={isLive ? theme.colors.running : theme.colors.warning} 
                bold
              >
                [ ● {isLive ? 'Live' : 'Off'} ]
              </Text>
            </Box>
          </Clickable>

          {/* Wrap mode pill */}
          <Clickable onClick={() => onToggleWrap?.()}>
            <Box 
              backgroundColor={isWrapMode ? theme.colors.accentDark : theme.colors.card} 
              paddingX={1}
              marginRight={1}
              flexShrink={0}
            >
              <Text color={isWrapMode ? theme.colors.accent : theme.colors.textSecondary} bold={isWrapMode}>
                {panelWidth < 68 
                  ? `[ ${isWrapMode ? 'W:On' : 'W:Off'} ]` 
                  : `[ w: ${isWrapMode ? 'Wrap On' : 'Wrap Off'} ]`}
              </Text>
            </Box>
          </Clickable>

          {/* Copy pill */}
          <Clickable onClick={() => onCopyCurrent?.()}>
            <Box 
              backgroundColor={theme.colors.card} 
              paddingX={1}
              flexShrink={0}
            >
              <Text color={theme.colors.accent} bold>
                {panelWidth < 68 ? '[ 📋 ]' : '[ 📋 Copy ]'}
              </Text>
            </Box>
          </Clickable>
        </Box>
      </Box>

      {/* Hairline Separator under Header Controls */}
      <Box width="100%" height={1} overflow="hidden" flexShrink={0}>
        <Text color={theme.colors.borderSubtle}>{'─'.repeat(innerWidth)}</Text>
      </Box>

      {/* Global Logs Stream with Strict Line Budgeting & Overflow Containment */}
      <Box 
        flexDirection="column" 
        height={availableLogLines} 
        overflow="hidden" 
        flexShrink={0}
        marginTop={0}
      >
        {visibleLogs.map((log, index) => {
          const badge = getServiceBadgeStyle(log.service);
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
              key={log.id}
              flexDirection="column"
              backgroundColor={isInRange ? '#1E293B' : undefined}
              paddingX={0}
              marginBottom={0}
            >
              {/* 1. Clickable Row Header: selects row & focuses panel */}
              <Clickable
                id={`global-log-row-${index}`}
                textStartX={jsonResult.isJson ? 42 : 23}
                width="100%"
                onClick={(ev) => {
                  onFocus?.();
                  onSelectLogIndex?.(index, ev?.shiftKey);
                }}
              >
                <Box flexDirection="row" alignItems="center" marginBottom={0} flexWrap="nowrap" width="100%">
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

                  <Box width={11} flexShrink={0} marginRight={1}>
                    <Text color={theme.colors.textDim}>[</Text>
                    <Text color={badge.color} bold>
                      {badge.cleanLabel.padEnd(8)}
                    </Text>
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
                    {renderMessage(log, jsonResult, jsonResult.isJson, isCursor)}
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
                <Box flexDirection="column" paddingLeft={14} marginTop={0} marginBottom={0}>
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
    </Clickable>
  );
});

export default GlobalLogsPanel;
