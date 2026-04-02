import type { ExecutiveAlert } from "../alerts/build-executive-alerts";
import type {
  OperationalCompensationAnalysis,
  OperationalCompensationDiscipline,
} from "../compensation/build-operational-compensation";
import type { GapVsCompensation } from "../compensation/build-gap-vs-compensation";
import type { DiagnosticsAggregation } from "../diagnostics/build-diagnostics-aggregation";
import type { ProjectDiscipline } from "../disciplines/build-project-disciplines";
import type { ProjectInsights } from "../insights/build-project-insights";
import type { Project } from "../model/project";
import {
  buildOperationalTaskViews,
  calculateTopImpactPercent,
  type OperationalTaskView,
} from "../operations/build-operational-task-views";
import type {
  DisciplineProgressAnalysis,
  DisciplineProgressTask,
} from "../progress/build-discipline-progress";
import type { AnalysisReliability } from "../reliability/build-analysis-reliability";
import type { SCurveResult } from "../s-curve/build-s-curve";
import type { ScheduleStatus } from "../schedule/build-schedule-status";
import type { ProjectScore } from "../score/build-project-score";
import type { ProjectWeightModel } from "../weight/build-project-weight-model";
import type { VersionComparisonSummary } from "../../app/comparison/compare-project-versions";

export type ExecutiveReportInput = {
  project: Project;
  projectDisplayName?: string;
  analysisAreaLabel?: string;
  generatedAt: string;
  diagnosticsAggregation?: DiagnosticsAggregation;
  score: ProjectScore;
  executiveAlerts: ExecutiveAlert[];
  insights: ProjectInsights;
  disciplines: ProjectDiscipline[];
  weightModel: ProjectWeightModel;
  disciplineProgress?: DisciplineProgressAnalysis;
  sCurve?: SCurveResult;
  scheduleStatus?: ScheduleStatus;
  analysisReliability?: AnalysisReliability;
  compensationAnalysis: OperationalCompensationAnalysis;
  compensationByDiscipline: OperationalCompensationDiscipline[];
  gapVsCompensation?: GapVsCompensation;
  versionComparison?: VersionComparisonSummary;
};

function hasUsableName(name: string | undefined): boolean {
  if (!name) {
    return false;
  }

  const normalized = name.trim().toLowerCase();
  return normalized.length > 0 && normalized !== "sem nome";
}

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
  return `${formatNumber(value, 2)}%`;
}

function formatDisplayDate(value: string): string {
  const parsed = new Date(`${value}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }

  return parsed.toLocaleDateString("pt-BR");
}

function formatAxisDate(value: string): string {
  const parsed = new Date(`${value}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }

  const months = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];
  return `${months[parsed.getMonth()]}/${String(parsed.getFullYear()).slice(-2)}`;
}

function shouldRenderCurveLabel(points: SCurveResult["points"], index: number): boolean {
  if (index === 0 || index === points.length - 1 || index % 4 === 0) {
    return true;
  }

  const current = new Date(`${points[index].date}T00:00:00`);
  const previous = new Date(`${points[index - 1].date}T00:00:00`);

  if (Number.isNaN(current.getTime()) || Number.isNaN(previous.getTime())) {
    return false;
  }

  return current.getMonth() !== previous.getMonth() || current.getFullYear() !== previous.getFullYear();
}

function toCurvePercent(value: number, percentBaseValue: number): number {
  if (percentBaseValue <= 0) {
    return 0;
  }

  return (value / percentBaseValue) * 100;
}

function buildCurvePath(values: number[], width: number, height: number, padding: number): string {
  if (values.length === 0) {
    return "";
  }

  const stepX = values.length === 1 ? 0 : (width - padding * 2) / (values.length - 1);

  return values
    .map((value, index) => {
      const x = padding + stepX * index;
      const y = height - padding - ((Math.max(0, Math.min(100, value)) / 100) * (height - padding * 2));
      return `${index === 0 ? "M" : "L"} ${x} ${y}`;
    })
    .join(" ");
}

function getCurveCoordinate(
  value: number,
  index: number,
  total: number,
  width: number,
  height: number,
  padding: number,
): { x: number; y: number } {
  const stepX = total <= 1 ? 0 : (width - padding * 2) / (total - 1);
  const x = padding + stepX * index;
  const y = height - padding - ((Math.max(0, Math.min(100, value)) / 100) * (height - padding * 2));

  return { x, y };
}

function getCurveChartWidth(pointCount: number): number {
  return Math.max(800, pointCount * 20);
}

