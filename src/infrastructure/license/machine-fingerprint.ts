import { invoke } from "@tauri-apps/api/tauri";

export async function getMachineFingerprint(): Promise<string> {
  const fingerprint = await invoke<string>("get_machine_fingerprint");
  if (typeof fingerprint !== "string" || fingerprint.trim().length < 32) {
    throw new Error("Invalid machine fingerprint.");
  }

  return fingerprint.trim();
}
