import React, { useReducer } from 'react';
import assert from 'assert';
import fs from 'node:fs';
import { render } from 'ink';
import { PassThrough } from 'stream';
import GlobalLogsPanel from '../src/components/GlobalLogsPanel.js';
import ServiceDetailPanel from '../src/components/ServiceDetailPanel.js';
import { ClickManagerContextValue, ClickProvider } from '../src/components/common/ClickManager.js';
import { useTerminalInput } from '../src/hooks/useTerminalInput.js';
import { DashboardState, dashboardReducer, initialDashboardState } from '../src/state/dashboardReducer.js';
import SetupWizard from '../src/components/wizard/SetupWizard.js';
import { MustroConfig } from '../types/config.js';
import { Service, ViewportInfo } from '../src/types/index.js';
import { stripAnsiEscapeCodes } from '../src/utils/ansi.js';

async function runExpandedJsonMouseSelectionTest() {
  const stdin = new PassThrough() as any;
  stdin.setRawMode = () => {};
  stdin.ref = () => {};
  stdin.unref = () => {};
  stdin.isTTY = true;

  const stdout = new PassThrough() as any;
  stdout.isTTY = true;
  stdout.columns = 100;
  stdout.rows = 50;

  const service: Service = {
    id: 'selection-service',
    name: 'selection-service',
    status: 'running',
    uptime: '1s',
    command: 'node server.js',
    port: '',
    pid: '123',
    errors: 0,
    logs: [
      {
        id: 'selection-ansi',
        timestamp: '14:00:00',
        service: 'selection-service',
        level: 'info',
        message: "this is log { number: \x1b[33m66666\x1b[39m, name: \x1b[32m'pawan'\x1b[39m }"
      },
      {
        id: 'selection-json',
        timestamp: '14:00:01',
        service: 'selection-service',
        level: 'info',
        message: JSON.stringify({ name: 'pawan', count: 666 })
      }
    ]
  };
  const initialState: DashboardState = {
    ...initialDashboardState,
    services: [service],
    globalLogs: service.logs!,
    selectedIndex: 0,
    activePanel: 'serviceLogs',
    serviceSelectedLogId: 'selection-json',
    serviceExpandedLogIds: { 'selection-json': true },
    globalSelectedLogId: 'selection-json',
    globalExpandedLogIds: { 'selection-json': true }
  };
  const viewport: ViewportInfo = {
    width: 100,
    height: 50,
    isWide: true,
    isUltraNarrow: false,
    isCompactHeight: false,
    isUltraCompactHeight: false,
    leftPanelWidth: 30,
    rightPanelWidth: 70,
    contentHeight: 48,
    servicesPanelHeight: 20,
    systemPanelHeight: 0,
    detailPanelHeight: 26,
    globalLogsPanelHeight: 20,
    maxServiceLogs: 6,
    maxGlobalLogs: 6
  };
  let latestState = initialState;
  const clickManagerRef = { current: null } as React.RefObject<ClickManagerContextValue | null>;

  const Harness: React.FC = () => {
    const [state, dispatch] = useReducer(dashboardReducer, initialState);
    latestState = state;
    useTerminalInput({ state, viewport, dispatch, exit: () => {}, clickManagerRef });

    return (
      <ClickProvider clickManagerRef={clickManagerRef}>
        <>
          <ServiceDetailPanel
            service={service}
            height={26}
            panelWidth={70}
            maxLogs={6}
            isFocused
            selectedLogIndex={0}
            selectedLogId="selection-json"
            expandedLogIds={state.serviceExpandedLogIds}
            onFocus={() => dispatch({ type: 'SET_ACTIVE_PANEL', panel: 'serviceLogs' })}
            onSelectLogIndex={(index, _shift, logId) => dispatch({
              type: 'SELECT_LOG_ROW',
              index,
              logId,
              panel: 'service'
            })}
          />
          <GlobalLogsPanel
            logs={state.globalLogs}
            height={20}
            panelWidth={70}
            maxLogs={6}
            isFocused
            selectedLogIndex={0}
            selectedLogId="selection-json"
            expandedLogIds={state.globalExpandedLogIds}
            onFocus={() => dispatch({ type: 'SET_ACTIVE_PANEL', panel: 'globalLogs' })}
            onSelectLogIndex={(index, _shift, logId) => dispatch({
              type: 'SELECT_LOG_ROW',
              index,
              logId,
              panel: 'global'
            })}
          />
        </>
      </ClickProvider>
    );
  };

  const { unmount } = render(<Harness />, { stdin, stdout });
  try {
    await new Promise(resolve => setTimeout(resolve, 120));

    const findRegion = (id: string) => {
      for (let y = 1; y <= 50; y++) {
        for (let x = 1; x <= 100; x++) {
          const region = clickManagerRef.current?.findRegionAt(x, y);
          if (region?.id === id) return region;
        }
      }
      throw new Error(`Missing clickable JSON line region: ${id}`);
    };

    const selectRange = async (panel: 'service' | 'global') => {
        const startRegion = findRegion(`${panel}-json-line-1-1`);
        const endRegion = findRegion(`${panel}-json-line-1-2`);
      stdin.write(`\x1b[<0;${startRegion.minX + 2};${startRegion.minY}M`);
      await new Promise(resolve => setTimeout(resolve, 30));
      stdin.write(`\x1b[<32;${endRegion.minX + 5};${endRegion.minY}M`);
      await new Promise(resolve => setTimeout(resolve, 30));
      stdin.write(`\x1b[<0;${endRegion.minX + 5};${endRegion.minY}m`);
      await new Promise(resolve => setTimeout(resolve, 30));

      const selection = panel === 'service'
        ? latestState.serviceJsonTextSelection
        : latestState.globalJsonTextSelection;
      assert.deepStrictEqual(selection, {
        logId: 'selection-json',
        anchorLine: 1,
        anchorChar: 2,
        headLine: 2,
        headChar: 5
      });
    };
    await selectRange('service');
    await selectRange('global');

    const ansiRow = findRegion('service-log-row-0');
    const textColumn = ansiRow.minX + (ansiRow.textStartX || 19);
    stdin.write(`\x1b[<0;${textColumn + 22};${ansiRow.minY}M`);
    await new Promise(resolve => setTimeout(resolve, 30));
    stdin.write(`\x1b[<32;${textColumn + 38};${ansiRow.minY}M`);
    await new Promise(resolve => setTimeout(resolve, 30));
    stdin.write(`\x1b[<0;${textColumn + 38};${ansiRow.minY}m`);
    await new Promise(resolve => setTimeout(resolve, 30));
    assert.deepStrictEqual(latestState.serviceCharSelection, { start: 22, end: 39 });
    assert.strictEqual(
      stripAnsiEscapeCodes(service.logs![0]!.message).slice(
        latestState.serviceCharSelection.start,
        latestState.serviceCharSelection.end
      ),
      "66666, name: 'paw"
    );

  } finally {
    unmount();
  }
}

