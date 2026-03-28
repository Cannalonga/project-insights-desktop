import { invoke } from "@tauri-apps/api/tauri";

export class MPPConversionError extends Error {
  code = "MPP_CONVERSION_FAILED" as const;

  constructor(message: string) {
    super(message);
    this.name = "MPPConversionError";
  }
}

const DEFAULT_MPP_ERROR_MESSAGE =
  "Não foi possível processar o arquivo .mpp. Formato não suportado ou inválido.";

export async function convertMPPToXML(filePath: string): Promise<string> {
  try {
    const xmlContent = await invoke<string>("convert_mpp_to_mspdi", { inputPath: filePath });

    if (!xmlContent || !xmlContent.trim()) {
      throw new MPPConversionError(DEFAULT_MPP_ERROR_MESSAGE);
    }

    return xmlContent;
  } catch (err) {
    console.error("[convertMPPToXML] raw conversion error:", err);

    if (err instanceof MPPConversionError) {
      throw err;
    }

    throw new MPPConversionError(DEFAULT_MPP_ERROR_MESSAGE);
  }
}
