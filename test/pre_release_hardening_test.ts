import assert from 'node:assert';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { sanitizeTerminalOutput } from '../src/utils/ansi.js';
import { autoDetectServices, validateMustroConfig } from '../src/services/configManager.js';
import { processManager } from '../src/services/processManager.js';
import { theme } from '../src/theme/theme.js';

console.log('=== STARTING PRE-RELEASE HARDENING TESTS ===\n');

// 1. sanitizeTerminalOutput preserves SGR colors and strips OSC/CSI/control sequences
{
  const sgr = '\x1b[32mOK\x1b[0m: server ready';
  assert.strictEqual(sanitizeTerminalOutput(sgr), sgr, 'SGR color sequences should be preserved');

  const osc52 = 'hello\x1b]52;c;SGVsbG8=\x07world';
  assert.strictEqual(sanitizeTerminalOutput(osc52), 'helloworld', 'OSC 52 clipboard sequence must be stripped');

  const oscTitle = '\x1b]0;HACKED TITLE\x07log line';
  assert.strictEqual(sanitizeTerminalOutput(oscTitle), 'log line', 'OSC 0 title sequence must be stripped');

  const cursorMove = 'line1\x1b[2J\x1b[1;1Hline2';
  assert.strictEqual(sanitizeTerminalOutput(cursorMove), 'line1line2', 'CSI screen clear/cursor move must be stripped');

  const bellAndNul = 'a\x00b\x07c\td';
  assert.strictEqual(sanitizeTerminalOutput(bellAndNul), 'abc\td', 'NUL/BEL stripped while tab preserved');

  const unterminatedOsc = 'prefix\x1b]0;unterminated-title';
  assert.strictEqual(sanitizeTerminalOutput(unterminatedOsc), 'prefix0;unterminated-title', 'Un-terminated OSC ESC byte must be stripped');

  const solitaryEsc = 'bad\x1b31mText';
  assert.strictEqual(sanitizeTerminalOutput(solitaryEsc), 'bad31mText', 'Solitary ESC without [ must be stripped');
  console.log('✔ [Test 1] sanitizeTerminalOutput strips unsafe control sequences while preserving SGR');
}

// 2. validateMustroConfig catches invalid schemas, ports, and duplicate names
{
  assert.strictEqual(validateMustroConfig(null).valid, false);
  assert.strictEqual(validateMustroConfig({ services: 'bad' }).valid, false);
  assert.strictEqual(
    validateMustroConfig({
      services: [{ name: 'api', path: '.', command: 'npm start', port: 99999 }]
    }).valid,
    false,
    'Port > 65535 must fail validation'
  );
  assert.strictEqual(
    validateMustroConfig({
      services: [
        { name: 'api', path: '.', command: 'npm start' },
        { name: 'API', path: './api', command: 'npm start' }
      ]
    }).valid,
    false,
    'Case-insensitive duplicate service names must fail validation'
  );
  assert.strictEqual(
    validateMustroConfig({
      services: [{ name: 'api', path: '.', command: 'npm start', port: 3000 }]
    }).valid,
    true,
    'Valid config must pass validation'
  );
  console.log('✔ [Test 2] validateMustroConfig enforces schema, port bounds, and unique names');
}

// 3. probeTcpPort rejects invalid ports safely
{
  const invalidPorts = [NaN, 0, -1, 65536, 3.14];
  for (const p of invalidPorts) {
    const res = await processManager.probeTcpPort(p);
    assert.strictEqual(res, false, `Invalid port ${p} must return false`);
  }
  console.log('✔ [Test 3] probeTcpPort safely rejects invalid port numbers');
}

// 4. bootGeneration cancellation aborts pending startAll waves on stopAll()
{
  const logs: string[] = [];
  const bootPromise = processManager.startAll(
    [
      { name: 'svc-1', path: '.', command: 'node -e "setTimeout(() => {}, 5000)"', autoStart: true },
      { name: 'svc-2', path: '.', command: 'node -e "setTimeout(() => {}, 5000)"', autoStart: true, dependsOn: ['svc-1'] }
    ],
    {
      onLog: (_svc, entry) => logs.push(entry.message),
      onStatusChange: () => {}
    },
    { bootStaggerMs: 200, maxConcurrentBoot: 1 }
  );

  // Immediately stopAll before wave 2 / svc-2 can spawn
  await new Promise(r => setTimeout(r, 50));
  await processManager.stopAll();
  await bootPromise;

  assert.strictEqual(processManager.isRunning('svc-1'), false, 'svc-1 must not be running after stopAll');
  assert.strictEqual(processManager.isRunning('svc-2'), false, 'svc-2 must not be spawned after stopAll');
  console.log('✔ [Test 4] bootGeneration cancellation prevents post-stopAll spawns');
}

// 5. restoreScreen disables button-event mouse tracking (?1002l)
{
  assert.ok(theme.ansi.restoreScreen.includes('\x1b[?1000l'), 'restoreScreen must disable ?1000');
  assert.ok(theme.ansi.restoreScreen.includes('\x1b[?1002l'), 'restoreScreen must disable ?1002');
  assert.ok(theme.ansi.restoreScreen.includes('\x1b[?1006l'), 'restoreScreen must disable ?1006');
  assert.ok(theme.ansi.restoreScreen.includes('\x1b[?1049l'), 'restoreScreen must leave alt screen ?1049');
  console.log('✔ [Test 5] theme.ansi.restoreScreen includes complete mouse & alt-screen cleanup');
}

// 6. autoDetectServices disambiguates duplicate monorepo service names
{
  const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'mustro-monorepo-'));
  try {
    fs.mkdirSync(path.join(tmpRoot, 'apps', 'web'), { recursive: true });
    fs.mkdirSync(path.join(tmpRoot, 'packages', 'web'), { recursive: true });
    fs.writeFileSync(path.join(tmpRoot, 'apps', 'web', 'package.json'), JSON.stringify({ name: 'web', scripts: { dev: 'vite' } }));
    fs.writeFileSync(path.join(tmpRoot, 'packages', 'web', 'package.json'), JSON.stringify({ name: 'web-pkg', scripts: { start: 'node index.js' } }));

    const detected = autoDetectServices(tmpRoot);
    assert.strictEqual(detected.length, 2, 'Both monorepo services should be detected');
    assert.strictEqual(detected[0]?.name, 'web');
    assert.strictEqual(detected[1]?.name, 'packages-web');
    const validation = validateMustroConfig({ services: detected });
    assert.strictEqual(validation.valid, true, `Auto-detected monorepo config must validate: ${validation.error ?? ''}`);
    console.log('✔ [Test 6] autoDetectServices disambiguates duplicate monorepo service names');
  } finally {
    fs.rmSync(tmpRoot, { recursive: true, force: true });
  }
}

console.log('\n✅ ALL PRE-RELEASE HARDENING TESTS PASSED (6/6)!');
