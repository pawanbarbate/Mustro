import React from 'react';
import { Box, Text } from 'ink';
import { JsonTextSelection, LogEntry } from '../types/index.js';
import Clickable from './common/ClickManager.js';
import { theme, getServiceBadgeStyle } from '../theme/theme.js';
import { parseJsonLog, formatJsonToHighlightedLines, HighlightedLine, JsonLogParseResult, calculateVisibleLogWindow, filterGlobalLogs, getLogDisplayText, getLogMessageColumnOffset, getHighlightedSelectionSegments } from '../utils/logFormatter.js';
import { getAnsiTextSelectionSegments, stripAnsiEscapeCodes } from '../utils/ansi.js';

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
  isMaximized?: boolean;
  selectedLogIndex?: number;
  selectedLogId?: string | number | null;
  selectionAnchor?: number | null;
  selectionAnchorLogId?: string | number | null;
  charSelection?: { start: number; end: number } | null;
  jsonTextSelection?: JsonTextSelection | null;
  jsonLineScroll?: number;
  jsonLineScrollById?: Record<string | number, number>;
  expandedLogIds?: Record<string | number, boolean>;
  copiedLogId?: string | number | null;
  onToggleSearch?: () => void;
  onCycleFilter?: () => void;
  onToggleLive?: () => void;
  onToggleWrap?: () => void;
  onToggleMaximize?: () => void;
  onScrollJson?: (delta: number, logId?: string | number) => void;
  onFocus?: () => void;
  onCopyCurrent?: () => void;
  onCopyLog?: (log: LogEntry) => void;
  onSelectLogIndex?: (index: number, isShift?: boolean, logId?: string | number) => void;
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
  isMaximized = false,
  selectedLogIndex = 0,
  selectedLogId = null,
  selectionAnchor = null,
  selectionAnchorLogId = null,
  charSelection = null,
  jsonTextSelection = null,
  jsonLineScroll = 0,
  jsonLineScrollById = {},
  expandedLogIds = {},
  copiedLogId = null,
  onToggleSearch,
  onCycleFilter,
  onToggleLive,
  onToggleWrap,
  onToggleMaximize,
  onScrollJson,
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

    // 1. Smart Structured JSON rendering (checks isJson FIRST to isolate header selection from JSON payload)
    const res = jsonResult || parseJsonLog(rawMsg);
    if (res.isJson) {
      const isJsonErr = res.error || res.level?.toLowerCase() === 'error';
      const isJsonWarn = res.level?.toLowerCase() === 'warn';
      const msgColor = isJsonErr ? theme.colors.stopped : isJsonWarn ? theme.colors.warning : theme.colors.textPrimary;

      const displayMsg = getLogDisplayText(log, maxMsgLen, isWrapMode);

      // Character selection active on this row: apply ONLY to formatted displayMsg!
      if (isCharSelected && charSelection) {
        const visibleMsg = stripAnsiEscapeCodes(displayMsg);
        const s = Math.max(0, Math.min(visibleMsg.length, charSelection.start));
        const e = Math.max(s, Math.min(visibleMsg.length, charSelection.end));
        const segments = getAnsiTextSelectionSegments(displayMsg, s, e);
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
            {segments.map((segment, index) => (
              <Text
                key={index}
                color={segment.selected ? '#FFFFFF' : segment.color || theme.colors.textPrimary}
                backgroundColor={segment.selected ? '#0284C7' : segment.backgroundColor}
                bold={segment.bold}
                dimColor={segment.dim}
                italic={segment.italic}
                underline={segment.underline}
                strikethrough={segment.strikethrough}
              >
                {segment.text}
              </Text>
            ))}
          </Text>
        );
      }

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
    const msg = getLogDisplayText(log, maxMsgLen, isWrapMode);

    if (isCharSelected && charSelection) {
      const visibleMsg = stripAnsiEscapeCodes(msg);
      const s = Math.max(0, Math.min(visibleMsg.length, charSelection.start));
      const e = Math.max(s, Math.min(visibleMsg.length, charSelection.end));
      const segments = getAnsiTextSelectionSegments(msg, s, e);
      return (
        <Text wrap={isWrapMode ? 'wrap' : undefined}>
          {segments.map((segment, index) => (
            <Text
              key={index}
              color={segment.selected ? '#FFFFFF' : segment.color || theme.colors.textPrimary}
              backgroundColor={segment.selected ? '#0284C7' : segment.backgroundColor}
              bold={segment.bold}
              dimColor={segment.dim}
              italic={segment.italic}
              underline={segment.underline}
              strikethrough={segment.strikethrough}
            >
              {segment.text}
            </Text>
          ))}
        </Text>
      );
    }

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
  const matchingLogs = filterGlobalLogs(logs, searchQuery, activeFilter);

  const totalFilteredLogs = matchingLogs.length;

  // Strict Line Budgeting:
  // Overhead: Border top (1) + Border bottom (1) + Header (1) + Hairline (1) = 4 lines.
  const overheadLines = 4;
  const availableLogLines = Math.max(2, (height || 10) - overheadLines);
  const {
    visibleLogs,
    visibleLineRanges,
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
    isWrapMode
  });

  const resolvedSelectedIndex = selectedLogId === null
    ? -1
    : visibleLogs.findIndex(log => log.id === selectedLogId);
  const safeSelectedIndex = selectedLogId !== null
    ? resolvedSelectedIndex
    : Math.min(selectedLogIndex, Math.max(0, visibleLogs.length - 1));
  const resolvedAnchorIndex = selectionAnchorLogId === null
    ? -1
    : visibleLogs.findIndex(log => log.id === selectionAnchorLogId);
  const visibleAnchorIndex = selectionAnchorLogId !== null
    ? (resolvedAnchorIndex >= 0 ? resolvedAnchorIndex : null)
    : selectionAnchor;
  const hasRangeSelection = isFocused && safeSelectedIndex >= 0 && visibleAnchorIndex !== null && visibleAnchorIndex !== safeSelectedIndex;
  const rangeMin = visibleAnchorIndex !== null ? Math.min(visibleAnchorIndex, safeSelectedIndex) : safeSelectedIndex;
  const rangeMax = visibleAnchorIndex !== null ? Math.max(visibleAnchorIndex, safeSelectedIndex) : safeSelectedIndex;
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

          {/* Zoom / Maximize pill */}
          {onToggleMaximize && (
            <Clickable onClick={() => onToggleMaximize()}>
              <Box 
                backgroundColor={isMaximized ? theme.colors.accentDark : theme.colors.card} 
                paddingX={1}
                marginRight={1}
                flexShrink={0}
              >
                <Text color={isMaximized ? theme.colors.accent : theme.colors.textSecondary} bold={isMaximized}>
                  {panelWidth < 68 
                    ? (isMaximized ? '[ 🗗 ]' : '[ ⤢ ]') 
                    : (isMaximized ? '[ 🗗 Restore ]' : '[ ⤢ Zoom ]')}
                </Text>
              </Box>
            </Clickable>
          )}

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
          const visibleRange = visibleLineRanges[index]!;

          let highlightedLines: HighlightedLine[] = [];
          let jsonScrollInfo: { start: number; end: number; total: number } | null = null;
          let jsonLineStart = 0;
          if (isExpanded && jsonResult.parsed && maxJsonLines > 0) {
            const fullLines = formatJsonToHighlightedLines(jsonResult.parsed);
            const renderedJsonLineCount = Math.min(fullLines.length, maxJsonLines);
            const maxScroll = Math.max(0, fullLines.length - maxJsonLines);
            const storedOffset = jsonLineScrollById[log.id] ?? jsonLineScroll;
            const offset = Math.max(0, Math.min(maxScroll, storedOffset));
            const firstVisibleJsonLine = Math.max(0, visibleRange.startLine - 1);
            const lastVisibleJsonLine = Math.min(renderedJsonLineCount, visibleRange.endLine - 1);
            const visibleJsonLineCount = Math.max(0, lastVisibleJsonLine - firstVisibleJsonLine);
            jsonLineStart = Math.min(
              fullLines.length - visibleJsonLineCount,
              offset + firstVisibleJsonLine
            );
            highlightedLines = fullLines.slice(jsonLineStart, jsonLineStart + visibleJsonLineCount);
            if (fullLines.length > maxJsonLines) {
              jsonScrollInfo = {
                start: jsonLineStart + 1,
                end: Math.min(fullLines.length, jsonLineStart + highlightedLines.length),
                total: fullLines.length
              };
            }
          }

          return (
            <Box
              key={log.id}
              flexDirection="column"
              backgroundColor={hasRangeSelection && isInRange ? '#1E3A5F' : isInRange ? '#14283A' : undefined}
              paddingX={0}
              marginBottom={0}
            >
              {visibleRange.startLine === 0 && (
                <Clickable
                  id={`global-log-row-${index}`}
                  textStartX={getLogMessageColumnOffset(
                    log,
                    23,
                    isExpanded,
                    jsonScrollInfo ? `[${jsonScrollInfo.start}-${jsonScrollInfo.end}/${jsonScrollInfo.total} lines]` : undefined
                  )}
                  width="100%"
                  onClick={(ev) => {
                    onFocus?.();
                    onSelectLogIndex?.(index, ev?.shiftKey, log.id);
                  }}
                >
                  <Box flexDirection="row" alignItems="center" marginBottom={0} flexWrap="nowrap" width="100%" height={1} overflow="hidden">
                    {/* Visual Selector Indicator */}
                    <Box width={2} flexShrink={0}>
                      {isCursor ? (
                        <Text color={theme.colors.accent} bold>▶ </Text>
                      ) : hasRangeSelection && isInRange ? (
                        <Text color={theme.colors.accent}>▎ </Text>
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
                            onSelectLogIndex?.(index, false, log.id);
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
                          <Box flexDirection="row" alignItems="center" marginLeft={1}>
                            <Clickable
                              onClick={() => {
                                onFocus?.();
                                onSelectLogIndex?.(index, false, log.id);
                                onScrollJson?.(-1, log.id);
                              }}
                            >
                              <Box backgroundColor={theme.colors.card} paddingX={1} marginRight={1}>
                                <Text color={jsonScrollInfo.start > 1 ? theme.colors.accent : theme.colors.textMuted} bold>▲</Text>
                              </Box>
                            </Clickable>
                            <Box backgroundColor={theme.colors.card} paddingX={1} marginRight={1}>
                              <Text color={theme.colors.warning} bold>
                                [{jsonScrollInfo.start}-{jsonScrollInfo.end}/{jsonScrollInfo.total} lines]
                              </Text>
                            </Box>
                            <Clickable
                              onClick={() => {
                                onFocus?.();
                                onSelectLogIndex?.(index, false, log.id);
                                onScrollJson?.(1, log.id);
                              }}
                            >
                              <Box backgroundColor={theme.colors.card} paddingX={1}>
                                <Text color={jsonScrollInfo.end < jsonScrollInfo.total ? theme.colors.accent : theme.colors.textMuted} bold>▼</Text>
                              </Box>
                            </Clickable>
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
              )}

              {/* 2. Inline Expanded JSON View: with vertical scroll track */}
              {isExpanded && highlightedLines.length > 0 && (
                <Box flexDirection="row" paddingLeft={14} marginTop={0} marginBottom={0}>
                  <Box flexDirection="column" flexGrow={1}>
                    {highlightedLines.map((hl, hlIdx) => (
                      <Clickable
                        key={hlIdx}
                        id={`global-json-line-${index}-${jsonLineStart + hlIdx}`}
                        textStartX={0}
                        width="100%"
                        onClick={() => {
                          onFocus?.();
                          onSelectLogIndex?.(index, false, log.id);
                        }}
                      >
                        <Box flexDirection="row" height={1} overflow="hidden" width="100%">
                          {getHighlightedSelectionSegments(
                            hl,
                            jsonLineStart + hlIdx,
                            jsonTextSelection?.logId === log.id ? jsonTextSelection : null
                          ).map((segment, segmentIdx) => (
                            <Text
                              key={segmentIdx}
                              color={segment.selected ? '#FFFFFF' : segment.color}
                              backgroundColor={segment.selected ? '#0284C7' : undefined}
                              bold={segment.bold}
                              dimColor={segment.dim}
                            >
                              {segment.text}
                            </Text>
                          ))}
                        </Box>
                      </Clickable>
                    ))}
                  </Box>
                  {jsonScrollInfo && jsonScrollInfo.total > maxJsonLines && (
                    <Box flexDirection="column" width={1} alignItems="center" marginLeft={1}>
                      {highlightedLines.map((_, idx) => {
                        const total = jsonScrollInfo.total;
                        const start = jsonScrollInfo.start - 1;
                        const thumbHeight = Math.max(1, Math.round((maxJsonLines / total) * maxJsonLines));
                        const maxScroll = Math.max(1, total - maxJsonLines);
                        const thumbPos = Math.round((start / maxScroll) * Math.max(0, maxJsonLines - thumbHeight));
                        const isThumb = idx >= thumbPos && idx < thumbPos + thumbHeight;
                        return (
                          <Text key={idx} color={isThumb ? theme.colors.accent : theme.colors.borderSubtle} bold={isThumb}>
                            {isThumb ? '█' : '│'}
                          </Text>
                        );
                      })}
                    </Box>
                  )}
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
