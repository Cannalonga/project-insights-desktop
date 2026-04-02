import type { ExecutiveAlert } from "../alerts/build-executive-alerts";
import type { OperationalCompensationDiscipline } from "../compensation/build-operational-compensation";
import type { GapVsCompensation } from "../compensation/build-gap-vs-compensation";
import type { ProjectDiscipline } from "../disciplines/build-project-disciplines";
import type { ProjectInsights } from "../insights/build-project-insights";
import type { Project } from "../model/project";
import { buildOperationalTaskViews } from "../operations/build-operational-task-views";
import type { ScheduleStatus } from "../schedule/build-schedule-status";
import type { ProjectWeightModel } from "../weight/build-project-weight-model";
import type { ExecutiveReportInput } from "./build-executive-report";
import type { ComparedTaskDelta, VersionComparisonSummary } from "../../app/comparison/compare-project-versions";

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function formatNumber(value: number, maximumFractionDigits = 2): string {
  return new Intl.NumberFormat("pt-BR", {
    minimumFractionDigits: 0,
    maximumFractionDigits,
  }).format(value);
}

function formatPercent(value: number): string {
  return `${formatNumber(value)}%`;
}

function formatDateTime(value: string): string {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }

  return parsed.toLocaleString("pt-BR");
}

function formatDate(value: string): string | null {
  if (!value) {
    return null;
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }

  return parsed.toLocaleDateString("pt-BR");
}

function severityRank(severity: ExecutiveAlert["severity"]): number {
  if (severity === "critical") {
    return 0;
  }

  if (severity === "warning") {
    return 1;
  }

  return 2;
}

function severityTag(severity: ExecutiveAlert["severity"]): string {
  if (severity === "critical") {
    return "CRITICAL";
  }

  if (severity === "warning") {
    return "WARNING";
  }

  return "INFO";
}

function statusTone(status: string | undefined): string {
  const normalized = status?.toUpperCase() ?? "";

  if (["OK", "BOM", "CONSISTENTE", "HIGH", "RECOVERABLE"].includes(normalized)) {
    return "ok";
  }

  if (["ATENCAO", "ATENCAO", "MODERATE", "TIGHT"].includes(normalized)) {
    return "warning";
  }

  return "critical";
}

function resolveProjectName(input: ExecutiveReportInput): string {
  return input.projectDisplayName?.trim() || input.project.name || "Projeto sem identificação";
}

function formatTaskDisplay(taskIdentifier: string | undefined, taskId: string, taskName: string): string {
  const resolvedIdentifier = taskIdentifier?.trim() || `[ID:${taskId}]`;
  return `${resolvedIdentifier} - ${taskName}`;
}

function buildGeneralSituation(input: ExecutiveReportInput): string {
  const status = (input.scheduleStatus?.status ?? input.score.status).toUpperCase();
  const gap = input.scheduleStatus?.gap;

  if (status === "CRITICAL" || status === "ATRASADO" || (gap !== undefined && gap < -10)) {
    return "O projeto apresenta desempenho abaixo do esperado, com sinais claros de perda de controle sobre o cronograma.";
  }

  if (status === "ATENCAO" || status === "ATENCAO" || status === "MODERATE" || (gap !== undefined && gap < 0)) {
    return "O projeto opera em atenção e já mostra sinais de pressão sobre prazo e execução.";
  }

  return "O projeto segue controlado neste recorte, mas requer manutencao do ritmo para preservar o prazo.";
}

function buildExecutiveReading(input: ExecutiveReportInput): string {
  const scheduleStatus = (input.scheduleStatus?.status ?? input.score.status).toUpperCase();
  const remainingPercent = input.weightModel.normalizedProjectValue > 0
    ? (input.weightModel.totalRemainingNormalizedValue / input.weightModel.normalizedProjectValue) * 100
    : 0;

  if (scheduleStatus === "CRITICAL" || scheduleStatus === "ATRASADO") {
    return "Projeto em risco de agravamento. A execução atual não é suficiente para recuperar o cronograma e a intervenção imediata é necessária.";
  }

  if (remainingPercent > 60) {
    return "O projeto ainda concentra grande volume pendente e exige resposta rapida para evitar aumento do atraso.";
  }

  return "O projeto permanece operacionalmente viável, mas depende de disciplina de execução para evitar deterioração do prazo.";
}