function calculatePercent(part: number, total: number): number {
  if (total <= 0) {
    return 0;
  }

  return (part / total) * 100;
}

function formatDateTime(value: string): string {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }

  return parsed.toLocaleString("pt-BR");
}

function resolveProjectDisplayName(
  project: Project,
  disciplines: ProjectDiscipline[],
  weightModel: ProjectWeightModel,
  explicitName?: string,
): string {
  if (hasUsableName(explicitName)) {
    return explicitName!.trim();
  }

  if (hasUsableName(project.name)) {
    return project.name.trim();
  }

  const dominantDiscipline = weightModel.disciplineWeights
    .slice()
    .sort((left, right) => right.totalNormalizedValue - left.totalNormalizedValue)[0];
  if (dominantDiscipline?.name) {
    return dominantDiscipline.name;
  }

  const firstDiscipline = disciplines.find((discipline) => hasUsableName(discipline.name));
  if (firstDiscipline?.name) {
    return firstDiscipline.name.trim();
  }

  const rootSummary = project.tasks.find((task) => task.isSummary && task.outlineLevel === 1 && hasUsableName(task.name));
  if (rootSummary?.name) {
    return rootSummary.name.trim();
  }

  const firstTask = project.tasks.find((task) => hasUsableName(task.name));
  if (firstTask?.name) {
    return firstTask.name.trim();
  }

  return "Projeto sem identificação";
}

function renderReliabilitySection(
  analysisReliability: AnalysisReliability | undefined,
  analysisAreaLabel: string,
): string {
  if (!analysisReliability) {
    return "";
  }

  return `
    <section class="card">
      <h2>Confiabilidade da análise</h2>
      <p class="context">Universo considerado: consistência das leituras produzidas para o recorte ${escapeHtml(analysisAreaLabel)}.</p>
      <div class="grid two">
        <div class="metric"><span>Confiabilidade geral</span><strong>${escapeHtml(analysisReliability.overallReliability)}</strong></div>
        <div class="metric"><span>Progresso</span><strong>${escapeHtml(analysisReliability.progressReliability)}</strong></div>
        <div class="metric"><span>Prazo</span><strong>${escapeHtml(analysisReliability.scheduleReliability)}</strong></div>
        <div class="metric"><span>Qualidade de dados</span><strong>${escapeHtml(analysisReliability.dataQualityReliability)}</strong></div>
      </div>
      <p>${escapeHtml(analysisReliability.explanation)}</p>
    </section>
  `;
}

function buildDecisionSummary(
  score: ProjectScore,
  diagnosticsAggregation: DiagnosticsAggregation | undefined,
): string {
  const dominantGroup = diagnosticsAggregation?.topGroups[0];

  if (dominantGroup?.severity === "error" && dominantGroup.category === "data-quality") {
    return `O cronograma está em estado ${score.status} devido principalmente a falhas de qualidade de dados concentradas em ${dominantGroup.title.toLowerCase()}.`;
  }

  if (dominantGroup?.severity === "error") {
    return `O cronograma está em estado ${score.status} devido principalmente a ${dominantGroup.title.toLowerCase()}.`;
  }

  return score.summaryMessage;
}

function renderScheduleSection(
  insights: ProjectInsights,
  analysisAreaLabel: string,
  scheduleStatus?: ScheduleStatus,
): string {
  if (!scheduleStatus) {
    if (!insights.schedulePerformance) {
      return `
        <p class="context">Critério técnico: apenas tasks do recorte ${escapeHtml(analysisAreaLabel)} com baseline e datas reais suficientes entram na leitura de prazo.</p>
        <p class="muted">Não há dados reais suficientes para leitura de prazo.</p>
      `;
    }

    return `
      <p class="context">Tasks consideradas: ${formatNumber(insights.schedulePerformance.totalTasks, 0)} (com baseline e datas reais suficientes no recorte ${escapeHtml(analysisAreaLabel)}).</p>
      <div class="grid two">
        <div class="metric"><span>Status de prazo</span><strong>${escapeHtml(insights.schedulePerformance.status)}</strong></div>
        <div class="metric"><span>Tasks atrasadas</span><strong>${formatNumber(insights.schedulePerformance.tasksDelayed, 0)} de ${formatNumber(insights.schedulePerformance.totalTasks, 0)} (${formatPercent(calculatePercent(insights.schedulePerformance.tasksDelayed, insights.schedulePerformance.totalTasks))})</strong></div>
        <div class="metric"><span>Atraso médio</span><strong>${formatNumber(insights.schedulePerformance.averageDelay)} dias</strong></div>
        <div class="metric"><span>Maior atraso</span><strong>${formatNumber(insights.schedulePerformance.maxDelay)} dias</strong></div>
      </div>
      <p>${escapeHtml(insights.schedulePerformance.message)}</p>
    `;
  }

  return `
    <p class="context">${escapeHtml(scheduleStatus.criteria)} Universo considerado: ${formatNumber(scheduleStatus.consideredWeightedTasks, 0)} tasks com peso válido de ${formatNumber(scheduleStatus.totalWeightedTasks, 0)} no recorte ${escapeHtml(analysisAreaLabel)}.</p>
    <div class="grid two">
      <div class="metric"><span>Status do prazo</span><strong>${escapeHtml(scheduleStatus.status)}</strong></div>
      <div class="metric"><span>Progresso real</span><strong>${formatPercent(scheduleStatus.progressReal)}</strong></div>
      <div class="metric"><span>Progresso esperado</span><strong>${formatPercent(scheduleStatus.progressExpected)}</strong></div>
      <div class="metric"><span>Gap</span><strong>${formatPercent(scheduleStatus.gap)}</strong></div>
    </div>
    <p>${escapeHtml(scheduleStatus.explanation)}</p>
  `;
}

