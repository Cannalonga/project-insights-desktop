import { readBinaryFile } from "@tauri-apps/api/fs";

const MAX_INPUT_FILE_BYTES = 25 * 1024 * 1024;
const MIN_INPUT_FILE_BYTES = 1;
const OLE_SIGNATURE = [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1];

export class InputFileValidationError extends Error {
  code = "INPUT_FILE_INVALID" as const;

  constructor(message: string) {
    super(message);
    this.name = "InputFileValidationError";
  }
}

export type InputFileValidationResult = {
  extension: ".mpp" | ".xml";
  mimeType: "application/vnd.ms-project" | "application/xml";
  sizeBytes: number;
};

function getExtension(filePath: string): ".mpp" | ".xml" | null {
  const normalized = filePath.trim().toLowerCase();

  if (normalized.endsWith(".mpp")) {
    return ".mpp";
  }

  if (normalized.endsWith(".xml")) {
    return ".xml";
  }

  return null;
}

function startsWithSignature(bytes: Uint8Array, signature: number[]): boolean {
  if (bytes.length < signature.length) {
    return false;
  }

  return signature.every((value, index) => bytes[index] === value);
}

function decodeTextPrefix(bytes: Uint8Array): string {
  const prefix = bytes.slice(0, Math.min(bytes.length, 512));
  return new TextDecoder("utf-8", { fatal: false }).decode(prefix).trimStart();
}

function detectMimeType(bytes: Uint8Array): InputFileValidationResult["mimeType"] | null {
  if (startsWithSignature(bytes, OLE_SIGNATURE)) {
    return "application/vnd.ms-project";
  }

  const textPrefix = decodeTextPrefix(bytes);
  if (textPrefix.startsWith("<?xml") || textPrefix.startsWith("<Project") || textPrefix.startsWith("<project")) {
    return "application/xml";
  }

  return null;
}

export async function validateInputFile(filePath: string): Promise<InputFileValidationResult> {
  const extension = getExtension(filePath);
  if (!extension) {
    throw new InputFileValidationError("Arquivo inválido. Use um arquivo .mpp válido.");
  }

  const bytes = await readBinaryFile(filePath);
  const sizeBytes = bytes.length;

  if (sizeBytes < MIN_INPUT_FILE_BYTES) {
    throw new InputFileValidationError("O arquivo selecionado está vazio ou corrompido.");
  }

  if (sizeBytes > MAX_INPUT_FILE_BYTES) {
    throw new InputFileValidationError("O arquivo excede o limite de 25 MB suportado para processamento seguro.");
  }

  const mimeType = detectMimeType(bytes);
  if (!mimeType) {
    throw new InputFileValidationError("O arquivo selecionado não possui estrutura válida para processamento seguro.");
  }

  if (extension === ".mpp" && mimeType !== "application/vnd.ms-project") {
    throw new InputFileValidationError("O arquivo .mpp selecionado parece corrompido ou com formato inválido.");
  }

  if (extension === ".xml" && mimeType !== "application/xml") {
    throw new InputFileValidationError("O arquivo .xml selecionado parece corrompido ou com formato inválido.");
  }

  return {
    extension,
    mimeType,
    sizeBytes,
  };
}
