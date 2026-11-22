import assert from 'assert';
import {
  dashboardReducer,
  initialDashboardState
} from '../src/state/dashboardReducer.js';
import { formatLogEntry } from '../src/utils/clipboard.js';
import {
  calculateVisibleLogWindow,
  filterGlobalLogs,
  formatJsonToHighlightedLines,
  getHighlightedSelectionSegments,
  getLogDisplayText,
  getSelectedJsonText
} from '../src/utils/logFormatter.js';
import { LogEntry } from '../src/types/index.js';
import { getAnsiTextSelectionSegments, stripAnsiEscapeCodes, truncateAnsiText } from '../src/utils/ansi.js';

async function runLogSelectionTests() {
  console.log('=== STARTING LOG SELECTION & INDICATOR UNIT TESTS ===');

  let state = { ...initialDashboardState };

  // Test 1: EXTEND_LOG_SELECTION sets anchor and advances head
  console.log('\n[Test 1] Testing EXTEND_LOG_SELECTION (Shift+Down)...');
  assert.strictEqual(state.serviceSelectionAnchor, null);
  assert.strictEqual(state.serviceSelectedLogIndex, 0);

  // Extend down from 0 to 1
  state = dashboardReducer(state, { type: 'EXTEND_LOG_SELECTION', delta: 1, maxIndex: 5, panel: 'service' });
  assert.strictEqual(state.serviceSelectionAnchor, 0, 'Anchor must be set to 0');
  assert.strictEqual(state.serviceSelectedLogIndex, 1, 'Head index must advance to 1');
  assert.strictEqual(state.selectedLogIndex, 1);

  // Extend down from 1 to 3
  state = dashboardReducer(state, { type: 'EXTEND_LOG_SELECTION', delta: 2, maxIndex: 5, panel: 'service' });
  assert.strictEqual(state.serviceSelectionAnchor, 0, 'Anchor must remain 0');
  assert.strictEqual(state.serviceSelectedLogIndex, 3, 'Head index must advance to 3');

  // Selected count = abs(3 - 0) + 1 = 4 lines
  const count1 = Math.abs(state.serviceSelectedLogIndex - state.serviceSelectionAnchor) + 1;
  assert.strictEqual(count1, 4, 'Should represent 4 selected lines');
  console.log('✔ EXTEND_LOG_SELECTION down accurately tracks anchor, head, and line count');

  // Test 2: EXTEND_LOG_SELECTION contracts (Shift+Up)
  console.log('\n[Test 2] Testing EXTEND_LOG_SELECTION contraction (Shift+Up)...');
  state = dashboardReducer(state, { type: 'EXTEND_LOG_SELECTION', delta: -1, maxIndex: 5, panel: 'service' });
  assert.strictEqual(state.serviceSelectionAnchor, 0);
  assert.strictEqual(state.serviceSelectedLogIndex, 2);
  const count2 = Math.abs(state.serviceSelectedLogIndex - state.serviceSelectionAnchor) + 1;
  assert.strictEqual(count2, 3, 'Should contract to 3 selected lines');
  console.log('✔ EXTEND_LOG_SELECTION contraction verified');

  // Test 3: SET_LOG_SELECTION_RANGE (Mouse drag / Shift-click)
  console.log('\n[Test 3] Testing SET_LOG_SELECTION_RANGE...');
  state = dashboardReducer(state, {
    type: 'SET_LOG_SELECTION_RANGE',
    anchorIndex: 1,
    headIndex: 4,
    panel: 'service'
  });
  assert.strictEqual(state.serviceSelectionAnchor, 1);
  assert.strictEqual(state.serviceSelectedLogIndex, 4);
  console.log('✔ SET_LOG_SELECTION_RANGE sets exact anchor and head');

  // Test 4: EXTEND_CHAR_SELECTION (Shift+Right / Shift+Left partial text)
  console.log('\n[Test 4] Testing EXTEND_CHAR_SELECTION...');
  state = { ...initialDashboardState };
  assert.strictEqual(state.serviceCharSelection, null);

  // Extend character selection by 5 characters
  state = dashboardReducer(state, { type: 'EXTEND_CHAR_SELECTION', delta: 5, maxLen: 50, panel: 'service' });
  assert.deepStrictEqual(state.serviceCharSelection, { start: 0, end: 5 });

  // Extend by another 10 characters
  state = dashboardReducer(state, { type: 'EXTEND_CHAR_SELECTION', delta: 10, maxLen: 50, panel: 'service' });
  assert.deepStrictEqual(state.serviceCharSelection, { start: 0, end: 15 });

  // Contract character selection by 4 characters
  state = dashboardReducer(state, { type: 'EXTEND_CHAR_SELECTION', delta: -4, maxLen: 50, panel: 'service' });
  assert.deepStrictEqual(state.serviceCharSelection, { start: 0, end: 11 });

  // Contract beyond start resets to null
  state = dashboardReducer(state, { type: 'EXTEND_CHAR_SELECTION', delta: -20, maxLen: 50, panel: 'service' });
  assert.strictEqual(state.serviceCharSelection, null);
  console.log('✔ EXTEND_CHAR_SELECTION accurately expands, contracts, and resets character bounds');

  // Test 5: CLEAR_LOG_SELECTION
  console.log('\n[Test 5] Testing CLEAR_LOG_SELECTION (Esc / non-Shift navigation)...');
  state = dashboardReducer(state, { type: 'SET_LOG_SELECTION_RANGE', anchorIndex: 2, headIndex: 5, panel: 'service' });
  assert.ok(state.serviceSelectionAnchor !== null);

  state = dashboardReducer(state, { type: 'CLEAR_LOG_SELECTION', panel: 'service' });
  assert.strictEqual(state.serviceSelectionAnchor, null);
  assert.strictEqual(state.serviceCharSelection, null);
  console.log('✔ CLEAR_LOG_SELECTION cleanly resets all selection states');

  // Test 6: Normal SELECT_LOG_ROW and NAVIGATE_LOG_SELECTION clear active selection
  console.log('\n[Test 6] Testing normal navigation clears active selection...');
  state = dashboardReducer(state, { type: 'SET_LOG_SELECTION_RANGE', anchorIndex: 1, headIndex: 3, panel: 'service' });
  assert.strictEqual(state.serviceSelectionAnchor, 1);

  // Plain click/selection on row 0 clears range
  state = dashboardReducer(state, { type: 'SELECT_LOG_ROW', index: 0, panel: 'service' });
  assert.strictEqual(state.serviceSelectionAnchor, null, 'Plain SELECT_LOG_ROW must clear anchor');
  assert.strictEqual(state.serviceSelectedLogIndex, 0);

  // Set range again
  state = dashboardReducer(state, { type: 'SET_LOG_SELECTION_RANGE', anchorIndex: 0, headIndex: 2, panel: 'service' });
  // Plain arrow navigation clears range
  state = dashboardReducer(state, { type: 'NAVIGATE_LOG_SELECTION', delta: 1, maxIndex: 5, panel: 'service' });
  assert.strictEqual(state.serviceSelectionAnchor, null, 'Plain NAVIGATE_LOG_SELECTION must clear anchor');
  console.log('✔ Normal navigation automatically clears previous selection range');

  // Test 7: Context change (service change, tab change) clears selection
  console.log('\n[Test 7] Testing tab and service changes clear selection...');
  state = dashboardReducer(state, { type: 'SET_LOG_SELECTION_RANGE', anchorIndex: 0, headIndex: 2, panel: 'service' });
  state = dashboardReducer(state, { type: 'SET_ACTIVE_TAB', tab: 'errors' });
  assert.strictEqual(state.serviceSelectionAnchor, null);
  assert.strictEqual(state.serviceCharSelection, null);

  state = dashboardReducer(state, { type: 'SET_LOG_SELECTION_RANGE', anchorIndex: 0, headIndex: 2, panel: 'service' });
  state = dashboardReducer(state, { type: 'SELECT_SERVICE', index: 1 });
  assert.strictEqual(state.serviceSelectionAnchor, null);
  assert.strictEqual(state.serviceCharSelection, null);
  console.log('✔ Selection cleanly resets on context switches');

  // Test 8: Multi-line clipboard string formatting
  console.log('\n[Test 8] Testing multi-line formatting across selection range...');
  const sampleLogs: LogEntry[] = [
    { id: '1', timestamp: '10:00:01', service: 'auth', level: 'info', message: 'User logged in' },
    { id: '2', timestamp: '10:00:02', service: 'auth', level: 'warn', message: 'Rate limit threshold near' },
    { id: '3', timestamp: '10:00:03', service: 'auth', level: 'error', message: 'Database connection dropped' },
  ];

  const anchor = 0;
  const head = 2;
  const selectedEntries = sampleLogs.slice(Math.min(anchor, head), Math.max(anchor, head) + 1);
  assert.strictEqual(selectedEntries.length, 3);

  const formattedLines = selectedEntries.map(l => formatLogEntry(l, 'auth')).join('\n');
  assert.ok(formattedLines.includes('User logged in'));
  assert.ok(formattedLines.includes('Rate limit threshold near'));
  assert.ok(formattedLines.includes('Database connection dropped'));
  assert.strictEqual(formattedLines.split('\n').length, 3);
  console.log('✔ Multi-line log formatting verified');

  // Test 9: Partial text snippet extraction
  console.log('\n[Test 9] Testing partial text snippet slicing...');
  const fullMsg = 'POST /api/v1/auth/session 200 (14.2ms)';
  const charRange = { start: 5, end: 25 };
  const partialSnippet = fullMsg.slice(charRange.start, charRange.end);
  assert.strictEqual(partialSnippet, '/api/v1/auth/session');
  assert.strictEqual(partialSnippet.length, 20);
  console.log('✔ Partial character slicing verified');

  // Test 10: SET_CHAR_SELECTION_RANGE (Mouse horizontal drag text selection)
  console.log('\n[Test 10] Testing SET_CHAR_SELECTION_RANGE for horizontal mouse drag...');
  state = dashboardReducer(state, { type: 'SET_CHAR_SELECTION_RANGE', start: 5, end: 25, panel: 'service' });
  assert.deepStrictEqual(state.serviceCharSelection, { start: 5, end: 25 });

  // Inverted drag (dragged from right to left)
  state = dashboardReducer(state, { type: 'SET_CHAR_SELECTION_RANGE', start: 30, end: 10, panel: 'service' });
  assert.deepStrictEqual(state.serviceCharSelection, { start: 10, end: 30 });

  // Zero-length drag clears selection
  state = dashboardReducer(state, { type: 'SET_CHAR_SELECTION_RANGE', start: 15, end: 15, panel: 'service' });
  assert.strictEqual(state.serviceCharSelection, null);
  console.log('✔ SET_CHAR_SELECTION_RANGE handles mouse character dragging accurately');

  // Test 11: Stable log identity survives line-budget window changes
  const jsonLog: LogEntry = {
    id: 'json-target',
    timestamp: '10:00:04',
    service: 'auth',
    level: 'info',
    message: JSON.stringify({ msg: 'server.started', level: 'info', port: 3000 })
  };
  const windowLogs: LogEntry[] = [
    ...Array.from({ length: 5 }, (_, i) => ({
      id: `plain-${i}`,
      timestamp: '10:00:00',
      service: i % 2 === 0 ? 'auth' : 'worker',
      level: 'info' as const,
      message: `message-${i}`
    })),
    jsonLog,
    ...Array.from({ length: 5 }, (_, i) => ({
      id: `tail-${i}`,
      timestamp: '10:00:05',
      service: 'auth',
      level: 'info' as const,
      message: `tail-${i}`
    }))
  ];
  assert.strictEqual(filterGlobalLogs(windowLogs, 'started', 'All Services').length, 1);
  assert.strictEqual(filterGlobalLogs(windowLogs, '', 'AUTH').length, 9);
  const displayedMessage = getLogDisplayText(jsonLog, 80, false);
  assert.strictEqual(displayedMessage, 'server.started');
  assert.strictEqual(displayedMessage.slice(0, 6), 'server');
  console.log('\n[Test 11] Stable log identity survives line-budget window changes...');

  state = dashboardReducer(initialDashboardState, {
    type: 'SELECT_LOG_ROW',
    index: 0,
    logId: jsonLog.id,
    panel: 'global'
  });
  state = dashboardReducer(state, { type: 'TOGGLE_LOG_EXPANSION', logId: jsonLog.id, panel: 'global' });
  const expandedWindow = calculateVisibleLogWindow({
    logs: windowLogs,
    availableLines: 5,
    scrollOffset: 0,
    expandedLogIds: state.globalExpandedLogIds,
    anchorLogId: jsonLog.id
  });
  assert.ok(expandedWindow.visibleLogs.some(log => log.id === state.globalSelectedLogId));

  state = dashboardReducer(state, {
    type: 'SET_LOG_SELECTION_RANGE',
    anchorIndex: 0,
    headIndex: 1,
    anchorLogId: 'plain-0',
    headLogId: jsonLog.id,
    panel: 'global'
  });
  assert.strictEqual(state.globalSelectionAnchorLogId, 'plain-0');
  assert.strictEqual(state.globalSelectedLogId, jsonLog.id);
  console.log('✔ Filtered windows, displayed JSON text, and stable selected log identity verified');

  // Test 12: JSON text selection preserves partial lines, indentation, and direction
  console.log('\n[Test 12] Testing partial multi-line JSON text selection...');
  const jsonLines = formatJsonToHighlightedLines({ name: 'pawan', count: 666 });
  const jsonLineText = jsonLines.map(line => line.tokens.map(token => token.text).join(''));
  const jsonTextSelection = {
    logId: 'json-selection',
    anchorLine: 1,
    anchorChar: 2,
    headLine: 2,
    headChar: 5
  };
  assert.strictEqual(
    getSelectedJsonText(jsonLines, jsonTextSelection),
    `${jsonLineText[1]!.slice(2)}\n${jsonLineText[2]!.slice(0, 6)}`
  );
  assert.strictEqual(
    getSelectedJsonText(jsonLines, { ...jsonTextSelection, anchorLine: 2, anchorChar: 5, headLine: 1, headChar: 2 }),
    `${jsonLineText[1]!.slice(2)}\n${jsonLineText[2]!.slice(0, 6)}`,
    'Reverse drags should copy the same text'
  );
  assert.strictEqual(
    getSelectedJsonText(jsonLines, { ...jsonTextSelection, headLine: jsonLines.length }),
    null,
    'Stale ranges outside the JSON payload should not copy text'
  );
  const highlightedSelection = getHighlightedSelectionSegments(jsonLines[1]!, 1, jsonTextSelection);
  assert.ok(highlightedSelection.some(segment => segment.selected && segment.text === '"name"'));
  console.log('✔ JSON drag ranges copy exact text and retain syntax highlighting');

  state = dashboardReducer(initialDashboardState, {
    type: 'SET_JSON_TEXT_SELECTION',
    selection: jsonTextSelection,
    panel: 'service'
  });
  assert.deepStrictEqual(state.serviceJsonTextSelection, jsonTextSelection);
  state = dashboardReducer(state, {
    type: 'SCROLL_JSON_LINES',
    delta: 1,
    maxScroll: 10,
    logId: 'json-selection',
    panel: 'service'
  });
  assert.strictEqual(state.serviceJsonTextSelection, null, 'Scrolling JSON should clear its previous visible selection');
  state = dashboardReducer(state, {
    type: 'SET_JSON_TEXT_SELECTION',
    selection: jsonTextSelection,
    panel: 'service'
  });
  state = dashboardReducer(state, {
    type: 'SELECT_LOG_ROW',
    index: 0,
    logId: 'another-log',
    panel: 'service'
  });
  assert.strictEqual(state.serviceJsonTextSelection, null, 'Changing the selected log should clear JSON text selection');

  // Test 13: ANSI color codes do not affect visible text selection offsets
  console.log('\n[Test 13] Testing ANSI-aware text selection and truncation...');
  const coloredText = 'this is \x1b[33mcolored\x1b[39m text';
  assert.strictEqual(stripAnsiEscapeCodes(coloredText), 'this is colored text');
  const ansiSegments = getAnsiTextSelectionSegments(coloredText, 8, 15);
  assert.ok(ansiSegments.some(segment => segment.text === 'colored' && segment.color === 'yellow' && segment.selected));
  assert.strictEqual(stripAnsiEscapeCodes(truncateAnsiText('A \x1b[33mcolored\x1b[39m tail', 10)), 'A colored…');
  console.log('✔ ANSI codes preserve visible selection offsets, color styling, and safe truncation');

  console.log('\n=== ALL LOG SELECTION & INDICATOR TESTS PASSED (13/13) ===');
}

runLogSelectionTests().catch((err) => {
  console.error('Test failed:', err);
  process.exit(1);
});