function rewriteAlertMessage(alert: ExecutiveAlert): string {
  const message = alert.message.trim();
  const lower = message.toLowerCase();
  const disciplineMatch = message.match(/disciplina\s+([^,.]+)/i);
  const disciplineName = disciplineMatch?.[1]?.trim();

  if (lower.includes("atras")) {
    return "O projeto apresenta deterioração no cumprimento de prazo.";
  }

  if ((lower.includes("concentra") || lower.includes("impacto pendente") || lower.includes("valor pendente")) && disciplineName) {
    return `A disciplina ${disciplineName} concentra a maior parte do impacto pendente e deve ser priorizada.`;
  }

  if (disciplineName && lower.includes("disciplina")) {
    return `A disciplina ${disciplineName} exige prioridade operacional para evitar ampliação do risco.`;
  }

  if (alert.severity === "critical") {
    return "O projeto apresenta um risco executivo que exige resposta imediata.";
  }

  if (alert.severity === "warning") {
    return "Ha sinal de pressao operacional que pode comprometer o desempenho do projeto.";
  }

  return message;
}

function renderAlerts(alerts: ExecutiveAlert[]): string {
  const topAlerts = alerts
    .slice()
    .sort((left, right) => severityRank(left.severity) - severityRank(right.severity))
    .slice(0, 5);

  if (topAlerts.length === 0) {
    return '<p class="muted">Não foram identificados riscos executivos relevantes neste recorte.</p>';
  }

  return `
    <ul class="alert-list">
      ${topAlerts
        .map(
          (alert) => `
            <li>
              <span class="tag ${statusTone(alert.severity)}">[${severityTag(alert.severity)}]</span>
              <span>${escapeHtml(rewriteAlertMessage(alert))}</span>
            </li>
          `,
        )
        .join("")}
    </ul>
  `;
}

function renderScheduleSummary(insights: ProjectInsights, scheduleStatus?: ScheduleStatus): string {
  const schedulePerformance = insights.schedulePerformance;
  const tasksDelayed = schedulePerformance?.tasksDelayed ?? 0;
  const averageDelay = schedulePerformance?.averageDelay ?? 0;
  const maxDelay = schedulePerformance?.maxDelay ?? 0;
  const interpretation = tasksDelayed > 0
    ? "O volume de tarefas atrasadas já indica perda de ritmo de execução."
    : "Não há acumulação relevante de atraso nas tarefas lidas neste recorte.";

  return `
    <div class="metric-grid two">
      <article class="metric-card">
        <span>Status de prazo</span>
        <strong>${escapeHtml(scheduleStatus?.status ?? schedulePerformance?.status ?? "SEM LEITURA")}</strong>
      </article>
      <article class="metric-card">
        <span>Tasks atrasadas</span>
        <strong>${schedulePerformance ? formatNumber(tasksDelayed, 0) : "n/a"}</strong>
      </article>
      <article class="metric-card">
        <span>Atraso medio</span>
        <strong>${schedulePerformance ? `${formatNumber(averageDelay)} dias` : "n/a"}</strong>
      </article>
      <article class="metric-card">
        <span>Maior atraso</span>
        <strong>${schedulePerformance ? `${formatNumber(maxDelay)} dias` : "n/a"}</strong>
      </article>
    </div>
    <p class="support-copy">${escapeHtml(interpretation)}</p>
  `;
}

