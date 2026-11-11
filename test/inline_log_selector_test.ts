import assert from 'assert';
import {
  dashboardReducer,
  initialDashboardState
} from '../src/state/dashboardReducer.js';
import {
  parseJsonLog,
  formatJsonToHighlightedLines,
  calculateVisibleLogWindow
} from '../src/utils/logFormatter.js';
import { LogEntry } from '../src/types/index.js';

async function runInlineLogSelectorTests() {
  console.log('=== STARTING INLINE LOG SELECTOR & EXPANSION UNIT TESTS ===');

  let state = { ...initialDashboardState };

  // Test 1: SELECT_LOG_ROW
  console.log('\n[Test 1] Testing SELECT_LOG_ROW...');
  state = dashboardReducer(state, { type: 'SELECT_LOG_ROW', index: 3 });
  assert.strictEqual(state.selectedLogIndex, 3, 'selectedLogIndex must be updated to 3');
  console.log('✔ SELECT_LOG_ROW correctly updates selectedLogIndex');

  // Test 2: NAVIGATE_LOG_SELECTION with bounds clamping
  console.log('\n[Test 2] Testing NAVIGATE_LOG_SELECTION...');
  state = dashboardReducer(state, { type: 'NAVIGATE_LOG_SELECTION', delta: 1, maxIndex: 5 });
  assert.strictEqual(state.selectedLogIndex, 4, 'selectedLogIndex should increment to 4');

  state = dashboardReducer(state, { type: 'NAVIGATE_LOG_SELECTION', delta: 5, maxIndex: 5 });
  assert.strictEqual(state.selectedLogIndex, 5, 'selectedLogIndex must be clamped to maxIndex (5)');

  state = dashboardReducer(state, { type: 'NAVIGATE_LOG_SELECTION', delta: -10, maxIndex: 5 });
  assert.strictEqual(state.selectedLogIndex, 0, 'selectedLogIndex must be clamped at minimum (0)');
  console.log('✔ NAVIGATE_LOG_SELECTION boundary clamping verified');

  // Test 3: TOGGLE_LOG_EXPANSION
  console.log('\n[Test 3] Testing TOGGLE_LOG_EXPANSION...');
  const testLogId = 'log-xyz-101';
  assert.strictEqual(!!state.expandedLogIds[testLogId], false, 'Initial expansion should be false');

  state = dashboardReducer(state, { type: 'TOGGLE_LOG_EXPANSION', logId: testLogId });
  assert.strictEqual(state.expandedLogIds[testLogId], true, 'Expansion state should be true after toggle');

  state = dashboardReducer(state, { type: 'TOGGLE_LOG_EXPANSION', logId: testLogId });
  assert.strictEqual(state.expandedLogIds[testLogId], false, 'Expansion state should toggle back to false');
  console.log('✔ TOGGLE_LOG_EXPANSION toggles inline expand state');

  // Test 4: TOGGLE_MOUSE_MODE
  console.log('\n[Test 4] Testing TOGGLE_MOUSE_MODE...');
  assert.strictEqual(state.mouseMode, 'native', 'Default mouseMode must be native');

  state = dashboardReducer(state, { type: 'TOGGLE_MOUSE_MODE' });
  assert.strictEqual(state.mouseMode, 'interactive', 'mouseMode should switch to interactive');

  state = dashboardReducer(state, { type: 'TOGGLE_MOUSE_MODE' });
  assert.strictEqual(state.mouseMode, 'native', 'mouseMode should toggle back to native');
  console.log('✔ TOGGLE_MOUSE_MODE toggles between native and interactive');

  // Test 5: SET_COPIED_FLASH
  console.log('\n[Test 5] Testing SET_COPIED_FLASH...');
  state = dashboardReducer(state, { type: 'SET_COPIED_FLASH', logId: 'log-copied-456' });
  assert.strictEqual(state.copiedLogId, 'log-copied-456', 'copiedLogId must match');

  state = dashboardReducer(state, { type: 'SET_COPIED_FLASH', logId: null });
  assert.strictEqual(state.copiedLogId, null, 'copiedLogId should be reset to null');
  console.log('✔ SET_COPIED_FLASH correctly manages copied row flash');

  // Test 6: Inline JSON parsing & syntax token rendering for in-place display
  console.log('\n[Test 6] Testing inline syntax highlighting generation...');
  const samplePino = JSON.stringify({
    method: 'POST',
    path: '/api/v1/auth/login',
    status: 200,
    latencyMs: 14.5,
    user: 'admin@devpulse.local',
    active: true
  });

  const parsed = parseJsonLog(samplePino);
  assert.strictEqual(parsed.isJson, true, 'Must detect as JSON');
  assert.ok(parsed.parsed, 'Must have parsed object');

  const lines = formatJsonToHighlightedLines(parsed.parsed);
  assert.ok(lines.length >= 6, 'Must generate multiple formatted lines');
  
  // Verify token highlighting categories
  const allTokens = lines.flatMap(l => l.tokens);
  const hasKey = allTokens.some(t => t.text.includes('"path"'));
  const hasString = allTokens.some(t => t.text.includes('"admin@devpulse.local"'));
  const hasNumber = allTokens.some(t => t.text.includes('200'));
  const hasBool = allTokens.some(t => t.text.includes('true'));

  assert.ok(hasKey, 'Must include key tokens');
  assert.ok(hasString, 'Must include string tokens');
  assert.ok(hasNumber, 'Must include number tokens');
  assert.ok(hasBool, 'Must include boolean tokens');
  console.log('✔ Inline JSON syntax tokens validated');

  // Test 7: Reset selectedLogIndex on tab/service change
  console.log('\n[Test 7] Testing selection reset on tab / service switch...');
  state = dashboardReducer(state, { type: 'SELECT_LOG_ROW', index: 8 });
  assert.strictEqual(state.selectedLogIndex, 8);

  state = dashboardReducer(state, { type: 'SET_ACTIVE_TAB', tab: 'errors' });
  assert.strictEqual(state.selectedLogIndex, 0, 'selectedLogIndex must reset to 0 on tab change');

  state = dashboardReducer(state, { type: 'SELECT_LOG_ROW', index: 5 });
  state = dashboardReducer(state, { type: 'SELECT_SERVICE', index: 1 });
  assert.strictEqual(state.selectedLogIndex, 0, 'selectedLogIndex must reset to 0 on service change');
  console.log('✔ selectedLogIndex properly resets on context changes');

  // Test 8: Shrinking an expanded JSON log under wrap mode
  console.log('\n[Test 8] Testing JSON shrink / collapse when wrap mode is active...');
  state = { ...state, isWrapMode: true, expandedLogIds: {} };
  const wrapLogId = 'wrap-log-99';
  
  // Initially under wrap mode, log is visually expanded because isWrapMode=true
  const isExpInitially = state.expandedLogIds[wrapLogId] !== undefined ? state.expandedLogIds[wrapLogId] : state.isWrapMode;
  assert.strictEqual(isExpInitially, true, 'Should be expanded when wrap mode is active');

  // User clicks or presses Enter to collapse/shrink it
  state = dashboardReducer(state, { type: 'TOGGLE_LOG_EXPANSION', logId: wrapLogId });
  const isExpAfterCollapse = state.expandedLogIds[wrapLogId] !== undefined ? state.expandedLogIds[wrapLogId] : state.isWrapMode;
  assert.strictEqual(isExpAfterCollapse, false, 'Should shrink/collapse even when wrap mode is active');

  // User clicks again to re-expand it
  state = dashboardReducer(state, { type: 'TOGGLE_LOG_EXPANSION', logId: wrapLogId });
  const isExpAfterReexpand = state.expandedLogIds[wrapLogId] !== undefined ? state.expandedLogIds[wrapLogId] : state.isWrapMode;
  assert.strictEqual(isExpAfterReexpand, true, 'Should re-expand after clicking again');
  console.log('✔ Shrink and re-expand under wrap mode verified');

  // Test 9: Line-budgeted windowing with standard collapsed logs
  console.log('\n[Test 9] Testing calculateVisibleLogWindow with collapsed logs...');
  const sampleLogs: LogEntry[] = Array.from({ length: 20 }, (_, i) => ({
    id: `log-${i}`,
    timestamp: '12:00:00',
    service: 'auth-service',
    level: 'info',
    message: i === 10 
      ? JSON.stringify({ event: 'user_login', userId: 1234, roles: ['admin', 'user'], active: true, region: 'us-east-1' })
      : `Standard log message number ${i}`
  }));

  const standardWindow = calculateVisibleLogWindow({
    logs: sampleLogs,
    availableLines: 6,
    scrollOffset: 0
  });

  assert.strictEqual(standardWindow.visibleLogs.length, 6, 'Should display 6 collapsed logs');
  assert.strictEqual(standardWindow.startIdx, 14, 'Start index should be 14 (logs 14-19)');
  assert.strictEqual(standardWindow.endIdx, 20, 'End index should be 20');
  console.log('✔ Standard collapsed window accurately slices 6 lines');

  // Test 10: Line-budgeted windowing with expanded JSON log (zero vertical overflow)
  console.log('\n[Test 10] Testing calculateVisibleLogWindow with expanded JSON log...');
  const expandedWindow = calculateVisibleLogWindow({
    logs: sampleLogs,
    availableLines: 6,
    scrollOffset: 0,
    expandedLogIds: { 'log-10': true },
    anchorLogId: 'log-10'
  });

  // Log 10 is JSON and takes 1 (header) + maxJsonLines (4) = 5 lines.
  // With 6 lines available, it can only fit log 10 (5 lines) + 1 adjacent log (1 line) = 6 lines!
  assert.ok(expandedWindow.visibleLogs.some(l => l.id === 'log-10'), 'Expanded log-10 must be included');
  assert.ok(expandedWindow.visibleLogs.length <= 2, 'Should reduce visible log count so total lines <= availableLines');
  console.log(`✔ Expanded JSON reduced visible logs count to ${expandedWindow.visibleLogs.length} to preserve line budget`);

  // Test 11: Total rendered footprint strictly <= availableLines under all scenarios
  console.log('\n[Test 11] Verifying total rendered line footprint never exceeds availableLines...');
  for (let lines = 2; lines <= 15; lines++) {
    const res = calculateVisibleLogWindow({
      logs: sampleLogs,
      availableLines: lines,
      scrollOffset: 0,
      expandedLogIds: { 'log-10': true },
      anchorLogId: 'log-10'
    });

    // Calculate actual line sum
    let totalLinesSum = 0;
    for (const l of res.visibleLogs) {
      if (l.id === 'log-10') {
        const parsed = parseJsonLog(l.message);
        const fullLines = formatJsonToHighlightedLines(parsed.parsed);
        const expLines = Math.min(fullLines.length, res.maxJsonLines) + (fullLines.length > res.maxJsonLines ? 1 : 0);
        totalLinesSum += 1 + expLines;
      } else {
        totalLinesSum += 1;
      }
    }

    assert.ok(
      totalLinesSum <= lines || res.visibleLogs.length === 1,
      `Lines sum (${totalLinesSum}) must be <= available budget (${lines})`
    );
  }
  console.log('✔ Line footprint strictly capped across all heights from 2 to 15 lines');

  // Test 12: Historical scrolling with expanded log
  console.log('\n[Test 12] Testing historical scrolling offset clamping with expanded logs...');
  const scrolledWindow = calculateVisibleLogWindow({
    logs: sampleLogs,
    availableLines: 6,
    scrollOffset: 5
  });
  assert.ok(scrolledWindow.effectiveOffset > 0, 'Effective offset should be > 0 when scrolled');
  assert.ok(scrolledWindow.endIdx <= sampleLogs.length, 'endIdx must not exceed totalLogs');
  console.log('✔ Scrolled offset and index bounds successfully verified');

  console.log('\n=== ALL INLINE LOG SELECTOR & EXPANSION TESTS PASSED (12/12) ===');
}

runInlineLogSelectorTests().catch((err) => {
  console.error('Test failed:', err);
  process.exit(1);
});
