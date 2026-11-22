import { theme } from '../theme/theme.js';
import { JsonTextSelection, LogEntry } from '../types/index.js';
import { stripAnsiEscapeCodes, truncateAnsiText } from './ansi.js';

export interface JsonLogParseResult {
  isJson: boolean;
  parsed?: any;
  canonicalMsg?: string;
  method?: string;
  path?: string;
  status?: string | number;
  latency?: string;
  error?: string;
  level?: string;
  extraPairs?: Array<{ key: string; val: string }>;
}

export interface HighlightToken {
  text: string;
  color?: string;
  bold?: boolean;
  dim?: boolean;
}

export interface HighlightedLine {
  tokens: HighlightToken[];
}

export interface JsonTextSelectionBounds {
  startLine: number;
  startChar: number;
  endLine: number;
  endChar: number;
}

export interface HighlightedSelectionSegment extends HighlightToken {
  selected: boolean;
}

export function getJsonTextSelectionBounds(selection: JsonTextSelection): JsonTextSelectionBounds {
  const anchor = { line: selection.anchorLine, char: selection.anchorChar };
  const head = { line: selection.headLine, char: selection.headChar };
  const isForward = anchor.line < head.line || (anchor.line === head.line && anchor.char <= head.char);
  const start = isForward ? anchor : head;
  const end = isForward ? head : anchor;

  return {
    startLine: Math.max(0, start.line),
    startChar: Math.max(0, start.char),
    endLine: Math.max(0, end.line),
    endChar: Math.max(0, end.char) + 1
  };
}

export function getSelectedJsonText(lines: HighlightedLine[], selection: JsonTextSelection): string | null {
  if (lines.length === 0) return null;

  const bounds = getJsonTextSelectionBounds(selection);
  if (bounds.startLine >= lines.length || bounds.endLine >= lines.length) return null;
  const startLine = Math.min(bounds.startLine, lines.length - 1);
  const endLine = Math.min(bounds.endLine, lines.length - 1);
  if (startLine > endLine) return null;

  return lines.slice(startLine, endLine + 1).map((line, idx) => {
    const lineIndex = startLine + idx;
    const text = line.tokens.map(token => token.text).join('');
    const startChar = lineIndex === startLine ? Math.min(bounds.startChar, text.length) : 0;
    const endChar = lineIndex === endLine ? Math.min(bounds.endChar, text.length) : text.length;
    return text.slice(startChar, Math.max(startChar, endChar));
  }).join('\n');
}

export function getHighlightedSelectionSegments(
  line: HighlightedLine,
  lineIndex: number,
  selection: JsonTextSelection | null
): HighlightedSelectionSegment[] {
  if (!selection) {
    return line.tokens.map(token => ({ ...token, selected: false }));
  }

  const bounds = getJsonTextSelectionBounds(selection);
  const lineLength = line.tokens.reduce((length, token) => length + token.text.length, 0);
  if (lineIndex < bounds.startLine || lineIndex > bounds.endLine) {
    return line.tokens.map(token => ({ ...token, selected: false }));
  }

  const selectedStart = lineIndex === bounds.startLine ? Math.min(bounds.startChar, lineLength) : 0;
  const selectedEnd = lineIndex === bounds.endLine ? Math.min(bounds.endChar, lineLength) : lineLength;
  if (selectedEnd <= selectedStart) {
    return line.tokens.map(token => ({ ...token, selected: false }));
  }

  const segments: HighlightedSelectionSegment[] = [];
  let lineOffset = 0;
  for (const token of line.tokens) {
    const tokenEnd = lineOffset + token.text.length;
    const start = Math.max(0, selectedStart - lineOffset);
    const end = Math.min(token.text.length, selectedEnd - lineOffset);
    const addSegment = (text: string, selected: boolean) => {
      if (text) segments.push({ ...token, text, selected });
    };

    addSegment(token.text.slice(0, start), false);
    addSegment(token.text.slice(start, Math.max(start, end)), end > start);
    addSegment(token.text.slice(Math.max(start, end)), false);
    lineOffset = tokenEnd;
  }
  return segments;
}

// Boilerplate keys that can be omitted from compact summaries
const BOILERPLATE_KEYS = new Set([
  'pid', 'hostname', 'host', 'time', 'timestamp', '@timestamp', 'v', 'version', 'level'
]);

/**
 * Safely parses a string if it represents a JSON log record,
 * extracting canonical fields (event message, route, status, error, latency).
 */
