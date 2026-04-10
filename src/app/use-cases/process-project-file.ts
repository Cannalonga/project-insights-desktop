import { readTextFile } from "@tauri-apps/api/fs";

import {
  appendProcessingLog,
  exportProcessingLogForUser,
  type ProcessingLogPayload,
} from "./processing-log";
import { convertMPPToXML } from "./convert-mpp-to-xml";
import { processMPPWithHistory } from "./process-mpp-with-history";
import type { ProcessInput, ProcessResult } from "./process-mpp";
import { type InputFileValidationResult, validateInputFile } from "./validate-input-file";
import { processProjectInput, type ProjectInputError } from "../../ingestion/shared/process-project-input";

const MPP_FALLBACK_MESSAGE =
  "Não foi possível processar este arquivo diretamente. Algumas versões do MS Project podem gerar variações no formato. Para garantir compatibilidade total, exporte o arquivo como XML (MSPDI) e tente novamente.";
const MPP_CONVERSION_FAILED_CODE = "MPP_CONVERSION_FAILED";

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
  exportUserLog?: () => Promise<string | null>;
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

async function exportUserAccessibleLog(
  options: ProcessProjectFileOptions | undefined,
): Promise<string | null> {
  const exporter = options?.exportUserLog ?? exportProcessingLogForUser;
  return exporter();
}

function buildMppFallbackMessage(userLogPath?: string | null): string {
  if (!userLogPath) {
    return MPP_FALLBACK_MESSAGE;
  }

  return `${MPP_FALLBACK_MESSAGE} Um log técnico foi salvo em ${userLogPath}.`;
}

export class ProjectFileGuidanceError extends Error {
  code = "PROJECT_FILE_GUIDANCE" as const;

  constructor(message: string) {
    super(message);
    this.name = "ProjectFileGuidanceError";
  }
}

function buildProjectInputError(error: ProjectInputError): Error {
  return new Error(error.message);
}

export async function processProjectFile(
  input: ProcessInput,
  convertMppToXml: (filePath: string) => Promise<string> = convertMPPToXML,
  validateFile: (filePath: string) => Promise<InputFileValidationResult> = validateInputFile,
  readXmlFile: (filePath: string) => Promise<string> = readTextFile,
  options?: ProcessProjectFileOptions,
  processor: (input: ProcessInput) => Promise<ProcessResult> = processMPPWithHistory,
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
      const projectInput = await processProjectInput({
        filePath,
        xmlContent,
      });

      if (!projectInput.ok) {
        throw buildProjectInputError(projectInput.error);
      }

      currentStage = "generating_analysis";
      emitStage(options, currentStage);
      const analysisStartedAt = now();
      const result = await processor({
        filePath,
        xmlContent,
        model: projectInput.project,
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
    let xmlContent = "";
    const convertAndCaptureXml = async (inputPath: string): Promise<string> => {
      xmlContent = await convertMppToXml(inputPath);
      return xmlContent;
    };
    const projectInput = await processProjectInput({
      filePath,
      convertMPPToMSPDIXml: convertAndCaptureXml,
    });

    if (!projectInput.ok) {
      const totalMs = now() - startedAt;
      const error = buildProjectInputError(projectInput.error);
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

      if (projectInput.error.code === MPP_CONVERSION_FAILED_CODE) {
        const userLogPath = await exportUserAccessibleLog(options);
        throw new ProjectFileGuidanceError(buildMppFallbackMessage(userLogPath));
      }

      throw error;
    }

    const conversionMs = now() - conversionStartedAt;
    currentStage = "generating_analysis";
    emitStage(options, currentStage);
    const analysisStartedAt = now();

    const result = await processor({
      filePath,
      xmlContent,
      model: projectInput.project,
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
