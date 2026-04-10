import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { ComparisonPanel } from "../components/ComparisonPanel";
import { InsightsPanel } from "../components/InsightsPanel";
import { getLicenseFeatureDecision } from "./license-feature-policy";

const demoLicense = {
  status: "NO_LICENSE",
  isLicensed: false,
  source: "local",
  message: "Modo demonstração.",
} as const;

function noop(): Promise<void> {
  return Promise.resolve();
}

describe("demo protection", () => {
  it("does not expose the full priority action block in demo mode", () => {
    const html = renderToStaticMarkup(
      <InsightsPanel
        presentationMode="complete"
        project={{ tasks: [] } as any}
        disciplines={[]}
        compensationAnalysis={
          {
            topTasks: [
              {
                taskId: "task-1",
                name: "Mobilizar frente crítica",
                disciplineName: "Planejamento",
                impactPercent: 7.4,
                remainingNormalizedValue: 42,
                progressPercent: 15,
              },
            ],
            potential: {
              top3ImpactPercent: 7.4,
              top5ImpactPercent: 8.1,
              message: "Leitura completa do potencial operacional.",
            },
          } as any
        }
        compensationByDiscipline={[]}
        weightModel={{ normalizedProjectValue: 100, disciplineWeights: [] } as any}
        executiveAlerts={[]}
        decisionActions={[]}
        license={demoLicense as any}
        onRequestLicense={noop}
        onOpenBuyLicense={noop}
      />,
    );

    expect(html).toContain("Ações protegidas na demo");
    expect(html).not.toContain("Mobilizar frente crítica");
    expect(html).not.toContain("Ação recomendada");
  });

  it("does not expose detailed comparison task lists in demo mode", () => {
    const html = renderToStaticMarkup(
      <ComparisonPanel
        comparison={
          {
            baseFileName: "base.mpp",
            currentFileName: "atual.mpp",
            projectProgress: {
              basePercent: 40,
              currentPercent: 46,
              deltaPercent: 6,
            },
            matching: {
              matchedCount: 10,
              newTasksCount: 1,
              removedTasksCount: 1,
              byTaskId: 8,
              byOutlineNumber: 1,
              byNameStructure: 1,
            },
            mostAdvancedTasks: [
              {
                taskId: "task-77",
                taskIdentifier: "1.2.3 - Concretagem da laje",
                taskName: "Concretagem da laje",
                matchMethod: "outline_number",
                baseProgressPercent: 20,
                currentProgressPercent: 80,
                deltaProgressPercent: 60,
              },
            ],
            stagnantTasks: [],
            regressionTasks: [],
            newTasks: [],
            removedTasks: [],
            executiveSummary: "Resumo agregado da evolução.",
            recoveryReading: "Leitura resumida da comparação.",
          } as any
        }
        license={demoLicense as any}
        onRequestLicense={noop}
        onOpenBuyLicense={noop}
      />,
    );

    expect(html).toContain("Detalhes protegidos na demo");
    expect(html).not.toContain("1.2.3 - Concretagem da laje");
    expect(html).not.toContain("Tasks que mais");
  });

  it("keeps export blocked by policy in demo mode", () => {
    expect(getLicenseFeatureDecision(demoLicense as any, "export_csv")).toEqual({
      allowed: false,
      title: "Exportacao CSV completa disponivel na versao completa",
      description: "Insira uma licenca valida ou obtenha a versao completa para liberar este recurso.",
    });
  });
});