export function parseJsonLog(rawMsg: string): JsonLogParseResult {
  if (!rawMsg || typeof rawMsg !== 'string') {
    return { isJson: false };
  }

  const trimmed = rawMsg.trim();
  if (!trimmed.startsWith('{') || !trimmed.endsWith('}')) {
    return { isJson: false };
  }

  try {
    const parsed = JSON.parse(trimmed);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return { isJson: false };
    }

    // 1. Extract canonical primary message
    const msgCandidate =
      parsed.msg ||
      parsed.message ||
      parsed.event ||
      parsed.description ||
      parsed.info ||
      (typeof parsed.error === 'string' ? parsed.error : parsed.error?.message) ||
      (typeof parsed.err === 'string' ? parsed.err : parsed.err?.message);

    const canonicalMsg = msgCandidate ? String(msgCandidate) : undefined;

    // 2. Extract HTTP context
    const method =
      parsed.method ||
      parsed.req?.method ||
      parsed.http?.method ||
      parsed.httpMethod;

    const path =
      parsed.path ||
      parsed.url ||
      parsed.route ||
      parsed.req?.url ||
      parsed.req?.path;

    const status =
      parsed.status ||
      parsed.statusCode ||
      parsed.res?.statusCode ||
      parsed.http?.status;

    // 3. Extract latency
    const rawLatency =
      parsed.latencyMs ||
      parsed.latency ||
      parsed.durationMs ||
      parsed.duration ||
      parsed.responseTime ||
      parsed.elapsed ||
      parsed.ms;

    let latency: string | undefined;
    if (rawLatency !== undefined) {
      latency = typeof rawLatency === 'number' ? `${rawLatency} ms` : String(rawLatency);
      if (!latency.endsWith('ms') && !latency.endsWith('s')) {
        latency = `${latency} ms`;
      }
    }

    // 4. Extract error details
    let error: string | undefined;
    if (parsed.error) {
      error = typeof parsed.error === 'string' ? parsed.error : (parsed.error.stack || parsed.error.message || JSON.stringify(parsed.error));
    } else if (parsed.err) {
      error = typeof parsed.err === 'string' ? parsed.err : (parsed.err.stack || parsed.err.message || JSON.stringify(parsed.err));
    } else if (parsed.exception) {
      error = typeof parsed.exception === 'string' ? parsed.exception : JSON.stringify(parsed.exception);
    }

    // 5. Extract level
    const level = parsed.level || parsed.lvl || parsed.severity;

    // 6. Collect secondary meaningful key-value pairs
    const extraPairs: Array<{ key: string; val: string }> = [];
    const usedKeys = new Set(['msg', 'message', 'event', 'error', 'err', 'method', 'path', 'url', 'route', 'status', 'statusCode', 'latency', 'latencyMs', 'duration', 'durationMs', 'responseTime', 'elapsed', 'ms']);

    for (const [k, v] of Object.entries(parsed)) {
      if (!BOILERPLATE_KEYS.has(k.toLowerCase()) && !usedKeys.has(k)) {
        let valStr = '';
        if (typeof v === 'object' && v !== null) {
          valStr = Array.isArray(v) ? `[${v.length} items]` : '{...}';
        } else {
          valStr = String(v);
        }
        if (valStr.length > 25) {
          valStr = valStr.slice(0, 24) + '…';
        }
        extraPairs.push({ key: k, val: valStr });
        if (extraPairs.length >= 4) break;
      }
    }

    return {
      isJson: true,
      parsed,
      canonicalMsg,
      method: method ? String(method).toUpperCase() : undefined,
      path: path ? String(path) : undefined,
      status,
      latency,
      error,
      level: level ? String(level) : undefined,
      extraPairs
    };
  } catch {
    return { isJson: false };
  }
}

export function getLogDisplayText(log: LogEntry, maxMessageLength: number, isWrapMode: boolean): string {
  const parsed = parseJsonLog(log.message);
  let message = log.message;
  if (parsed.isJson) {
    message = parsed.canonicalMsg || (parsed.extraPairs && parsed.extraPairs.length > 0
      ? parsed.extraPairs.map(pair => `${pair.key}: ${pair.val}`).join(' | ')
      : (parsed.error || 'Structured payload'));
  }
  return isWrapMode || stripAnsiEscapeCodes(message).length <= maxMessageLength
    ? message
    : truncateAnsiText(message, maxMessageLength);
}

