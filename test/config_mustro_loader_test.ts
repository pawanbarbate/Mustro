import path from 'path';
import fs from 'fs';
import {
  getConfigFilePath,
  hasConfigFile,
  loadConfigFile,
  saveConfigFile,
  parseCliArgs,
  CONFIG_FILENAMES
} from '../src/services/configManager.js';
import { MustroConfig } from '../src/types/config.js';

console.log('--- STARTING MUSTRO CONFIGURATION LOADER TESTS ---');

const tmpTestDir = path.resolve(process.cwd(), 'test/fixtures/config-loader-sandbox');
if (!fs.existsSync(tmpTestDir)) {
  fs.mkdirSync(tmpTestDir, { recursive: true });
}

function cleanupSandbox() {
  if (fs.existsSync(tmpTestDir)) {
    const files = fs.readdirSync(tmpTestDir);
    for (const file of files) {
      fs.unlinkSync(path.join(tmpTestDir, file));
    }
  }
}

try {
  cleanupSandbox();

  // -------------------------------------------------------------
  // Test 1: Empty directory returns null
  // -------------------------------------------------------------
  console.log('[TEST 1] Verifying empty directory returns null...');
  if (hasConfigFile(tmpTestDir)) {
    throw new Error('Expected hasConfigFile to be false for empty directory');
  }
  if (getConfigFilePath(tmpTestDir) !== null) {
    throw new Error('Expected getConfigFilePath to return null for empty directory');
  }
  console.log('✔ Empty directory returns null');

  // -------------------------------------------------------------
  // Test 2: Auto-detect config.mustro.json
  // -------------------------------------------------------------
  console.log('[TEST 2] Verifying auto-detection of config.mustro.json...');
  const sampleConfig: MustroConfig = {
    $schema: 'https://mustro.dev/schema.json',
    name: 'test-workspace',
    version: '1.0.0',
    services: [
      { name: 'web', path: './web', command: 'npm start', port: 3000, autoStart: true },
      { name: 'api', path: './api', command: 'npm run dev', port: 8080, autoStart: true }
    ]
  };

  const configPath1 = path.join(tmpTestDir, 'config.mustro.json');
  fs.writeFileSync(configPath1, JSON.stringify(sampleConfig, null, 2), 'utf-8');

  if (!hasConfigFile(tmpTestDir)) {
    throw new Error('Expected hasConfigFile to be true when config.mustro.json exists');
  }
  const detectedPath1 = getConfigFilePath(tmpTestDir);
  if (detectedPath1 !== configPath1) {
    throw new Error(`Expected getConfigFilePath to resolve to ${configPath1}, got ${detectedPath1}`);
  }

  const loadedConfig1 = loadConfigFile(tmpTestDir);
  if (!loadedConfig1 || loadedConfig1.services.length !== 2) {
    throw new Error('Failed to load config.mustro.json properly');
  }
  if (loadedConfig1.services[0]?.name !== 'web' || loadedConfig1.services[1]?.port !== 8080) {
    throw new Error('Loaded service configuration does not match expected values');
  }
  console.log('✔ config.mustro.json is detected and loaded perfectly');

  // -------------------------------------------------------------
  // Test 3: Auto-detect (anyname).mustro.json (e.g. backend.mustro.json)
  // -------------------------------------------------------------
  console.log('[TEST 3] Verifying auto-detection of (anyname).mustro.json pattern...');
  cleanupSandbox();

  const customNamedPath = path.join(tmpTestDir, 'my-microservices.mustro.json');
  fs.writeFileSync(customNamedPath, JSON.stringify(sampleConfig, null, 2), 'utf-8');

  if (!hasConfigFile(tmpTestDir)) {
    throw new Error('Expected hasConfigFile to find my-microservices.mustro.json');
  }
  const detectedDynamic = getConfigFilePath(tmpTestDir);
  if (detectedDynamic !== customNamedPath) {
    throw new Error(`Expected ${customNamedPath}, got ${detectedDynamic}`);
  }
  const loadedDynamic = loadConfigFile(tmpTestDir);
  if (!loadedDynamic || loadedDynamic.services.length !== 2) {
    throw new Error('Failed to load my-microservices.mustro.json');
  }
  console.log('✔ Any custom file ending with .mustro.json is automatically recognized');

  // -------------------------------------------------------------
  // Test 4: Priority resolution when both config.mustro.json and others exist
  // -------------------------------------------------------------
  console.log('[TEST 4] Verifying priority resolution (config.mustro.json takes priority)...');
  const otherPath = path.join(tmpTestDir, 'other.mustro.json');
  fs.writeFileSync(otherPath, JSON.stringify(sampleConfig, null, 2), 'utf-8');
  fs.writeFileSync(configPath1, JSON.stringify({ ...sampleConfig, name: 'priority-test' }, null, 2), 'utf-8');

  const resolvedPriority = getConfigFilePath(tmpTestDir);
  if (resolvedPriority !== configPath1) {
    throw new Error(`Expected config.mustro.json to have priority over other.mustro.json, got: ${resolvedPriority}`);
  }
  const loadedPriority = loadConfigFile(tmpTestDir);
  if (loadedPriority?.name !== 'priority-test') {
    throw new Error('Loaded incorrect config during priority test');
  }
  console.log('✔ config.mustro.json successfully takes priority when multiple mustro files exist');

  // -------------------------------------------------------------
  // Test 5: Direct file path loading
  // -------------------------------------------------------------
  console.log('[TEST 5] Verifying direct file path loading...');
  const directLoaded = loadConfigFile(customNamedPath);
  if (!directLoaded || directLoaded.services.length !== 2) {
    throw new Error('Direct file path loading failed');
  }
  console.log('✔ Direct file path loading works seamlessly');

  // -------------------------------------------------------------
  // Test 6: CLI Argument Parsing
  // -------------------------------------------------------------
  console.log('[TEST 6] Verifying CLI argument parser...');
  // Case A: --config
  const argsA = parseCliArgs(['--config', './test.mustro.json']);
  if (argsA.configPath !== './test.mustro.json') {
    throw new Error(`CLI --config parsing failed: ${argsA.configPath}`);
  }

  // Case B: -c
  const argsB = parseCliArgs(['-c', 'custom.mustro.json']);
  if (argsB.configPath !== 'custom.mustro.json') {
    throw new Error(`CLI -c parsing failed: ${argsB.configPath}`);
  }

  // Case C: --config=value
  const argsC = parseCliArgs(['--config=config.mustro.json']);
  if (argsC.configPath !== 'config.mustro.json') {
    throw new Error(`CLI --config= parsing failed: ${argsC.configPath}`);
  }

  // Case D: Positional mustro file
  const argsD = parseCliArgs(['production.mustro.json']);
  if (argsD.configPath !== 'production.mustro.json') {
    throw new Error(`CLI positional parsing failed: ${argsD.configPath}`);
  }

  // Case E: Empty
  const argsE = parseCliArgs([]);
  if (argsE.configPath !== undefined) {
    throw new Error(`CLI empty args parsing failed: ${argsE.configPath}`);
  }
  console.log('✔ All CLI argument variations (-c, --config, --config=..., positional) parse correctly');

  // -------------------------------------------------------------
  // Test 7: Reject legacy DevPulse config filenames
  // -------------------------------------------------------------
  console.log('[TEST 7] Verifying legacy DevPulse filenames are rejected...');
  cleanupSandbox();

  const legacyConfigPath = path.join(tmpTestDir, 'legacy.devpulse.json');
  fs.writeFileSync(legacyConfigPath, JSON.stringify(sampleConfig, null, 2), 'utf-8');

  if (hasConfigFile(tmpTestDir) || getConfigFilePath(tmpTestDir) !== null) {
    throw new Error('Legacy .devpulse.json files must not be discovered');
  }
  if (hasConfigFile(legacyConfigPath) || loadConfigFile(legacyConfigPath) !== null) {
    throw new Error('Legacy .devpulse.json files must not be directly loaded');
  }
  if (parseCliArgs([legacyConfigPath]).configPath !== legacyConfigPath) {
    throw new Error('Legacy config path should be parsed so the CLI can report it as unsupported');
  }
  console.log('✔ Legacy .devpulse.json files are rejected');

  // -------------------------------------------------------------
  // Test 8: saveConfigFile preserves detected file path
  // -------------------------------------------------------------
  console.log('[TEST 8] Verifying saveConfigFile preserves the existing config file...');
  cleanupSandbox();

  const activeTestFile = path.join(tmpTestDir, 'staging.mustro.json');
  fs.writeFileSync(activeTestFile, JSON.stringify(sampleConfig, null, 2), 'utf-8');

  // Update a service in config
  const updatedConfig: MustroConfig = {
    ...sampleConfig,
    services: [
      ...sampleConfig.services,
      { name: 'worker', path: './worker', command: 'npm run worker', autoStart: true }
    ]
  };

  const savedTarget = saveConfigFile(updatedConfig, tmpTestDir);
  if (savedTarget !== activeTestFile) {
    throw new Error(`Expected saveConfigFile to write to ${activeTestFile}, got: ${savedTarget}`);
  }

  const reloaded = JSON.parse(fs.readFileSync(activeTestFile, 'utf-8')) as MustroConfig;
  if (reloaded.services.length !== 3) {
    throw new Error(`Expected 3 services in saved config, got ${reloaded.services.length}`);
  }
  console.log('✔ saveConfigFile preserves and writes back to staging.mustro.json');

  console.log('\n✅ ALL MUSTRO CONFIGURATION LOADER TESTS PASSED!\n');
} finally {
  cleanupSandbox();
  if (fs.existsSync(tmpTestDir)) {
    fs.rmdirSync(tmpTestDir);
  }
}

