
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const isDebugEnabled = () => process.env.MUSTRO_DEBUG === "1" || process.env.MUSTRO_DEBUG === "true";
const logFile = path.join(os.tmpdir(), "mustro-debug.log");

function writeLog(level: string, message: string): void {
  if (!isDebugEnabled()) return;
  const timestamp = new Date().toISOString();
  const log = `[${timestamp}] [${level}] ${message}\n`;

  try {
    fs.appendFile(logFile, log, () => {
      // Intentionally silent on error to prevent corrupting the TUI terminal screen
    });
  } catch {
    // Ignore synchronous write errors
  }
}

export const logger = {
  info: (message: string) => writeLog("INFO", message),
  warn: (message: string) => writeLog("WARN", message),
  error: (message: string) => writeLog("ERROR", message),
};
