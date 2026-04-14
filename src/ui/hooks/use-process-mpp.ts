import { useRef, useState } from "react";

import { processProjectComparison } from "../../app/use-cases/process-project-comparison";
import { processProjectFile, type ProcessingStage } from "../../app/use-cases/process-project-file";
import { type ProcessInput } from "../../app/use-cases/process-mpp";
import type { ProcessResult } from "../types/process-result";

const SLOW_PROCESSING_THRESHOLD_MS = 12000;

function getUserErrorMessage(err: unknown): string {
  if (err instanceof Error && "code" in err && err.code === "PROJECT_FILE_GUIDANCE") {
    return err.message;
  }

  if (err instanceof Error && "code" in err && err.code === "INPUT_FILE_INVALID") {
    return err.message;
  }

  if (err instanceof Error && "code" in err && err.code === "MPP_INPUT_FATAL") {
    return "Não foi possível concluir a análise completa deste arquivo. Isso pode acontecer em projetos maiores ou com estruturas específicas. Se possível, gere uma nova exportação do cronograma e processe novamente.";
  }

  return "Não foi possível concluir a análise completa deste arquivo. Isso pode acontecer em projetos maiores ou com estruturas específicas. Se possível, gere uma nova exportação do cronograma e processe novamente.";
}

function getStageMessage(stage: ProcessingStage): string {
  switch (stage) {
    case "validating_input":
      return "Processando arquivo...";
    case "reading_xml":
      return "Lendo cronograma...";
    case "reading_xer":
      return "Lendo arquivo Primavera XER...";
    case "converting_mpp":
      return "Convertendo cronograma...";
    case "generating_analysis":
      return "Gerando análise...";
    case "completed":
      return "Análise concluída.";
    default:
      return "Processando arquivo...";
  }
}

export type FileAnalysisMode = "single" | "comparison";

export function useProcessMPP() {
  const [result, setResult] = useState<ProcessResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [processingMessage, setProcessingMessage] = useState<string | null>(null);
  const [slowProcessingMessage, setSlowProcessingMessage] = useState<string | null>(null);
  const [analysisMode, setAnalysisMode] = useState<FileAnalysisMode>("single");
  const slowTimerRef = useRef<number | null>(null);

  function clearSlowTimer(): void {
    if (slowTimerRef.current !== null) {
      window.clearTimeout(slowTimerRef.current);
      slowTimerRef.current = null;
    }
  }

  function startSlowTimer(): void {
    clearSlowTimer();
    slowTimerRef.current = window.setTimeout(() => {
      setSlowProcessingMessage(
        "O arquivo é grande e o processamento está levando mais tempo que o normal. Projetos maiores podem levar mais tempo para análise.",
      );
    }, SLOW_PROCESSING_THRESHOLD_MS);
  }

  async function runProcessing(run: () => Promise<ProcessResult>): Promise<void> {
    if (loading) {
      return;
    }

    setLoading(true);
    setError(null);
    setResult(null);
    setProcessingMessage(getStageMessage("validating_input"));
    setSlowProcessingMessage("Projetos maiores podem levar mais tempo para análise.");
    startSlowTimer();

    try {
      const nextResult = await run();
      setResult(nextResult);
    } catch (err) {
      setError(getUserErrorMessage(err));
      setResult(null);
    } finally {
      clearSlowTimer();
      setLoading(false);
      setProcessingMessage(null);
      setSlowProcessingMessage(null);
    }
  }

  async function processFile(input: ProcessInput): Promise<void> {
    setAnalysisMode("single");
    console.log("PROCESS SINGLE:", input.filePath ?? "sem-caminho");
    await runProcessing(() =>
      processProjectFile(input, undefined, undefined, undefined, {
        onStage: (stage) => {
          setProcessingMessage(getStageMessage(stage));
        },
      }),
    );
  }

  async function processComparisonFiles(baseFilePath: string, currentFilePath: string): Promise<void> {
    setAnalysisMode("comparison");
    console.log("PROCESS BASE:", baseFilePath);
    console.log("PROCESS CURRENT:", currentFilePath);
    await runProcessing(async () => {
      setProcessingMessage("Processando versão base...");
      const nextResult = await processProjectComparison({ baseFilePath, currentFilePath });
      setProcessingMessage("Comparação concluída.");
      return nextResult;
    });
  }

  function clear(): void {
    clearSlowTimer();
    setResult(null);
    setLoading(false);
    setError(null);
    setProcessingMessage(null);
    setSlowProcessingMessage(null);
  }

  function reportError(message: string): void {
    clearSlowTimer();
    setResult(null);
    setLoading(false);
    setError(message);
    setProcessingMessage(null);
    setSlowProcessingMessage(null);
  }

  return {
    result,
    loading,
    error,
    processingMessage,
    slowProcessingMessage,
    analysisMode,
    setAnalysisMode,
    processFile,
    processComparisonFiles,
    reportError,
    clear,
  };
}
