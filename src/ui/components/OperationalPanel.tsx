import type { GapVsCompensation } from "../../core/compensation/build-gap-vs-compensation";
import type { AnalysisReliability } from "../../core/reliability/build-analysis-reliability";
import type { SCurveResult } from "../../core/s-curve/build-s-curve";
import type { ScheduleStatus } from "../../core/schedule/build-schedule-status";
import type { ProjectScore } from "../../core/score/build-project-score";
import type { PresentationMode } from "../types/presentation-mode";
import type { DecisionActionWithNarrative } from "../decision/build-decision-narrative";
import type { VersionComparisonSummary } from "../../app/comparison/compare-project-versions";

type OperationalPanelProps = {
  presentationMode: PresentationMode;
  score?: ProjectScore | null;
  analysisReliability?: AnalysisReliability | null;
  scheduleStatus?: ScheduleStatus | null;
  gapVsCompensation?: GapVsCompensation | null;
  versionComparison?: VersionComparisonSummary | null;
  sCurve?: SCurveResult | null;
  decisionActions?: DecisionActionWithNarrative[];
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
) {
  const stepX = total <= 1 ? 0 : (width - padding * 2) / (total - 1);
  const x = padding + stepX * index;
  const y = height - padding - ((Math.max(0, Math.min(100, value)) / 100) * (height - padding * 2));

  return { x, y };
}

function getCurveChartWidth(pointCount: number): number {
  if (pointCount <= 16) {
    return 820;
  }

  if (pointCount <= 32) {
    return Math.max(920, pointCount * 28);
  }

  return Math.max(1100, pointCount * 32);
}

function getPillClass(level: string | undefined): string {
  const normalized = level?.toUpperCase() ?? "";

  if (normalized === "OK" || normalized === "HIGH" || normalized === "BOM" || normalized === "EXCELENTE") {
    return "pill-ok";
  }

  if (normalized === "ATENCAO" || normalized === "ATENÇÃO" || normalized === "MODERATE") {
    return "pill-attention";
  }

  return "pill-critical";
}

function compactReliability(level: string | undefined): string {
  if (level === "CRITICAL" || level === "LOW") {
    return "LOW";
  }

  if (level === "MODERATE") {
    return "MODERATE";
  }

  return "HIGH";
}

function describeReliability(level: string | undefined): string {
  const compact = compactReliability(level);

  if (compact === "HIGH") {
    return "Base consistente";
  }

  if (compact === "MODERATE") {
    return "Base parcial";
  }

  return "Base limitada";
}

function buildReliabilityExecutiveNote(analysisReliability: AnalysisReliability): string {
  const dominantIssue = analysisReliability.dominantIssues[0]?.title;
  const blockedReason = analysisReliability.blockedConclusions[0]?.reason;

  if (dominantIssue) {
    return dominantIssue;
  }

  if (blockedReason) {
    return blockedReason;
  }

  return analysisReliability.explanation;
}

function getGapCardTitle(versionComparison?: VersionComparisonSummary | null): string {
  return versionComparison ? "Gap do projeto" : "Gap vs compensação";
}

function getGapCompensationLabel(
  gapVsCompensation?: GapVsCompensation | null,
  versionComparison?: VersionComparisonSummary | null,
): string {
  if (versionComparison) {
    return formatPercent(versionComparison.projectProgress.deltaPercent);
  }

  if (!gapVsCompensation) {
    return "Sem leitura";
  }

  switch (gapVsCompensation.status) {
    case "recoverable":
      return "Recuperável";
    case "tight":
      return "No limite";
    case "insufficient":
      return "Insuficiente";
    default:
      return "Sem base";
  }
}