export function getLogMessageColumnOffset(
  log: LogEntry,
  baseOffset: number,
  isExpanded: boolean,
  scrollRangeLabel?: string
): number {
  const parsed = parseJsonLog(log.message);
  if (!parsed.isJson) return baseOffset;

  const expandLabel = isExpanded ? '▼ JSON (collapse)' : '▶ JSON (expand)';
  let offset = baseOffset + expandLabel.length + 3;
  if (scrollRangeLabel) {
    offset += 1 + 4 + scrollRangeLabel.length + 3 + 3;
  }
  if (parsed.method) offset += `${parsed.method} `.length;
  if (parsed.path) offset += `${parsed.path} `.length;
  if (parsed.status) offset += `[${parsed.status}] `.length;
  if (parsed.latency) offset += `(${parsed.latency}) `.length;
  return offset;
}

export function filterGlobalLogs(logs: LogEntry[], searchQuery: string, activeFilter: string): LogEntry[] {
  const query = searchQuery.trim().toLowerCase();
  return logs.filter(log => {
    if (activeFilter !== 'All Services' && log.service.toLowerCase() !== activeFilter.toLowerCase()) {
      return false;
    }
    return !query || log.message.toLowerCase().includes(query) || log.service.toLowerCase().includes(query);
  });
}

/**
 * Returns formatted 2-space indented pretty-printed JSON if input is JSON,
 * or original string verbatim.
 */
export function prettyPrintJson(rawMsg: string): string {
  try {
    const trimmed = rawMsg.trim();
    if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
      const parsed = JSON.parse(trimmed);
      return JSON.stringify(parsed, null, 2);
    }
  } catch {}
  return rawMsg;
}

/**
 * Transforms any arbitrary JS object/JSON into syntax-highlighted token lines
 * with colored keys, strings, numbers, booleans, and nulls.
 */
