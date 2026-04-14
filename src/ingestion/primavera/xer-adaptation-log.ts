import { invoke } from "@tauri-apps/api/tauri";

import type {
  XerAdaptationDiagnosticCode,
  XerAdaptationDiagnosticSeverity,
} from "./adapt-xer-to-project";

export type XerAdaptationLogEntry = {
  timestamp: string;
  source: "primavera-xer";
  event: string;
  severity: XerAdaptationDiagnosticSeverity;
  message: string;
  selectedProjectId?: string;
  diagnosticCode?: XerAdaptationDiagnosticCode;
  entityType?: string;
  entityId?: string;
  context?: Record<string, unknown>;
};

export type XerAdaptationLogWriter = (entry: XerAdaptationLogEntry) => void | Promise<void>;

export async function appendXerAdaptationLog(entry: XerAdaptationLogEntry): Promise<void> {
  const payload = JSON.stringify(entry);
  const tauriIpc = (window as Window & { __TAURI_IPC__?: unknown }).__TAURI_IPC__;

  if (typeof tauriIpc !== "function") {
    console.info("[appendXerAdaptationLog] tauri ipc unavailable; using console fallback", entry);
    return;
  }

  try {
    await invoke("append_processing_log", { entry: payload });
  } catch (error) {
    console.warn("[appendXerAdaptationLog] failed to persist XER adaptation log entry", {
      entry,
      error,
    });
  }
}