function getGapSupportText(
  gapVsCompensation?: GapVsCompensation | null,
  versionComparison?: VersionComparisonSummary | null,
): string {
  if (versionComparison) {
    return `Base ${formatPercent(versionComparison.projectProgress.basePercent)} | Atual ${formatPercent(versionComparison.projectProgress.currentPercent)}`;
  }

  if (gapVsCompensation?.gapPercent !== undefined) {
    return `Gap ${formatPercent(gapVsCompensation.gapPercent)} | Top 3 ${formatPercent(gapVsCompensation.top3CompensationPercent)}`;
  }

  return gapVsCompensation?.message ?? "Sem base histórica suficiente";
}

function getGapReading(scheduleStatus?: ScheduleStatus | null): string {
  const gap = scheduleStatus?.gap ?? 0;

  if (gap < 0) {
    return `Desvio atual de ${formatPercent(Math.abs(gap))} abaixo do esperado.`;
  }

  if (gap > 0) {
    return `Real acima do esperado em ${formatPercent(gap)}.`;
  }

  return "Sem desvio percentual relevante no ponto atual.";
}

function renderReliabilityCompact(analysisReliability: AnalysisReliability, presentationMode: PresentationMode) {
  const isExecutiveMode = presentationMode === "executive";

  return (
    <section className="panel-card compact reliability-dashboard">
      <div className="panel-header" style={{ marginBottom: 12 }}>
        <div>
          <p className="panel-kicker">Confiabilidade</p>
          <h2 className="panel-title">Confiança da análise</h2>
        </div>
        <span className={`reliability-pill ${getPillClass(analysisReliability.overallReliability)}`}>
          {isExecutiveMode
            ? describeReliability(analysisReliability.overallReliability)
            : compactReliability(analysisReliability.overallReliability)}
        </span>
      </div>

      <div className="compact-breakdown">
        <span className={`reliability-pill ${getPillClass(analysisReliability.progressReliability)}`}>
          Progresso{" "}
          {isExecutiveMode
            ? describeReliability(analysisReliability.progressReliability).toLowerCase()
            : compactReliability(analysisReliability.progressReliability)}
        </span>
        <span className={`reliability-pill ${getPillClass(analysisReliability.scheduleReliability)}`}>
          Prazo{" "}
          {isExecutiveMode
            ? describeReliability(analysisReliability.scheduleReliability).toLowerCase()
            : compactReliability(analysisReliability.scheduleReliability)}
        </span>
        <span className={`reliability-pill ${getPillClass(analysisReliability.dataQualityReliability)}`}>
          Dados{" "}
          {isExecutiveMode
            ? describeReliability(analysisReliability.dataQualityReliability).toLowerCase()
            : compactReliability(analysisReliability.dataQualityReliability)}
        </span>
      </div>

      {isExecutiveMode ? <p className="panel-description" style={{ marginTop: 12 }}>{buildReliabilityExecutiveNote(analysisReliability)}</p> : null}
    </section>
  );
}


function buildExecutiveCurveReading(scheduleStatus: ScheduleStatus | null | undefined, sCurve: SCurveResult | null | undefined): string {
  if (!sCurve || sCurve.points.length < 2) {
    return getGapReading(scheduleStatus);
  }

  const points = sCurve.points;
  const lastPoint = points[points.length - 1];
  const previousPoint = points[points.length - 2];
  const currentGap = toCurvePercent(lastPoint.realAccumulated, sCurve.percentBaseValue) - toCurvePercent(lastPoint.plannedAccumulated, sCurve.percentBaseValue);
  const previousGap =
    toCurvePercent(previousPoint.realAccumulated, sCurve.percentBaseValue) -
    toCurvePercent(previousPoint.plannedAccumulated, sCurve.percentBaseValue);

  if (currentGap < previousGap - 1) {
    return "TendÃªncia de desvio crescente na Curva S.";
  }

  if (currentGap > previousGap + 1) {
    return "RecuperaÃ§Ã£o recente detectada na Curva S.";
  }

  if (currentGap < 0) {
    return "Avanço real abaixo do planejado no ponto atual.";
  }

  return "Trajetória estável na Curva S neste recorte.";
}

