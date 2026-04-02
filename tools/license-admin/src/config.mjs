import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const TOOL_SRC_DIR = dirname(fileURLToPath(import.meta.url));
const TOOL_ROOT_DIR = resolve(TOOL_SRC_DIR, "..");
const REPO_ROOT_DIR = resolve(TOOL_ROOT_DIR, "..", "..");

export const DEFAULT_BASE_DIR = "D:\\LICENCAS_CANNACONVERTER2_0";
export const DEFAULT_PRIVATE_KEY_PATH = resolve(DEFAULT_BASE_DIR, "private_key", "private_key.pem");
export const DEFAULT_ISSUED_DIR = resolve(DEFAULT_BASE_DIR, "issued");
export const DEFAULT_LOGS_DIR = resolve(DEFAULT_BASE_DIR, "logs");
export const DEFAULT_LICENSE_CONTRACT_PATH = resolve(REPO_ROOT_DIR, "shared", "license-contract.json");
export const DEFAULT_LOG_FILE = "license-admin.log";
