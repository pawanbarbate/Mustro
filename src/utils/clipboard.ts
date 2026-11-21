import { spawn } from 'child_process';
import fs from 'fs';
import { LogEntry, Service } from '../types/index.js';

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
 * Helper to execute a command with stdin text
 */
function trySpawnCopy(cmd: string, args: string[], text: string): Promise<boolean> {
  return new Promise((resolve) => {
    try {
      const child = spawn(cmd, args, { stdio: ['pipe', 'ignore', 'ignore'] });
      let resolved = false;

      child.on('error', () => {
        if (!resolved) {
          resolved = true;
          resolve(false);
        }
      });

      child.on('close', (code) => {
        if (!resolved) {
          resolved = true;
          resolve(code === 0);
        }
      });

      child.stdin?.write(text);
      child.stdin?.end();
    } catch {
      resolve(false);
    }
  });
}

/**
 * Copy text to system clipboard using native OS commands
 */
export async function copyViaOsCommand(text: string): Promise<boolean> {
  const platform = process.platform;

  if (platform === 'darwin') {
    return trySpawnCopy('pbcopy', [], text);
  }

  if (platform === 'win32') {
    return trySpawnCopy('clip.exe', [], text);
  }

  // Linux: Try wl-copy (Wayland), xclip (X11), xsel, or clip.exe (WSL)
  const isWayland = !!process.env.WAYLAND_DISPLAY;
  const attempts: [string, string[]][] = isWayland
    ? [
        ['wl-copy', []],
        ['xclip', ['-selection', 'clipboard']],
        ['xsel', ['--clipboard', '--input']],
        ['clip.exe', []]
      ]
    : [
        ['xclip', ['-selection', 'clipboard']],
        ['xsel', ['--clipboard', '--input']],
        ['wl-copy', []],
        ['clip.exe', []]
      ];

  for (const [cmd, args] of attempts) {
    const success = await trySpawnCopy(cmd, args, text);
    if (success) {
      return true;
    }
  }

  return false;
}

/**
 * Emit OSC 52 sequence directly to /dev/tty (bypasses Ink's stdout renderer)
 */
export function writeOsc52(text: string): boolean {
  try {
    const osc52 = getOsc52Sequence(text);
    if (process.platform !== 'win32') {
      try {
        const ttyFd = fs.openSync('/dev/tty', 'w');
        fs.writeSync(ttyFd, osc52);
        fs.closeSync(ttyFd);
        return true;
      } catch {
        process.stdout.write(osc52);
        return true;
      }
    } else {
      process.stdout.write(osc52);
      return true;
    }
  } catch {
    return false;
  }
}

export interface CopyResult {
  success: boolean;
  osSuccess: boolean;
  osc52Success: boolean;
}

/**
 * Detailed clipboard writer returning diagnostic execution statuses
 */
export async function copyToClipboardDetailed(text: string): Promise<CopyResult> {
  if (!text) {
    return { success: false, osSuccess: false, osc52Success: false };
  }

  // 1. Emit OSC 52 sequence directly to /dev/tty
  const osc52Success = writeOsc52(text);

  // 2. Concurrently execute OS clipboard command
  const osSuccess = await copyViaOsCommand(text);

  return {
    success: osSuccess || osc52Success,
    osSuccess,
    osc52Success
  };
}

/**
 * Generate accurate user feedback for copy attempts
 */
export function getCopyFeedbackMessage(result: CopyResult, baseMessage: string): string {
  if (!result.success) {
    return '⚠ Copy failed — install xclip/wl-clipboard or enable OSC 52 in terminal';
  }
  if (result.osSuccess) {
    return baseMessage;
  }
  if (process.platform === 'linux') {
    return `${baseMessage} (Tip: install xclip if desktop paste fails)`;
  }
  return baseMessage;
}

/**
 * Universal dual-engine clipboard writer:
 * 1. Writes OSC 52 escape code to /dev/tty (works across SSH, tmux, modern terminals)
 * 2. Asynchronously writes to OS native clipboard (pbcopy, xclip, clip.exe)
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

