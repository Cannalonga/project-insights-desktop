import type { ExecutiveAlert } from "../alerts/build-executive-alerts";
import type { OperationalCompensationDiscipline } from "../compensation/build-operational-compensation";
import type { GapVsCompensation } from "../compensation/build-gap-vs-compensation";
import type { ProjectDiscipline } from "../disciplines/build-project-disciplines";
import type { Project } from "../model/project";
import { buildOperationalTaskViews } from "../operations/build-operational-task-views";
import type { ProjectInsights } from "../insights/build-project-insights";
import type { ScheduleStatus } from "../schedule/build-schedule-status";
import type { ProjectScore } from "../score/build-project-score";
import type { ProjectWeightModel } from "../weight/build-project-weight-model";
import type { ExecutiveReportInput } from "./build-executive-report";

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
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

function renderAlerts(alerts: ExecutiveAlert[]): string {
  const topAlerts = alerts
    .slice()
    .sort((left, right) => severityRank(left.severity) - severityRank(right.severity))
    .slice(0, 5);

  if (topAlerts.length === 0) {
    return '<p class="muted">Nenhum alerta executivo relevante foi identificado neste recorte.</p>';
  }

  return `
    <ul class="alert-list">
      ${topAlerts
        .map(
          (alert) => `
            <li>
              <span class="tag ${statusTone(alert.severity)}">[${severityTag(alert.severity)}]</span>
              <span>${escapeHtml(alert.message)}</span>
            </li>
          `,
        )
        .join("")}
    </ul>
  `;
}

function renderScheduleSummary(insights: ProjectInsights, scheduleStatus?: ScheduleStatus): string {
  const schedulePerformance = insights.schedulePerformance;

  return `
    <div class="metric-grid two">
      <article class="metric-card">
        <span>Status de prazo</span>
        <strong>${escapeHtml(scheduleStatus?.status ?? schedulePerformance?.status ?? "SEM LEITURA")}</strong>
      </article>
      <article class="metric-card">
        <span>Tasks atrasadas</span>
        <strong>${schedulePerformance ? formatNumber(schedulePerformance.tasksDelayed, 0) : "n/a"}</strong>
      </article>
      <article class="metric-card">
        <span>Atraso medio</span>
        <strong>${schedulePerformance ? `${formatNumber(schedulePerformance.averageDelay)} dias` : "n/a"}</strong>
      </article>
      <article class="metric-card">
        <span>Maior atraso</span>
        <strong>${schedulePerformance ? `${formatNumber(schedulePerformance.maxDelay)} dias` : "n/a"}</strong>
      </article>
    </div>
    ${schedulePerformance?.message ? `<p class="support-copy">${escapeHtml(schedulePerformance.message)}</p>` : ""}
  `;
}

