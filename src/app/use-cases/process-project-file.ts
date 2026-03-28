import { readTextFile } from "@tauri-apps/api/fs";

import { appendProcessingLog, type ProcessingLogPayload } from "./processing-log";
import { convertMPPToXML, MPPConversionError } from "./convert-mpp-to-xml";
import { processMPPWithHistory } from "./process-mpp-with-history";
import type { ProcessInput, ProcessResult } from "./process-mpp";
import { type InputFileValidationResult, validateInputFile } from "./validate-input-file";

const MPP_FALLBACK_MESSAGE =
  "Nao foi possivel processar este arquivo diretamente. Algumas versoes do MS Project podem gerar variacoes no formato. Para garantir compatibilidade total, exporte o arquivo como XML (MSPDI) e tente novamente.";

export type ProcessingStage =
  | "validating_input"
  | "reading_xml"
  | "converting_mpp"
  | "generating_analysis"
  | "completed";

type ProcessProjectFileOptions = {
  onStage?: (stage: ProcessingStage) => void;
  now?: () => number;
  logEvent?: (payload: ProcessingLogPayload) => Promise<void>;
};

function isSupportedFile(filePath?: string): boolean {
  const normalized = filePath?.toLowerCase() ?? "";
  return normalized.endsWith(".mpp") || normalized.endsWith(".xml");
}

function buildUnsupportedInputError(): Error {
  return new Error("A entrada do Project Insights aceita arquivos .mpp ou .xml (MSPDI).");
}

function getErrorDetails(error: unknown): { message: string; stack?: string } {
  if (error instanceof Error) {
    return {
      message: error.message,
      stack: error.stack,
    };
  }

  return {
    message: String(error),
  };
}

function emitStage(options: ProcessProjectFileOptions | undefined, stage: ProcessingStage): void {
  options?.onStage?.(stage);
}

async function emitLog(
  options: ProcessProjectFileOptions | undefined,
  payload: ProcessingLogPayload,
): Promise<void> {
  const logger = options?.logEvent ?? appendProcessingLog;
  await logger(payload);
}

export class ProjectFileGuidanceError extends Error {
  code = "PROJECT_FILE_GUIDANCE" as const;

  constructor(message: string) {
    super(message);
    this.name = "ProjectFileGuidanceError";
  }
}

export async function processProjectFile(
  input: ProcessInput,
  convertMppToXml: (filePath: string) => Promise<string> = convertMPPToXML,
  validateFile: (filePath: string) => Promise<InputFileValidationResult> = validateInputFile,
  readXmlFile: (filePath: string) => Promise<string> = readTextFile,
  options?: ProcessProjectFileOptions,
): Promise<ProcessResult> {
  if (!input.filePath || !isSupportedFile(input.filePath)) {
    throw buildUnsupportedInputError();
  }

  const now = options?.now ?? Date.now;
  const filePath = input.filePath;
  const startedAt = now();
  let currentStage: ProcessingStage = "validating_input";
  let validation: InputFileValidationResult | null = null;

  await emitLog(options, {
    timestamp: new Date().toISOString(),
    level: "info",
    event: "processing_started",
    stage: currentStage,
    filePath,
  });
  emitStage(options, currentStage);

  try {
    validation = await validateFile(filePath);
    await emitLog(options, {
      timestamp: new Date().toISOString(),
      level: "info",
      event: "input_validated",
      stage: currentStage,
      filePath,
      extension: validation.extension,
      mimeType: validation.mimeType,
      sizeBytes: validation.sizeBytes,
    });

    if (validation.extension === ".xml") {
      currentStage = "reading_xml";
      emitStage(options, currentStage);
      const readStartedAt = now();

      const xmlContent = input.xmlContent ?? (await readXmlFile(filePath));
      const readXmlMs = now() - readStartedAt;

      currentStage = "generating_analysis";
      emitStage(options, currentStage);
      const analysisStartedAt = now();
      const result = await processMPPWithHistory({
        filePath,
        xmlContent,
      });
      const analysisMs = now() - analysisStartedAt;
      const totalMs = now() - startedAt;

      currentStage = "completed";
      emitStage(options, currentStage);
      await emitLog(options, {
        timestamp: new Date().toISOString(),
        level: "info",
        event: "processing_completed",
        stage: currentStage,
        filePath,
        extension: validation.extension,
        mimeType: validation.mimeType,
        sizeBytes: validation.sizeBytes,
        readXmlMs,
        analysisMs,
        totalMs,
      });

      return result;
    }

    currentStage = "converting_mpp";
    emitStage(options, currentStage);
    const conversionStartedAt = now();
    let xmlContent: string;

    try {
      xmlContent = await convertMppToXml(filePath);
    } catch (error) {
      const totalMs = now() - startedAt;
      await emitLog(options, {
        timestamp: new Date().toISOString(),
        level: "error",
        event: "processing_failed",
        stage: currentStage,
        filePath,
        extension: validation.extension,
        mimeType: validation.mimeType,
        sizeBytes: validation.sizeBytes,
        totalMs,
        ...getErrorDetails(error),
      });

      if (error instanceof MPPConversionError) {
        throw new ProjectFileGuidanceError(MPP_FALLBACK_MESSAGE);
      }

      throw error;
    }

    const conversionMs = now() - conversionStartedAt;
    currentStage = "generating_analysis";
    emitStage(options, currentStage);
    const analysisStartedAt = now();

    const result = await processMPPWithHistory({
      filePath,
      xmlContent,
    });

    const analysisMs = now() - analysisStartedAt;
    const totalMs = now() - startedAt;

    currentStage = "completed";
    emitStage(options, currentStage);
    await emitLog(options, {
      timestamp: new Date().toISOString(),
      level: "info",
      event: "processing_completed",
      stage: currentStage,
      filePath,
      extension: validation.extension,
      mimeType: validation.mimeType,
      sizeBytes: validation.sizeBytes,
      conversionMs,
      analysisMs,
      totalMs,
    });

    return result;
  } catch (error) {
    if (!(error instanceof ProjectFileGuidanceError)) {
      await emitLog(options, {
        timestamp: new Date().toISOString(),
        level: "error",
        event: "processing_failed",
        stage: currentStage,
        filePath,
        extension: validation?.extension,
        mimeType: validation?.mimeType,
        sizeBytes: validation?.sizeBytes ?? null,
        totalMs: now() - startedAt,
        ...getErrorDetails(error),
      });
    }

    throw error;
  }
}