function renderSCurveSection(
  sCurve: SCurveResult | undefined,
  analysisAreaLabel: string,
): string {
  if (!sCurve || sCurve.points.length === 0) {
    return `
      <section class="card">
        <h2>Curva S</h2>
        <p class="context">Universo considerado: distribuição semanal do recorte ${escapeHtml(analysisAreaLabel)}.</p>
        <p class="muted">${escapeHtml(sCurve?.explanation ?? "Não há base suficiente para gerar Curva S neste recorte.")}</p>
      </section>
    `;
  }

  const currentPoint = sCurve.points[sCurve.points.length - 1];
  const plannedNow = toCurvePercent(currentPoint.plannedAccumulated, sCurve.percentBaseValue);
  const realNow = toCurvePercent(currentPoint.realAccumulated, sCurve.percentBaseValue);
  const currentGap = Number((realNow - plannedNow).toFixed(2));

  return `
    <section class="card s-curve-card">
      <h2>Curva S</h2>
      <p class="context">Leitura semanal do recorte ${escapeHtml(analysisAreaLabel)} com foco no desvio atual entre planejado e realizado.</p>
      <div class="s-curve-highlight">
        <span class="badge badge-warning">Planejado atual ${formatPercent(plannedNow)}</span>
        <span class="badge ${currentGap < 0 ? "badge-danger" : "badge-ok"}">Real atual ${formatPercent(realNow)}</span>
        <span class="badge ${currentGap < 0 ? "badge-danger" : "badge-ok"}">Gap atual ${formatPercent(currentGap)}</span>
      </div>
      <div class="chart-scroll">
        <svg width="${getCurveChartWidth(sCurve.points.length)}" height="300" viewBox="0 0 ${getCurveChartWidth(sCurve.points.length)} 300" role="img" aria-label="Curva S acumulada">
          <line x1="52" y1="20" x2="52" y2="236" stroke="#94a3b8" stroke-width="1" />
          <line x1="52" y1="236" x2="${getCurveChartWidth(sCurve.points.length) - 20}" y2="236" stroke="#94a3b8" stroke-width="1" />
          ${[0, 25, 50, 75, 100]
            .map((value) => {
              const y = 236 - (value / 100) * 216;
              return `
                <g>
                  <line x1="52" y1="${y}" x2="${getCurveChartWidth(sCurve.points.length) - 20}" y2="${y}" stroke="#e2e8f0" stroke-width="1" />
                  <text x="10" y="${y + 4}" font-size="12" fill="#475569">${value}%</text>
                </g>
              `;
            })
            .join("")}
          <path d="${buildCurvePath(
            sCurve.points.map((point) => toCurvePercent(point.plannedAccumulated, sCurve.percentBaseValue)),
            getCurveChartWidth(sCurve.points.length),
            280,
            52,
          )}" fill="none" stroke="#2563eb" stroke-width="3" />
          <path d="${buildCurvePath(
            sCurve.points.map((point) => toCurvePercent(point.replannedAccumulated, sCurve.percentBaseValue)),
            getCurveChartWidth(sCurve.points.length),
            280,
            52,
          )}" fill="none" stroke="#f97316" stroke-width="3" />
          <path d="${buildCurvePath(
            sCurve.points.map((point) => toCurvePercent(point.realAccumulated, sCurve.percentBaseValue)),
            getCurveChartWidth(sCurve.points.length),
            280,
            52,
          )}" fill="none" stroke="#dc2626" stroke-width="3" />
          ${[
            {
              label: "Planejado acumulado",
              color: "#2563eb",
              values: sCurve.points.map((point) => toCurvePercent(point.plannedAccumulated, sCurve.percentBaseValue)),
            },
            {
              label: "Replanejado acumulado",
              color: "#f97316",
              values: sCurve.points.map((point) => toCurvePercent(point.replannedAccumulated, sCurve.percentBaseValue)),
            },
            {
              label: "Real acumulado",
              color: "#dc2626",
              values: sCurve.points.map((point) => toCurvePercent(point.realAccumulated, sCurve.percentBaseValue)),
            },
          ]
            .map((series) =>
              sCurve.points
                .map((point, index) => {
                  const coordinate = getCurveCoordinate(
                    series.values[index],
                    index,
                    sCurve.points.length,
                    getCurveChartWidth(sCurve.points.length),
                    280,
                    52,
                  );
                  return `
                    <circle cx="${coordinate.x}" cy="${coordinate.y}" r="3" fill="${series.color}">
                      <title>${escapeHtml(`${series.label}: ${formatDisplayDate(point.date)} - ${formatPercent(series.values[index])}`)}</title>
                    </circle>
                  `;
                })
                .join(""),
            )
            .join("")}
          ${sCurve.points
            .map((point, index) => {
              if (!shouldRenderCurveLabel(sCurve.points, index)) {
                return "";
              }

              const { x } = getCurveCoordinate(0, index, sCurve.points.length, getCurveChartWidth(sCurve.points.length), 280, 52);
              const anchor = index === 0 ? "start" : index === sCurve.points.length - 1 ? "end" : "middle";
              return `<text x="${x}" y="262" font-size="11" fill="#475569" text-anchor="${anchor}" transform="rotate(-35 ${x} 262)">${escapeHtml(formatAxisDate(point.date))}</text>`;
            })
            .join("")}
        </svg>
      </div>
      <ul>
        <li><strong>Azul:</strong> planejado acumulado</li>
        <li><strong>Laranja:</strong> replanejado acumulado</li>
        <li><strong>Vermelho:</strong> real acumulado</li>
      </ul>
      <details>
        <summary>Série semanal detalhada</summary>
        <table>
          <thead>
            <tr>
              <th>Semana</th>
              <th>Planejado acum.</th>
              <th>Replanejado acum.</th>
              <th>Real acum.</th>
            </tr>
          </thead>
          <tbody>
            ${sCurve.points
              .map(
                (point) => `
                  <tr>
                    <td>${escapeHtml(formatDisplayDate(point.date))}</td>
                    <td>${formatPercent(toCurvePercent(point.plannedAccumulated, sCurve.percentBaseValue))}</td>
                    <td>${formatPercent(toCurvePercent(point.replannedAccumulated, sCurve.percentBaseValue))}</td>
                    <td>${formatPercent(toCurvePercent(point.realAccumulated, sCurve.percentBaseValue))}</td>
                  </tr>
                `,
              )
              .join("")}
          </tbody>
        </table>
      </details>
    </section>
  `;
}