function renderWeightSummary(weightModel: ProjectWeightModel): string {
  const currentPercent = weightModel.progressWeightedPercent;
  const remainingPercent = Math.max(0, 100 - currentPercent);
  const interpretation = remainingPercent > 60
    ? "Grande parte do escopo ainda permanece pendente, com execução abaixo do necessário para recuperação de prazo."
    : remainingPercent > 30
      ? "O projeto ainda possui volume relevante de escopo pendente e exige manutenção do ritmo de execução."
      : "A maior parte do escopo já foi executada, mas o saldo remanescente ainda exige disciplina operacional."

  return `
    <div class="metric-grid two">
      <article class="metric-card">
        <span>Avanco atual</span>
        <strong>${formatPercent(currentPercent)}</strong>
      </article>
      <article class="metric-card">
        <span>Restante a executar</span>
        <strong>${formatPercent(remainingPercent)}</strong>
      </article>
    </div>
    <p class="support-copy">${escapeHtml(interpretation)}</p>
    <p class="footnote">Distribuicao baseada no peso relativo das tarefas no projeto.</p>
  `;
}

function renderCriticalDiscipline(
  disciplines: ProjectDiscipline[],
  compensationByDiscipline: OperationalCompensationDiscipline[],
): string {
  if (disciplines.length === 0 || compensationByDiscipline.length === 0) {
    return '<p class="muted">Não foi possível destacar disciplina prioritária neste recorte.</p>';
  }

  const impactMap = new Map(compensationByDiscipline.map((item) => [item.disciplineName, item]));
  const critical = disciplines
    .slice()
    .sort((left, right) => (impactMap.get(right.name)?.impactPercent ?? 0) - (impactMap.get(left.name)?.impactPercent ?? 0))[0];

  if (!critical) {
    return '<p class="muted">Não foi possível destacar disciplina prioritária neste recorte.</p>';
  }

  const impact = impactMap.get(critical.name);

  return `
    <article class="highlight-card subtle">
      <p class="section-kicker">FOCO CRITICO</p>
      <h3>${escapeHtml(critical.name)}</h3>
      <p class="highlight-copy small">A disciplina ${escapeHtml(critical.name)} concentra a maior parte do impacto do projeto e deve ser tratada como prioridade operacional imediata.</p>
      <div class="metric-grid two compact">
        <article class="metric-card">
          <span>Tipo</span>
          <strong>${escapeHtml(critical.disciplineType ?? "OUTRO")}</strong>
        </article>
        <article class="metric-card">
          <span>Impacto potencial</span>
          <strong>${formatPercent(impact?.impactPercent ?? 0)}</strong>
        </article>
      </div>
    </article>
  `;
}

function renderDisciplines(
  disciplines: ProjectDiscipline[],
  weightModel: ProjectWeightModel,
  compensationByDiscipline: OperationalCompensationDiscipline[],
): string {
  if (disciplines.length === 0) {
    return '<p class="muted">Nenhuma disciplina estrutural foi identificada neste recorte.</p>';
  }

  const disciplineWeights = new Map(
    weightModel.disciplineWeights.map((discipline) => [discipline.outlineNumber, discipline]),
  );
  const compensationMap = new Map(
    compensationByDiscipline.map((discipline) => [discipline.disciplineName, discipline]),
  );

  const rows = disciplines
    .slice()
    .sort((left, right) => {
      const rightImpact = compensationMap.get(right.name)?.impactPercent ?? 0;
      const leftImpact = compensationMap.get(left.name)?.impactPercent ?? 0;
      return rightImpact - leftImpact;
    })
    .map((discipline) => {
      const disciplineWeight = disciplineWeights.get(discipline.outlineNumber);
      const disciplineImpact = compensationMap.get(discipline.name);

      return `
        <tr>
          <td>${escapeHtml(discipline.disciplineType ?? "OUTRO")}</td>
          <td>${escapeHtml(discipline.name)}</td>
          <td>${formatPercent(disciplineWeight?.progressWeightedPercent ?? 0)}</td>
          <td>${formatNumber(disciplineWeight?.remainingNormalizedValue ?? 0, 0)}</td>
          <td>${formatPercent(disciplineImpact?.impactPercent ?? 0)}</td>
        </tr>
      `;
    })
    .join("");

  return `
    <table>
      <thead>
        <tr>
          <th>Tipo</th>
          <th>Disciplina</th>
          <th>Avanco</th>
          <th>Valor pendente</th>
          <th>Impacto potencial</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>
  `;
}

