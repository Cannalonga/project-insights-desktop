import { useEffect, useRef, useState } from "react";

import type { LicenseContextState } from "../../core/license/license-types";

type LicensePanelProps = {
  license: LicenseContextState;
  loading: boolean;
  importing: boolean;
  exportingLogs: boolean;
  onApplyLicenseText: (contents: string) => Promise<boolean>;
  onExportLogs: () => Promise<void>;
};

function formatDate(value?: string): string {
  if (!value) {
    return "n/a";
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }

  return parsed.toLocaleDateString("pt-BR");
}

function resolveStatusTitle(license: LicenseContextState): string {
  switch (license.status) {
    case "valid":
      return "Licença ativa";
    case "expired":
      return "Licença expirada";
    case "invalid":
      return "Licença inválida";
    default:
      return "Modo demonstração ativo";
  }
}

function resolvePlanLabel(license: LicenseContextState): string {
  if (license.status === "missing") {
    return "Demo";
  }

  if (license.plan === "semiannual") {
    return "Semestral";
  }

  if (license.plan === "annual") {
    return "Anual";
  }

  return license.plan ?? "n/a";
}

function resolveDaysRemaining(license: LicenseContextState): string {
  if (license.daysRemaining === undefined) {
    return "n/a";
  }

  return String(license.daysRemaining);
}

function resolveStatusMessage(license: LicenseContextState): string {
  if (license.status === "valid") {
    return `Licença ativa (${resolvePlanLabel(license).toLowerCase()}).`;
  }

  return license.message;
}

export function LicensePanel({
  license,
  loading,
  importing,
  exportingLogs,
  onApplyLicenseText,
  onExportLogs,
}: LicensePanelProps) {
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    function handleOpenPanel(): void {
      setExpanded(true);
      window.setTimeout(() => {
        textareaRef.current?.focus();
        textareaRef.current?.scrollIntoView({ block: "center", behavior: "smooth" });
      }, 0);
    }

    window.addEventListener("project-insights:open-license-panel", handleOpenPanel);
    return () => window.removeEventListener("project-insights:open-license-panel", handleOpenPanel);
  }, []);

  async function handleApply(): Promise<void> {
    const contents = textareaRef.current?.value ?? "";
    const success = await onApplyLicenseText(contents);
    if (success && textareaRef.current) {
      textareaRef.current.value = "";
      setExpanded(false);
    }
  }

  return (
    <section className="license-panel compact-license-panel">
      <div className="compact-license-header">
        <div>
          <p className="panel-kicker">Licença</p>
          <h3 className="support-chart-title">{loading ? "Verificando licença..." : resolveStatusTitle(license)}</h3>
          <p className="panel-description">{loading ? "Validando o acesso local aos recursos premium." : resolveStatusMessage(license)}</p>
        </div>
        {!expanded ? (
          <button type="button" className="secondary-button" onClick={() => setExpanded(true)} disabled={loading || importing}>
            Aplicar licença
          </button>
        ) : null}
      </div>

      <div className="license-panel-metrics compact-license-metrics">
        <div className="metric-card compact-metric-card">
          <span className="metric-label">Plano</span>
          <strong>{resolvePlanLabel(license)}</strong>
        </div>
        <div className="metric-card compact-metric-card">
          <span className="metric-label">Validade</span>
          <strong>{formatDate(license.expiresAt)}</strong>
        </div>
        <div className="metric-card compact-metric-card">
          <span className="metric-label">Dias restantes</span>
          <strong>{resolveDaysRemaining(license)}</strong>
        </div>
      </div>

      {expanded ? (
        <div className="license-apply-panel compact-license-apply-panel">
          <p className="license-apply-hint">Cole a licença recebida e clique em aplicar.</p>
          <textarea
            ref={textareaRef}
            className="license-apply-textarea"
            rows={7}
            defaultValue=""
            placeholder="Cole sua licença aqui"
          />
          <div className="license-inline-actions">
            <button type="button" className="primary-button" onClick={() => void handleApply()} disabled={loading || importing}>
              {importing ? "Aplicando..." : "Aplicar licença"}
            </button>
            <button type="button" className="secondary-button" onClick={() => setExpanded(false)}>
              Fechar
            </button>
            <button type="button" className="ghost-button" onClick={() => void onExportLogs()} disabled={exportingLogs}>
              {exportingLogs ? "Exportando..." : "Exportar logs"}
            </button>
          </div>
        </div>
      ) : null}
    </section>
  );
}
