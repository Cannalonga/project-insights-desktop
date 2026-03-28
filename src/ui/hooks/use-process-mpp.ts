import { useRef, useState } from "react";

import { type ProcessInput } from "../../app/use-cases/process-mpp";
import { processProjectFile, type ProcessingStage } from "../../app/use-cases/process-project-file";
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
    return "Nao foi possivel concluir a analise completa deste arquivo. Isso pode acontecer em projetos maiores ou com estruturas especificas. Se possivel, tente exportar o cronograma como XML (MSPDI) e processar novamente.";
  }

  return "Nao foi possivel concluir a analise completa deste arquivo. Isso pode acontecer em projetos maiores ou com estruturas especificas. Se possivel, tente exportar o cronograma como XML (MSPDI) e processar novamente.";
}

function getStageMessage(stage: ProcessingStage): string {
  switch (stage) {
    case "validating_input":
      return "Processando arquivo...";
    case "reading_xml":
      return "Lendo arquivo XML (MSPDI)...";
    case "converting_mpp":
      return "Convertendo cronograma...";
    case "generating_analysis":
      return "Gerando analise...";
    case "completed":
      return "Analise concluida.";
    default:
      return "Processando arquivo...";
  }
}

export function useProcessMPP() {
  const [result, setResult] = useState<ProcessResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [processingMessage, setProcessingMessage] = useState<string | null>(null);
  const [slowProcessingMessage, setSlowProcessingMessage] = useState<string | null>(null);
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
      setSlowProcessingMessage("O arquivo e grande e o processamento esta levando mais tempo que o normal. Projetos maiores podem levar mais tempo para analise.");
    }, SLOW_PROCESSING_THRESHOLD_MS);
  }

  async function processFile(input: ProcessInput): Promise<void> {
    if (loading) {
      return;
    }

    setLoading(true);
    setError(null);
    setResult(null);
    setProcessingMessage(getStageMessage("validating_input"));
    setSlowProcessingMessage("Projetos maiores podem levar mais tempo para analise.");
    startSlowTimer();

    try {
      const nextResult = await processProjectFile(input, undefined, undefined, undefined, {
        onStage: (stage) => {
          setProcessingMessage(getStageMessage(stage));
        },
      });
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
    processFile,
    reportError,
    clear,
  };
}
