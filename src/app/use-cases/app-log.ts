import { invoke } from "@tauri-apps/api/tauri";

export type OperationalLogEvent =
  | "license_apply_success"
  | "license_apply_failed"
  | "license_state_loaded"
  | "license_state_load_failed"
  | "license_refresh_result"
  | "parse_error"
  | "validation_error";

export type LicensingLogAction =
  | "apply_license"
  | "validate_license"
  | "load_stored_state"
  | "refresh_license"
  | "offline_reopen";

export type LicensingLogOutcome = "success" | "failure" | "denied" | "fallback_offline";

export type LicensingLogErrorCategory =
  | "network"
  | "license_input"
  | "license_state"
  | "backend_response"
  | "config"
  | "unexpected";

export type LicensingLogClassifiedReason =
  | "dns"
  | "tls"
  | "connect_timeout"
  | "read_timeout"
  | "connection_refused"
  | "proxy_or_intercepted"
  | "http_4xx"
  | "http_5xx"
  | "invalid_response"
  | "offline"
  | "unknown_network";

export type LicensingLogStage = "dns" | "tls" | "connect" | "response" | "parse" | "unknown";

export type OperationalLogPayload = {
  timestamp: string;
  event: OperationalLogEvent;
  source: "paste" | "file";
  action?: LicensingLogAction;
  outcome?: LicensingLogOutcome;
  inputLength?: number;
  reason?: string;
  classifiedReason?: LicensingLogClassifiedReason;
  message?: string;
  errorName?: string;
  rawErrorName?: string;
  rawErrorMessage?: string;
  rawErrorCode?: string;
  errorCategory?: LicensingLogErrorCategory;
  operation?: "activate-license" | "validate-license";
  httpStatus?: number;
  elapsedMs?: number;
  host?: string;
  stage?: LicensingLogStage;
  hadLicensedStateBeforeFailure?: boolean;
  uiStateBefore?: string;
  uiStateAfter?: string;
  requestContext?: "local" | "remote";
  buildVersion?: string;
};

export async function appendOperationalLog(payload: OperationalLogPayload): Promise<void> {
  const entry = JSON.stringify(payload);
  const tauriIpc = (window as Window & { __TAURI_IPC__?: unknown }).__TAURI_IPC__;

  if (typeof tauriIpc !== "function") {
    console.info("[appendOperationalLog] tauri ipc unavailable; using console fallback", payload);
    return;
  }

  try {
    await invoke("append_operational_log", { entry });
  } catch (error) {
    console.warn("[appendOperationalLog] failed to persist app log entry", { error });
  }
}

export async function exportOperationalLogForUser(): Promise<string | null> {
  const tauriIpc = (window as Window & { __TAURI_IPC__?: unknown }).__TAURI_IPC__;

  if (typeof tauriIpc !== "function") {
    console.info("[exportOperationalLogForUser] tauri ipc unavailable; skipping app log export");
    return null;
  }

  try {
    return await invoke<string>("export_operational_log_for_user");
  } catch (error) {
    console.warn("[exportOperationalLogForUser] failed to export app log copy", { error });
    return null;
  }
}
