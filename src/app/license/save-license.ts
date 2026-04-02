import { invoke } from "@tauri-apps/api/tauri";

export async function saveLicense(contents: string): Promise<void> {
  await invoke("save_license_content", { contents });
}
