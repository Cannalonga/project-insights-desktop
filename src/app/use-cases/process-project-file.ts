import { convertMPPToXML } from "./convert-mpp-to-xml";
import { processMPPWithHistory } from "./process-mpp-with-history";
import type { ProcessInput, ProcessResult } from "./process-mpp";
import { validateInputFile } from "./validate-input-file";

const PROCESSING_TIMEOUT_MS = 180_000;

function isMPPFile(filePath?: string): boolean {
  return Boolean(filePath?.toLowerCase().endsWith(".mpp"));
}

function buildUnsupportedInputError(): Error {
  return new Error("A entrada do CannaConverter 2.0 aceita apenas arquivos .mpp.");
}

export class ProcessingTimeoutError extends Error {
  code = "PROCESSING_TIMEOUT" as const;

  constructor(message: string) {
    super(message);
    this.name = "ProcessingTimeoutError";
  }
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number, message: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new ProcessingTimeoutError(message));
    }, timeoutMs);

    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}

export async function processProjectFile(
  input: ProcessInput,
  convertMppToXml: (filePath: string) => Promise<string> = convertMPPToXML,
  validateFile: (filePath: string) => Promise<unknown> = validateInputFile,
): Promise<ProcessResult> {
  if (!input.filePath || !isMPPFile(input.filePath) || input.xmlContent !== undefined) {
    throw buildUnsupportedInputError();
  }

  const filePath = input.filePath;
  await validateFile(filePath);

  const xmlContent = await withTimeout(
    convertMppToXml(filePath),
    PROCESSING_TIMEOUT_MS,
    "O processamento excedeu o tempo limite de seguranca para este arquivo.",
  );

  return withTimeout(
    processMPPWithHistory({
      filePath,
      xmlContent,
    }),
    PROCESSING_TIMEOUT_MS,
    "O processamento excedeu o tempo limite de seguranca para este arquivo.",
  );
}
