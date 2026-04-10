import type { ComparedTaskDelta, VersionComparisonSummary } from "../../app/comparison/compare-project-versions";
import type { LicenseContextState } from "../../core/license/license-types";
import { LicenseGate } from "../license/LicenseGate";

type ComparisonPanelProps = {
  comparison?: VersionComparisonSummary | null;
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

function renderTaskList(title: string, items: ComparedTaskDelta[]): JSX.Element {
  return (
    <article className="panel-card compact">
      <div className="panel-header">
        <div>
          <p className="panel-kicker">{"Compara\u00e7\u00e3o"}</p>
          <h2 className="panel-title">{title}</h2>
        </div>
      </div>
      <ul className="clean-list compact-task-list">
        {items.map((item) => (
          <li key={`${title}-${item.taskId}`}>
            <strong>{item.taskIdentifier}</strong>
            <div className="muted-text">
              Base {formatPercent(item.baseProgressPercent)} | Atual {formatPercent(item.currentProgressPercent)} | Delta{" "}
              {formatPercent(item.deltaProgressPercent)}
            </div>
          </li>
        ))}
      </ul>
    </article>
  );
}

export function ComparisonPanel({ comparison, license, onRequestLicense, onOpenBuyLicense }: ComparisonPanelProps) {
  if (!comparison) {
    return null;
  }

  return (
    <section className="dashboard-grid">
      <section className="panel-card compact">
        <div className="panel-header">
          <div>
            <p className="panel-kicker">{"Comparar vers\u00f5es"}</p>
            <h2 className="panel-title">{"Resumo de evolu\u00e7\u00e3o"}</h2>
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
            <span className="metric-label">{"Avan\u00e7o base"}</span>
            <strong>{formatPercent(comparison.projectProgress.basePercent)}</strong>
          </div>
          <div className="metric-card">
            <span className="metric-label">{"Avan\u00e7o atual"}</span>
            <strong>{formatPercent(comparison.projectProgress.currentPercent)}</strong>
          </div>
          <div className="metric-card">
            <span className="metric-label">Gap do projeto</span>
            <strong>{formatPercent(comparison.projectProgress.deltaPercent)}</strong>
          </div>
        </div>

        <p className="panel-description" style={{ marginTop: 16 }}>
          {comparison.executiveSummary}
        </p>
        <p className="panel-description">{comparison.recoveryReading}</p>
      </section>

      <LicenseGate
        feature="comparison_task_lists"
        license={license}
        onRequestLicense={onRequestLicense}
        onOpenBuyLicense={onOpenBuyLicense}
        fallback={
          <article className="panel-card compact">
            <div className="panel-header">
              <div>
                <p className="panel-kicker">{"Compara\u00e7\u00e3o"}</p>
                <h2 className="panel-title">Detalhes protegidos na demo</h2>
              </div>
            </div>
            <div className="metrics-grid export-summary-grid">
              <div className="metric-card">
                <span className="metric-label">{"Tasks que avan\u00e7aram"}</span>
                <strong>{comparison.mostAdvancedTasks.length}</strong>
              </div>
              <div className="metric-card">
                <span className="metric-label">{"Sem avan\u00e7o"}</span>
                <strong>{comparison.stagnantTasks.length}</strong>
              </div>
              <div className="metric-card">
                <span className="metric-label">{"Regress\u00f5es"}</span>
                <strong>{comparison.regressionTasks.length}</strong>
              </div>
            </div>
            <p className="panel-description" style={{ marginTop: 16 }}>
              {"A demo confirma que h\u00e1 mudan\u00e7as relevantes entre vers\u00f5es, mas a lista operacional por task fica dispon\u00edvel apenas na vers\u00e3o licenciada."}
            </p>
          </article>
        }
      >
        <>
          {comparison.mostAdvancedTasks.length > 0 ? renderTaskList("Tasks que mais avan\u00e7aram", comparison.mostAdvancedTasks) : null}
          {comparison.stagnantTasks.length > 0 ? renderTaskList("Tasks sem avan\u00e7o", comparison.stagnantTasks) : null}
          {comparison.regressionTasks.length > 0 ? renderTaskList("Tasks com regress\u00f5es", comparison.regressionTasks) : null}
          {comparison.newTasks.length > 0 ? renderTaskList("Tasks novas", comparison.newTasks) : null}
          {comparison.removedTasks.length > 0 ? renderTaskList("Tasks removidas", comparison.removedTasks) : null}
        </>
      </LicenseGate>
    </section>
  );
}
