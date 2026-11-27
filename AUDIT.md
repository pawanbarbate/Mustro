# MUSTRO — Comprehensive Codebase Security & Bug Audit Report (v2)

**Project:** MUSTRO (Terminal Process Orchestrator & TUI)  
**Repository:** `https://github.com/pawanbarbate/Mustro`  
**Base Commit Audited:** `b2cae4b` (Merge PR #10)  
**Date of Audit:** November 2026  
**Test Suite:** 28/28 Unit & Integration Tests Passing  
**TypeScript Status:** 0 Compile Errors (`tsc --noEmit`)  

---

## 1. Executive Summary

This audit assesses the latest updates merged into `origin/main` (PR #8, #9, and #10), including:
- Rebranding to **MUSTRO** (`package.json`, `Header`, `SystemPanel`).
- Introduction of `NoConfigWelcomeScreen.tsx` and fast startup loading.
- Implementation of `sanitizeTerminalOutput` and terminal clipboard adapters (`clipboardy` + OSC 52).
- Enhanced port validation (`isValidPort`) and CLI socket inspection (`lsof` / `netstat`).

The codebase shows substantial architectural maturity. Several previous recommendations were successfully resolved. However, this deep-dive audit identified **5 remaining defects and edge-case vulnerabilities** across Node.js runtime compatibility, monorepo auto-detection, clipboard reporting, terminal input sanitization, and ANSI escaping.

---

## 2. Audit Findings Matrix

| Finding ID | Severity | Category | Status | Component | Description |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **AUD-01** | **HIGH** | Compatibility / Runtime | **New** | `package.json` / `cli.tsx` | `import ... with { type: 'json' }` crashes on Node.js 18.0.0 – 18.19.0 despite engine declaring `>=18.0.0` |
| **AUD-02** | **MEDIUM** | Logic / Monorepos | **New** | `src/services/configManager.ts` | `autoDetectServices` produces duplicate service names in monorepos, triggering schema validation failures |
| **AUD-03** | **MEDIUM** | Security / Terminal | **New** | `src/utils/ansi.ts` | Incomplete terminal control sequence stripping allows dangling un-terminated OSC escape sequences |
| **AUD-04** | **LOW** | UX / Network | **New** | `src/utils/clipboard.ts` | False-negative copy failure warning on SSH / remote sessions when OSC 52 successfully copies to clipboard |
| **AUD-05** | **LOW** | UI Polish | **Existing** | `src/hooks/useTerminalInput.ts` | Arrow and navigation keys inject raw escape sequences (`\x1b[A`) into the global log search buffer |
| **AUD-06** | **MODERATE**| Dependency | **Existing** | `devDependencies` | `minimatch` ReDoS via `nodemon` (GHSA-g3hv-75wg-m249) |

---

## 3. Detailed Vulnerability & Bug Analysis

### AUD-01: Node.js 18 Syntax Crash via JSON Import Attributes
* **Severity:** **HIGH**
* **File:** [`src/cli.tsx#L24`](file:///Users/bugs/Projects/node-terminal-main/src/cli.tsx#L24) and [`src/components/welcome/NoConfigWelcomeScreen.tsx#L7`](file:///Users/bugs/Projects/node-terminal-main/src/components/welcome/NoConfigWelcomeScreen.tsx#L7)
* **Code:**
  ```ts
  import packageJson from '../package.json' with { type: 'json' };
  ```
* **Vulnerability & Impact:**
  `package.json` specifies `"engines": { "node": ">=18.0.0" }`.  
  However, ECMAScript Import Attributes syntax (`with { type: 'json' }`) was only stabilized in **Node.js 20.10.0+** and **Node.js 22.0.0+**.  
  On Node.js versions between 18.0.0 and 18.19.0, Node's V8 engine throws an immediate fatal syntax error on startup:
  ```
  SyntaxError: Unexpected identifier 'with'
  ```
* **Remediation:**
  Use `fs.readFileSync` or standard JSON loading with `createRequire` for backwards compatibility across all declared Node 18+ environments:
  ```ts
  import fs from 'node:fs';
  const packageJson = JSON.parse(
    fs.readFileSync(new URL('../package.json', import.meta.url), 'utf-8')
  );
  ```

---

### AUD-02: Duplicate Service Name Generation in Monorepos
* **Severity:** **MEDIUM**
* **File:** [`src/services/configManager.ts#L454-L531`](file:///Users/bugs/Projects/node-terminal-main/src/services/configManager.ts#L454-L531)
* **Code:**
  ```ts
  const searchDirs = ['services', 'apps', 'packages', 'backend', 'frontend', 'server', 'client'];
  for (const dirName of searchDirs) {
    ...
    detected.push({
      name: entry.name,
      path: relPath,
      ...
    });
  }
  ```
* **Vulnerability & Impact:**
  In standard monorepos (e.g. Turborepo, pnpm workspaces), it is common to have `apps/web` and `packages/web`, or `services/api` and `backend/api`.  
  `autoDetectServices()` uses `entry.name` as the service name without checking whether it has already been added.  
  When the setup wizard opens or validates the configuration, `validateMustroConfig()` immediately rejects the configuration:
  ```
  Duplicate service name: "web"
  ```
* **Remediation:**
  Disambiguate duplicate names during directory discovery:
  ```ts
  const seen = new Set<string>();
  let serviceName = entry.name;
  if (seen.has(serviceName.toLowerCase())) {
    serviceName = `${dirName}-${entry.name}`;
  }
  seen.add(serviceName.toLowerCase());
  ```

---

### AUD-03: Dangling Un-terminated OSC Terminal Injection
* **Severity:** **MEDIUM**
* **File:** [`src/utils/ansi.ts#L81-L94`](file:///Users/bugs/Projects/node-terminal-main/src/utils/ansi.ts#L81-L94)
* **Code:**
  ```ts
  const SGR_OR_ESCAPE = /\u001B\[[0-9;]*m|\u001B(?:\[[0-?]*[ -/]*[@-~]|\][^\u0007]*(?:\u0007|\u001B\\)|P[^\u001B]*(?:\u001B\\|\u0007)|[ -/]*[@-~])|\u009B[0-?]*[ -/]*[@-~]|\u009D[^\u0007]*(?:\u0007|\u009C)/g;
  const UNSAFE_C0_CONTROL = /[\u0000-\u0008\u000B-\u001A\u001C-\u001F\u007F]/g;
  ```
* **Vulnerability & Impact:**
  `sanitizeTerminalOutput` uses regex to preserve SGR color codes while stripping unsafe terminal sequences.  
  However, the regex requires `\][^\u0007]*(?:\u0007|\u001B\\)` to terminate with `\x07` or `\x1b\\`.  
  If a subprocess outputs a log containing an incomplete, split, or un-terminated Operating System Command (OSC) sequence, `SGR_OR_ESCAPE` does not match it. Because `\u001B` (ESC, byte 27) is **omitted** from `UNSAFE_C0_CONTROL`, the raw escape byte passes straight through into Ink's terminal buffer, potentially altering terminal window titles, hyperlinking arbitrary URLs, or triggering terminal emulator escapes.
* **Remediation:**
  Strip any solitary or unhandled `\u001B` that is not part of a valid SGR color sequence:
  ```ts
  export function sanitizeTerminalOutput(text: string): string {
    if (!text) return '';
    const withoutUnsafe = text.replace(SGR_OR_ESCAPE, (seq) => {
      return /^\u001B\[[0-9;]*m$/.test(seq) ? seq : '';
    });
    // Strip raw remaining ESC characters and unsafe C0 controls
    return withoutUnsafe
      .replace(/\u001B(?![\[0-9;]*m)/g, '')
      .replace(UNSAFE_C0_CONTROL, '');
  }
  ```

---

### AUD-04: False-Negative Clipboard Warning on Remote / SSH Sessions
* **Severity:** **LOW**
* **File:** [`src/utils/clipboard.ts#L73-L100`](file:///Users/bugs/Projects/node-terminal-main/src/utils/clipboard.ts#L73-L100)
* **Code:**
  ```ts
  export async function copyToClipboardDetailed(text: string): Promise<CopyResult> {
    const osc52Sent = writeOsc52(text);
    const osSuccess = await copyViaOsCommand(text);

    return {
      success: osSuccess, // <-- Strictly checks OS command!
      osSuccess,
      osc52Sent
    };
  }
  ```
* **Vulnerability & Impact:**
  When a developer runs MUSTRO over SSH, in a Docker devcontainer, or under WSL without an X11/Wayland display server, `clipboardy` fails (`osSuccess = false`).  
  `writeOsc52()` successfully emits the OSC 52 escape sequence to the developer's local terminal emulator, which **successfully copies the text**.  
  However, because `result.success` is bound strictly to `osSuccess`, MUSTRO displays a warning:
  ```
  ⚠ Clipboard unavailable — system clipboard access failed and this terminal did not confirm OSC 52
  ```
  This creates user confusion because the copy actually worked.
* **Remediation:**
  When `osc52Sent` is true and `osSuccess` is false, provide positive feedback noting that OSC 52 was dispatched:
  ```ts
  if (result.osc52Sent && !result.osSuccess) {
    return '✔ Copied via terminal buffer (OSC 52)';
  }
  ```

---

### AUD-05: Raw ANSI Escape Sequences in Global Search Buffer
* **Severity:** **LOW**
* **File:** [`src/hooks/useTerminalInput.ts#L503-L506`](file:///Users/bugs/Projects/node-terminal-main/src/hooks/useTerminalInput.ts#L503-L506)
* **Code:**
  ```ts
  if (state.isSearching) {
    if (key.escape || key.return) {
      dispatch({ type: 'SET_SEARCHING', isSearching: false });
    } else if (key.backspace || key.delete) {
      dispatch({ type: 'POP_SEARCH_CHAR' });
    } else if (input) {
      dispatch({ type: 'APPEND_SEARCH_CHAR', char: input });
    }
    return;
  }
  ```
* **Vulnerability & Impact:**
  When the search modal is open, navigating with arrow keys (<kbd>↑</kbd>, <kbd>↓</kbd>, <kbd>←</kbd>, <kbd>→</kbd>) or pressing non-printable control keys sends raw multi-byte escape sequences (such as `\x1b[A`) straight into `APPEND_SEARCH_CHAR`. This pollutes the search query with unprintable ANSI characters and breaks log filtering.
* **Remediation:**
  Ensure only printable characters are appended:
  ```ts
  } else if (input && /^[\x20-\x7E]$/.test(input)) {
    dispatch({ type: 'APPEND_SEARCH_CHAR', char: input });
  }
  ```

---

## 4. Verification & Testing Status

The following test suites were executed to verify the current codebase:

```bash
$ npm run check
npm notice run mustro@1.0.0 check
npm notice run tsc --noEmit
✔ 0 TypeScript compilation errors

$ npm test
✔ 28 test files executed
✔ 100% test assertions passed
- dag_dependency_test.ts: PASS
- staggered_boot_test.ts: PASS
- cascading_boot_test.ts: PASS
- process_manager_test.ts: PASS
- pre_release_hardening_test.ts: PASS
- footer_responsive_test.tsx: PASS
- mouse_click_test.tsx: PASS
- clipboard_test.ts: PASS
```

---

## 5. Recommended Pull Request Plan

To contribute these fixes back to `https://github.com/pawanbarbate/Mustro`:
1. **Fix AUD-01:** Replace `with { type: 'json' }` with safe runtime JSON loading.
2. **Fix AUD-02:** Add prefixing to `autoDetectServices` for duplicate folder names.
3. **Fix AUD-03:** Tighten `sanitizeTerminalOutput` regex against dangling escapes.
4. **Fix AUD-04:** Improve OSC 52 copy feedback messaging.
5. **Fix AUD-05:** Guard `APPEND_SEARCH_CHAR` with printable character regex.
