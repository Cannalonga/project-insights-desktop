import type {
  OperationalCompensationAnalysis,
  OperationalCompensationDiscipline,
  OperationalCompensationTask,
} from "../../core/compensation/build-operational-compensation";
import type { ExecutiveAlert } from "../../core/alerts/build-executive-alerts";
import type { ProjectDiscipline } from "../../core/disciplines/build-project-disciplines";
import type { LicenseContextState } from "../../core/license/license-types";
import type { Project } from "../../core/model/project";
import type { Task } from "../../core/model/task";
import type { ProjectWeightModel } from "../../core/weight/build-project-weight-model";
import type {
  DecisionAction,
  DecisionActionTask,
} from "../decision/build-decision-actions";
import type { DecisionActionWithNarrative } from "../decision/build-decision-narrative";
import { LicenseGate } from "../license/LicenseGate";
import type { PresentationMode } from "../types/presentation-mode";

type InsightsPanelProps = {
  presentationMode: PresentationMode;
  project?: Project | null;
  disciplines?: ProjectDiscipline[];
  compensationAnalysis?: OperationalCompensationAnalysis | null;
  compensationByDiscipline?: OperationalCompensationDiscipline[];
  weightModel?: ProjectWeightModel | null;
  executiveAlerts?: ExecutiveAlert[];
  decisionActions?: DecisionActionWithNarrative[];
  license: LicenseContextState;
  onRequestLicense: () => Promise<void>;
  onOpenBuyLicense: () => Promise<void>;
};

function formatNumber(value: number, maximumFractionDigits = 2): string {
  return new Intl.NumberFormat("pt-BR", {
    minimumFractionDigits: 0,
    maximumFractionDigits,
  }).format(value);
}

function formatPercent(value: number): string {
  return `${formatNumber(value)}%`;
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

function round2(value: number): number {
  return Number(value.toFixed(2));
}

function resolveTaskIdentifier(task: Task | undefined, fallbackTask: OperationalCompensationTask): string {
  if (task?.outlineNumber?.trim()) {
    return task.outlineNumber.trim();
  }

  return fallbackTask.taskId;
}

function buildTaskScheduleContext(task?: Task): string[] {
  if (!task) {
    return [];
  }

  const items: string[] = [];
  const plannedStart = formatDate(task.startDate);
  const plannedFinish = formatDate(task.endDate);
  const actualStart = formatDate(task.actualStartDate);
  const actualFinish = formatDate(task.actualEndDate);

  if (plannedStart) {
    items.push(`Início planejado ${plannedStart}`);
  }

  if (plannedFinish) {
    items.push(`Fim planejado ${plannedFinish}`);
  }

  if (actualStart) {
    items.push(`Início real ${actualStart}`);
  }

  if (actualFinish) {
    items.push(`Fim real ${actualFinish}`);
  }

  return items;
}

function buildPriorityReason(task: OperationalCompensationTask): string {
  if (task.progressPercent === 0) {
    return "Prioridade por alto valor relativo pendente ainda sem conclusão.";
  }

  if (task.progressPercent < 100) {
    return "Prioridade por alta capacidade de compensação com execução em aberto.";
  }

  return "Prioridade por alto valor relativo pendente no recorte atual.";
}

function formatStatusLine(inProgressTasks: number, notStartedTasks: number): string {
  if (notStartedTasks > inProgressTasks) {
    return `${notStartedTasks} não iniciadas`;
  }

  if (inProgressTasks > 0) {
    return `${inProgressTasks} em andamento`;
  }

  return "Sem pressão operacional relevante";
}

function getAlertClass(severity: ExecutiveAlert["severity"]): string {
  if (severity === "critical") {
    return "pill-critical";
  }

  if (severity === "warning") {
    return "pill-attention";
  }

  return "pill-info";
}

type TaskPresentationGroup = {
  key: string;
  baseName: string;
  tasks: OperationalCompensationTask[];
  leadTask: OperationalCompensationTask;
  occurrenceCount: number;
  impactPercentTotal: number;
  remainingNormalizedValueTotal: number;
  representativeProgressPercent: number;
  predominantDisciplineName?: string;
  predominantDisciplineType: string;
  disciplineNames: string[];
};

function normalizeTaskBaseName(name: string): string {
  return name.trim().replace(/\s+/g, " ").toLocaleLowerCase("pt-BR");
}

function buildTaskPresentationGroups(
  tasks: OperationalCompensationTask[],
  disciplinesByName: Map<string, ProjectDiscipline>,
): TaskPresentationGroup[] {
  const grouped = new Map<string, TaskPresentationGroup>();

  for (const task of tasks) {
    const key = normalizeTaskBaseName(task.name);
    const current = grouped.get(key);

    if (!current) {
      const disciplineName = task.disciplineName?.trim();
      grouped.set(key, {
        key,
        baseName: task.name.trim(),
        tasks: [task],
        leadTask: task,
        occurrenceCount: 1,
        impactPercentTotal: task.impactPercent,
        remainingNormalizedValueTotal: task.remainingNormalizedValue,
        representativeProgressPercent: task.progressPercent,
        predominantDisciplineName: disciplineName,
        predominantDisciplineType: disciplinesByName.get(disciplineName ?? "")?.disciplineType ?? "OUTRO",
        disciplineNames: disciplineName ? [disciplineName] : [],
      });
      continue;
    }

    current.tasks.push(task);
    current.occurrenceCount += 1;
    current.impactPercentTotal = round2(current.impactPercentTotal + task.impactPercent);
    current.remainingNormalizedValueTotal = round2(current.remainingNormalizedValueTotal + task.remainingNormalizedValue);

    if (
      task.remainingNormalizedValue > current.leadTask.remainingNormalizedValue ||
      (task.remainingNormalizedValue === current.leadTask.remainingNormalizedValue && task.impactPercent > current.leadTask.impactPercent)
    ) {
      current.leadTask = task;
    }

    const disciplineName = task.disciplineName?.trim();
    if (disciplineName && !current.disciplineNames.includes(disciplineName)) {
      current.disciplineNames.push(disciplineName);
    }
  }

  for (const group of grouped.values()) {
    const weightedProgressBase = group.tasks.reduce((sum, task) => sum + task.remainingNormalizedValue, 0);
    const weightedProgressValue = group.tasks.reduce(
      (sum, task) => sum + task.progressPercent * task.remainingNormalizedValue,
      0,
    );
    group.representativeProgressPercent =
      weightedProgressBase > 0
        ? round2(weightedProgressValue / weightedProgressBase)
        : round2(group.tasks.reduce((sum, task) => sum + task.progressPercent, 0) / group.tasks.length);

    const disciplineTotals = new Map<string, number>();
    for (const task of group.tasks) {
      const disciplineName = task.disciplineName?.trim();
      if (!disciplineName) {
        continue;
      }

      disciplineTotals.set(
        disciplineName,
        round2((disciplineTotals.get(disciplineName) ?? 0) + task.remainingNormalizedValue),
      );
    }

    const predominantDiscipline = [...disciplineTotals.entries()].sort((left, right) => right[1] - left[1])[0]?.[0];
    group.predominantDisciplineName = predominantDiscipline ?? group.predominantDisciplineName;
    group.predominantDisciplineType =
      disciplinesByName.get(group.predominantDisciplineName ?? "")?.disciplineType ?? "OUTRO";
  }

  return [...grouped.values()].sort((left, right) => {
    if (right.impactPercentTotal !== left.impactPercentTotal) {
      return right.impactPercentTotal - left.impactPercentTotal;
    }

    return right.remainingNormalizedValueTotal - left.remainingNormalizedValueTotal;
  });
}

function buildImpactCompositionData(
  groups: TaskPresentationGroup[],
): Array<{ key: string; label: string; value: number }> {
  return groups.slice(0, 5).map((group, index) => ({
    key: `${group.key}-${index}`,
    label: group.occurrenceCount > 1 ? `${group.baseName} (${group.occurrenceCount})` : group.baseName,
    value: group.impactPercentTotal,
  }));
}

function buildProgressPotentialData(
  weightModel?: ProjectWeightModel | null,
  compensationAnalysis?: OperationalCompensationAnalysis | null,
): Array<{ key: string; label: string; value: number; tone: "neutral" | "warning" | "critical" }> {
  if (!weightModel || !compensationAnalysis) {
    return [];
  }

  return [
    {
      key: "progress",
      label: "Progresso ponderado atual",
      value: weightModel.progressWeightedPercent,
      tone: "neutral",
    },
    {
      key: "top3",
      label: "Potencial das 3 principais",
      value: compensationAnalysis.potential.top3ImpactPercent,
      tone: "warning",
    },
    {
      key: "top5",
      label: "Potencial das 5 principais",
      value: compensationAnalysis.potential.top5ImpactPercent,
      tone: "critical",
    },
  ];
}

function clampPercent(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }

  return Math.max(0, Math.min(100, value));
}

