import React from 'react';
import { renderToString } from 'ink';
import Mustro from '../src/Mustro.js';

console.log('--- RENDERING MUSTRO AT 110x36 (USER SCREENSHOT DIMENSIONS) ---');
const output = renderToString(<Mustro width={110} height={36} />);
const lines = output.split('\n');
console.log(`Rendered line count: ${lines.length}`);

// Print the first 36 lines cleanly
lines.slice(0, 36).forEach((line, i) => {
  console.log(`[L${String(i + 1).padStart(2, '0')}] ${line}`);
});

// Check for double colons
const hasDoubleColon = output.includes('::');
console.log('\nHas double colon (::3000)?', hasDoubleColon ? 'FAIL: Found double colon' : 'PASS: Clean single colons');

console.log('\n✅ PROPORTIONS TEST COMPLETED');

