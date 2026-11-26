const ANSI_ESCAPE_SEQUENCE = /\u001B(?:\[[0-?]*[ -/]*[@-~]|\][^\u0007]*(?:\u0007|\u001B\\)|[ -/]*[@-~])|\u009B[0-?]*[ -/]*[@-~]|\u009D[^\u0007]*(?:\u0007|\u009C)/g;

const ANSI_COLORS = ['black', 'red', 'green', 'yellow', 'blue', 'magenta', 'cyan', 'white'];
const ANSI_BRIGHT_COLORS = ['#808080', '#ff5555', '#50fa7b', '#f1fa8c', '#bd93f9', '#ff79c6', '#8be9fd', '#ffffff'];

export interface AnsiTextStyle {
  color?: string;
  backgroundColor?: string;
  bold?: boolean;
  dim?: boolean;
  italic?: boolean;
  underline?: boolean;
  strikethrough?: boolean;
}

export interface AnsiTextSegment extends AnsiTextStyle {
  text: string;
  selected: boolean;
}

function color256(index: number): string {
  if (index < 8) return ANSI_COLORS[index] || 'white';
  if (index < 16) return ANSI_BRIGHT_COLORS[index - 8] || '#ffffff';
  if (index < 232) {
    const value = index - 16;
    const channels = [Math.floor(value / 36), Math.floor((value % 36) / 6), value % 6]
      .map(channel => channel === 0 ? 0 : 55 + channel * 40);
    return `#${channels.map(channel => channel.toString(16).padStart(2, '0')).join('')}`;
  }
  const gray = 8 + (index - 232) * 10;
  return `#${gray.toString(16).padStart(2, '0').repeat(3)}`;
}

function applySgr(style: AnsiTextStyle, sequence: string): void {
  const parameters = sequence
    .slice(sequence.startsWith('\u001B') ? 2 : 1, -1)
    .split(';')
    .map(value => value === '' ? 0 : Number(value));

  for (let index = 0; index < parameters.length; index++) {
    const code = parameters[index] ?? 0;
    if (code === 0) {
      for (const key of Object.keys(style) as Array<keyof AnsiTextStyle>) delete style[key];
    } else if (code === 1) style.bold = true;
    else if (code === 2) style.dim = true;
    else if (code === 3) style.italic = true;
    else if (code === 4) style.underline = true;
    else if (code === 9) style.strikethrough = true;
    else if (code === 22) {
      delete style.bold;
      delete style.dim;
    } else if (code === 23) delete style.italic;
    else if (code === 24) delete style.underline;
    else if (code === 29) delete style.strikethrough;
    else if (code === 39) delete style.color;
    else if (code === 49) delete style.backgroundColor;
    else if (code >= 30 && code <= 37) style.color = ANSI_COLORS[code - 30];
    else if (code >= 90 && code <= 97) style.color = ANSI_BRIGHT_COLORS[code - 90];
    else if (code >= 40 && code <= 47) style.backgroundColor = ANSI_COLORS[code - 40];
    else if (code >= 100 && code <= 107) style.backgroundColor = ANSI_BRIGHT_COLORS[code - 100];
    else if ((code === 38 || code === 48) && parameters[index + 1] === 5 && parameters[index + 2] !== undefined) {
      const color = color256(parameters[index + 2]!);
      if (code === 38) style.color = color;
      else style.backgroundColor = color;
      index += 2;
    } else if ((code === 38 || code === 48) && parameters[index + 1] === 2 && parameters[index + 4] !== undefined) {
      const color = `#${parameters.slice(index + 2, index + 5).map(channel =>
        Math.max(0, Math.min(255, channel)).toString(16).padStart(2, '0')
      ).join('')}`;
      if (code === 38) style.color = color;
      else style.backgroundColor = color;
      index += 4;
    }
  }
}

export function stripAnsiEscapeCodes(text: string): string {
  return text.replace(ANSI_ESCAPE_SEQUENCE, '');
}

const SGR_OR_ESCAPE = /\u001B\[[0-9;]*m|\u001B(?:\[[0-?]*[ -/]*[@-~]|\][^\u0007]*(?:\u0007|\u001B\\)|P[^\u001B]*(?:\u001B\\|\u0007)|[ -/]*[@-~])|\u009B[0-?]*[ -/]*[@-~]|\u009D[^\u0007]*(?:\u0007|\u009C)/g;
const UNSAFE_C0_CONTROL = /[\u0000-\u0008\u000B-\u001A\u001C-\u001F\u007F]/g;

/**
 * Strip dangerous non-SGR terminal control sequences (OSC title/clipboard/hyperlinks,
 * CSI cursor movement, DCS, and raw C0 control characters) while preserving SGR colors.
 */
export function sanitizeTerminalOutput(text: string): string {
  if (!text) return '';
  const withoutUnsafeEscapes = text.replace(SGR_OR_ESCAPE, (seq) => {
    return /^\u001B\[[0-9;]*m$/.test(seq) ? seq : '';
  });
  return withoutUnsafeEscapes.replace(UNSAFE_C0_CONTROL, '');
}

export function truncateAnsiText(text: string, maxLength: number): string {
  const visibleText = stripAnsiEscapeCodes(text);
  if (visibleText.length <= maxLength) return text;
  if (maxLength <= 0) return '';

  const targetLength = Math.max(0, maxLength - 1);
  let visibleLength = 0;
  let rawIndex = 0;
  while (rawIndex < text.length && visibleLength < targetLength) {
    ANSI_ESCAPE_SEQUENCE.lastIndex = rawIndex;
    const escape = ANSI_ESCAPE_SEQUENCE.exec(text);
    if (escape && escape.index === rawIndex) {
      rawIndex = ANSI_ESCAPE_SEQUENCE.lastIndex;
    } else {
      rawIndex++;
      visibleLength++;
    }
  }

  return `${text.slice(0, rawIndex)}\u001B[0m…`;
}

export function getAnsiTextSelectionSegments(text: string, start: number, end: number): AnsiTextSegment[] {
  const segments: AnsiTextSegment[] = [];
  const style: AnsiTextStyle = {};
  const sequenceMatcher = new RegExp(ANSI_ESCAPE_SEQUENCE.source, 'g');
  let rawIndex = 0;
  let visibleIndex = 0;
  let match: RegExpExecArray | null;

  const addVisibleText = (value: string) => {
    if (!value) return;
    const segmentStart = visibleIndex;
    const segmentEnd = visibleIndex + value.length;
    const selectedStart = Math.max(segmentStart, start);
    const selectedEnd = Math.min(segmentEnd, end);
    const localStart = selectedStart - segmentStart;
    const localEnd = selectedEnd - segmentStart;
    const add = (segmentText: string, selected: boolean) => {
      if (segmentText) segments.push({ ...style, text: segmentText, selected });
    };

    add(value.slice(0, Math.max(0, localStart)), false);
    add(value.slice(Math.max(0, localStart), Math.max(Math.max(0, localStart), localEnd)), selectedEnd > selectedStart);
    add(value.slice(Math.max(Math.max(0, localStart), localEnd)), false);
    visibleIndex = segmentEnd;
  };

  while ((match = sequenceMatcher.exec(text)) !== null) {
    addVisibleText(text.slice(rawIndex, match.index));
    const sequence = match[0];
    if (sequence.endsWith('m') && (sequence.startsWith('\u001B[') || sequence.startsWith('\u009B'))) {
      applySgr(style, sequence);
    }
    rawIndex = sequenceMatcher.lastIndex;
  }
  addVisibleText(text.slice(rawIndex));

  return segments;
}
