import { open } from "@tauri-apps/api/dialog";

import type { ProcessInput } from "../../app/use-cases/process-mpp";

type FilePickerProps = {
  loading: boolean;
  processFile: (input: ProcessInput) => Promise<void>;
  reportError: (message: string) => void;
};

export function FilePicker({ loading, processFile, reportError }: FilePickerProps) {
  async function handleSelectFile(): Promise<void> {
    try {
      const filePath = await open({
        multiple: false,
        filters: [{ name: "Project Files", extensions: ["mpp", "xml"] }],
      });

      if (!filePath || Array.isArray(filePath)) {
        return;
      }

      await processFile({ filePath });
    } catch {
      reportError("Nao foi possivel selecionar ou abrir o arquivo agora.");
    }
  }

  return (
    <div>
      <button
        type="button"
        className="primary-button"
        onClick={() => void handleSelectFile()}
        disabled={loading}
        aria-busy={loading}
      >
        {loading ? "Processando..." : "Selecionar arquivo"}
      </button>
      <p className="muted-text" style={{ margin: "10px 0 0" }}>
        Entrada aceita: <code>.mpp</code> ou <code>.xml</code> (MSPDI), ate 25 MB.
      </p>
    </div>
  );
}