function renderDisciplinesTable(
  disciplines: ProjectDiscipline[],
  weightModel: ProjectWeightModel,
  analysisAreaLabel: string,
): string {
  const disciplineWeightsByOutline = new Map(
    weightModel.disciplineWeights.map((discipline) => [discipline.outlineNumber, discipline]),
  );
  const sortedDisciplines = [...disciplines].sort((left, right) => left.score.value - right.score.value);

  if (sortedDisciplines.length === 0) {
    return `
      <p class="context">Universo considerado: recorte ${escapeHtml(analysisAreaLabel)}.</p>
      <p class="muted">Nenhuma disciplina estrutural identificada no recorte atual.</p>
    `;
  }

  if (sortedDisciplines.length === 1) {
    const discipline = sortedDisciplines[0];
    const weight = disciplineWeightsByOutline.get(discipline.outlineNumber);

    return `
      <p class="context">Universo considerado: leitura disciplinar do recorte ${escapeHtml(analysisAreaLabel)}.</p>
      <p><strong>Score:</strong> ${formatNumber(discipline.score.value, 0)} (${escapeHtml(discipline.score.status.toUpperCase())})</p>
      <p><strong>Valor pendente:</strong> ${formatNumber(weight?.remainingNormalizedValue ?? 0)}</p>
      <p><strong>Avanço ponderado:</strong> ${formatPercent(weight?.progressWeightedPercent ?? 0)}</p>
    `;
  }

  return `
    <p class="context">Universo considerado: disciplinas estruturais identificadas dentro do recorte ${escapeHtml(analysisAreaLabel)}.</p>
    <table>
      <thead>
        <tr>
          <th>Disciplina</th>
          <th>Score</th>
          <th>Status</th>
          <th>Valor pendente</th>
          <th>Avanço ponderado</th>
        </tr>
      </thead>
      <tbody>
        ${sortedDisciplines
          .map((discipline) => {
            const weight = disciplineWeightsByOutline.get(discipline.outlineNumber);

            return `
              <tr>
                <td>${escapeHtml(discipline.name)}</td>
                <td>${formatNumber(discipline.score.value, 0)}</td>
                <td>${escapeHtml(discipline.score.status.toUpperCase())}</td>
                <td>${formatNumber(weight?.remainingNormalizedValue ?? 0)}</td>
                <td>${formatPercent(weight?.progressWeightedPercent ?? 0)}</td>
              </tr>
            `;
          })
          .join("")}
      </tbody>
    </table>
  `;
}

