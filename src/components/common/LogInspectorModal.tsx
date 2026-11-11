import React from 'react';
import { Box, Text } from 'ink';
import { LogEntry } from '../../types/index.js';
import Clickable from './ClickManager.js';
import { theme } from '../../theme/theme.js';
import {
  parseJsonLog,
  formatJsonToHighlightedLines,
  prettyPrintJson,
  HighlightedLine
} from '../../utils/logFormatter.js';

export interface LogInspectorModalProps {
  log: LogEntry;
  serviceName?: string;
  activeTab?: 'formatted' | 'raw';
  scrollOffset?: number;
  onSelectTab?: (tab: 'formatted' | 'raw') => void;
  onScroll?: (delta: number) => void;
  onClose: () => void;
  onCopyFormatted: () => void;
  onCopyRaw: () => void;
  width?: number;
  height?: number;
}

export const LogInspectorModal: React.FC<LogInspectorModalProps> = React.memo(({
  log,
  serviceName,
  activeTab = 'formatted',
  scrollOffset = 0,
  onSelectTab,
  onScroll,
  onClose,
  onCopyFormatted,
  onCopyRaw,
  width = 85,
  height
}) => {
  const modalWidth = Math.min(Math.max(width - 6, 45), 95);
  const svc = serviceName || log.service || 'Service';
  const lvl = (log.level || 'info').toUpperCase();
  const isErr = lvl === 'ERROR';
  const isWarn = lvl === 'WARN';

  const lvlColor = isErr ? theme.colors.stopped : isWarn ? theme.colors.warning : theme.colors.accent;
  const lvlBg = isErr ? theme.colors.stoppedBg : isWarn ? theme.colors.warningBg : theme.colors.card;

  const contentWidth = modalWidth - 4;

  // 1. Parse JSON log if structured
  const jsonParseResult = React.useMemo(() => parseJsonLog(log.message), [log.message]);
  const isJson = jsonParseResult.isJson;

  // 2. Prepare Formatted vs Raw Lines
  const highlightedJsonLines: HighlightedLine[] = React.useMemo(() => {
    if (!isJson || !jsonParseResult.parsed) return [];
    return formatJsonToHighlightedLines(jsonParseResult.parsed);
  }, [isJson, jsonParseResult.parsed]);

  const rawLines = React.useMemo(() => {
    return (log.message || '').split(/\r?\n/);
  }, [log.message]);

  const totalLines = isJson && activeTab === 'formatted'
    ? highlightedJsonLines.length
    : rawLines.length;

  // Windowing calculation
  const maxVisibleLines = height ? Math.max(6, height - 12) : 16;
  const maxScroll = Math.max(0, totalLines - maxVisibleLines);
  const effectiveOffset = Math.max(0, Math.min(scrollOffset, maxScroll));
  const startIdx = effectiveOffset;
  const endIdx = Math.min(totalLines, startIdx + maxVisibleLines);

  const visibleJsonLines = highlightedJsonLines.slice(startIdx, endIdx);
  const visibleRawLines = rawLines.slice(startIdx, endIdx);

  return (
    <Box
      borderStyle="round"
      borderColor={isErr ? theme.colors.stopped : theme.colors.borderFocus}
      borderBackgroundColor={theme.colors.canvas}
      flexDirection="column"
      paddingX={2}
      paddingY={1}
      width={modalWidth}
      backgroundColor={theme.colors.surface}
    >
      {/* 1. Header Bar */}
      <Box flexDirection="row" justifyContent="space-between" alignItems="center" marginBottom={0}>
        <Box flexDirection="row" alignItems="center">
          <Text color={isErr ? theme.colors.stopped : theme.colors.accent} bold>
            🔍 Log & Error Inspector
          </Text>
          {isJson && (
            <Box backgroundColor={theme.colors.accentDark} paddingX={1} marginLeft={1}>
              <Text color={theme.colors.accent} bold>[JSON Structured]</Text>
            </Box>
          )}
        </Box>
        <Box flexDirection="row" alignItems="center">
          <Box backgroundColor={lvlBg} paddingX={1} marginRight={1}>
            <Text color={lvlColor} bold>[{lvl}]</Text>
          </Box>
          <Box backgroundColor={theme.colors.card} paddingX={1}>
            <Text color={theme.colors.textPrimary} bold>{svc}</Text>
          </Box>
        </Box>
      </Box>

      {/* 2. Tabs Row (Formatted vs Raw) */}
      <Box flexDirection="row" justifyContent="space-between" alignItems="center" marginTop={1} marginBottom={0}>
        <Box flexDirection="row" alignItems="center">
          {isJson ? (
            <>
              <Clickable onClick={() => onSelectTab?.('formatted')}>
                <Box
                  backgroundColor={activeTab === 'formatted' ? theme.colors.card : theme.colors.surface}
                  paddingX={1}
                  marginRight={1}
                >
                  <Text color={activeTab === 'formatted' ? theme.colors.accent : theme.colors.textMuted} bold={activeTab === 'formatted'}>
                    [ 🌲 Formatted JSON (1) ]
                  </Text>
                </Box>
              </Clickable>
              <Clickable onClick={() => onSelectTab?.('raw')}>
                <Box
                  backgroundColor={activeTab === 'raw' ? theme.colors.card : theme.colors.surface}
                  paddingX={1}
                  marginRight={1}
                >
                  <Text color={activeTab === 'raw' ? theme.colors.accent : theme.colors.textMuted} bold={activeTab === 'raw'}>
                    [ 📄 Raw Stream (2) ]
                  </Text>
                </Box>
              </Clickable>
            </>
          ) : (
            <Box backgroundColor={theme.colors.card} paddingX={1}>
              <Text color={theme.colors.textSecondary}>Plain Log Output</Text>
            </Box>
          )}
        </Box>

        {/* Position / Scroll Indicator */}
        <Box flexDirection="row" alignItems="center">
          <Text color={theme.colors.textMuted}>
            Lines {startIdx + 1}-{endIdx}/{totalLines}
          </Text>
          {totalLines > maxVisibleLines && (
            <Box backgroundColor={theme.colors.card} paddingX={1} marginLeft={1}>
              <Text color={theme.colors.accent}>[↑↓ Scroll]</Text>
            </Box>
          )}
        </Box>
      </Box>

      {/* Hairline Divider */}
      <Box width="100%" height={1} overflow="hidden" marginTop={0} marginBottom={1}>
        <Text color={theme.colors.borderSubtle}>{'─'.repeat(contentWidth)}</Text>
      </Box>

      {/* 3. Main Message Content Body */}
      <Box
        flexDirection="column"
        backgroundColor={theme.colors.canvas}
        paddingX={1}
        paddingY={1}
        marginBottom={1}
        borderStyle="single"
        borderColor={theme.colors.borderSubtle}
        height={maxVisibleLines + 2}
      >
        {isJson && activeTab === 'formatted' ? (
          /* Render Syntax Highlighted JSON Tree */
          visibleJsonLines.map((line, idx) => (
            <Box key={idx} flexDirection="row" flexWrap="nowrap">
              {line.tokens.map((token, tIdx) => (
                <Text
                  key={tIdx}
                  color={token.color || theme.colors.textPrimary}
                  bold={token.bold}
                  dimColor={token.dim}
                >
                  {token.text}
                </Text>
              ))}
            </Box>
          ))
        ) : (
          /* Render Raw Lines (Plain text / Raw JSON) */
          visibleRawLines.map((line, idx) => {
            const isErrorLine = isErr || line.toLowerCase().includes('error') || line.includes('✖');
            return (
              <Text
                key={idx}
                color={isErrorLine ? theme.colors.stopped : theme.colors.textPrimary}
                wrap="wrap"
              >
                {line || ' '}
              </Text>
            );
          })
        )}
      </Box>

      {/* 4. Action Buttons & Keyboard Hints */}
      <Box flexDirection="row" justifyContent="space-between" alignItems="center" marginTop={0}>
        <Box flexDirection="row" alignItems="center">
          {isJson ? (
            <>
              <Clickable onClick={onCopyFormatted}>
                <Box backgroundColor={theme.colors.runningBg} paddingX={1} marginRight={1}>
                  <Text color={theme.colors.running} bold>[ 📋 Copy Formatted JSON (c / Enter) ]</Text>
                </Box>
              </Clickable>
              <Clickable onClick={onCopyRaw}>
                <Box backgroundColor={theme.colors.card} paddingX={1} marginRight={1}>
                  <Text color={theme.colors.textSecondary} bold>[ 📋 Copy Raw (r) ]</Text>
                </Box>
              </Clickable>
            </>
          ) : (
            <Clickable onClick={onCopyRaw}>
              <Box backgroundColor={theme.colors.runningBg} paddingX={1} marginRight={1}>
                <Text color={theme.colors.running} bold>[ 📋 Copy to Clipboard (c / Enter) ]</Text>
              </Box>
            </Clickable>
          )}
        </Box>

        <Clickable onClick={onClose}>
          <Box backgroundColor={theme.colors.card} paddingX={1}>
            <Text color={theme.colors.textSecondary} bold>[ Close (Esc) ]</Text>
          </Box>
        </Clickable>
      </Box>
    </Box>
  );
});

export default LogInspectorModal;