function renderImmediateAction(project: Project, weightModel: ProjectWeightModel, generatedAt: string): string {
  const topTask = buildOperationalTaskViews(weightModel, project, generatedAt, 1)[0];

  if (!topTask) {
    return '<p class="muted">Nao ha task critica suficiente para destacar neste momento.</p>';
  }

  const sourceTask = project.tasks.find((task) => task.id === topTask.taskId);
  const plannedStart = formatDate(sourceTask?.startDate ?? "");
  const plannedFinish = formatDate(sourceTask?.endDate ?? "");
  const actualStart = formatDate(sourceTask?.actualStartDate ?? "");
  const actualFinish = formatDate(sourceTask?.actualEndDate ?? "");
  const scheduleItems = [
    plannedStart ? `Início planejado ${plannedStart}` : null,
    plannedFinish ? `Fim planejado ${plannedFinish}` : null,
    actualStart ? `Início real ${actualStart}` : null,
    actualFinish ? `Fim real ${actualFinish}` : null,
  ].filter(Boolean);
  const reason = `${topTask.disciplineName ?? "A task"} concentra uma das maiores alavancas de avanço imediato no projeto.`;
  const risk = `Se essa frente não avançar, o projeto tende a manter pressão sobre prazo e a reduzir sua capacidade de recuperação.`;
  const taskDisplay = formatTaskDisplay(topTask.taskIdentifier, topTask.taskId, topTask.name);

  return `
    <article class="highlight-card">
      <p class="section-kicker">ACAO PRIORITARIA</p>
      <h3>Se voce fizer apenas uma coisa agora:</h3>
      <p class="priority-task">${escapeHtml(taskDisplay)}</p>
      <div class="metric-grid two compact">
        <article class="metric-card">
          <span>Disciplina</span>
          <strong>${escapeHtml(topTask.disciplineName ?? "n/a")}</strong>
        </article>
        <article class="metric-card">
          <span>Impacto no projeto</span>
          <strong>${formatPercent(topTask.impactPercent)}</strong>
        </article>
        <article class="metric-card">
          <span>Execucao atual</span>
          <strong>${formatPercent(topTask.realPercent)}</strong>
        </article>
        <article class="metric-card">
          <span>Status operacional</span>
          <strong>${escapeHtml(topTask.statusLabel)}</strong>
        </article>
      </div>
      ${scheduleItems.length > 0 ? `<p class="support-copy">${escapeHtml(scheduleItems.join(" | "))}</p>` : ""}
      <p><strong>Motivo:</strong> ${escapeHtml(reason)}</p>
      <p><strong>Risco:</strong> ${escapeHtml(risk)}</p>
      <p class="highlight-copy">Executar esta ação pode gerar até ${formatPercent(topTask.impactPercent)} de avanço no projeto.</p>
    </article>
  `;
}

