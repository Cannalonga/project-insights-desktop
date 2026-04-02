import { appendFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";

import { DEFAULT_LOG_FILE } from "./config.mjs";

export function appendOperationLog(logsDir, entry) {
  mkdirSync(logsDir, { recursive: true });
  const safeEntry = {
    timestamp: new Date().toISOString(),
    command: entry.command,
    licenseId: entry.licenseId ?? null,
    status: entry.status,
    filePath: entry.filePath ?? null,
  };

  appendFileSync(join(logsDir, DEFAULT_LOG_FILE), `${JSON.stringify(safeEntry)}\n`, "utf8");
}