function resolveTaskPendingPercent(
  remainingNormalizedValue: number,
  weightModel?: ProjectWeightModel | null,
): number {
  if (!weightModel || weightModel.normalizedProjectValue <= 0) {
    return 0;
  }

  return clampPercent((remainingNormalizedValue / weightModel.normalizedProjectValue) * 100);
}

function buildRecommendedActionReason(group: TaskPresentationGroup): string {
  if (group.tasks.length > 1) {
    return "Prioridade por concentrar maior valor relativo pendente em tarefas com o mesmo nome operacional.";
  }

  return "Prioridade por maior valor relativo pendente e impacto no projeto.";
}

function buildDisciplineSummary(group: TaskPresentationGroup): string {
  if (group.disciplineNames.length <= 1) {
    return group.predominantDisciplineName ?? "n/a";
  }

  return `${group.predominantDisciplineName ?? group.disciplineNames[0]} +${group.disciplineNames.length - 1}`;
}

function getDemoRecoveryLabel(
  rank: 3 | 5,
  compensationAnalysis: OperationalCompensationAnalysis,
): string {
  const impact = rank === 3 ? compensationAnalysis.potential.top3ImpactPercent : compensationAnalysis.potential.top5ImpactPercent;

  if (impact >= 5) {
    return "Potencial relevante";
  }

  if (impact >= 2) {
    return "Potencial moderado";
  }

  return "Potencial limitado";
}

function buildDecisionTaskScheduleContext(task: DecisionActionTask): string[] {
  const items: string[] = [];
  const plannedStart = task.plannedStart ? formatDate(task.plannedStart) : null;
  const plannedFinish = task.plannedFinish ? formatDate(task.plannedFinish) : null;
  const actualStart = task.actualStart ? formatDate(task.actualStart) : null;
  const actualFinish = task.actualFinish ? formatDate(task.actualFinish) : null;

  if (plannedStart) {
    items.push(`Início planejado ${plannedStart}`);
  }

  if (plannedFinish) {
    items.push(`Fim planejado ${plannedFinish}`);
  }

  if (actualStart) {
    items.push(`Início real ${actualStart}`);
  }

  if (actualFinish) {
    items.push(`Fim real ${actualFinish}`);
  }

  if (task.delayDays > 0) {
    items.push(`Atraso real ${task.delayDays} dias`);
  }

  return items;
}