function renderCompensation(project: Project, weightModel: ProjectWeightModel, generatedAt: string): string {
  const taskViews = buildOperationalTaskViews(weightModel, project, generatedAt, 5);
  const top3 = taskViews.slice(0, 3).reduce((sum, task) => sum + task.impactPercent, 0);
  const top5 = taskViews.slice(0, 5).reduce((sum, task) => sum + task.impactPercent, 0);
  const interpretation = top3 > 0
    ? "Existe capacidade de recuperação, porém limitada e dependente de ação imediata."
    : "A capacidade de recuperação identificada neste recorte é baixa.";

  if (taskViews.length === 0) {
    return '<p class="muted">Não há tasks suficientes para leitura operacional de compensação.</p>';
  }

  return `
    <div class="metric-grid three">
      <article class="metric-card">
        <span>Top 3 impacto</span>
        <strong>${formatPercent(top3)}</strong>
      </article>
      <article class="metric-card">
        <span>Top 5 impacto</span>
        <strong>${formatPercent(top5)}</strong>
      </article>
      <article class="metric-card">
        <span>Tasks consideradas</span>
        <strong>${formatNumber(taskViews.length, 0)}</strong>
      </article>
    </div>
    <p class="support-copy">${escapeHtml(interpretation)}</p>
    <ul class="task-list">
      ${taskViews
        .map(
          (task) => `
            <li>
              <strong>${escapeHtml(formatTaskDisplay(task.taskIdentifier, task.taskId, task.name))}</strong>
              <span>${escapeHtml(task.disciplineName ?? "n/a")} | impacto ${formatPercent(task.impactPercent)} | status ${escapeHtml(task.statusLabel)}</span>
            </li>
          `,
        )
        .join("")}
    </ul>
  `;
}

function renderComparedTaskLine(task: ComparedTaskDelta): string {
  return `
    <li>
      <strong>${escapeHtml(task.taskIdentifier)}</strong>
      <span>Base ${formatPercent(task.baseProgressPercent)} | Atual ${formatPercent(task.currentProgressPercent)} | Delta ${formatPercent(task.deltaProgressPercent)}</span>
    </li>
  `;
}

function renderComparisonSection(versionComparison?: VersionComparisonSummary): string {
  if (!versionComparison) {
    return "";
  }

  return `
    <section class="report-section">
      <div class="section-header">
        <p class="section-kicker">EVOLUCAO ENTRE VERSOES</p>
        <h2>Comparação entre base e atual</h2>
      </div>
      <div class="metric-grid four">
        <article class="metric-card">
          <span>Avanco base</span>
          <strong>${formatPercent(versionComparison.projectProgress.basePercent)}</strong>
        </article>
        <article class="metric-card">
          <span>Avanco atual</span>
          <strong>${formatPercent(versionComparison.projectProgress.currentPercent)}</strong>
        </article>
        <article class="metric-card ${statusTone(versionComparison.projectProgress.deltaPercent >= 0 ? "OK" : "CRITICAL")}">
          <span>Evolução do projeto</span>
          <strong>${formatPercent(versionComparison.projectProgress.deltaPercent)}</strong>
        </article>
        <article class="metric-card">
          <span>Tasks correlacionadas</span>
          <strong>${formatNumber(versionComparison.matching.matchedCount, 0)}</strong>
        </article>
      </div>
      <p class="executive-copy">${escapeHtml(versionComparison.executiveSummary)}</p>
      <p class="support-copy">${escapeHtml(versionComparison.recoveryReading)}</p>
      <div class="metric-grid three">
        <article class="metric-card">
          <span>Por ID</span>
          <strong>${formatNumber(versionComparison.matching.byTaskId, 0)}</strong>
        </article>
        <article class="metric-card">
          <span>Por WBS</span>
          <strong>${formatNumber(versionComparison.matching.byOutlineNumber, 0)}</strong>
        </article>
        <article class="metric-card">
          <span>Nome + estrutura</span>
          <strong>${formatNumber(versionComparison.matching.byNameStructure, 0)}</strong>
        </article>
      </div>
    </section>

    <section class="report-section">
      <div class="section-header">
        <p class="section-kicker">MOVIMENTO DO CRONOGRAMA</p>
        <h2>Tasks com maior efeito entre as versões</h2>
      </div>
      ${versionComparison.mostAdvancedTasks.length > 0 ? `
        <ul class="task-list">
          ${versionComparison.mostAdvancedTasks.slice(0, 5).map(renderComparedTaskLine).join("")}
        </ul>
      ` : '<p class="muted">Não houve tasks com avanço relevante entre as versões.</p>'}
      ${versionComparison.regressionTasks.length > 0 ? `
        <div style="margin-top:16px">
          <p class="section-kicker">REGRESSOES IDENTIFICADAS</p>
          <ul class="task-list">
            ${versionComparison.regressionTasks.slice(0, 5).map(renderComparedTaskLine).join("")}
          </ul>
        </div>
      ` : ""}
      ${versionComparison.newTasks.length > 0 ? `
        <div style="margin-top:16px">
          <p class="section-kicker">TASKS NOVAS</p>
          <ul class="task-list">
            ${versionComparison.newTasks.slice(0, 5).map(renderComparedTaskLine).join("")}
          </ul>
        </div>
      ` : ""}
      ${versionComparison.removedTasks.length > 0 ? `
        <div style="margin-top:16px">
          <p class="section-kicker">TASKS REMOVIDAS</p>
          <ul class="task-list">
            ${versionComparison.removedTasks.slice(0, 5).map(renderComparedTaskLine).join("")}
          </ul>
        </div>
      ` : ""}
    </section>
  `;
}