function renderWeightSummary(weightModel: ProjectWeightModel): string {
  return `
    <div class="metric-grid four">
      <article class="metric-card">
        <span>Valor total normalizado</span>
        <strong>${formatNumber(weightModel.normalizedProjectValue, 0)}</strong>
      </article>
      <article class="metric-card">
        <span>Valor executado</span>
        <strong>${formatNumber(weightModel.totalEarnedNormalizedValue, 0)}</strong>
      </article>
      <article class="metric-card">
        <span>Valor pendente</span>
        <strong>${formatNumber(weightModel.totalRemainingNormalizedValue, 0)}</strong>
      </article>
      <article class="metric-card">
        <span>Avanco ponderado</span>
        <strong>${formatPercent(weightModel.progressWeightedPercent)}</strong>
      </article>
    </div>
    <p class="footnote">Escala normalizada para analise de impacto. Nao representa custo real.</p>
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
  const taskWeights = new Map(weightModel.taskWeights.map((task) => [task.taskId, task]));
  const topTask = buildOperationalTaskViews(weightModel, project, generatedAt, 1)[0];

  if (!topTask) {
    return '<p class="muted">Nao ha task critica suficiente para destacar neste momento.</p>';
  }

  const sourceTask = project.tasks.find((task) => task.id === topTask.taskId);
  const sourceWeight = taskWeights.get(topTask.taskId);
  const plannedStart = formatDate(sourceTask?.startDate ?? "");
  const plannedFinish = formatDate(sourceTask?.endDate ?? "");
  const actualStart = formatDate(sourceTask?.actualStartDate ?? "");
  const actualFinish = formatDate(sourceTask?.actualEndDate ?? "");
  const scheduleItems = [
    plannedStart ? `Inicio planejado ${plannedStart}` : null,
    plannedFinish ? `Fim planejado ${plannedFinish}` : null,
    actualStart ? `Inicio real ${actualStart}` : null,
    actualFinish ? `Fim real ${actualFinish}` : null,
  ].filter(Boolean);

  return `
    <article class="highlight-card">
      <p class="section-kicker">PONTO CRITICO DE ACAO IMEDIATA</p>
      <h3>${escapeHtml(topTask.name)}</h3>
      <div class="metric-grid two compact">
        <article class="metric-card">
          <span>Disciplina</span>
          <strong>${escapeHtml(topTask.disciplineName ?? "n/a")}</strong>
        </article>
        <article class="metric-card">
          <span>Impacto</span>
          <strong>${formatPercent(topTask.impactPercent)}</strong>
        </article>
        <article class="metric-card">
          <span>Valor pendente</span>
          <strong>${formatPercent(topTask.impactPercent)}</strong>
        </article>
        <article class="metric-card">
          <span>Status operacional</span>
          <strong>${escapeHtml(topTask.statusLabel)}</strong>
        </article>
      </div>
      ${scheduleItems.length > 0 ? `<p class="support-copy">${escapeHtml(scheduleItems.join(" | "))}</p>` : ""}
      <p class="highlight-copy">Executar esta acao pode gerar ate ${formatPercent(topTask.impactPercent)} de avanco no projeto.</p>
    </article>
  `;
}

function renderCompensation(project: Project, weightModel: ProjectWeightModel, generatedAt: string): string {
  const taskViews = buildOperationalTaskViews(weightModel, project, generatedAt, 5);

  if (taskViews.length === 0) {
    return '<p class="muted">Nao ha tasks suficientes para leitura operacional de compensacao.</p>';
  }

  return `
    <div class="metric-grid three">
      <article class="metric-card">
        <span>Top 3 impacto</span>
        <strong>${formatPercent(taskViews.slice(0, 3).reduce((sum, task) => sum + task.impactPercent, 0))}</strong>
      </article>
      <article class="metric-card">
        <span>Top 5 impacto</span>
        <strong>${formatPercent(taskViews.slice(0, 5).reduce((sum, task) => sum + task.impactPercent, 0))}</strong>
      </article>
      <article class="metric-card">
        <span>Tasks consideradas</span>
        <strong>${formatNumber(taskViews.length, 0)}</strong>
      </article>
    </div>
    <ul class="task-list">
      ${taskViews
        .map(
          (task) => `
            <li>
              <strong>${escapeHtml(task.name)}</strong>
              <span>${escapeHtml(task.disciplineName ?? "n/a")} | impacto ${formatPercent(task.impactPercent)} | status ${escapeHtml(task.statusLabel)}</span>
            </li>
          `,
        )
        .join("")}
    </ul>
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
        <h2>Leitura de cobertura do gap</h2>
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

function resolveProjectName(input: ExecutiveReportInput): string {
  return input.projectDisplayName?.trim() || input.project.name || "Projeto sem identificacao";
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
      .muted {
        color: #52606d;
        line-height: 1.5;
      }
      .highlight-card {
        border: 1px solid #f0d49a;
        background: linear-gradient(180deg, #fffdf7 0%, #fff9ef 100%);
      }
      .highlight-copy {
        font-size: 16px;
        font-weight: 700;
        margin-bottom: 0;
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
            <span>Data da analise</span>
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
          <p class="section-kicker">ALERTAS EXECUTIVOS</p>
          <h2>Sinais prioritarios para decisao</h2>
        </div>
        ${renderAlerts(input.executiveAlerts)}
      </section>

      <section class="report-section">
        <div class="section-header">
          <p class="section-kicker">PRAZO</p>
          <h2>Leitura objetiva do cronograma</h2>
        </div>
        ${renderScheduleSummary(input.insights, input.scheduleStatus)}
      </section>

      <section class="report-section">
        <div class="section-header">
          <p class="section-kicker">PESO NORMALIZADO</p>
          <h2>Base de impacto do projeto</h2>
        </div>
        ${renderWeightSummary(input.weightModel)}
      </section>

      <section class="report-section">
        <div class="section-header">
          <p class="section-kicker">DISCIPLINAS</p>
          <h2>Leitura por frente estrutural</h2>
        </div>
        ${renderDisciplines(input.disciplines, input.weightModel, input.compensationByDiscipline)}
      </section>

      ${renderImmediateAction(input.project, input.weightModel, input.generatedAt)}

      <section class="report-section">
        <div class="section-header">
          <p class="section-kicker">COMPENSACAO OPERACIONAL</p>
          <h2>Capacidade de recuperacao</h2>
        </div>
        ${renderCompensation(input.project, input.weightModel, input.generatedAt)}
      </section>

      ${renderGapVsCompensation(input.gapVsCompensation)}
    </div>
  </body>
</html>
  `.trim();
}

