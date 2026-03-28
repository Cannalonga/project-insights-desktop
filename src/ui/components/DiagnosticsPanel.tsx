import { useState } from "react";

import type { Diagnostics } from "../../core/diagnostics/build-diagnostics";
import type {
  DiagnosticGroup,
  DiagnosticsAggregation,
} from "../../core/diagnostics/build-diagnostics-aggregation";
import type { DiagnosticIssue } from "../../core/diagnostics/types";

type DiagnosticsPanelProps = {
  diagnostics: Diagnostics | null;
  aggregation: DiagnosticsAggregation | null;
};

const MAX_EXECUTIVE_GROUPS = 5;
const MAX_RAW_ITEMS = 100;

function renderAffectedTasks(group: DiagnosticGroup): string {
  if (group.affectedTaskIds.length === 0) {
    return "Escopo em nivel de projeto";
  }

  return `${group.affectedTaskIds.length} tasks afetadas`;
}

function renderRawDiagnostic(item: DiagnosticIssue): string {
  return `[${item.severity}] [${item.category}] ${item.message}`;
}

export function DiagnosticsPanel({ diagnostics, aggregation }: DiagnosticsPanelProps) {
  const [showDetails, setShowDetails] = useState(false);

  if (!diagnostics || !aggregation) {
    return null;
  }

  if (diagnostics.items.length === 0) {
    return null;
  }

  const executiveGroups = aggregation.topGroups.slice(0, MAX_EXECUTIVE_GROUPS);
  const rawItems = diagnostics.items.slice(0, MAX_RAW_ITEMS);

  return (
    <section className="panel-card">
      <div className="panel-header">
        <div>
          <p className="panel-kicker">Diagnostics</p>
          <h2 className="panel-title">Ruido tecnico resumido para decisao</h2>
        </div>
        <button type="button" className="secondary-button" onClick={() => setShowDetails((current) => !current)}>
          {showDetails ? "Ocultar detalhes" : "Ver detalhes"}
        </button>
      </div>

      <div className="diagnostics-summary">
        <div className="metric-card diagnostic-total error">
          <span className="metric-label">Erros</span>
          <strong>{diagnostics.errors.length}</strong>
        </div>
        <div className="metric-card diagnostic-total warning">
          <span className="metric-label">Warnings</span>
          <strong>{diagnostics.warnings.length}</strong>
        </div>
        <div className="metric-card diagnostic-total info">
          <span className="metric-label">Causas raiz</span>
          <strong>{aggregation.totalGroups}</strong>
        </div>
      </div>

      <p className="panel-description">
        {aggregation.totalItems} ocorrencias brutas preservadas, consolidadas em {aggregation.totalGroups} causas raiz.
      </p>

      <div style={{ marginTop: 16 }}>
        <h3>Principais causas</h3>
        <ul className="clean-list">
          {executiveGroups.map((group) => (
            <li key={group.groupKey}>
              <span className={`alert-pill ${group.severity === "error" ? "pill-critical" : group.severity === "warning" ? "pill-attention" : "pill-info"}`}>
                {group.severity.toUpperCase()}
              </span>
              {" "}
              <strong>{group.title}</strong>
              <div className="muted-text" style={{ marginTop: 6 }}>
                {group.count} ocorrencias. {renderAffectedTasks(group)}.
              </div>
            </li>
          ))}
        </ul>
      </div>

      {showDetails ? (
        <div className="support-grid" style={{ marginTop: 18 }}>
          <div className="support-card">
            <h3>Visao tecnica consolidada</h3>
            <div className="clean-list">
              {aggregation.groups.map((group) => (
                <article key={group.groupKey} className="support-card">
                  <h3>
                    [{group.severity.toUpperCase()}] [{group.category}] {group.title}
                  </h3>
                  <p className="muted-text">
                    {group.count} ocorrencias. {renderAffectedTasks(group)}. Padrao dominante: {group.dominantPattern}.
                  </p>
                  <p>{group.normalizedMessage}</p>
                  <ul className="clean-list">
                    {group.sampleDiagnostics.map((sample, index) => (
                      <li key={`${group.groupKey}-sample-${index}`}>{sample.message}</li>
                    ))}
                  </ul>
                </article>
              ))}
            </div>
          </div>

          <div className="support-card">
            <h3>Lista bruta</h3>
            <p className="muted-text">Volume real preservado: {diagnostics.items.length} diagnostics originais.</p>
            <ul className="clean-list task-list">
              {rawItems.map((item, index) => (
                <li key={`${item.id}-${item.taskId ?? "project"}-${index}`}>{renderRawDiagnostic(item)}</li>
              ))}
            </ul>
            {diagnostics.items.length > MAX_RAW_ITEMS ? (
              <p className="muted-text" style={{ marginTop: 12 }}>
                Exibindo os primeiros {MAX_RAW_ITEMS} itens para leitura. O volume bruto total continua preservado.
              </p>
            ) : null}
          </div>
        </div>
      ) : null}
    </section>
  );
}