function renderCompensationTasks(
  project: Project,
  weightModel: ProjectWeightModel,
  analysisAreaLabel: string,
  generatedAt: string,
): string {
  const taskViews = buildOperationalTaskViews(weightModel, project, generatedAt);
  const includeDiscipline = new Set(
    taskViews
      .map((task) => task.disciplineName?.trim())
      .filter((name): name is string => Boolean(name)),
  ).size > 1;
  const top3ImpactPercent = calculateTopImpactPercent(taskViews, 3);

  if (taskViews.length === 0) {
    return `
      <p class="context">Base de valor pendente: ${formatNumber(weightModel.totalRemainingNormalizedValue)} da área ${escapeHtml(analysisAreaLabel)}, distribuída entre ${formatNumber(weightModel.taskWeights.length, 0)} tasks operacionais com peso válido.</p>
      <p class="muted">Não há tasks operacionalmente relevantes na janela atual do recorte.</p>
    `;
  }

  return `
    <p class="context">As 3 tarefas abaixo representam ${formatPercent(top3ImpactPercent)} do avanço potencial do recorte ${escapeHtml(analysisAreaLabel)}.</p>
    <table class="task-impact-table">
      <thead>
        <tr>
          <th>Task</th>
          <th>Previsto</th>
          <th>Real</th>
          <th>Gap</th>
          <th>Impacto no avanço</th>
        </tr>
      </thead>
      <tbody>
      ${taskViews
        .map(
          (task, index) => `
            <tr class="${index < 3 ? "top-priority" : ""}">
              <td>
                <span class="task-name">${escapeHtml(task.name)}</span>
                <span class="task-subline">${escapeHtml(task.taskIdentifier)}${includeDiscipline && task.disciplineName ? ` | ${escapeHtml(task.disciplineName)}` : ""}</span>
              </td>
              <td>${task.expectedPercent === null ? "n/a" : formatPercent(task.expectedPercent)}</td>
              <td>${formatPercent(task.realPercent)}</td>
              <td class="${task.gapPercent !== null && task.gapPercent < 0 ? "gap-negative" : "gap-neutral"}">${task.gapPercent === null ? "n/a" : formatPercent(task.gapPercent)}</td>
              <td class="${task.impactPercent > 0 ? "impact-negative" : "gap-neutral"}">${formatPercent(task.impactPercent)}</td>
            </tr>
          `,
        )
        .join("")}
      </tbody>
    </table>
  `;
}