async function runExpandedJsonWheelScrollTest() {
  const stdin = new PassThrough() as any;
  stdin.setRawMode = () => {};
  stdin.ref = () => {};
  stdin.unref = () => {};
  stdin.isTTY = true;

  const stdout = new PassThrough() as any;
  stdout.isTTY = true;
  stdout.columns = 100;
  stdout.rows = 30;

  const logs = [
    { id: 'wheel-before', timestamp: '14:00:00', service: 'wheel-service', level: 'info' as const, message: 'before' },
    {
      id: 'wheel-json',
      timestamp: '14:00:01',
      service: 'wheel-service',
      level: 'info' as const,
      message: JSON.stringify({ values: Array.from({ length: 30 }, (_, index) => `value-${index}`) })
    },
    { id: 'wheel-after', timestamp: '14:00:02', service: 'wheel-service', level: 'info' as const, message: 'after' }
  ];
  const service: Service = {
    id: 'wheel-service',
    name: 'wheel-service',
    status: 'running',
    uptime: '1s',
    command: 'node server.js',
    port: '',
    pid: '123',
    errors: 0,
    logs
  };
  const initialState: DashboardState = {
    ...initialDashboardState,
    services: [service],
    globalLogs: logs,
    activePanel: 'serviceLogs',
    serviceSelectedLogId: 'wheel-json',
    globalSelectedLogId: 'wheel-json',
    serviceExpandedLogIds: { 'wheel-json': true },
    globalExpandedLogIds: { 'wheel-json': true },
    serviceLogScroll: 1,
    globalLogScroll: 1,
    serviceJsonLineScrollById: { 'wheel-json': 1 },
    globalJsonLineScroll: 1
  };
  const viewport: ViewportInfo = {
    width: 100,
    height: 30,
    isWide: true,
    isUltraNarrow: false,
    isCompactHeight: false,
    isUltraCompactHeight: false,
    leftPanelWidth: 30,
    rightPanelWidth: 70,
    contentHeight: 28,
    servicesPanelHeight: 10,
    systemPanelHeight: 0,
    detailPanelHeight: 12,
    globalLogsPanelHeight: 12,
    maxServiceLogs: 5,
    maxGlobalLogs: 8
  };
  let latestState = initialState;
  const clickManagerRef = { current: null } as React.RefObject<ClickManagerContextValue | null>;

  const Harness: React.FC = () => {
    const [state, dispatch] = useReducer(dashboardReducer, initialState);
    latestState = state;
    useTerminalInput({ state, viewport, dispatch, exit: () => {}, clickManagerRef });

    return (
      <ClickProvider clickManagerRef={clickManagerRef}>
        <>
          <ServiceDetailPanel
            service={service}
            height={12}
            panelWidth={70}
            isFocused
            selectedLogId="wheel-json"
            scrollOffset={state.serviceLogScroll}
            jsonLineScrollById={state.serviceJsonLineScrollById}
            expandedLogIds={state.serviceExpandedLogIds}
            onFocus={() => dispatch({ type: 'SET_ACTIVE_PANEL', panel: 'serviceLogs' })}
          />
          <GlobalLogsPanel
            logs={state.globalLogs}
            height={12}
            panelWidth={70}
            isFocused
            selectedLogId="wheel-json"
            scrollOffset={state.globalLogScroll}
            jsonLineScroll={state.globalJsonLineScroll}
            expandedLogIds={state.globalExpandedLogIds}
            onFocus={() => dispatch({ type: 'SET_ACTIVE_PANEL', panel: 'globalLogs' })}
          />
        </>
      </ClickProvider>
    );
  };

  const { unmount } = render(<Harness />, { stdin, stdout });
  try {
    await new Promise(resolve => setTimeout(resolve, 80));
    const findRegion = (id: string) => {
      for (let y = 1; y <= 30; y++) {
        for (let x = 1; x <= 100; x++) {
          const region = clickManagerRef.current?.findRegionAt(x, y);
          if (region?.id === id) return region;
        }
      }
      throw new Error(`Missing expanded JSON line region: ${id}`);
    };

    const serviceLogRow = findRegion('service-log-row-0');
    stdin.write(`\x1b[<64;${Math.max(serviceLogRow.minX + 1, viewport.leftPanelWidth + 2)};${serviceLogRow.minY}M`);
    await new Promise(resolve => setTimeout(resolve, 30));
    assert.strictEqual(latestState.serviceLogScroll, 2, 'Service wheel should scroll the outer log list');
    assert.strictEqual(
      latestState.serviceJsonLineScrollById['wheel-json'],
      1,
      'Service wheel should leave the JSON line offset unchanged'
    );
    stdin.write('\x1b[6~');
    await new Promise(resolve => setTimeout(resolve, 30));
    assert.strictEqual(latestState.serviceLogScroll, 0, 'PageDown should scroll past expanded service JSON');
    assert.strictEqual(latestState.serviceJsonLineScrollById['wheel-json'], 1);

    const globalLogRow = findRegion('global-log-row-0');
    stdin.write(`\x1b[<64;${Math.max(globalLogRow.minX + 1, viewport.leftPanelWidth + 2)};${globalLogRow.minY}M`);
    await new Promise(resolve => setTimeout(resolve, 30));
    assert.strictEqual(latestState.globalLogScroll, 2, 'Global wheel should scroll the outer log list');
    assert.strictEqual(latestState.globalJsonLineScroll, 1, 'Global wheel should leave the JSON line offset unchanged');
  } finally {
    unmount();
  }
}