export function formatJsonToHighlightedLines(obj: any, indent = 2): HighlightedLine[] {
  const jsonStr = JSON.stringify(obj, null, indent);
  const rawLines = jsonStr.split('\n');

  return rawLines.map((line) => {
    const tokens: HighlightToken[] = [];
    let remaining = line;

    // Indentation whitespace
    const indentMatch = remaining.match(/^(\s+)/);
    if (indentMatch && indentMatch[1]) {
      tokens.push({ text: indentMatch[1] });
      remaining = remaining.slice(indentMatch[1].length);
    }

    // Check for JSON Key: "key":
    const keyMatch = remaining.match(/^("(\\"|[^"])*")(\s*:\s*)/);
    if (keyMatch) {
      tokens.push({
        text: keyMatch[1]!,
        color: theme.colors.borderFocus, // Bright Cyan for Keys
        bold: true
      });
      tokens.push({
        text: keyMatch[3]!,
        color: theme.colors.textMuted // Delimiter
      });
      remaining = remaining.slice(keyMatch[0].length);
    }

    // Parse remaining value on this line
    if (remaining.length > 0) {
      // String value: "value" (optional trailing comma)
      const strMatch = remaining.match(/^("(\\"|[^"])*")(,?)/);
      if (strMatch) {
        tokens.push({
          text: strMatch[1]!,
          color: theme.colors.running // Emerald Green for Strings
        });
        if (strMatch[3]) {
          tokens.push({ text: strMatch[3], color: theme.colors.textMuted });
        }
      }
      // Number: 123 or 45.67 (optional trailing comma)
      else if (/^-?\d+(\.\d+)?(,?)$/.test(remaining.trim())) {
        const numMatch = remaining.match(/^(-?\d+(\.\d+)?)(,?)/);
        if (numMatch) {
          tokens.push({
            text: numMatch[1]!,
            color: theme.colors.warning, // Amber Gold for Numbers
            bold: true
          });
          if (numMatch[3]) {
            tokens.push({ text: numMatch[3], color: theme.colors.textMuted });
          }
        }
      }
      // Boolean: true | false (optional trailing comma)
      else if (/^(true|false)(,?)$/.test(remaining.trim())) {
        const boolMatch = remaining.match(/^(true|false)(,?)/);
        if (boolMatch) {
          tokens.push({
            text: boolMatch[1]!,
            color: '#C084FC', // Purple for Booleans
            bold: true
          });
          if (boolMatch[2]) {
            tokens.push({ text: boolMatch[2], color: theme.colors.textMuted });
          }
        }
      }
      // Null: null (optional trailing comma)
      else if (/^null(,?)$/.test(remaining.trim())) {
        const nullMatch = remaining.match(/^null(,?)/);
        if (nullMatch) {
          tokens.push({
            text: 'null',
            color: theme.colors.textMuted,
            dim: true
          });
          if (nullMatch[1]) {
            tokens.push({ text: nullMatch[1], color: theme.colors.textMuted });
          }
        }
      }
      // Brackets, braces, arrays: { } [ ]
      else {
        tokens.push({
          text: remaining,
          color: theme.colors.textSecondary
        });
      }
    }

    return { tokens };
  });
}

export interface WindowedLogsResult {
  visibleLogs: LogEntry[];
  visibleLineRanges: Array<{ startLine: number; endLine: number }>;
  startIdx: number;
  endIdx: number;
  totalLogs: number;
  maxScroll: number;
  effectiveOffset: number;
  maxJsonLines: number;
}

function getLogLineWeight(
  log: LogEntry,
  expandedLogIds: Record<string | number, boolean>,
  maxJsonLines: number
): number {
  if (!expandedLogIds[log.id]) return 1;
  const jsonRes = parseJsonLog(log.message);
  if (!jsonRes.isJson || !jsonRes.parsed) return 1;
  return 1 + Math.min(formatJsonToHighlightedLines(jsonRes.parsed).length, maxJsonLines);
}

export function getLogScrollOffsetForEntry(params: {
  logs: LogEntry[];
  availableLines: number;
  expandedLogIds: Record<string | number, boolean>;
  logId: string | number;
}): number {
  const { logs, availableLines, expandedLogIds, logId } = params;
  const budget = Math.max(1, availableLines);
  const maxJsonLines = Math.max(1, budget - 1);
  const logIndex = logs.findIndex(log => String(log.id) === String(logId));
  if (logIndex < 0) return 0;

  let totalLines = 0;
  let targetEndLine = 0;
  logs.forEach((log, index) => {
    totalLines += getLogLineWeight(log, expandedLogIds, maxJsonLines);
    if (index === logIndex) targetEndLine = totalLines;
  });

  const maxScroll = Math.max(0, totalLines - budget);
  return Math.max(0, Math.min(maxScroll, totalLines - targetEndLine));
}

/**
 * Calculates a window of log entries constrained by an exact vertical line budget.
 * Automatically accounts for collapsed (1 line) vs expanded JSON logs (1 + N lines),
 * guaranteeing total rendered lines never exceed availableLines.
 */
export function calculateVisibleLogWindow(params: {
  logs: LogEntry[];
  availableLines: number;
  scrollOffset: number;
  expandedLogIds?: Record<string | number, boolean>;
  isWrapMode?: boolean;
}): WindowedLogsResult {
  const { logs, availableLines, scrollOffset, expandedLogIds = {}, isWrapMode = false } = params;
  const totalLogs = logs.length;
  const budget = Math.max(1, availableLines);

  // Full inline budgeting:
  // Allow expanded JSON to utilize the panel budget (leaving at least 1 line for the log's header)
  // without artificial 55% or 10-line caps.
  const maxJsonLines = Math.max(1, budget - 1);

  if (totalLogs === 0) {
    return {
      visibleLogs: [],
      visibleLineRanges: [],
      startIdx: 0,
      endIdx: 0,
      totalLogs: 0,
      maxScroll: 0,
      effectiveOffset: 0,
      maxJsonLines
    };
  }

  const weights = logs.map(log => getLogLineWeight(log, expandedLogIds, maxJsonLines));
  const totalLines = weights.reduce((sum, weight) => sum + weight, 0);
  const maxScroll = Math.max(0, totalLines - budget);
  const effectiveOffset = Math.max(0, Math.min(scrollOffset, maxScroll));
  const viewportStart = Math.max(0, totalLines - budget - effectiveOffset);
  const viewportEnd = Math.min(totalLines, viewportStart + budget);
  const visible: LogEntry[] = [];
  const visibleLineRanges: Array<{ startLine: number; endLine: number }> = [];
  let contentLine = 0;
  let startIdx = totalLogs;
  let endIdx = 0;

  logs.forEach((log, index) => {
    const itemStart = contentLine;
    const itemEnd = itemStart + weights[index]!;
    contentLine = itemEnd;
    if (itemEnd <= viewportStart || itemStart >= viewportEnd) return;

    startIdx = Math.min(startIdx, index);
    endIdx = index + 1;
    visible.push(log);
    visibleLineRanges.push({
      startLine: Math.max(0, viewportStart - itemStart),
      endLine: Math.min(weights[index]!, viewportEnd - itemStart)
    });
  });

  return {
    visibleLogs: visible,
    visibleLineRanges,
    startIdx,
    endIdx,
    totalLogs,
    maxScroll,
    effectiveOffset,
    maxJsonLines
  };
}