function renderCompensationByDiscipline(
  compensationByDiscipline: OperationalCompensationDiscipline[],
  analysisAreaLabel: string,
): string {
  if (compensationByDiscipline.length === 0) {
    return `
      <p class="context">Universo considerado: contribuição das disciplinas para o avanço total do recorte ${escapeHtml(analysisAreaLabel)}.</p>
      <p class="muted">Não há contribuição disciplinar relevante para exibir neste recorte.</p>
    `;
  }

  if (compensationByDiscipline.length === 1) {
    const discipline = compensationByDiscipline[0];

    return `
      <p class="context">Base de cálculo: percentual de contribuição para o avanço total do recorte ${escapeHtml(analysisAreaLabel)}.</p>
      <p>A disciplina representa ${formatPercent(discipline.impactPercent)} do avanço total do recorte analisado.</p>
      <p>As 3 tasks com maior contribuição dentro da disciplina representam ${formatPercent(discipline.top3ImpactPercent)} do avanço total.</p>
    `;
  }

  return `
    <p class="context">Base de cálculo: percentual de contribuição de cada disciplina para o avanço total do recorte ${escapeHtml(analysisAreaLabel)}.</p>
    <table>
      <thead>
        <tr>
          <th>Disciplina</th>
          <th>Participação no avanço total</th>
          <th>3 maiores contribuições</th>
        </tr>
      </thead>
      <tbody>
        ${compensationByDiscipline
          .map(
            (discipline) => `
              <tr>
                <td>${escapeHtml(discipline.disciplineName)}</td>
                <td>${formatPercent(discipline.impactPercent)}</td>
                <td>${formatPercent(discipline.top3ImpactPercent)}</td>
              </tr>
            `,
          )
          .join("")}
      </tbody>
    </table>
  `;
}

function renderOperationalTaskLine(
  task: DisciplineProgressTask,
  mode: "earned" | "pending" | "progress",
  includeDiscipline: boolean,
): string {
  const disciplineSegment = includeDiscipline ? ` | ${escapeHtml(task.disciplineName.toUpperCase())}` : "";

  if (mode === "earned") {
    return `${escapeHtml(task.taskIdentifier)} | ${escapeHtml(task.name)}${disciplineSegment} | ${formatPercent(task.progressPercent)} concluído | valor executado ${formatNumber(task.earnedNormalizedValue)}`;
  }

  if (mode === "progress") {
    return `${escapeHtml(task.taskIdentifier)} | ${escapeHtml(task.name)}${disciplineSegment} | ${formatPercent(task.progressPercent)} concluído | impacto ${formatPercent(task.impactPercent)}`;
  }

  return `${escapeHtml(task.taskIdentifier)} | ${escapeHtml(task.name)}${disciplineSegment} | ${formatPercent(task.progressPercent)} concluído | valor pendente ${formatNumber(task.remainingNormalizedValue)}`;
}

function renderProgressTaskList(
  title: string,
  tasks: DisciplineProgressTask[],
  mode: "earned" | "pending" | "progress",
  emptyMessage: string,
  includeDiscipline = false,
): string {
  if (tasks.length === 0) {
    return `<p class="muted">${escapeHtml(emptyMessage)}</p>`;
  }

  return `
    <div>
      <h3>${escapeHtml(title)}</h3>
      <ul>
        ${tasks.map((task) => `<li>${renderOperationalTaskLine(task, mode, includeDiscipline)}</li>`).join("")}
      </ul>
    </div>
  `;
}

function renderDisciplineProgressSection(
  disciplineProgress: DisciplineProgressAnalysis | undefined,
  analysisAreaLabel: string,
): string {
  if (!disciplineProgress || disciplineProgress.disciplines.length === 0) {
    return `
      <section class="card">
        <h2>Avanço por disciplina</h2>
        <p class="context">Universo considerado: tasks operacionais com peso válido no recorte ${escapeHtml(analysisAreaLabel)}.</p>
        <p class="muted">Não há disciplinas com progresso operacional rastreável neste recorte.</p>
      </section>
    `;
  }

  return `
    <section class="card">
      <h2>Avanço por disciplina</h2>
      <p class="context">Resumo compacto das disciplinas no recorte ${escapeHtml(analysisAreaLabel)} para leitura semanal.</p>
      <table>
        <thead>
          <tr>
            <th>Disciplina</th>
            <th>Avanço ponderado</th>
            <th>Em andamento</th>
            <th>Concluídas</th>
            <th>Não iniciadas</th>
          </tr>
        </thead>
        <tbody>
          ${disciplineProgress.disciplines
            .map(
              (discipline) => `
                <tr>
                  <td>${escapeHtml(discipline.disciplineName)}</td>
                  <td>${formatPercent(discipline.progressWeightedPercent)}</td>
                  <td>${formatNumber(discipline.inProgressTasks, 0)}</td>
                  <td>${formatNumber(discipline.completedTasks, 0)}</td>
                  <td>${formatNumber(discipline.notStartedTasks, 0)}</td>
                </tr>
              `,
            )
            .join("")}
        </tbody>
      </table>
    </section>
  `;
}

