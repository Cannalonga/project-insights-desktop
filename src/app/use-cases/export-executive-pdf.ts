import { invoke } from "@tauri-apps/api/tauri";

export async function exportExecutivePdf(htmlContent: string, outputPath: string): Promise<void> {
  await invoke("export_executive_pdf", {
    htmlContent,
    outputPath,
  });
}
