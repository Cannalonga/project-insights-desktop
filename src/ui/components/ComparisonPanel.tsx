import type { ComparedTaskDelta, VersionComparisonSummary } from "../../app/comparison/compare-project-versions";

type ComparisonPanelProps = {
  comparison?: VersionComparisonSummary | null;
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

function renderTaskList(title: string, items: ComparedTaskDelta[]): JSX.Element {
  return (
    <article className="panel-card compact">
      <div className="panel-header">
        <div>
          <p className="panel-kicker">Comparação</p>
          <h2 className="panel-title">{title}</h2>
        </div>
      </div>
      <ul className="clean-list compact-task-list">
        {items.map((item) => (
          <li key={`${title}-${item.taskId}`}>
            <strong>{item.taskIdentifier}</strong>
            <div className="muted-text">
              Base {formatPercent(item.baseProgressPercent)} | Atual {formatPercent(item.currentProgressPercent)} | Delta {formatPercent(item.deltaProgressPercent)}
            </div>
          </li>
        ))}
      </ul>
    </article>
  );
}

export function ComparisonPanel({ comparison }: ComparisonPanelProps) {
  if (!comparison) {
    return null;
  }

  return (
    <section className="dashboard-grid">
      <section className="panel-card compact">
        <div className="panel-header">
          <div>
            <p className="panel-kicker">Comparar versões</p>
            <h2 className="panel-title">Resumo de evolução</h2>
          </div>
        </div>

        <div className="metrics-grid export-summary-grid">
          <div className="metric-card">
            <span className="metric-label">Arquivo base</span>
            <strong>{comparison.baseFileName}</strong>
          </div>
          <div className="metric-card">
            <span className="metric-label">Arquivo atual</span>
            <strong>{comparison.currentFileName}</strong>
          </div>
          <div className="metric-card">
            <span className="metric-label">Avanço base</span>
            <strong>{formatPercent(comparison.projectProgress.basePercent)}</strong>
          </div>
          <div className="metric-card">
            <span className="metric-label">Avanço atual</span>
            <strong>{formatPercent(comparison.projectProgress.currentPercent)}</strong>
          </div>
          <div className="metric-card">
            <span className="metric-label">Gap do projeto</span>
            <strong>{formatPercent(comparison.projectProgress.deltaPercent)}</strong>
          </div>
        </div>

        <p className="panel-description" style={{ marginTop: 16 }}>{comparison.executiveSummary}</p>
        <p className="panel-description">{comparison.recoveryReading}</p>
      </section>

      {comparison.mostAdvancedTasks.length > 0 ? renderTaskList("Tasks que mais avançaram", comparison.mostAdvancedTasks) : null}
      {comparison.stagnantTasks.length > 0 ? renderTaskList("Tasks sem avanço", comparison.stagnantTasks) : null}
      {comparison.regressionTasks.length > 0 ? renderTaskList("Tasks com regressões", comparison.regressionTasks) : null}
      {comparison.newTasks.length > 0 ? renderTaskList("Tasks novas", comparison.newTasks) : null}
      {comparison.removedTasks.length > 0 ? renderTaskList("Tasks removidas", comparison.removedTasks) : null}
    </section>
  );
}
