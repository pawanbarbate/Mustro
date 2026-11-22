import clipboard from 'clipboardy';
import fs from 'fs';
import { LogEntry, Service } from '../types/index.js';
import { stripAnsiEscapeCodes } from './ansi.js';

export { stripAnsiEscapeCodes } from './ansi.js';

/**
 * Generate OSC 52 terminal clipboard escape sequence.
 * Supports tmux and screen wrapping.
 */
export function getOsc52Sequence(text: string): string {
  const base64 = Buffer.from(text, 'utf8').toString('base64');
  let seq = `\x1b]52;c;${base64}\x07`;
  if (process.env.TMUX) {
    seq = `\x1bPtmux;\x1b${seq}\x1b\\`;
  } else if (process.env.TERM?.startsWith('screen')) {
    seq = `\x1bP${seq}\x1b\\`;
  }
  return seq;
}

/**
 * Copy text to the system clipboard using clipboardy platform adapters.
 */
export async function copyViaOsCommand(text: string): Promise<boolean> {
  try {
    await clipboard.write(stripAnsiEscapeCodes(text));
    return true;
  } catch {
    return false;
  }
}

/**
 * Emit OSC 52 sequence directly to /dev/tty (bypasses Ink's stdout renderer)
 */
export function writeOsc52(text: string): boolean {
  try {
    const osc52 = getOsc52Sequence(stripAnsiEscapeCodes(text));
    if (process.platform !== 'win32') {
      const ttyFd = fs.openSync('/dev/tty', 'w');
      try {
        fs.writeSync(ttyFd, osc52);
      } finally {
        fs.closeSync(ttyFd);
      }
      return true;
    }

    if (process.stdout.isTTY) {
      process.stdout.write(osc52);
      return true;
    }
  } catch {
    return false;
  }

  return false;
}

export interface CopyResult {
  /** True only when a native clipboard command reports a successful write. */
  success: boolean;
  osSuccess: boolean;
  /** True when an OSC 52 request was emitted; terminals do not acknowledge acceptance. */
  osc52Sent: boolean;
}

/**
 * Detailed clipboard writer returning diagnostic execution statuses
 */
export async function copyToClipboardDetailed(text: string): Promise<CopyResult> {
  if (!text) {
    return { success: false, osSuccess: false, osc52Sent: false };
  }

  // OSC 52 is best-effort: terminals do not report whether they accepted it.
  const osc52Sent = writeOsc52(text);

  const osSuccess = await copyViaOsCommand(text);

  return {
    success: osSuccess,
    osSuccess,
    osc52Sent
  };
}

/**
 * Generate accurate user feedback for copy attempts
 */
export function getCopyFeedbackMessage(result: CopyResult, baseMessage: string): string {
  if (!result.success) {
    if (result.osc52Sent) {
      return '⚠ Clipboard unavailable — system clipboard access failed and this terminal did not confirm OSC 52';
    }
    return '⚠ Copy failed — check system clipboard access or enable OSC 52 in your terminal';
  }
  return baseMessage;
}

/**
 * Attempts an OSC 52 request and writes to the OS clipboard. The boolean
 * reports only the native clipboard command result, not terminal acceptance.
 */
export async function copyToClipboard(text: string): Promise<boolean> {
  const result = await copyToClipboardDetailed(text);
  return result.success;
}

/**
 * Format a single LogEntry into clean, shareable plain text
 */
export function formatLogEntry(log: LogEntry, serviceName?: string): string {
  const svc = serviceName || log.service || 'unknown';
  const lvl = (log.level || 'info').toUpperCase();
  const time = log.timestamp || new Date().toLocaleTimeString();
  return `[${time}] [${svc}] [${lvl}] ${log.message}`;
}

/**
 * Format a service's full status summary into a shareable report
 */
export function formatServiceErrorSummary(service: Service): string {
  const lines: string[] = [
    `=== DevPulse Service Report: ${service.name} ===`,
    `Status: ${service.status.toUpperCase()}${service.statusText ? ` (${service.statusText})` : ''}`,
    `Command: ${Array.isArray(service.command) ? service.command.join(' && ') : service.command}`,
    `Directory: ${service.path || '.'}`,
    service.port ? `Port: ${service.port}` : null,
    service.pid ? `PID: ${service.pid}` : null,
    service.uptime !== undefined ? `Uptime: ${service.uptime}s` : null,
    service.restarts !== undefined ? `Restarts: ${service.restarts}` : null,
    service.errors !== undefined ? `Error Count: ${service.errors}` : null,
    service.lastError ? `\nLast Error:\n${service.lastError}` : null
  ].filter(Boolean) as string[];

  if (service.errorLogs && service.errorLogs.length > 0) {
    lines.push('\nRecent Error Logs:');
    service.errorLogs.slice(-5).forEach((err) => {
      lines.push(`  [${err.timestamp}] ${err.message}`);
    });
  }

  return lines.join('\n');
}

/**
 * Format all error logs of a service into a formatted code block
 */
export function formatAllErrors(service: Service): string {
  const errors = service.errorLogs || [];
  if (errors.length === 0) {
    if (service.lastError) {
      return `[${service.name}] ${service.lastError}`;
    }
    return `[${service.name}] No recorded errors.`;
  }

  const header = `=== DevPulse Error Log Dump: ${service.name} (${errors.length} error${errors.length === 1 ? '' : 's'}) ===\n`;
  const body = errors
    .map((err, i) => `#${i + 1} [${err.timestamp}] [${(err.level || 'ERROR').toUpperCase()}]:\n${err.message}`)
    .join('\n\n');
  return header + body;
}
