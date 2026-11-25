import assert from 'assert';
import {
  getOsc52Sequence,
  copyToClipboard,
  copyToClipboardDetailed,
  getCopyFeedbackMessage,
  formatLogEntry,
  stripAnsiEscapeCodes,
  formatServiceErrorSummary,
  formatAllErrors
} from '../src/utils/clipboard.js';
import {
  dashboardReducer,
  initialDashboardState
} from '../src/state/dashboardReducer.js';
import { LogEntry, Service } from '../src/types/index.js';

async function runClipboardTests() {
  console.log('=== STARTING CLIPBOARD & LOG SHARING UNIT TESTS ===');

  // Test 1: OSC 52 sequence generation and base64 roundtrip
  console.log('\n[Test 1] Testing OSC 52 ANSI escape sequence formatting...');
  const testMsg = 'Error: Connection refused to redis://127.0.0.1:6379\n  at TCPConnectWrap';
  const oscSeq = getOsc52Sequence(testMsg);
  
  assert.ok(oscSeq.startsWith('\x1b]52;c;'), 'OSC 52 sequence must start with \\x1b]52;c;');
  assert.ok(oscSeq.endsWith('\x07'), 'OSC 52 sequence must terminate with BEL (\\x07)');
  
  const base64Part = oscSeq.slice(7, -1);
  const decoded = Buffer.from(base64Part, 'base64').toString('utf8');
  assert.strictEqual(decoded, testMsg, 'Decoded OSC 52 base64 must match original text verbatim');
  console.log('✔ OSC 52 sequence generation & base64 roundtrip verified');

  // Test 2: strip ANSI escape sequences from copied plain text
  console.log('\n[Test 2] Testing ANSI escape sequence removal...');
  const coloredLog = "[10:59:08] [gateway] [INFO] this is log { number: \x1b[33m66666\x1b[39m, name: \x1b[32m'pawan'\x1b[39m }";
  assert.strictEqual(
    stripAnsiEscapeCodes(coloredLog),
    "[10:59:08] [gateway] [INFO] this is log { number: 66666, name: 'pawan' }"
  );
  assert.strictEqual(stripAnsiEscapeCodes('plain text'), 'plain text', 'Plain text should remain unchanged');
  console.log('✔ ANSI escape sequences removed while preserving log text');

  // Test 3: formatLogEntry
  console.log('\n[Test 3] Testing formatLogEntry with un-truncated text...');
  const sampleLog: LogEntry = {
    id: 'log-1',
    timestamp: '14:22:05',
    service: 'auth-service',
    message: 'UnhandledPromiseRejection: JWT_SECRET not configured in environment variables',
    level: 'error'
  };
  const formattedLog = formatLogEntry(sampleLog);
  assert.strictEqual(
    formattedLog,
    '[14:22:05] [auth-service] [ERROR] UnhandledPromiseRejection: JWT_SECRET not configured in environment variables'
  );
  console.log('✔ formatLogEntry output verified:', formattedLog);

  // Test 4: formatServiceErrorSummary
  console.log('\n[Test 4] Testing formatServiceErrorSummary report generation...');
  const sampleService: Service = {
    id: 'svc-payment',
    name: 'payment-svc',
    status: 'stopped',
    statusText: 'CRASHED (Exit 1)',
    uptime: '45s',
    uptimeSeconds: 45,
    command: 'npm run start:worker',
    path: './services/payment',
    port: ':4002',
    pid: '8712',
    errors: 2,
    lastError: 'FATAL: database "payments_db" does not exist',
    errorLogs: [
      {
        id: 'err-1',
        timestamp: '14:20:10',
        service: 'payment-svc',
        message: 'FATAL: database "payments_db" does not exist',
        level: 'error'
      }
    ]
  };

  const summary = formatServiceErrorSummary(sampleService);
  assert.ok(summary.includes('=== MUSTRO Service Report: payment-svc ==='), 'Summary contains title');
  assert.ok(summary.includes('Status: STOPPED (CRASHED (Exit 1))'), 'Summary contains status');
  assert.ok(summary.includes('Port: :4002'), 'Summary contains port');
  assert.ok(summary.includes('PID: 8712'), 'Summary contains PID');
  assert.ok(summary.includes('FATAL: database "payments_db" does not exist'), 'Summary contains last error');
  console.log('✔ formatServiceErrorSummary structure verified');

  // Test 5: formatAllErrors
  console.log('\n[Test 5] Testing formatAllErrors multi-error dump...');
  const multiErrorService: Service = {
    ...sampleService,
    errorLogs: [
      { id: 'e1', timestamp: '14:01:00', service: 'payment-svc', message: 'First error stack trace', level: 'error' },
      { id: 'e2', timestamp: '14:02:00', service: 'payment-svc', message: 'Second error stack trace', level: 'error' }
    ]
  };
  const allErrorsDump = formatAllErrors(multiErrorService);
  assert.ok(allErrorsDump.includes('2 errors'), 'Header shows 2 errors');
  assert.ok(allErrorsDump.includes('#1 [14:01:00] [ERROR]:\nFirst error stack trace'), 'Includes error 1');
  assert.ok(allErrorsDump.includes('#2 [14:02:00] [ERROR]:\nSecond error stack trace'), 'Includes error 2');
  console.log('✔ formatAllErrors multi-error dump verified');

  // Test 6: copyToClipboard & copyToClipboardDetailed executes without throwing
  console.log('\n[Test 6] Testing copyToClipboard execution...');
  const copyResult = await copyToClipboard('DevPulse copy test string');
  assert.ok(typeof copyResult === 'boolean', 'copyToClipboard must return a boolean');
  const detailed = await copyToClipboardDetailed('DevPulse detailed test');
  assert.ok(typeof detailed.success === 'boolean');
  assert.ok(typeof detailed.osSuccess === 'boolean');
  assert.ok(typeof detailed.osc52Sent === 'boolean');
  assert.strictEqual(detailed.success, detailed.osSuccess, 'Only a native clipboard write can confirm copy success');
  const msgOk = getCopyFeedbackMessage({ success: true, osSuccess: true, osc52Sent: true }, '✔ Copied');
  assert.strictEqual(msgOk, '✔ Copied');
  const msgFail = getCopyFeedbackMessage({ success: false, osSuccess: false, osc52Sent: false }, '✔ Copied');
  assert.ok(msgFail.includes('⚠ Copy failed'));
  const msgUnconfirmed = getCopyFeedbackMessage({ success: false, osSuccess: false, osc52Sent: true }, '✔ Copied');
  assert.ok(msgUnconfirmed.includes('Clipboard unavailable'), 'OSC 52 emission must not be reported as confirmed clipboard success');
  assert.ok(!msgUnconfirmed.includes('✔ Copied'), 'Unconfirmed OSC 52 feedback must not claim copied content');
  console.log('✔ copyToClipboard & copyToClipboardDetailed executed successfully');

  // Test 7: Reducer state management for Toast and Log Inspector
  console.log('\n[Test 7] Testing Reducer Toast & Inspector actions...');
  let state = initialDashboardState;

  // 6a. SHOW_TOAST
  state = dashboardReducer(state, { type: 'SHOW_TOAST', message: '✔ Copied to clipboard!', durationMs: 2000 });
  assert.strictEqual(state.toastMessage, '✔ Copied to clipboard!');
  assert.ok(state.toastExpiresAt && state.toastExpiresAt > Date.now());

  // 6b. TICK_CLOCK before expiration retains toast
  state = dashboardReducer(state, { type: 'TICK_CLOCK', time: '14:22:06' });
  assert.strictEqual(state.toastMessage, '✔ Copied to clipboard!');

  // 6c. HIDE_TOAST clears toast immediately
  state = dashboardReducer(state, { type: 'HIDE_TOAST' });
  assert.strictEqual(state.toastMessage, null);
  assert.strictEqual(state.toastExpiresAt, undefined);
  console.log('✔ Reducer toast actions verified');

  console.log('\n=== ALL CLIPBOARD & LOG SHARING TESTS PASSED (7/7) ===');
}

runClipboardTests().catch((err) => {
  console.error('Clipboard test failed:', err);
  process.exit(1);
});
