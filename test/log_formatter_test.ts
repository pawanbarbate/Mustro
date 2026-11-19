import assert from 'assert';
import {
  parseJsonLog,
  prettyPrintJson,
  formatJsonToHighlightedLines
} from '../src/utils/logFormatter.js';
import {
  dashboardReducer,
  initialDashboardState
} from '../src/state/dashboardReducer.js';
import { LogEntry } from '../src/types/index.js';

async function runLogFormatterTests() {
  console.log('=== STARTING LOG FORMATTER & JSON INSPECTION UNIT TESTS ===');

  // Test 1: JSON log auto-detection and non-JSON rejection
  console.log('\n[Test 1] Testing JSON log detection and parsing...');
  const plainText = 'Server started on port 3000';
  assert.strictEqual(parseJsonLog(plainText).isJson, false, 'Plain text should not be detected as JSON');

  const pinoLog = JSON.stringify({
    level: 30,
    time: 1710002130,
    pid: 4812,
    hostname: 'devbox',
    req: { method: 'POST', url: '/api/v1/users' },
    res: { statusCode: 201 },
    responseTime: 38,
    msg: 'User created successfully',
    userId: 'usr-9921',
    role: 'admin'
  });

  const pinoResult = parseJsonLog(pinoLog);
  assert.strictEqual(pinoResult.isJson, true, 'Pino log must be detected as JSON');
  assert.strictEqual(pinoResult.canonicalMsg, 'User created successfully');
  assert.strictEqual(pinoResult.method, 'POST');
  assert.strictEqual(pinoResult.path, '/api/v1/users');
  assert.strictEqual(pinoResult.status, 201);
  assert.strictEqual(pinoResult.latency, '38 ms');
  assert.ok(pinoResult.extraPairs?.some(p => p.key === 'userId' && p.val === 'usr-9921'), 'Extra pairs contains userId');
  console.log('✔ Pino structured log auto-detection & field extraction verified');

  // Test 2: Winston and error log format parsing
  console.log('\n[Test 2] Testing Winston & structured error extraction...');
  const winstonErrorLog = JSON.stringify({
    level: 'error',
    message: 'Database query execution failed',
    error: {
      message: 'Connection timeout after 5000ms',
      code: 'ETIMEDOUT',
      stack: 'Error: Connection timeout\n  at Socket.<anonymous> (/app/db.js:42:15)'
    },
    query: 'SELECT * FROM users'
  });

  const winstonResult = parseJsonLog(winstonErrorLog);
  assert.strictEqual(winstonResult.isJson, true);
  assert.strictEqual(winstonResult.canonicalMsg, 'Database query execution failed');
  assert.ok(winstonResult.error?.includes('Connection timeout'), 'Error stack/message captured');
  console.log('✔ Winston structured error log parsing verified');

  // Test 3: prettyPrintJson formatting
  console.log('\n[Test 3] Testing prettyPrintJson 2-space indentation...');
  const singleLineJson = '{"key":"value","count":10,"active":true}';
  const pretty = prettyPrintJson(singleLineJson);
  assert.strictEqual(pretty, '{\n  "key": "value",\n  "count": 10,\n  "active": true\n}');

  // Non-JSON returns verbatim
  assert.strictEqual(prettyPrintJson('Regular log line'), 'Regular log line');
  console.log('✔ prettyPrintJson 2-space formatting verified');

  // Test 4: Syntax highlighting tokenization
  console.log('\n[Test 4] Testing formatJsonToHighlightedLines token coloring...');
  const testPayload = {
    appName: 'devpulse',
    port: 8080,
    debug: false,
    empty: null
  };
  const highlightedLines = formatJsonToHighlightedLines(testPayload);
  assert.ok(highlightedLines.length > 0, 'Must produce lines');

  // Find line with "appName"
  const appNameLine = highlightedLines.find(l => l.tokens.some(t => t.text.includes('"appName"')));
  assert.ok(appNameLine, 'Must have appName line');
  const keyToken = appNameLine?.tokens.find(t => t.text === '"appName"');
  assert.ok(keyToken?.bold, 'Key token must be bold');
  const strToken = appNameLine?.tokens.find(t => t.text === '"devpulse"');
  assert.ok(strToken?.color, 'String token must have color');

  // Find line with "port"
  const portLine = highlightedLines.find(l => l.tokens.some(t => t.text.includes('"port"')));
  const numToken = portLine?.tokens.find(t => t.text === '8080');
  assert.ok(numToken?.bold, 'Number token must be bold');

  // Find line with "debug"
  const debugLine = highlightedLines.find(l => l.tokens.some(t => t.text.includes('"debug"')));
  const boolToken = debugLine?.tokens.find(t => t.text === 'false');
  assert.strictEqual(boolToken?.color, '#C084FC', 'Boolean token must be purple (#C084FC)');

  console.log('✔ Syntax highlighting token classification verified');

  // Test 5: Reducer wrap mode & in-place JSON line scrolling state management
  console.log('\n[Test 5] Testing Reducer Wrap Mode & In-Place JSON Line Scrolling...');
  let state = initialDashboardState;
  assert.strictEqual(state.isWrapMode, false, 'Default isWrapMode is false');

  // 5a. Toggle Wrap Mode
  state = dashboardReducer(state, { type: 'TOGGLE_WRAP_MODE' });
  assert.strictEqual(state.isWrapMode, true, 'Wrap mode toggled to true');
  state = dashboardReducer(state, { type: 'TOGGLE_WRAP_MODE' });
  assert.strictEqual(state.isWrapMode, false, 'Wrap mode toggled back to false');

  // 5b. Scroll JSON lines in-place
  state = dashboardReducer(state, { type: 'SCROLL_JSON_LINES', delta: 4, maxScroll: 20, panel: 'service' });
  assert.strictEqual(state.serviceJsonLineScroll, 4);

  // 5c. Scroll JSON lines clamp
  state = dashboardReducer(state, { type: 'SCROLL_JSON_LINES', delta: 50, maxScroll: 20, panel: 'service' });
  assert.strictEqual(state.serviceJsonLineScroll, 20);

  // 5d. Reset JSON line scroll
  state = dashboardReducer(state, { type: 'RESET_JSON_LINE_SCROLL', panel: 'service' });
  assert.strictEqual(state.serviceJsonLineScroll, 0);

  console.log('✔ Reducer Wrap Mode & in-place JSON line scrolling verified');

  console.log('\n=== ALL LOG FORMATTER & JSON INSPECTION TESTS PASSED (5/5) ===');
}

runLogFormatterTests().catch((err) => {
  console.error('Log Formatter test failed:', err);
  process.exit(1);
});

