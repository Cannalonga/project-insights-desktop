import { useState } from "react";

import { type ProcessInput } from "../../app/use-cases/process-mpp";
import { processProjectFile } from "../../app/use-cases/process-project-file";
import type { ProcessResult } from "../types/process-result";

function getUserErrorMessage(err: unknown): string {
  if (err instanceof Error && "code" in err && err.code === "MPP_CONVERSION_FAILED") {
    return "Não foi possível processar o arquivo .mpp. Formato não suportado ou inválido.";
  }

  if (err instanceof Error && "code" in err && err.code === "INPUT_FILE_INVALID") {
    return err.message;
  }

  if (err instanceof Error && "code" in err && err.code === "MPP_INPUT_FATAL") {
    return err.message;
  }

  if (err instanceof Error && "code" in err && err.code === "PROCESSING_TIMEOUT") {
    return err.message;
  }

  if (err instanceof Error && err.message === "A entrada do CannaConverter 2.0 aceita apenas arquivos .mpp.") {
    return err.message;
  }

  return "Não foi possível concluir o processamento do cronograma de forma segura.";
}

export function useProcessMPP() {
  const [result, setResult] = useState<ProcessResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function processFile(input: ProcessInput): Promise<void> {
    if (loading) {
      return;
    }

    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const nextResult = await processProjectFile(input);
      setResult(nextResult);
    } catch (err) {
      setError(getUserErrorMessage(err));
      setResult(null);
    } finally {
      setLoading(false);
    }
  }

  function clear(): void {
    setResult(null);
    setLoading(false);
    setError(null);
  }

  function reportError(message: string): void {
    setResult(null);
    setLoading(false);
    setError(message);
  }

  return {
    result,
    loading,
    error,
    processFile,
    reportError,
    clear,
  };
}