export function buildExecutiveReport({
  project,
  projectDisplayName,
  analysisAreaLabel = "Projeto completo",
  generatedAt,
  diagnosticsAggregation,
  score,
  insights,
  disciplines,
  weightModel,
  disciplineProgress,
  sCurve,
  scheduleStatus,
  analysisReliability,
  compensationAnalysis,
  compensationByDiscipline,
}: ExecutiveReportInput): string {
  const resolvedProjectName = resolveProjectDisplayName(project, disciplines, weightModel, projectDisplayName);
  const decisionSummary = buildDecisionSummary(score, diagnosticsAggregation);

  return `
<!DOCTYPE html>
<html lang="pt-BR">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'; img-src data:; style-src 'unsafe-inline';" />
    <title>Relatório Executivo - ${escapeHtml(resolvedProjectName)}</title>
    <style>
      body {
        margin: 0;
        padding: 32px;
        font-family: "Segoe UI", Arial, sans-serif;
        background: linear-gradient(180deg, #eef3ef 0%, #f8faf8 100%);
        color: #1f2933;
      }
      .page {
        max-width: 1120px;
        margin: 0 auto;
      }
      h1, h2, h3 {
        margin: 0 0 12px;
      }
      h1 {
        font-size: 34px;
        letter-spacing: -0.04em;
      }
      h2 {
        font-size: 20px;
        padding-bottom: 8px;
      }
      .card {
        background: #ffffff;
        border: 1px solid #d9e2ec;
        border-radius: 20px;
        padding: 22px;
        margin-bottom: 22px;
        box-shadow: 0 18px 38px rgba(31, 41, 51, 0.06);
      }
      .hero-card {
        background: linear-gradient(145deg, #ffffff, #f7faf7);
      }
      .subcard {
        border-top: 1px solid #e4e7eb;
        padding-top: 16px;
        margin-top: 16px;
      }
      .grid {
        display: grid;
        gap: 12px;
      }
      .grid.two {
        grid-template-columns: repeat(2, minmax(0, 1fr));
      }
      .grid.four {
        grid-template-columns: repeat(4, minmax(0, 1fr));
      }
      .support-row {
        display: grid;
        gap: 16px;
        grid-template-columns: repeat(3, minmax(0, 1fr));
        margin-bottom: 22px;
      }
      .metric {
        background: #f8fafc;
        border: 1px solid #e4e7eb;
        border-radius: 14px;
        padding: 14px;
      }
      .metric span {
        display: block;
        font-size: 12px;
        color: #52606d;
        margin-bottom: 6px;
        text-transform: uppercase;
        letter-spacing: 0.04em;
      }
      .metric strong {
        font-size: 20px;
      }
      .hero-metric strong {
        font-size: 24px;
        letter-spacing: -0.03em;
      }
      .status-ok {
        background: #e7f4ec;
        border-color: #bfdfca;
      }
      .status-attention {
        background: #fff4dc;
        border-color: #f0d49a;
      }
      .status-critical {
        background: #fde8e8;
        border-color: #efb3b3;
      }
      .compact-note {
        margin: 0;
        color: #52606d;
        line-height: 1.45;
      }
      table {
        width: 100%;
        border-collapse: collapse;
      }
      .chart-scroll {
        overflow-x: auto;
        padding-bottom: 8px;
      }
      .s-curve-card {
        padding-bottom: 16px;
      }
      .s-curve-highlight {
        display: inline-flex;
        gap: 10px;
        flex-wrap: wrap;
        margin-bottom: 14px;
      }
      .badge {
        display: inline-flex;
        align-items: center;
        padding: 6px 10px;
        border-radius: 999px;
        font-size: 12px;
        font-weight: 700;
        letter-spacing: 0.04em;
        text-transform: uppercase;
      }
      .badge-ok {
        background: #e7f4ec;
        color: #256c43;
      }
      .badge-warning {
        background: #fff4dc;
        color: #9b6b10;
      }
      .badge-danger {
        background: #fde8e8;
        color: #b83434;
      }
      .task-impact-table {
        width: 100%;
      }
      .task-impact-table tbody tr.top-priority {
        background: #fff6f6;
      }
      .task-impact-table tbody tr.top-priority td:first-child {
        border-left: 4px solid #c43d3d;
      }
      .task-name {
        font-weight: 700;
        font-size: 15px;
        color: #18232d;
      }
      .task-subline {
        display: block;
        margin-top: 4px;
        color: #52606d;
        font-size: 12px;
      }
      .gap-negative,
      .impact-negative {
        color: #b83434;
        font-weight: 700;
      }
      .gap-neutral {
        color: #52606d;
      }
      .footer-note {
        color: #52606d;
        font-size: 12px;
        line-height: 1.5;
      }
      th, td {
        text-align: left;
        padding: 10px 8px;
        border-bottom: 1px solid #e4e7eb;
        vertical-align: top;
      }
      th {
        font-size: 12px;
        text-transform: uppercase;
        color: #52606d;
      }
      ul {
        margin: 0;
        padding-left: 20px;
      }
      li {
        margin-bottom: 8px;
      }
      .muted {
        color: #52606d;
      }
      .context {
        color: #52606d;
        margin: 0 0 14px;
      }
      @media (max-width: 900px) {
        .support-row {
          grid-template-columns: 1fr;
        }
      }
      @media print {
        body {
          background: #ffffff;
          padding: 0;
        }
        .card {
          break-inside: avoid;
        }
      }
    </style>
  </head>
  <body>
    <div class="page">
      <section class="card hero-card">
        <h1>Relatório Executivo</h1>
        <div class="grid two">
          <div class="metric hero-metric"><span>Projeto</span><strong>${escapeHtml(resolvedProjectName)}</strong></div>
          <div class="metric hero-metric"><span>Área do relatório</span><strong>${escapeHtml(analysisAreaLabel)}</strong></div>
          <div class="metric hero-metric ${scheduleStatus?.status === "OK" ? "status-ok" : scheduleStatus?.status === "ATENCAO" ? "status-attention" : "status-critical"}"><span>Status do prazo</span><strong>${escapeHtml(scheduleStatus?.status ?? score.status.toUpperCase())}</strong></div>
          <div class="metric hero-metric ${analysisReliability?.overallReliability === "HIGH" ? "status-ok" : analysisReliability?.overallReliability === "MODERATE" ? "status-attention" : "status-critical"}"><span>Confiabilidade</span><strong>${escapeHtml(analysisReliability?.overallReliability ?? "n/a")}</strong></div>
          <div class="metric hero-metric"><span>Planejado vs real</span><strong>${scheduleStatus ? `${formatPercent(scheduleStatus.progressExpected)} vs ${formatPercent(scheduleStatus.progressReal)}` : "n/a"}</strong></div>
          <div class="metric hero-metric ${scheduleStatus && scheduleStatus.gap < 0 ? "status-critical" : "status-ok"}"><span>Gap atual</span><strong>${scheduleStatus ? formatPercent(scheduleStatus.gap) : "n/a"}</strong></div>
          <div class="metric hero-metric"><span>Leitura semanal</span><strong>${escapeHtml(formatDateTime(generatedAt))}</strong></div>
        </div>
        <p class="compact-note"><strong>Leitura de decisão:</strong> ${escapeHtml(decisionSummary)}</p>
      </section>

      ${renderSCurveSection(sCurve, analysisAreaLabel)}

      <section class="card">
        <h2>Tarefas com impacto no periodo atual</h2>
        ${renderCompensationTasks(project, weightModel, analysisAreaLabel, generatedAt)}
      </section>

      <div class="support-row">
        <section class="card">
          <h2>Status do prazo</h2>
          ${renderScheduleSection(insights, analysisAreaLabel, scheduleStatus)}
        </section>

        ${renderReliabilitySection(analysisReliability, analysisAreaLabel)}

        <section class="card">
          <h2>Avanço planejado vs real</h2>
          <p class="context">Referência do recorte ${escapeHtml(analysisAreaLabel)} no momento da leitura.</p>
          <div class="grid">
            <div class="metric"><span>Real</span><strong>${scheduleStatus ? formatPercent(scheduleStatus.progressReal) : formatPercent(weightModel.progressWeightedPercent)}</strong></div>
            <div class="metric"><span>Planejado</span><strong>${scheduleStatus ? formatPercent(scheduleStatus.progressExpected) : "n/a"}</strong></div>
            <div class="metric"><span>Gap</span><strong>${scheduleStatus ? formatPercent(scheduleStatus.gap) : "n/a"}</strong></div>
          </div>
        </section>
      </div>
      ${renderDisciplineProgressSection(disciplineProgress, analysisAreaLabel)}

      <section class="card">
        <h2>Impacto da disciplina no avanço do projeto</h2>
        ${renderCompensationByDiscipline(compensationByDiscipline, analysisAreaLabel)}
      </section>

      <section class="card">
        <h2>Rodapé técnico</h2>
        <p class="footer-note">${escapeHtml(weightModel.disclaimer)}</p>
      </section>
    </div>
  </body>
</html>
  `.trim();
}

