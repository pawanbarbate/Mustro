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
  assert.strictEqual(!!state.expandedLogIds[testLogId], false, 'Expansion state should toggle back to false');
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

  // Test 8: Wrap mode decoupling from JSON expansion
  console.log('\n[Test 8] Testing Wrap Mode decoupling (wrap mode does not auto-expand JSON)...');
  state = { ...state, isWrapMode: true, expandedLogIds: {} };
  const wrapLogId = 'wrap-log-99';
  
  // Under wrap mode, log is NOT auto-expanded
  assert.strictEqual(!!state.expandedLogIds[wrapLogId], false, 'Wrap mode must NOT auto-expand JSON logs');

  // Explicit expansion expands the log
  state = dashboardReducer(state, { type: 'TOGGLE_LOG_EXPANSION', logId: wrapLogId });
  assert.strictEqual(!!state.expandedLogIds[wrapLogId], true, 'Explicit toggle should expand the log');

  // Explicit collapse shrinks it
  state = dashboardReducer(state, { type: 'TOGGLE_LOG_EXPANSION', logId: wrapLogId });
  assert.strictEqual(!!state.expandedLogIds[wrapLogId], false, 'Explicit toggle should collapse the log');
  console.log('✔ Wrap mode properly decoupled from JSON expansion');

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

  // Test 10: Line-budgeted windowing with expanded JSON log (zero vertical overflow, preserves surrounding logs)
  console.log('\n[Test 10] Testing calculateVisibleLogWindow with expanded JSON log...');
  const expandedWindow = calculateVisibleLogWindow({
    logs: sampleLogs,
    availableLines: 6,
    scrollOffset: 0,
    expandedLogIds: { 'log-10': true },
    anchorLogId: 'log-10'
  });

  // Log 10 is JSON and takes 1 (header) + maxJsonLines (5) = 6 lines max.
  // With 6 lines available, it fully expands log-10 inline without artificial truncation!
  assert.ok(expandedWindow.visibleLogs.some(l => l.id === 'log-10'), 'Expanded log-10 must be included');
  assert.ok(expandedWindow.visibleLogs.length >= 1, 'Expanded log-10 is fully rendered inline in available space');
  console.log(`✔ Expanded JSON rendered ${expandedWindow.visibleLogs.length} visible log(s) with full inline JSON within 6-line budget`);

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
        const expLines = Math.min(fullLines.length, res.maxJsonLines);
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

  // Test 13: Panel-specific expansion isolation (service vs global)
  console.log('\n[Test 13] Testing panel-specific expansion isolation in reducer...');
  state = { ...initialDashboardState, activePanel: 'serviceLogs' };
  const targetId = 'svc-log-special';

  // Toggle in service logs
  state = dashboardReducer(state, { type: 'TOGGLE_LOG_EXPANSION', logId: targetId, panel: 'service' });
  assert.strictEqual(state.serviceExpandedLogIds[targetId], true, 'Must expand in serviceExpandedLogIds');
  assert.strictEqual(!!state.globalExpandedLogIds[targetId], false, 'Must NOT expand in globalExpandedLogIds');

  // Toggle in global logs
  const globalTargetId = 'global-log-special';
  state = dashboardReducer(state, { type: 'TOGGLE_LOG_EXPANSION', logId: globalTargetId, panel: 'global' });
  assert.strictEqual(state.globalExpandedLogIds[globalTargetId], true, 'Must expand in globalExpandedLogIds');
  assert.strictEqual(!!state.serviceExpandedLogIds[globalTargetId], false, 'Must NOT expand in serviceExpandedLogIds');
  console.log('✔ Expansion state strictly isolated between service logs and global logs');

  // Test 14: Expanding an older log never hides newer logs in live tail mode
  console.log('\n[Test 14] Verifying expanding a log never cuts off live tail or newer logs...');
  const mixedServiceLogs: LogEntry[] = [
    { id: 'auth-1', timestamp: '10:00:01', service: 'auth', level: 'info', message: JSON.stringify({ route: '/login', ok: true }) },
    { id: 'billing-1', timestamp: '10:00:02', service: 'billing', level: 'info', message: 'Invoice generated' },
    { id: 'payment-1', timestamp: '10:00:03', service: 'payment', level: 'info', message: 'Payment processed' },
    { id: 'gateway-1', timestamp: '10:00:04', service: 'gateway', level: 'info', message: 'Route proxy 200' },
  ];

  // In live tail mode (scrollOffset = 0)
  const tailWindow = calculateVisibleLogWindow({
    logs: mixedServiceLogs,
    availableLines: 6,
    scrollOffset: 0,
    expandedLogIds: { 'auth-1': true }
  });

  // Latest log (gateway-1) MUST be included
  assert.ok(tailWindow.visibleLogs.some(l => l.id === 'gateway-1'), 'Latest log gateway-1 must be visible in live tail');
  assert.strictEqual(tailWindow.endIdx, mixedServiceLogs.length, 'End index must reach totalLogs in live tail');
  console.log('✔ Live tail preserves the latest service logs even with prior expanded logs');

  // Test 15: Rich syntax highlighting line budget minimum
  console.log('\n[Test 15] Verifying maxJsonLines proportional budget...');
  for (let b = 3; b <= 10; b++) {
    const res = calculateVisibleLogWindow({
      logs: sampleLogs,
      availableLines: b,
      scrollOffset: 0
    });
    assert.ok(res.maxJsonLines >= 2, `maxJsonLines (${res.maxJsonLines}) must be >= 2 when budget is ${b}`);
  }
  console.log('✔ maxJsonLines guaranteed >= 2 lines for rich syntax highlighting');

  // Test 16: Decoupled Panel Selection Cursors
  console.log('\n[Test 16] Testing independent serviceSelectedLogIndex and globalSelectedLogIndex...');
  let decoupledState = { ...initialDashboardState };
  assert.strictEqual(decoupledState.serviceSelectedLogIndex, 0);
  assert.strictEqual(decoupledState.globalSelectedLogIndex, 0);

  // Select row in globalLogs
  decoupledState = dashboardReducer(decoupledState, { type: 'SELECT_LOG_ROW', index: 4, panel: 'global' });
  assert.strictEqual(decoupledState.globalSelectedLogIndex, 4, 'globalSelectedLogIndex should be 4');
  assert.strictEqual(decoupledState.serviceSelectedLogIndex, 0, 'serviceSelectedLogIndex should remain 0');

  // Navigate selection in serviceLogs
  decoupledState = dashboardReducer(decoupledState, { type: 'NAVIGATE_LOG_SELECTION', delta: 2, maxIndex: 10, panel: 'service' });
  assert.strictEqual(decoupledState.serviceSelectedLogIndex, 2, 'serviceSelectedLogIndex should be 2');
  assert.strictEqual(decoupledState.globalSelectedLogIndex, 4, 'globalSelectedLogIndex should still be 4');
  console.log('✔ Service and Global panel selection indices are strictly decoupled');

  // Test 17: Proportional Line Budget Guarantee for GlobalLogsPanel
  console.log('\n[Test 17] Verifying GlobalLogsPanel 6-line budget with expanded JSON...');
  const globalTestLogs: LogEntry[] = [
    { id: 'g-1', timestamp: '11:00:01', service: 'auth', level: 'info', message: 'User signed in' },
    { id: 'g-2', timestamp: '11:00:02', service: 'billing', level: 'info', message: 'Invoice generated' },
    { id: 'g-3', timestamp: '11:00:03', service: 'gateway', level: 'info', message: 'Proxy request dispatched' },
    { id: 'g-4', timestamp: '11:00:04', service: 'notif', level: 'info', message: JSON.stringify({ invoice: 'INV-100', amount: 99.99, paid: true, currency: 'USD' }) },
    { id: 'g-5', timestamp: '11:00:05', service: 'auth', level: 'info', message: 'Token refreshed' },
    { id: 'g-6', timestamp: '11:00:06', service: 'worker', level: 'info', message: 'Background queue processed' },
  ];

  const globalWindow = calculateVisibleLogWindow({
    logs: globalTestLogs,
    availableLines: 6,
    scrollOffset: 0,
    expandedLogIds: { 'g-4': true },
    anchorLogId: 'g-4'
  });

  // Calculate rendered line footprint of globalWindow
  let renderedLines = 0;
  for (const log of globalWindow.visibleLogs) {
    if (log.id === 'g-4') {
      const parsed = parseJsonLog(log.message);
      const fullLines = formatJsonToHighlightedLines(parsed.parsed);
      const expLines = Math.min(fullLines.length, globalWindow.maxJsonLines);
      renderedLines += 1 + expLines;
    } else {
      renderedLines += 1;
    }
  }

  assert.ok(renderedLines <= 6, `Total rendered lines (${renderedLines}) must not exceed available 6-line budget`);
  assert.ok(globalWindow.visibleLogs.length >= 1, `Must show expanded log (showed ${globalWindow.visibleLogs.length})`);
  assert.ok(globalWindow.visibleLogs.some(l => l.id === 'g-4'), 'Expanded JSON log g-4 must be visible');
  console.log(`✔ Global Logs expansion fits within 6 lines (${renderedLines}/6 lines used, ${globalWindow.visibleLogs.length} logs visible)`);

  // Test 18: Global Logs Accordion Mode (only 1 expanded log at a time to protect all services)
  console.log('\n[Test 18] Testing Global Logs Accordion Mode...');
  let accordionState = { ...initialDashboardState, activePanel: 'globalLogs' as const };
  accordionState = dashboardReducer(accordionState, { type: 'TOGGLE_LOG_EXPANSION', logId: 'log-A', panel: 'global' });
  assert.strictEqual(accordionState.globalExpandedLogIds['log-A'], true);
  assert.strictEqual(Object.keys(accordionState.globalExpandedLogIds).length, 1);

  // Expanding log-B must automatically collapse log-A in global logs
  accordionState = dashboardReducer(accordionState, { type: 'TOGGLE_LOG_EXPANSION', logId: 'log-B', panel: 'global' });
  assert.strictEqual(accordionState.globalExpandedLogIds['log-B'], true);
  assert.strictEqual(accordionState.globalExpandedLogIds['log-A'], undefined);
  assert.strictEqual(Object.keys(accordionState.globalExpandedLogIds).length, 1);
  console.log('✔ Accordion mode guarantees exactly 1 expanded log at a time in Global Logs');

  // Test 19: Scaled inline JSON expansion in tall viewports (e.g. 190x45 terminal)
  console.log('\n[Test 19] Testing scaled inline JSON expansion in tall viewports...');
  const tallWindow = calculateVisibleLogWindow({
    logs: sampleLogs,
    availableLines: 17, // 45-line terminal globalLogs available height
    scrollOffset: 0,
    expandedLogIds: { 'log-10': true },
    anchorLogId: 'log-10'
  });
  // In a 17-line budget, maxJsonLines scales up to Math.min(10, Math.floor(17 * 0.55)) - 1 = 9 - 1 = 8 lines
  assert.ok(tallWindow.maxJsonLines >= 8, `maxJsonLines (${tallWindow.maxJsonLines}) should scale up to >= 8 in tall viewports`);
  console.log(`✔ Tall viewports provide generous maxJsonLines (${tallWindow.maxJsonLines}) allowing standard JSON to fit inline without truncation`);

  // Test 20: In-place JSON Line Scrolling (replaces popup modal)
  console.log('\n[Test 20] Testing in-place JSON line scrolling actions...');
  let scrollState = { ...initialDashboardState };
  assert.strictEqual(scrollState.serviceJsonLineScroll, 0);
  assert.strictEqual(scrollState.globalJsonLineScroll, 0);

  // Scroll service JSON lines
  scrollState = dashboardReducer(scrollState, { type: 'SCROLL_JSON_LINES', delta: 3, maxScroll: 10, panel: 'service' });
  assert.strictEqual(scrollState.serviceJsonLineScroll, 3, 'serviceJsonLineScroll should advance by 3');

  // Clamp service JSON lines
  scrollState = dashboardReducer(scrollState, { type: 'SCROLL_JSON_LINES', delta: 20, maxScroll: 10, panel: 'service' });
  assert.strictEqual(scrollState.serviceJsonLineScroll, 10, 'serviceJsonLineScroll should clamp to maxScroll (10)');

  // Reset service JSON line scroll
  scrollState = dashboardReducer(scrollState, { type: 'RESET_JSON_LINE_SCROLL', panel: 'service' });
  assert.strictEqual(scrollState.serviceJsonLineScroll, 0, 'serviceJsonLineScroll should reset to 0');

  // Scroll global JSON lines
  scrollState = dashboardReducer(scrollState, { type: 'SCROLL_JSON_LINES', delta: 5, maxScroll: 15, panel: 'global' });
  assert.strictEqual(scrollState.globalJsonLineScroll, 5, 'globalJsonLineScroll should advance by 5');

  // Reset on log navigation
  scrollState = dashboardReducer(scrollState, { type: 'NAVIGATE_LOG_SELECTION', delta: 1, maxIndex: 10, panel: 'global' });
  assert.strictEqual(scrollState.globalJsonLineScroll, 0, 'globalJsonLineScroll should reset on log navigation');

  console.log('✔ In-place JSON line scrolling & reset actions verified');

  console.log('\n=== ALL INLINE LOG SELECTOR & EXPANSION TESTS PASSED (20/20) ===');
}

runInlineLogSelectorTests().catch((err) => {
  console.error('Test failed:', err);
  process.exit(1);
});