export function OperationalPanel({
  presentationMode,
  score,
  analysisReliability,
  scheduleStatus,
  gapVsCompensation,
  versionComparison,
  sCurve,
  decisionActions = [],
}: OperationalPanelProps) {
  if (!score && !analysisReliability && !scheduleStatus && !gapVsCompensation && !versionComparison && (!sCurve || sCurve.points.length === 0)) {
    return null;
  }

  const curveGap = scheduleStatus?.gap ?? 0;
  const executiveGapReading =
    curveGap < 0 ? `Abaixo do esperado em ${formatPercent(Math.abs(curveGap))}.` : curveGap > 0 ? `Acima do esperado em ${formatPercent(curveGap)}.` : "Sem desvio relevante.";
  const primaryDecision = decisionActions[0];
  const curveChartWidth = sCurve ? getCurveChartWidth(sCurve.points.length) : 820;

  return (
    <section className="dashboard-grid">
      <section className="decision-grid">
        <article className="panel-card executive-card">
          <span className="metric-label">Status geral</span>
          <strong>{score?.status.toUpperCase() ?? "SEM LEITURA"}</strong>
          <span className={`status-pill ${getPillClass(score?.status)}`}>
            {presentationMode === "executive" ? score?.summaryMessage ?? "Sem resumo consolidado" : score?.summaryMessage ?? "Sem resumo"}
          </span>
        </article>

        <article className="panel-card executive-card">
          <span className="metric-label">Score do projeto</span>
          <strong>{score ? formatNumber(score.value, 0) : "n/a"}</strong>
          <span className="muted-text">
            {presentationMode === "executive" ? "Sa\u00fade do cronograma" : "Sa\u00fade consolidada do cronograma"}
          </span>
        </article>

        <article className="panel-card executive-card">
          <span className="metric-label">Status de prazo</span>
          <strong>{scheduleStatus?.status ?? "SEM LEITURA"}</strong>
          <span className={`status-pill ${getPillClass(scheduleStatus?.status)}`}>
            {scheduleStatus
              ? presentationMode === "executive"
                ? executiveGapReading
                : getGapReading(scheduleStatus)
              : "Sem leitura de prazo"}
          </span>
        </article>

        <article className="panel-card executive-card">
          <span className="metric-label">{getGapCardTitle(versionComparison)}</span>
          <strong>{getGapCompensationLabel(gapVsCompensation, versionComparison)}</strong>
          <span className="muted-text">
            {presentationMode === "executive" && primaryDecision && !versionComparison
              ? `Ação líder ${primaryDecision.title} | ganho potencial ${formatPercent(primaryDecision.gainPercent)}`
              : getGapSupportText(gapVsCompensation, versionComparison)}
          </span>
        </article>
      </section>

      {analysisReliability ? renderReliabilityCompact(analysisReliability, presentationMode) : null}

      {sCurve && sCurve.points.length > 0 ? (
        <section className="panel-card chart-card s-curve-primary-card">
          <div className="panel-header">
            <div>
              <p className="panel-kicker">Curva S</p>
              <h2 className="panel-title">Planejado x Executado x Real</h2>
            </div>
            <div className="curve-reading-badges">
              <span className={`status-pill ${curveGap < 0 ? "pill-critical" : curveGap > 0 ? "pill-ok" : "pill-attention"}`}>
                Desvio atual {formatPercent(Math.abs(curveGap))}
              </span>
              <span className="muted-text">
                {presentationMode === "executive" ? buildExecutiveCurveReading(scheduleStatus, sCurve) : getGapReading(scheduleStatus)}
              </span>
            </div>
          </div>

          <div className="chart-scroll">
            <div className="chart-scroll-inner" style={{ minWidth: `${curveChartWidth}px` }}>
              <svg
                width={curveChartWidth}
                height="320"
                viewBox={`0 0 ${curveChartWidth} 320`}
                role="img"
                aria-label="Curva S acumulada"
              >
                <line x1="56" y1="20" x2="56" y2="230" stroke="#94a3b8" strokeWidth="1" />
                <line x1="56" y1="230" x2={curveChartWidth - 24} y2="230" stroke="#94a3b8" strokeWidth="1" />
                {[0, 25, 50, 75, 100].map((value) => {
                  const y = 230 - (value / 100) * 210;
                  return (
                    <g key={value}>
                      <line x1="56" y1={y} x2={curveChartWidth - 24} y2={y} stroke="#e2e8f0" strokeWidth="1" />
                      <text x="10" y={y + 4} fontSize="12" fill="#475569">
                        {value}%
                      </text>
                    </g>
                  );
                })}
                <path
                  d={buildCurvePath(
                    sCurve.points.map((point) => toCurvePercent(point.plannedAccumulated, sCurve.percentBaseValue)),
                    curveChartWidth,
                    270,
                    56,
                  )}
                  fill="none"
                  stroke="#2563eb"
                  strokeWidth="3.5"
                />
                <path
                  d={buildCurvePath(
                    sCurve.points.map((point) => toCurvePercent(point.replannedAccumulated, sCurve.percentBaseValue)),
                    curveChartWidth,
                    270,
                    56,
                  )}
                  fill="none"
                  stroke="#f97316"
                  strokeWidth="3.5"
                />
                <path
                  d={buildCurvePath(
                    sCurve.points.map((point) => toCurvePercent(point.realAccumulated, sCurve.percentBaseValue)),
                    curveChartWidth,
                    270,
                    56,
                  )}
                  fill="none"
                  stroke="#dc2626"
                  strokeWidth="4"
                />
                {[
                  {
                    key: "planned",
                    color: "#2563eb",
                    label: "Planejado acumulado",
                    values: sCurve.points.map((point) => toCurvePercent(point.plannedAccumulated, sCurve.percentBaseValue)),
                  },
                  {
                    key: "replanned",
                    color: "#f97316",
                    label: "Replanejado acumulado",
                    values: sCurve.points.map((point) => toCurvePercent(point.replannedAccumulated, sCurve.percentBaseValue)),
                  },
                  {
                    key: "real",
                    color: "#dc2626",
                    label: "Real acumulado",
                    values: sCurve.points.map((point) => toCurvePercent(point.realAccumulated, sCurve.percentBaseValue)),
                  },
                ].flatMap((series) =>
                  sCurve.points.map((point, index) => {
                    const coordinate = getCurveCoordinate(
                      series.values[index],
                      index,
                      sCurve.points.length,
                      curveChartWidth,
                      270,
                      56,
                    );

                    return (
                      <circle key={`${series.key}-${point.date}`} cx={coordinate.x} cy={coordinate.y} r="3" fill={series.color}>
                        <title>{`${series.label}: ${formatDisplayDate(point.date)} - ${formatPercent(series.values[index])}`}</title>
                      </circle>
                    );
                  }),
                )}
                {sCurve.points.map((point, index) => {
                  if (!shouldRenderCurveLabel(sCurve.points, index)) {
                    return null;
                  }

                  const { x } = getCurveCoordinate(0, index, sCurve.points.length, curveChartWidth, 270, 56);

                  return (
                    <text
                      key={point.date}
                      x={x}
                      y="260"
                      fontSize="11"
                      fill="#475569"
                      textAnchor={index === 0 ? "start" : index === sCurve.points.length - 1 ? "end" : "middle"}
                      transform={`rotate(-35 ${x} 260)`}
                    >
                      {formatAxisDate(point.date)}
                    </text>
                  );
                })}
              </svg>
            </div>
          </div>

          <div className="chart-legend minimal">
            <span><span className="legend-line" style={{ background: "#2563eb" }} /> Planejado</span>
            <span><span className="legend-line" style={{ background: "#f97316" }} /> Executado</span>
            <span><span className="legend-line" style={{ background: "#dc2626" }} /> Real</span>
          </div>
        </section>
      ) : null}
    </section>
  );
}
