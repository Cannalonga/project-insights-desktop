import { open } from "@tauri-apps/api/dialog";

import type { ProcessInput } from "../../app/use-cases/process-mpp";

type FilePickerProps = {
  processFile: (input: ProcessInput) => Promise<void>;
  reportError: (message: string) => void;
};

export function FilePicker({ processFile, reportError }: FilePickerProps) {
  async function handleSelectFile(): Promise<void> {
    try {
      const filePath = await open({
        multiple: false,
        filters: [{ name: "MPP Files", extensions: ["mpp"] }],
      });

      if (!filePath || Array.isArray(filePath)) {
        return;
      }

      await processFile({ filePath });
    } catch (err) {
      reportError("Não foi possível selecionar ou abrir o arquivo .mpp.");
    }
  }

  return (
    <div>
      <button type="button" className="primary-button" onClick={() => void handleSelectFile()}>
        Selecionar arquivo
      </button>
      <p className="muted-text" style={{ margin: "10px 0 0" }}>
        Entrada aceita: <code>.mpp</code>, até 25 MB.
      </p>
    </div>
  );
}
