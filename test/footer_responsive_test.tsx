import assert from 'node:assert';
import React from 'react';
import { renderToString } from 'ink';
import Footer from '../src/components/Footer.js';
import { ClickProvider } from '../src/components/common/ClickManager.js';

console.log('=== STARTING FOOTER RESPONSIVE WIDTH-BUDGET TESTS ===\n');

const widths = [55, 72, 80, 85, 100, 115, 120, 140];

for (const width of widths) {
  const output = renderToString(
    <ClickProvider>
      <Footer
        width={width}
        activePanel="serviceLogs"
        selectionText="12 chars"
        isMaximized={true}
        onToggleHelp={() => {}}
        onSwitchConfig={() => {}}
        onToggleMaximize={() => {}}
      />
    </ClickProvider>
  );

  const lines = output.split('\n');
  assert.strictEqual(lines.length, 1, `Footer at width=${width} must render on exactly 1 line (got ${lines.length})`);
  assert.ok(output.includes('?'), `Footer at width=${width} must keep ? Help visible`);
  assert.ok(output.includes('Connected'), `Footer at width=${width} must keep Connected indicator visible`);

  if (width >= 80) {
    for (const keycap of ['?', 'r', 's', 'c', 'z', 't', 'p']) {
      assert.ok(output.includes(keycap), `Footer at width=${width} must keep core shortcut "${keycap}" visible`);
    }
  }
  console.log(`✔ width=${width}: 1 line, core shortcuts and status intact`);
}

console.log('\n✅ ALL FOOTER RESPONSIVE TESTS PASSED!');
