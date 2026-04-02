import { invoke } from "@tauri-apps/api/tauri";

export type OperationalLogEvent =
  | "license_apply_success"
  | "license_apply_failed"
  | "parse_error"
  | "validation_error";

export type OperationalLogPayload = {
  timestamp: string;
  event: OperationalLogEvent;
  source: "paste" | "file";
  inputLength?: number;
  reason?: string;
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