function formatConfidence(confidence: DecisionAction["confidence"]): string {
  if (confidence === "high") {
    return "Alta";
  }

  if (confidence === "medium") {
    return "Média";
  }

  return "Limitada";
}

function renderDecisionTaskDetails(action: DecisionAction) {
  if (action.relatedTasks.length <= 1) {
    return null;
  }

  return (
    <details className="grouped-task-details">
      <summary>Ver tarefas</summary>
      <div className="grouped-task-items">
        {action.relatedTasks.map((task) => (
          <article key={`${action.id}-${task.taskId}`} className="grouped-task-item">
            <strong>
              [{task.identifier}] {task.name}
            </strong>
            <div className="muted-text">
              Disciplina {task.disciplineType} | projeto/bloco {task.disciplineName ?? "n/a"}
            </div>
            {buildDecisionTaskScheduleContext(task).length > 0 ? (
              <div className="task-context-list compact">
                {buildDecisionTaskScheduleContext(task).map((item) => (
                  <span key={`${task.taskId}-${item}`} className="muted-text">
                    {item}
                  </span>
                ))}
              </div>
            ) : null}
            <div className="grouped-task-metrics muted-text">
              <span>Impacto {formatPercent(task.impactPercent)}</span>
              <span>Valor pendente {formatNumber(task.remainingNormalizedValue)}</span>
              <span>Progresso {formatPercent(task.progressPercent)}</span>
            </div>
          </article>
        ))}
      </div>
    </details>
  );
}

function renderGroupedTaskDetails(
  group: TaskPresentationGroup,
  tasksById: Map<string, Task>,
  disciplinesByName: Map<string, ProjectDiscipline>,
) {
  if (group.tasks.length <= 1) {
    return null;
  }

  return (
    <details className="grouped-task-details">
      <summary>Ver tarefas</summary>
      <div className="grouped-task-items">
        {group.tasks.map((task) => {
          const sourceTask = tasksById.get(task.taskId);
          return (
            <article key={`${group.key}-${task.taskId}`} className="grouped-task-item">
              <strong>
                [{resolveTaskIdentifier(sourceTask, task)}] {task.name}
              </strong>
              <div className="muted-text">
                Disciplina {disciplinesByName.get(task.disciplineName ?? "")?.disciplineType ?? "OUTRO"} | projeto/bloco{" "}
                {task.disciplineName ?? "n/a"}
              </div>
              {buildTaskScheduleContext(sourceTask).length > 0 ? (
                <div className="task-context-list compact">
                  {buildTaskScheduleContext(sourceTask).map((item) => (
                    <span key={`${task.taskId}-${item}`} className="muted-text">
                      {item}
                    </span>
                  ))}
                </div>
              ) : null}
              <div className="grouped-task-metrics muted-text">
                <span>Impacto {formatPercent(task.impactPercent)}</span>
                <span>Valor pendente {formatNumber(task.remainingNormalizedValue)}</span>
                <span>Progresso {formatPercent(task.progressPercent)}</span>
              </div>
            </article>
          );
        })}
      </div>
    </details>
  );
}

