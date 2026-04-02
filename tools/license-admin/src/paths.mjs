import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";

import {
  DEFAULT_BASE_DIR,
  DEFAULT_ISSUED_DIR,
  DEFAULT_LOGS_DIR,
  DEFAULT_PRIVATE_KEY_PATH,
  DEFAULT_LICENSE_CONTRACT_PATH,
} from "./config.mjs";

export function resolveOperationalPaths(options = {}) {
  const baseDir = resolve(options.baseDir ?? DEFAULT_BASE_DIR);
  const privateKeyPath = resolve(options.privateKeyPath ?? resolve(baseDir, "private_key", "private_key.pem"));
  const issuedDir = resolve(options.issuedDir ?? resolve(baseDir, "issued"));
  const logsDir = resolve(options.logsDir ?? resolve(baseDir, "logs"));
  const licenseContractPath = resolve(options.licenseContractPath ?? DEFAULT_LICENSE_CONTRACT_PATH);

  return {
    baseDir,
    privateKeyPath,
    issuedDir,
    logsDir,
    licenseContractPath,
  };
}

export function ensureOperationalDirectories(paths) {
  mkdirSync(dirname(paths.privateKeyPath), { recursive: true });
  mkdirSync(paths.issuedDir, { recursive: true });
  mkdirSync(paths.logsDir, { recursive: true });
}
