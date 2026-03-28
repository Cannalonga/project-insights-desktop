import { describe, expect, it } from "vitest";

import type { DecisionAction } from "./build-decision-actions";
import { buildDecisionNarrative } from "./build-decision-narrative";

function makeAction(overrides: Partial<DecisionAction> = {}): DecisionAction {
  return {
    id: "action-1",
    title: "Recebimento frente Alfa (3 tarefas)",
    description: "Atue na frente elétrica para recuperar avanço imediato.",
    disciplineType: "ELETRICA",
    disciplineName: "Elétrica",
    impactPercent: 12,
    impactType: "unlock",
    gainPercent: 12,
    urgencyScore: 90,
    effortScore: 2,
    confidence: "medium",
    cause: {
      code: "external_block",
      label: "Bloqueio operacional",
      explanation: "Bloqueio operacional com sinais de dependência externa ou fornecimento.",
    },
    reasons: [
      "Bloqueio operacional com sinais de dependência externa ou fornecimento.",
      "alto impacto no avanço do projeto",
      "atraso real nas tasks relacionadas",
      "valor relativo pendente concentrado",
    ],
    consequences: ["Sem essa ação, a frente tende a continuar bloqueada e impactar o avanço do projeto."],
    relatedTasks: [],
    occurrenceCount: 3,
    representativeProgressPercent: 20,
    remainingNormalizedValue: 120000,
    ...overrides,
  };
}

describe("buildDecisionNarrative", () => {
  it("builds a more concrete headline and short label from the same decision action", () => {
    const narrative = buildDecisionNarrative(makeAction());

    expect(narrative.headline).toBe("Elétrica com avanço travado por bloqueio operacional");
    expect(narrative.shortLabel).toBe("Bloqueio operacional - Elétrica");
  });

  it("starts the explanation with concrete field language and then lists operational signals", () => {
    const narrative = buildDecisionNarrative(makeAction());

    expect(narrative.explanation.startsWith("Frente iniciada com avanço mínimo e atraso acumulado, indicando bloqueio operacional.")).toBe(true);
    expect(narrative.explanation).toContain("Baseado em:");
    expect(narrative.explanation).toContain("impacto direto no avanço do projeto");
    expect(narrative.explanation).toContain("atraso real já configurado");
  });

  it("uses a more operational consequence statement", () => {
    const narrative = buildDecisionNarrative(makeAction());

    expect(narrative.consequence).toBe("Sem destravar essa frente, parte do avanço do projeto continua represada.");
  });
});