function renderGapVsCompensation(gapVsCompensation?: GapVsCompensation): string {
  if (!gapVsCompensation || gapVsCompensation.status === "unavailable") {
    return "";
  }

  return `
    <section class="report-section">
      <div class="section-header">
        <p class="section-kicker">GAP VS COMPENSACAO</p>
        <h2>Capacidade de cobertura do gap</h2>
      </div>
      <div class="metric-grid four">
        <article class="metric-card">
          <span>Gap</span>
          <strong>${gapVsCompensation.gapPercent !== undefined ? formatPercent(gapVsCompensation.gapPercent) : "n/a"}</strong>
        </article>
        <article class="metric-card">
          <span>Top 3</span>
          <strong>${formatPercent(gapVsCompensation.top3CompensationPercent)}</strong>
        </article>
        <article class="metric-card">
          <span>Top 5</span>
          <strong>${formatPercent(gapVsCompensation.top5CompensationPercent)}</strong>
        </article>
        <article class="metric-card ${statusTone(gapVsCompensation.status)}">
          <span>Status</span>
          <strong>${escapeHtml(gapVsCompensation.status.toUpperCase())}</strong>
        </article>
      </div>
      <p class="support-copy">${escapeHtml(gapVsCompensation.message)}</p>
    </section>
  `;
}

function renderConclusion(input: ExecutiveReportInput): string {
  const status = (input.scheduleStatus?.status ?? input.score.status).toUpperCase();

  if (status === "CRITICAL" || status === "ATRASADO") {
    return "O projeto se encontra em estado de atenção crítica, com risco real de agravamento do atraso. A execução atual não é suficiente para recuperar o ritmo planejado. A intervenção imediata é necessária.";
  }

  if (status === "ATENCAO" || status === "ATENCAO" || status === "MODERATE") {
    return "O projeto se encontra em estado de atenção, com risco de agravamento caso o ritmo atual seja mantido. A prioridade agora é concentrar execução nas frentes de maior impacto.";
  }

  return "O projeto permanece controlado neste recorte, mas deve manter foco nas frentes de maior impacto para preservar o desempenho.";
}