export function InsightsPanel({
  presentationMode,
  project,
  disciplines = [],
  compensationAnalysis,
  compensationByDiscipline = [],
  weightModel,
  executiveAlerts = [],
  decisionActions = [],
  license,
  onRequestLicense,
  onOpenBuyLicense,
}: InsightsPanelProps) {
  const isExecutiveMode = presentationMode === "executive";
  const isLicensed = license.isLicensed;
  const tasksById = new Map((project?.tasks ?? []).map((task) => [task.id, task]));
  const disciplinesByName = new Map(disciplines.map((discipline) => [discipline.name, discipline]));
  const disciplineWeightsByName = new Map((weightModel?.disciplineWeights ?? []).map((discipline) => [discipline.name, discipline]));
  const compensationByDisciplineName = new Map(compensationByDiscipline.map((discipline) => [discipline.disciplineName, discipline]));
  const rawTopTasks = [...(compensationAnalysis?.topTasks ?? [])].sort((left, right) => right.impactPercent - left.impactPercent);
  const groupedTopTasks = buildTaskPresentationGroups(rawTopTasks, disciplinesByName);
  const presentationGroups = isExecutiveMode
    ? groupedTopTasks
    : rawTopTasks.map((task) => buildTaskPresentationGroups([task], disciplinesByName)[0]!).filter(Boolean);
  const recommendedAction = presentationGroups[0] ?? null;
  const impactComposition = buildImpactCompositionData(isExecutiveMode ? groupedTopTasks : presentationGroups);
  const progressPotential = buildProgressPotentialData(weightModel, compensationAnalysis);
  const topAlerts = executiveAlerts.slice(0, isExecutiveMode ? 3 : 5);
  const executiveActions = isExecutiveMode ? decisionActions.slice(0, 3) : [];
  const primaryExecutiveAction = executiveActions[0];
  const hasActionContent = Boolean(primaryExecutiveAction) || presentationGroups.length > 0;
  const alertSummary = {
    critical: topAlerts.filter((alert) => alert.severity === "critical").length,
    warning: topAlerts.filter((alert) => alert.severity === "warning").length,
    info: topAlerts.filter((alert) => alert.severity === "info").length,
  };

  if (presentationGroups.length === 0 && executiveActions.length === 0 && topAlerts.length === 0 && !compensationAnalysis) {
    return null;
  }

  return (
    <section className="dashboard-grid">
        {!isLicensed && hasActionContent ? (
          <section className="panel-card action-panel">
            <div className="panel-header">
              <div>
                <p className="panel-kicker">{isExecutiveMode ? "Visao executiva" : "Prioridades identificadas"}</p>
                <h2 className="panel-title">{isExecutiveMode ? "Leitura premium bloqueada" : "Ações protegidas na demo"}</h2>
              </div>
            </div>
            <p className="panel-description">
              {isExecutiveMode
                ? "A demonstração mostra o status geral do projeto, mas a leitura executiva completa fica disponível apenas na versão licenciada."
                : "A demo confirma que existem ações prioritárias identificadas, mas os detalhes acionáveis ficam disponíveis apenas na versão licenciada."}
            </p>
            <div className="priority-stats">
              <span className="comparison-chip">
                <strong>{isExecutiveMode ? "Ações destacadas" : "Frentes priorizadas"}</strong> {isExecutiveMode ? 3 : presentationGroups.length}
              </span>
              {topAlerts.length > 0 ? (
                <span className="comparison-chip">
                  <strong>Sinais detectados</strong> {topAlerts.length}
                </span>
              ) : null}
              {recommendedAction ? (
                <span className="comparison-chip">
                  <strong>Impacto agregado</strong> {formatPercent(recommendedAction.impactPercentTotal)}
                </span>
              ) : null}
            </div>
          </section>
        ) : isExecutiveMode && primaryExecutiveAction ? (
          <LicenseGate
            feature="executive_full_view"
            license={license}
            onRequestLicense={onRequestLicense}
            onOpenBuyLicense={onOpenBuyLicense}
            fallback={
              <section className="panel-card action-panel">
                <div className="panel-header">
                  <div>
                    <p className="panel-kicker">Visao executiva</p>
                    <h2 className="panel-title">Leitura premium bloqueada</h2>
                  </div>
                </div>
                <p className="panel-description">
                  A demonstracao mostra o status geral do projeto, mas a leitura executiva completa e liberada apenas
                  na versao licenciada.
                </p>
                <div className="priority-stats">
                  <span className="comparison-chip">
                    <strong>Acao lider</strong> {primaryExecutiveAction.narrative.shortLabel}
                  </span>
                  <span className="comparison-chip">
                    <strong>Disciplina principal</strong> {primaryExecutiveAction.disciplineType}
                  </span>
                </div>
              </section>
            }
          >
            <section className="panel-card action-panel">
            <div className="panel-header">
              <div>
                <p className="panel-kicker">Decisão imediata</p>
              <h2 className="panel-title">Top 3 ações</h2>
            </div>
          </div>

          <article className="recommended-action-card">
            <p className="panel-kicker">AÇÃO PRIORITÁRIA</p>
            <p className="priority-command-text">Se você fizer apenas uma coisa agora, faça isso.</p>
            <h3 className="recommended-action-title">{primaryExecutiveAction.narrative.shortLabel}</h3>
            <p className="panel-description">{primaryExecutiveAction.narrative.headline}</p>
            <p className="priority-cause-text">
              <strong>Causa principal identificada:</strong> {primaryExecutiveAction.cause.explanation}
            </p>
            <div className="priority-stats">
              <span className="comparison-chip">
                <strong>Disciplina principal</strong> {primaryExecutiveAction.disciplineType}
              </span>
              <span className="comparison-chip">
                <strong>Projeto/bloco principal</strong> {primaryExecutiveAction.disciplineName ?? "n/a"}
              </span>
              <span className="impact-negative">
                <strong>Impacto principal</strong> {formatPercent(primaryExecutiveAction.impactPercent)}
              </span>
              <span className="comparison-chip">
                <strong>Ganho estimado</strong> {formatPercent(primaryExecutiveAction.gainPercent)}
              </span>
              <span className="comparison-chip">
                <strong>Confiança</strong> {formatConfidence(primaryExecutiveAction.confidence)}
              </span>
            </div>
            <div className="micro-bar-grid">
              <div className="micro-bar-row">
                <div className="micro-bar-meta">
                  <span>Impacto no avanço do projeto</span>
                  <strong>{formatPercent(primaryExecutiveAction.impactPercent)}</strong>
                </div>
                <div className="micro-bar-track">
                  <div className="micro-bar-fill impact" style={{ width: `${clampPercent(primaryExecutiveAction.impactPercent)}%` }} />
                </div>
              </div>
              <div className="micro-bar-row">
                <div className="micro-bar-meta">
                  <span>Valor relativo pendente</span>
                  <strong>{formatNumber(primaryExecutiveAction.remainingNormalizedValue)}</strong>
                </div>
                <div className="micro-bar-track">
                  <div
                    className="micro-bar-fill pending"
                    style={{ width: `${resolveTaskPendingPercent(primaryExecutiveAction.remainingNormalizedValue, weightModel)}%` }}
                  />
                </div>
              </div>
              <div className="micro-bar-row">
                <div className="micro-bar-meta">
                  <span>Progresso do grupo</span>
                  <strong>{formatPercent(primaryExecutiveAction.representativeProgressPercent)}</strong>
                </div>
                <div className="micro-bar-track">
                  <div className="micro-bar-fill progress" style={{ width: `${clampPercent(primaryExecutiveAction.representativeProgressPercent)}%` }} />
                </div>
              </div>
            </div>

            <div className="support-summary-list">
              <article className="support-summary-item">
                <strong>Por que essa ação?</strong>
                <span className="muted-text">{primaryExecutiveAction.narrative.explanation}</span>
              </article>
              {primaryExecutiveAction.consequences.length > 0 ? (
                <article className="support-summary-item">
                  <strong>Consequência da inação</strong>
                  <span className="muted-text">{primaryExecutiveAction.narrative.consequence}</span>
                </article>
              ) : null}
            </div>

            <p className="recommended-action-outcome">
              Executar esta ação pode avançar o projeto em até {formatPercent(primaryExecutiveAction.gainPercent)}.
            </p>
            {renderDecisionTaskDetails(primaryExecutiveAction)}
          </article>

          <p className="action-section-title">Top 3 ações para esta leitura</p>
            <div className="priority-list">
              {executiveActions.map((action, index) => (
              <article key={action.id} className={`priority-card ${index < 3 ? "top-ranked" : ""}`}>
                <span className="priority-rank">#{index + 1}</span>
                <strong>{action.narrative.shortLabel}</strong>
                <p className="priority-cause-text compact">
                  <strong>Causa:</strong> {action.cause.label}
                </p>
                <div className="priority-stats">
                  <span className="comparison-chip">
                    <strong>Disciplina</strong> {action.disciplineType}
                  </span>
                  <span className="comparison-chip">
                    <strong>Projeto/bloco</strong> {action.disciplineName ?? "n/a"}
                  </span>
                  <span className="impact-negative">
                    <strong>Impacto</strong> {formatPercent(action.impactPercent)}
                  </span>
                </div>
                <p className="priority-reason">{action.narrative.headline}</p>
                {renderDecisionTaskDetails(action)}
              </article>
              ))}
            </div>
            </section>
          </LicenseGate>
        ) : presentationGroups.length > 0 ? (
        <section className="panel-card action-panel">
          <div className="panel-header">
            <div>
              <p className="panel-kicker">{isExecutiveMode ? "Decisão imediata" : "Tarefas prioritárias"}</p>
              <h2 className="panel-title">{isExecutiveMode ? "Top 3 ações" : "Onde agir primeiro"}</h2>
            </div>
          </div>

          {recommendedAction ? (
            <article className="recommended-action-card">
              <p className="panel-kicker">{isExecutiveMode ? "AÇÃO PRIORITÁRIA" : "Ação recomendada"}</p>
              {isExecutiveMode ? (
                <p className="priority-command-text">Se você fizer apenas uma coisa agora, faça isso.</p>
              ) : null}
              <h3 className="recommended-action-title">
                {recommendedAction.tasks.length > 1
                  ? `${recommendedAction.baseName} (${recommendedAction.occurrenceCount} tarefas)`
                  : recommendedAction.baseName}
              </h3>
              <div className="priority-stats">
                <span className="comparison-chip">
                  <strong>Disciplina principal</strong> {recommendedAction.predominantDisciplineType}
                </span>
                <span className="comparison-chip">
                  <strong>Projeto/bloco principal</strong> {buildDisciplineSummary(recommendedAction)}
                </span>
                {!isExecutiveMode ? (
                  <span className="comparison-chip">
                    <strong>Ocorrências reais</strong> {recommendedAction.occurrenceCount}
                  </span>
                ) : null}
                <span className="impact-negative">
                  <strong>{isExecutiveMode ? "Impacto principal" : "Impacto total no avanço ponderado do projeto"}</strong> {formatPercent(recommendedAction.impactPercentTotal)}
                </span>
                <span className="comparison-chip">
                  <strong>{isExecutiveMode ? "Ganho estimado" : "Valor relativo pendente total"}</strong>{" "}
                  {isExecutiveMode
                    ? formatPercent(recommendedAction.impactPercentTotal)
                    : formatNumber(recommendedAction.remainingNormalizedValueTotal)}
                </span>
                {!isExecutiveMode ? (
                  <span className="comparison-chip">
                    <strong>Ocorrências reais</strong> {recommendedAction.occurrenceCount}
                  </span>
                ) : null}
              </div>
              {isExecutiveMode && recommendedAction.tasks.length > 1 ? (
                <p className="grouped-task-note">
                  Grupo visual de tarefas reais com o mesmo nome operacional. O detalhe individual continua disponível abaixo.
                </p>
              ) : null}
              {buildTaskScheduleContext(tasksById.get(recommendedAction.leadTask.taskId)).length > 0 ? (
                <div className="task-context-list">
                  {buildTaskScheduleContext(tasksById.get(recommendedAction.leadTask.taskId)).map((item) => (
                    <span key={`${recommendedAction.key}-${item}`} className="muted-text">{item}</span>
                  ))}
                </div>
              ) : null}
              <div className="micro-bar-grid">
                <div className="micro-bar-row">
                  <div className="micro-bar-meta">
                    <span>Impacto total no avanço ponderado do projeto</span>
                    <strong>{formatPercent(recommendedAction.impactPercentTotal)}</strong>
                  </div>
                  <div className="micro-bar-track">
                    <div className="micro-bar-fill impact" style={{ width: `${clampPercent(recommendedAction.impactPercentTotal)}%` }} />
                  </div>
                </div>
                {!isExecutiveMode ? (
                  <div className="micro-bar-row">
                    <div className="micro-bar-meta">
                      <span>Valor relativo pendente total</span>
                      <strong>{formatNumber(recommendedAction.remainingNormalizedValueTotal)}</strong>
                    </div>
                    <div className="micro-bar-track">
                      <div
                        className="micro-bar-fill pending"
                        style={{ width: `${resolveTaskPendingPercent(recommendedAction.remainingNormalizedValueTotal, weightModel)}%` }}
                      />
                    </div>
                  </div>
                ) : null}
                <div className="micro-bar-row">
                  <div className="micro-bar-meta">
                    <span>{isExecutiveMode ? "Progresso do grupo" : "Progresso representativo do grupo"}</span>
                    <strong>{formatPercent(recommendedAction.representativeProgressPercent)}</strong>
                  </div>
                  <div className="micro-bar-track">
                    <div className="micro-bar-fill progress" style={{ width: `${clampPercent(recommendedAction.representativeProgressPercent)}%` }} />
                  </div>
                </div>
                {recommendedAction.predominantDisciplineName && disciplineWeightsByName.get(recommendedAction.predominantDisciplineName) ? (
                  <div className="micro-bar-row">
                    <div className="micro-bar-meta">
                      <span>Avanço da disciplina</span>
                      <strong>{formatPercent(disciplineWeightsByName.get(recommendedAction.predominantDisciplineName)!.progressWeightedPercent)}</strong>
                    </div>
                    <div className="micro-bar-track">
                      <div
                        className="micro-bar-fill discipline-progress"
                        style={{ width: `${clampPercent(disciplineWeightsByName.get(recommendedAction.predominantDisciplineName)!.progressWeightedPercent)}%` }}
                      />
                    </div>
                  </div>
                ) : null}
                {recommendedAction.predominantDisciplineName && compensationByDisciplineName.get(recommendedAction.predominantDisciplineName) ? (
                  <div className="micro-bar-row">
                    <div className="micro-bar-meta">
                      <span>Impacto pendente por disciplina</span>
                      <strong>{formatPercent(compensationByDisciplineName.get(recommendedAction.predominantDisciplineName)!.impactPercent)}</strong>
                    </div>
                    <div className="micro-bar-track">
                      <div
                        className="micro-bar-fill discipline-impact"
                        style={{ width: `${clampPercent(compensationByDisciplineName.get(recommendedAction.predominantDisciplineName)!.impactPercent)}%` }}
                      />
                    </div>
                  </div>
                ) : null}
              </div>
              <p className="priority-reason">{buildRecommendedActionReason(recommendedAction)}</p>
              <p className="recommended-action-outcome">
                Executar esta ação pode gerar até {formatPercent(recommendedAction.impactPercentTotal)} de avanço no projeto.
              </p>
              {isExecutiveMode ? renderGroupedTaskDetails(recommendedAction, tasksById, disciplinesByName) : null}
            </article>
          ) : null}

          <div className="priority-list">
            {(isExecutiveMode ? presentationGroups.slice(0, 3) : presentationGroups).map((group, index) => (
              <article key={`${group.key}-${index}`} className={`priority-card ${index < 3 ? "top-ranked" : ""}`}>
                {index < 3 ? <span className="priority-rank">#{index + 1}</span> : null}
                <strong>
                  {group.occurrenceCount > 1
                    ? `${group.baseName} (${group.occurrenceCount} tarefas)`
                    : isExecutiveMode
                      ? group.baseName
                      : `${resolveTaskIdentifier(tasksById.get(group.leadTask.taskId), group.leadTask)} | ${group.baseName}`}
                </strong>
                <div className="priority-stats">
                  <span className="comparison-chip">
                    <strong>Disciplina principal</strong> {group.predominantDisciplineType}
                  </span>
                  <span className="comparison-chip">
                    <strong>Projeto/bloco principal</strong> {buildDisciplineSummary(group)}
                  </span>
                  {isExecutiveMode ? null : (
                    <span className="comparison-chip">
                      <strong>Ocorrências reais</strong> {group.occurrenceCount}
                    </span>
                  )}
                  <span className="impact-negative">
                    <strong>{isExecutiveMode ? "Impacto principal" : "Impacto total no avanço ponderado do projeto"}</strong> {formatPercent(group.impactPercentTotal)}
                  </span>
                  {isExecutiveMode ? null : (
                    <span className="comparison-chip">
                      <strong>Valor relativo pendente total</strong> {formatNumber(group.remainingNormalizedValueTotal)}
                    </span>
                  )}
                </div>
                {isExecutiveMode && group.occurrenceCount > 1 ? (
                  <p className="grouped-task-note">
                    Agrupamento visual proposital para reduzir ruído. As tarefas abaixo continuam distintas no cronograma.
                  </p>
                ) : null}
                {buildTaskScheduleContext(tasksById.get(group.leadTask.taskId)).length > 0 ? (
                  <div className="task-context-list">
                    {buildTaskScheduleContext(tasksById.get(group.leadTask.taskId)).map((item) => (
                      <span key={`${group.key}-${item}`} className="muted-text">{item}</span>
                    ))}
                  </div>
                ) : null}
                <div className="micro-bar-grid compact">
                  <div className="micro-bar-row">
                    <div className="micro-bar-meta">
                      <span>Impacto total no avanço ponderado do projeto</span>
                      <strong>{formatPercent(group.impactPercentTotal)}</strong>
                    </div>
                    <div className="micro-bar-track">
                      <div className="micro-bar-fill impact" style={{ width: `${clampPercent(group.impactPercentTotal)}%` }} />
                    </div>
                  </div>
                  {!isExecutiveMode ? (
                    <div className="micro-bar-row">
                      <div className="micro-bar-meta">
                        <span>Valor relativo pendente total</span>
                        <strong>{formatNumber(group.remainingNormalizedValueTotal)}</strong>
                      </div>
                      <div className="micro-bar-track">
                        <div className="micro-bar-fill pending" style={{ width: `${resolveTaskPendingPercent(group.remainingNormalizedValueTotal, weightModel)}%` }} />
                      </div>
                    </div>
                  ) : null}
                  <div className="micro-bar-row">
                    <div className="micro-bar-meta">
                      <span>{isExecutiveMode ? "Progresso do grupo" : "Progresso representativo do grupo"}</span>
                      <strong>{formatPercent(group.representativeProgressPercent)}</strong>
                    </div>
                    <div className="micro-bar-track">
                      <div className="micro-bar-fill progress" style={{ width: `${clampPercent(group.representativeProgressPercent)}%` }} />
                    </div>
                  </div>
                  {group.predominantDisciplineName && disciplineWeightsByName.get(group.predominantDisciplineName) ? (
                    <div className="micro-bar-row">
                      <div className="micro-bar-meta">
                        <span>Avanço da disciplina</span>
                        <strong>{formatPercent(disciplineWeightsByName.get(group.predominantDisciplineName)!.progressWeightedPercent)}</strong>
                      </div>
                      <div className="micro-bar-track">
                        <div
                          className="micro-bar-fill discipline-progress"
                          style={{ width: `${clampPercent(disciplineWeightsByName.get(group.predominantDisciplineName)!.progressWeightedPercent)}%` }}
                        />
                      </div>
                    </div>
                  ) : null}
                  {group.predominantDisciplineName && compensationByDisciplineName.get(group.predominantDisciplineName) ? (
                    <div className="micro-bar-row">
                      <div className="micro-bar-meta">
                        <span>Impacto pendente por disciplina</span>
                        <strong>{formatPercent(compensationByDisciplineName.get(group.predominantDisciplineName)!.impactPercent)}</strong>
                      </div>
                      <div className="micro-bar-track">
                        <div
                          className="micro-bar-fill discipline-impact"
                          style={{ width: `${clampPercent(compensationByDisciplineName.get(group.predominantDisciplineName)!.impactPercent)}%` }}
                        />
                      </div>
                    </div>
                  ) : null}
                </div>
                <p className="priority-reason">
                  {isExecutiveMode && group.tasks.length > 1
                    ? "Grupo priorizado por alto impacto consolidado e valor pendente concentrado."
                    : buildPriorityReason(group.leadTask)}
                </p>
                {isExecutiveMode ? renderGroupedTaskDetails(group, tasksById, disciplinesByName) : null}
              </article>
            ))}
          </div>
        </section>
      ) : null}

      {compensationAnalysis ? (
        <section className="panel-card compact">
          <div className="panel-header">
            <div>
              <p className="panel-kicker">Compensação operacional</p>
              <h2 className="panel-title">Capacidade de recuperação</h2>
            </div>
          </div>

          <div className="decision-grid compact-grid">
            <article className="metric-card">
              <span className="metric-label">Impacto potencial de compensação das 3 principais tasks</span>
              <strong>
                {isLicensed ? formatPercent(compensationAnalysis.potential.top3ImpactPercent) : getDemoRecoveryLabel(3, compensationAnalysis)}
              </strong>
            </article>
            <article className="metric-card">
              <span className="metric-label">Impacto potencial de compensação das 5 principais tasks</span>
              <strong>
                {isLicensed ? formatPercent(compensationAnalysis.potential.top5ImpactPercent) : getDemoRecoveryLabel(5, compensationAnalysis)}
              </strong>
            </article>
          </div>

            <p className="panel-description" style={{ marginTop: 16 }}>
              {isLicensed
                ? compensationAnalysis.potential.message
                : "A demo mostra o potencial agregado de compensação. Ative a licença para visualizar os vetores operacionais completos."}
            </p>

            <LicenseGate
              feature="recovery_full"
              license={license}
              onRequestLicense={onRequestLicense}
              onOpenBuyLicense={onOpenBuyLicense}
              fallback={
                <div className="license-preview-card" style={{ marginTop: 18 }}>
                  <p className="panel-description">
                    A demonstracao mostra o potencial agregado de compensacao, mas a leitura operacional completa fica
                    disponivel apenas na versao licenciada.
                  </p>
                </div>
              }
            >
              <>
                {!isExecutiveMode && impactComposition.length > 0 ? (
                  <div className="visual-support-grid" style={{ marginTop: 18 }}>
                    <article className="support-chart-card">
                      <p className="panel-kicker">Composição por impacto</p>
                      <h3 className="support-chart-title">Tasks com maior peso pendente</h3>
                      <div className="impact-bar-chart" role="img" aria-label="Composição por impacto das tasks prioritárias">
                        {impactComposition.map((item) => (
                          <div key={item.key} className="impact-bar-row">
                            <div className="impact-bar-header">
                              <span className="impact-bar-label" title={item.label}>{item.label}</span>
                              <strong>{formatPercent(item.value)}</strong>
                            </div>
                            <div className="impact-bar-track">
                              <div className="impact-bar-fill" style={{ width: `${Math.max(item.value, 2)}%` }} />
                            </div>
                          </div>
                        ))}
                      </div>
                    </article>

                    <article className="support-chart-card">
                      <p className="panel-kicker">Progresso x potencial</p>
                      <h3 className="support-chart-title">Leitura comparativa</h3>
                      <div className="comparison-bars" role="img" aria-label="Comparação entre progresso atual e potencial de compensação">
                        {progressPotential.map((item) => (
                          <div key={item.key} className="comparison-bar-row">
                            <div className="comparison-bar-header">
                              <span>{item.label}</span>
                              <strong>{formatPercent(item.value)}</strong>
                            </div>
                            <div className="comparison-bar-track">
                              <div className={`comparison-bar-fill ${item.tone}`} style={{ width: `${Math.max(item.value, 2)}%` }} />
                            </div>
                          </div>
                        ))}
                      </div>
                    </article>
                  </div>
                ) : null}

                {!isExecutiveMode ? (
                  <ul className="clean-list compact-task-list" style={{ marginTop: 16 }}>
            {(isExecutiveMode ? presentationGroups.slice(0, 3) : presentationGroups).map((group, index) => (
              <li key={`comp-${group.key}-${index}`}>
                <strong>
                  {group.occurrenceCount > 1
                    ? `${group.baseName} (${group.occurrenceCount} tarefas)`
                    : `${resolveTaskIdentifier(tasksById.get(group.leadTask.taskId), group.leadTask)} | ${group.baseName}`}
                </strong>
                <div className="muted-text">
                  Disciplina principal {group.predominantDisciplineType} | projeto/bloco principal {buildDisciplineSummary(group)} | impacto total no avanço ponderado do projeto {formatPercent(group.impactPercentTotal)} | valor relativo pendente total {formatNumber(group.remainingNormalizedValueTotal)}
                </div>
                {isExecutiveMode && group.occurrenceCount > 1 ? (
                  <p className="grouped-task-note compact">
                    Agrupamento visual de tarefas reais com o mesmo nome operacional para reduzir duplicação aparente.
                  </p>
                ) : null}
                <div className="micro-bar-grid compact" style={{ marginTop: 10 }}>
                  <div className="micro-bar-row">
                    <div className="micro-bar-meta">
                      <span>Impacto total no avanço ponderado do projeto</span>
                      <strong>{formatPercent(group.impactPercentTotal)}</strong>
                    </div>
                    <div className="micro-bar-track">
                      <div className="micro-bar-fill impact" style={{ width: `${clampPercent(group.impactPercentTotal)}%` }} />
                    </div>
                  </div>
                  {!isExecutiveMode ? (
                    <div className="micro-bar-row">
                      <div className="micro-bar-meta">
                        <span>Valor relativo pendente total</span>
                        <strong>{formatNumber(group.remainingNormalizedValueTotal)}</strong>
                      </div>
                      <div className="micro-bar-track">
                        <div className="micro-bar-fill pending" style={{ width: `${resolveTaskPendingPercent(group.remainingNormalizedValueTotal, weightModel)}%` }} />
                      </div>
                    </div>
                  ) : null}
                  <div className="micro-bar-row">
                    <div className="micro-bar-meta">
                      <span>{isExecutiveMode ? "Progresso do grupo" : "Progresso representativo do grupo"}</span>
                      <strong>{formatPercent(group.representativeProgressPercent)}</strong>
                    </div>
                    <div className="micro-bar-track">
                      <div className="micro-bar-fill progress" style={{ width: `${clampPercent(group.representativeProgressPercent)}%` }} />
                    </div>
                  </div>
                  {group.predominantDisciplineName && disciplineWeightsByName.get(group.predominantDisciplineName) ? (
                    <div className="micro-bar-row">
                      <div className="micro-bar-meta">
                        <span>Avanço da disciplina</span>
                        <strong>{formatPercent(disciplineWeightsByName.get(group.predominantDisciplineName)!.progressWeightedPercent)}</strong>
                      </div>
                      <div className="micro-bar-track">
                        <div
                          className="micro-bar-fill discipline-progress"
                          style={{ width: `${clampPercent(disciplineWeightsByName.get(group.predominantDisciplineName)!.progressWeightedPercent)}%` }}
                        />
                      </div>
                    </div>
                  ) : null}
                  {group.predominantDisciplineName && compensationByDisciplineName.get(group.predominantDisciplineName) ? (
                    <div className="micro-bar-row">
                      <div className="micro-bar-meta">
                        <span>Impacto pendente por disciplina</span>
                        <strong>{formatPercent(compensationByDisciplineName.get(group.predominantDisciplineName)!.impactPercent)}</strong>
                      </div>
                      <div className="micro-bar-track">
                        <div
                          className="micro-bar-fill discipline-impact"
                          style={{ width: `${clampPercent(compensationByDisciplineName.get(group.predominantDisciplineName)!.impactPercent)}%` }}
                        />
                      </div>
                    </div>
                  ) : null}
                </div>
                <div className="muted-text">
                  {isExecutiveMode && group.tasks.length > 1
                    ? "Conjunto de tarefas relacionadas ao mesmo nome operacional com alta capacidade de compensação."
                    : buildPriorityReason(group.leadTask)}
                </div>
                {isExecutiveMode ? renderGroupedTaskDetails(group, tasksById, disciplinesByName) : null}
              </li>
            ))}
                  </ul>
                ) : null}
              </>
            </LicenseGate>
          </section>
        ) : null}

      {topAlerts.length > 0 && !isExecutiveMode ? (
        <section className="panel-card compact">
          <div className="panel-header">
            <div>
              <p className="panel-kicker">Alertas executivos</p>
              <h2 className="panel-title">Sinais prioritários</h2>
            </div>
          </div>

          {isLicensed ? (
            <ul className="clean-list">
              {topAlerts.map((alert) => (
                <li key={alert.id}>
                  <span className={`alert-pill ${getAlertClass(alert.severity)}`}>{alert.severity.toUpperCase()}</span>{" "}
                  <strong>{alert.message}</strong>
                </li>
              ))}
            </ul>
          ) : (
            <>
              <div className="metrics-grid export-summary-grid">
                <div className="metric-card">
                  <span className="metric-label">Críticos</span>
                  <strong>{alertSummary.critical}</strong>
                </div>
                <div className="metric-card">
                  <span className="metric-label">Atenção</span>
                  <strong>{alertSummary.warning}</strong>
                </div>
                <div className="metric-card">
                  <span className="metric-label">Informativos</span>
                  <strong>{alertSummary.info}</strong>
                </div>
              </div>
              <p className="panel-description" style={{ marginTop: 16 }}>
                A demo mostra a presença de sinais prioritários, mas os alertas detalhados ficam disponíveis apenas na
                versão licenciada.
              </p>
            </>
          )}
        </section>
      ) : null}
    </section>
  );
}

