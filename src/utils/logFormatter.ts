import { theme } from '../theme/theme.js';
import { LogEntry } from '../types/index.js';

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
  return isWrapMode || message.length <= maxMessageLength
    ? message
    : `${message.slice(0, Math.max(0, maxMessageLength - 1))}…`;
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

export function getLogWindowAnchorId(
  logs: LogEntry[],
  selectedLogId: string | number | null,
  expandedLogIds: Record<string | number, boolean>,
  selectionAnchorLogId: string | number | null = null
): string | number | null {
  if (selectionAnchorLogId !== null && logs.some(log => String(log.id) === String(selectionAnchorLogId))) {
    return selectionAnchorLogId;
  }
  if (
    selectedLogId !== null &&
    expandedLogIds[selectedLogId] &&
    logs.some(log => String(log.id) === String(selectedLogId))
  ) {
    return selectedLogId;
  }
  return Object.keys(expandedLogIds).find(id => expandedLogIds[id]) || null;
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
  startIdx: number;
  endIdx: number;
  totalLogs: number;
  maxScroll: number;
  effectiveOffset: number;
  maxJsonLines: number;
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
  anchorLogId?: string | number | null;
}): WindowedLogsResult {
  const { logs, availableLines, scrollOffset, expandedLogIds = {}, isWrapMode = false, anchorLogId } = params;
  const totalLogs = logs.length;
  const budget = Math.max(1, availableLines);

  // Full inline budgeting:
  // Allow expanded JSON to utilize the panel budget (leaving at least 1 line for the log's header)
  // without artificial 55% or 10-line caps.
  const maxJsonLines = Math.max(1, budget - 1);

  if (totalLogs === 0) {
    return {
      visibleLogs: [],
      startIdx: 0,
      endIdx: 0,
      totalLogs: 0,
      maxScroll: 0,
      effectiveOffset: 0,
      maxJsonLines
    };
  }

  const getLogWeight = (log: LogEntry): number => {
    // Decouple Wrap Mode from JSON expansion: wrap mode only wraps text strings, never auto-expands JSON trees
    const isExp = !!expandedLogIds[log.id];
    if (!isExp) return 1;
    const jsonRes = parseJsonLog(log.message);
    if (!jsonRes.isJson || !jsonRes.parsed) return 1;
    const fullLines = formatJsonToHighlightedLines(jsonRes.parsed);
    const expLines = Math.min(fullLines.length, maxJsonLines);
    return 1 + expLines;
  };

  const maxScroll = Math.max(0, totalLogs - 1);
  const effectiveOffset = Math.max(0, Math.min(scrollOffset, maxScroll));

  // Determine target anchor only if explicitly provided
  let targetIdx: number = -1;
  if (anchorLogId !== undefined && anchorLogId !== null) {
    targetIdx = logs.findIndex(l => String(l.id) === String(anchorLogId));
  }

  let visible: LogEntry[] = [];
  let startIdx = 0;
  let endIdx = 0;

  if (targetIdx >= 0 && targetIdx < totalLogs) {
    // Anchor around targetIdx
    const targetLog = logs[targetIdx]!;
    visible = [targetLog];
    let usedLines = getLogWeight(targetLog);

    let belowIdx = targetIdx + 1;
    let aboveIdx = targetIdx - 1;

    if (effectiveOffset === 0) {
      // Live tail: prefer logs below towards latest
      while (belowIdx < totalLogs) {
        const nextLog = logs[belowIdx]!;
        const weight = getLogWeight(nextLog);
        if (usedLines + weight > budget) break;
        visible.push(nextLog);
        usedLines += weight;
        belowIdx++;
      }
      while (aboveIdx >= 0) {
        const prevLog = logs[aboveIdx]!;
        const weight = getLogWeight(prevLog);
        if (usedLines + weight > budget) break;
        visible.unshift(prevLog);
        usedLines += weight;
        aboveIdx--;
      }
    } else {
      // Scrolled up: prefer logs above
      while (aboveIdx >= 0) {
        const prevLog = logs[aboveIdx]!;
        const weight = getLogWeight(prevLog);
        if (usedLines + weight > budget) break;
        visible.unshift(prevLog);
        usedLines += weight;
        aboveIdx--;
      }
      while (belowIdx < totalLogs) {
        const nextLog = logs[belowIdx]!;
        const weight = getLogWeight(nextLog);
        if (usedLines + weight > budget) break;
        visible.push(nextLog);
        usedLines += weight;
        belowIdx++;
      }
    }

    startIdx = aboveIdx + 1;
    endIdx = belowIdx;
  } else {
    // Standard backward accumulation from (totalLogs - effectiveOffset)
    const anchorEnd = Math.max(1, totalLogs - effectiveOffset);
    let usedLines = 0;
    let currentIdx = anchorEnd - 1;

    while (currentIdx >= 0) {
      const log = logs[currentIdx]!;
      const weight = getLogWeight(log);
      if (usedLines + weight > budget && visible.length > 0) {
        break;
      }
      visible.unshift(log);
      usedLines += weight;
      currentIdx--;
    }

    startIdx = currentIdx + 1;
    endIdx = startIdx + visible.length;

    // Forward fill if startIdx === 0 and budget remains
    while (endIdx < totalLogs) {
      const nextLog = logs[endIdx]!;
      const weight = getLogWeight(nextLog);
      if (usedLines + weight > budget) break;
      visible.push(nextLog);
      usedLines += weight;
      endIdx++;
    }
  }

  const calculatedOffset = Math.max(0, totalLogs - endIdx);

  return {
    visibleLogs: visible,
    startIdx,
    endIdx,
    totalLogs,
    maxScroll,
    effectiveOffset: effectiveOffset > 0 ? (calculatedOffset > 0 ? calculatedOffset : effectiveOffset) : 0,
    maxJsonLines
  };
}
