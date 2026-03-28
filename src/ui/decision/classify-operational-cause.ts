import type { DecisionActionConfidence, DecisionActionImpactType } from "./build-decision-actions";

export type OperationalCauseCode =
  | "external_block"
  | "execution_delay"
  | "low_productivity"
  | "critical_concentration"
  | "dependency_block"
  | "insufficient_signal";

export type OperationalCause = {
  code: OperationalCauseCode;
  label: string;
  explanation: string;
};

export type OperationalCauseInput = {
  progressPercent: number;
  impactPercent: number;
  remainingNormalizedValue: number;
  delayDays: number;
  occurrenceCount: number;
  hasActualStart: boolean;
  hasActualFinish: boolean;
  confidence: DecisionActionConfidence;
  impactType: DecisionActionImpactType;
  scheduleStatus?: "OK" | "ATENCAO" | "ATRASADO";
};

function hasRelevantImpact(input: OperationalCauseInput): boolean {
  return input.impactPercent >= 8 || input.remainingNormalizedValue >= 100000;
}

export function classifyOperationalCause(input: OperationalCauseInput): OperationalCause {
  if (
    input.confidence === "low" &&
    input.delayDays <= 0 &&
    input.progressPercent <= 0 &&
    input.impactPercent < 8
  ) {
    return {
      code: "insufficient_signal",
      label: "Sinal insuficiente",
      explanation: "Sinais insuficientes para classificar a causa com confiança.",
    };
  }

  if (
    input.impactType === "unlock" &&
    !input.hasActualStart &&
    input.delayDays > 7 &&
    hasRelevantImpact(input)
  ) {
    return {
      code: "dependency_block",
      label: "Dependência operacional",
      explanation: "Frente dependente de desbloqueio de etapas anteriores.",
    };
  }

  if (
    input.delayDays > 14 &&
    input.progressPercent > 0 &&
    input.progressPercent < 30 &&
    hasRelevantImpact(input)
  ) {
    return {
      code: "external_block",
      label: "Bloqueio operacional",
      explanation: "Bloqueio operacional com sinais de dependência externa ou fornecimento.",
    };
  }

  if (
    input.delayDays > 7 &&
    input.progressPercent < 60 &&
    !input.hasActualFinish
  ) {
    return {
      code: "execution_delay",
      label: "Atraso de execução",
      explanation: "Atraso direto na execução frente ao planejado.",
    };
  }

  if (
    input.progressPercent > 0 &&
    input.progressPercent < 70 &&
    (input.scheduleStatus === "ATRASADO" || input.impactPercent >= 8)
  ) {
    return {
      code: "low_productivity",
      label: "Baixa produtividade",
      explanation: "Baixo ritmo de execução na frente analisada.",
    };
  }

  if (hasRelevantImpact(input)) {
    return {
      code: "critical_concentration",
      label: "Concentração crítica",
      explanation: "Alta concentração de impacto operacional nesta frente.",
    };
  }

  return {
    code: "insufficient_signal",
    label: "Sinal insuficiente",
    explanation: "Sinais insuficientes para classificar a causa com confiança.",
  };
}
