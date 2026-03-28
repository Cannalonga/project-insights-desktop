import { invoke } from "@tauri-apps/api/tauri";

export type ProcessingLogPayload = {
  timestamp: string;
  level: "info" | "error";
  event: string;
  stage?: string;
  filePath?: string;
  extension?: string;
  mimeType?: string;
  sizeBytes?: number | null;
  durationMs?: number;
  conversionMs?: number;
  readXmlMs?: number;
  analysisMs?: number;
  totalMs?: number;
  message?: string;
  stack?: string;
};

export async function appendProcessingLog(payload: ProcessingLogPayload): Promise<void> {
  const entry = JSON.stringify(payload);
  const tauriIpc = (window as Window & { __TAURI_IPC__?: unknown }).__TAURI_IPC__;

  if (typeof tauriIpc !== "function") {
    console.info("[appendProcessingLog] tauri ipc unavailable; using console fallback", payload);
    return;
  }

  try {
    await invoke("append_processing_log", { entry });
  } catch (error) {
    console.warn("[appendProcessingLog] failed to persist processing log entry", {
      payload,
      error,
    });
  }
}