export function buildExecutivePdfReport(input: ExecutiveReportInput): string {
  const projectName = resolveProjectName(input);
  const overallStatus = input.scheduleStatus?.status ?? input.score.status.toUpperCase();

  return `
<!DOCTYPE html>
<html lang="pt-BR">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'; img-src data:; style-src 'unsafe-inline';" />
    <title>Relatorio Executivo - ${escapeHtml(projectName)}</title>
    <style>
      @page {
        size: A4;
        margin: 16mm;
      }
      body {
        margin: 0;
        color: #1f2933;
        font-family: "Segoe UI", Arial, sans-serif;
        background: #f5f7f5;
      }
      .page {
        max-width: 1024px;
        margin: 0 auto;
      }
      .hero,
      .report-section,
      .highlight-card {
        background: #ffffff;
        border: 1px solid #d9e2ec;
        border-radius: 18px;
        padding: 20px;
        margin-bottom: 16px;
        break-inside: avoid;
      }
      .hero {
        background: linear-gradient(180deg, #ffffff 0%, #f7faf7 100%);
      }
      h1, h2, h3, p {
        margin-top: 0;
      }
      h1 {
        font-size: 28px;
        margin-bottom: 16px;
        letter-spacing: -0.03em;
      }
      h2 {
        font-size: 18px;
        margin-bottom: 12px;
      }
      h3 {
        font-size: 20px;
        margin-bottom: 12px;
      }
      .priority-task {
        font-size: 22px;
        font-weight: 700;
        margin-bottom: 14px;
      }
      .section-kicker {
        font-size: 11px;
        letter-spacing: 0.08em;
        text-transform: uppercase;
        color: #52606d;
        margin-bottom: 8px;
        font-weight: 700;
      }
      .section-header {
        margin-bottom: 14px;
      }
      .metric-grid {
        display: grid;
        gap: 12px;
      }
      .metric-grid.compact {
        gap: 10px;
      }
      .metric-grid.two {
        grid-template-columns: repeat(2, minmax(0, 1fr));
      }
      .metric-grid.three {
        grid-template-columns: repeat(3, minmax(0, 1fr));
      }
      .metric-grid.four {
        grid-template-columns: repeat(4, minmax(0, 1fr));
      }
      .metric-card {
        background: #f8fafc;
        border: 1px solid #e4e7eb;
        border-radius: 14px;
        padding: 14px;
      }
      .metric-card span {
        display: block;
        font-size: 11px;
        text-transform: uppercase;
        letter-spacing: 0.04em;
        color: #52606d;
        margin-bottom: 6px;
      }
      .metric-card strong {
        font-size: 18px;
      }
      .metric-card.ok,
      .tag.ok {
        background: #e7f4ec;
        color: #256c43;
      }
      .metric-card.warning,
      .tag.warning {
        background: #fff4dc;
        color: #9b6b10;
      }
      .metric-card.critical,
      .tag.critical {
        background: #fde8e8;
        color: #b83434;
      }
      .hero-grid {
        display: grid;
        gap: 12px;
        grid-template-columns: repeat(4, minmax(0, 1fr));
      }
      .alert-list,
      .task-list {
        margin: 0;
        padding: 0;
        list-style: none;
      }
      .alert-list li,
      .task-list li {
        display: flex;
        gap: 10px;
        align-items: flex-start;
        padding: 10px 0;
        border-bottom: 1px solid #e4e7eb;
      }
      .alert-list li:last-child,
      .task-list li:last-child {
        border-bottom: none;
        padding-bottom: 0;
      }
      .task-list li {
        flex-direction: column;
      }
      .task-list li span {
        color: #52606d;
      }
      .tag {
        display: inline-flex;
        border-radius: 999px;
        padding: 4px 8px;
        font-size: 11px;
        font-weight: 700;
        white-space: nowrap;
      }
      table {
        width: 100%;
        border-collapse: collapse;
      }
      th, td {
        text-align: left;
        padding: 10px 8px;
        border-bottom: 1px solid #e4e7eb;
        vertical-align: top;
      }
      th {
        font-size: 11px;
        text-transform: uppercase;
        letter-spacing: 0.04em;
        color: #52606d;
      }
      .support-copy,
      .footnote,
      .muted,
      .executive-copy {
        color: #52606d;
        line-height: 1.5;
      }
      .executive-copy {
        font-size: 16px;
      }
      .highlight-card {
        border: 1px solid #f0d49a;
        background: linear-gradient(180deg, #fffdf7 0%, #fff9ef 100%);
      }
      .highlight-card.subtle {
        border-color: #d9e2ec;
        background: #ffffff;
      }
      .highlight-copy {
        font-size: 16px;
        font-weight: 700;
        margin-bottom: 0;
      }
      .highlight-copy.small {
        font-size: 15px;
        font-weight: 600;
      }
      @media print {
        body {
          background: #ffffff;
        }
      }
    </style>
  </head>
  <body>
    <div class="page">
      <section class="hero">
        <p class="section-kicker">RELATORIO EXECUTIVO</p>
        <h1>${escapeHtml(projectName)}</h1>
        <div class="hero-grid">
          <article class="metric-card">
            <span>Data da análise</span>
            <strong>${escapeHtml(formatDateTime(input.generatedAt))}</strong>
          </article>
          <article class="metric-card">
            <span>Area do relatorio</span>
            <strong>${escapeHtml(input.analysisAreaLabel ?? "Projeto completo")}</strong>
          </article>
          <article class="metric-card ${statusTone(input.score.status)}">
            <span>Score do projeto</span>
            <strong>${formatNumber(input.score.value, 0)}</strong>
          </article>
          <article class="metric-card ${statusTone(overallStatus)}">
            <span>Status geral</span>
            <strong>${escapeHtml(overallStatus)}</strong>
          </article>
        </div>
      </section>

      <section class="report-section">
        <div class="section-header">
          <p class="section-kicker">SITUACAO GERAL DO PROJETO</p>
          <h2>Leitura executiva da situação atual</h2>
        </div>
        <p class="executive-copy">${escapeHtml(buildGeneralSituation(input))}</p>
      </section>

      <section class="report-section">
        <div class="section-header">
          <p class="section-kicker">LEITURA EXECUTIVA</p>
          <h2>O que a gestão precisa saber agora</h2>
        </div>
        <p class="executive-copy">${escapeHtml(buildExecutiveReading(input))}</p>
      </section>

      <section class="report-section">
        <div class="section-header">
          <p class="section-kicker">PRINCIPAIS RISCOS IDENTIFICADOS</p>
          <h2>Riscos com potencial de impacto imediato</h2>
        </div>
        ${renderAlerts(input.executiveAlerts)}
      </section>

      <section class="report-section">
        <div class="section-header">
          <p class="section-kicker">SITUACAO DE PRAZO</p>
          <h2>Leitura objetiva do cronograma</h2>
        </div>
        ${renderScheduleSummary(input.insights, input.scheduleStatus)}
      </section>

      <section class="report-section">
        <div class="section-header">
          <p class="section-kicker">AVANCO DO PROJETO</p>
          <h2>Ritmo de execução e saldo pendente</h2>
        </div>
        ${renderWeightSummary(input.weightModel)}
      </section>

      ${renderComparisonSection(input.versionComparison)}

      <section class="report-section">
        <div class="section-header">
          <p class="section-kicker">DISCIPLINAS</p>
          <h2>Distribuicao do impacto por frente estrutural</h2>
        </div>
        ${renderDisciplines(input.disciplines, input.weightModel, input.compensationByDiscipline)}
      </section>

      ${renderCriticalDiscipline(input.disciplines, input.compensationByDiscipline)}

      ${renderImmediateAction(input.project, input.weightModel, input.generatedAt)}

      <section class="report-section">
        <div class="section-header">
          <p class="section-kicker">COMPENSACAO OPERACIONAL</p>
          <h2>Capacidade de recuperação</h2>
        </div>
        ${renderCompensation(input.project, input.weightModel, input.generatedAt)}
      </section>

      ${renderGapVsCompensation(input.gapVsCompensation)}

      <section class="report-section">
        <div class="section-header">
          <p class="section-kicker">CONCLUSAO EXECUTIVA</p>
          <h2>Direção recomendada para a gestão</h2>
        </div>
        <p class="executive-copy">${escapeHtml(renderConclusion(input))}</p>
      </section>
    </div>
  </body>
</html>
  `.trim();
}