async function runMouseClickTests() {
  console.log('--- STARTING SGR MOUSE & TOUCHPAD CLICK VERIFICATION ---');

  const stdin = new PassThrough() as any;
  stdin.setRawMode = () => {};
  stdin.ref = () => {};
  stdin.unref = () => {};
  stdin.isTTY = true;

  const stdout = new PassThrough() as any;
  stdout.isTTY = true;
  stdout.columns = 80;
  stdout.rows = 24;

  let completedConfig: MustroConfig | null = null;

  try {
    const { unmount } = render(
      <SetupWizard 
        width={80} 
        height={24} 
        onComplete={(cfg) => {
          completedConfig = cfg;
        }} 
      />,
      { stdin, stdout }
    );

    // Wait for initial render and listeners attachment
    await new Promise(r => setTimeout(r, 100));

    // TEST 1: Click "+ Add (a)" button in Left Panel at col 8, row 20
    console.log('\n[TEST 1] Sending SGR Left Click on "+ Add (a)" button (col 8, row 20)...');
    stdin.write('\x1b[<0;8;20M'); // SGR press: baseButton 0, col 8, row 20
    await new Promise(r => setTimeout(r, 80));

    // TEST 2: Click on "Name" field in Right Panel (col 45, row 6)
    console.log('[TEST 2] Sending SGR Left Click on "Name" field (col 45, row 6)...');
    stdin.write('\x1b[<0;45;6M');
    await new Promise(r => setTimeout(r, 80));

    // Type a service name "orders-service"
    console.log('[TEST 2b] Typing "orders-service" into focused Name field...');
    stdin.write('orders-service');
    await new Promise(r => setTimeout(r, 80));

    // TEST 3: Click on "Folder Path" field in Right Panel (col 45, row 7)
    console.log('[TEST 3] Sending SGR Left Click on "Folder Path" field (col 45, row 7)...');
    stdin.write('\x1b[<0;45;7M');
    await new Promise(r => setTimeout(r, 80));

    // Type path "./services/orders"
    console.log('[TEST 3b] Typing "./services/orders" into focused Path field...');
    stdin.write('./services/orders');
    await new Promise(r => setTimeout(r, 80));

    // TEST 4: Click on "Command" field in Right Panel (col 45, row 8)
    console.log('[TEST 4] Sending SGR Left Click on "Command" field (col 45, row 8)...');
    stdin.write('\x1b[<0;45;8M');
    await new Promise(r => setTimeout(r, 80));

    // TEST 5: Click on "Auto-Start" toggle (col 45, row 10)
    console.log('[TEST 5] Sending SGR Left Click on "Auto-Start" toggle (col 45, row 10)...');
    stdin.write('\x1b[<0;45;10M'); // should toggle from true to false
    await new Promise(r => setTimeout(r, 80));

    // TEST 6: Click "+ Add to Registry" button (col 40, row 12)
    console.log('[TEST 6] Sending SGR Left Click on "+ Add to Registry" button (col 40, row 12)...');
    stdin.write('\x1b[<0;40;12M');
    await new Promise(r => setTimeout(r, 80));

    // TEST 7: Click "▶ Save & Launch" CTA button in Left Panel (col 15, row 22)
    console.log('[TEST 7] Sending SGR Left Click on "Save & Launch" CTA (col 15, row 22)...');
    stdin.write('\x1b[<0;15;22M');
    await new Promise(r => setTimeout(r, 120));

    unmount();

    if (completedConfig) {
      console.log('\n✅ TEST PASSED: SetupWizard successfully saved config and launched via mouse clicks!');
      console.log('Saved config summary:', {
        name: completedConfig.name,
        servicesCount: completedConfig.services.length,
        services: completedConfig.services.map(s => ({ name: s.name, path: s.path, cmd: s.command, auto: s.autoStart }))
      });
      await runExpandedJsonMouseSelectionTest();
      await runExpandedJsonWheelScrollTest();
      console.log('✅ TEST PASSED: Mouse drag selected an exact range across expanded JSON lines!');
    } else {
      console.error('\n❌ TEST FAILED: onComplete was not triggered by mouse clicks.');
      process.exit(1);
    }
  } finally {
    try {
      if (fs.existsSync('config.mustro.json')) {
        fs.unlinkSync('config.mustro.json');
      }
    } catch {}
  }
}

runMouseClickTests().catch(err => {
  console.error('Error during test:', err);
  process.exit(1);
});

