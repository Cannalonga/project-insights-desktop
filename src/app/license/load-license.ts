import { invoke } from "@tauri-apps/api/tauri";

export type LoadLicenseResult =
  | { status: "missing" }
  | { status: "loaded"; contents: string }
  | { status: "invalid" };

export async function loadLicense(): Promise<LoadLicenseResult> {
  try {
    const contents = await invoke<string | null>("load_license_content");
    if (!contents) {
      return { status: "missing" };
    }

    return { status: "loaded", contents };
  } catch {
    return { status: "invalid" };
  }
}
