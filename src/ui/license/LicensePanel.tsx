import { useEffect, useRef, useState } from "react";

import { LICENSE_CLIENT_STATES, type LicenseContextState } from "../../core/license/license-types";

type LicensePanelProps = {
  license: LicenseContextState;
  loading: boolean;
  importing: boolean;
  exportingLogs: boolean;
  onApplyLicenseText: (contents: string) => Promise<boolean>;
  onExportLogs: () => Promise<void>;
};

function formatDateTime(value?: string): string {
  if (!value) {
    return "n/a";
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }

  return parsed.toLocaleString("pt-BR");
}

function resolveStatusTitle(license: LicenseContextState): string {
  switch (license.status) {
    case LICENSE_CLIENT_STATES.ACTIVATING:
      return "Ativando licença";
    case LICENSE_CLIENT_STATES.VALID:
      return "Licença ativa";
    case LICENSE_CLIENT_STATES.OFFLINE_VALID:
      return "Licença ativa em modo offline";
    case LICENSE_CLIENT_STATES.REVOKED:
      return "Licença revogada";
    case LICENSE_CLIENT_STATES.BLOCKED:
      return "Licença bloqueada";
    case LICENSE_CLIENT_STATES.EXPIRED:
      return "Licença expirada";
    case LICENSE_CLIENT_STATES.MISMATCH:
      return "Licença vinculada a outro dispositivo";
    case LICENSE_CLIENT_STATES.INVALID:
      return "Licença inválida";
    case LICENSE_CLIENT_STATES.ERROR:
      return "Validação necessária";
    case LICENSE_CLIENT_STATES.NO_LICENSE:
    default:
      return "Modo demonstração ativo";
  }
}

function resolveTrustStatus(license: LicenseContextState): string {
  switch (license.status) {
    case LICENSE_CLIENT_STATES.VALID:
      return "Validado online";
    case LICENSE_CLIENT_STATES.OFFLINE_VALID:
      return "Janela offline ativa";
    case LICENSE_CLIENT_STATES.ACTIVATING:
      return "Processando ativação";
    case LICENSE_CLIENT_STATES.ERROR:
      return "Ação necessária";
    default:
      return "Não validado";
  }
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
          <h3 className="support-chart-title">
            {loading ? "Verificando licença..." : resolveStatusTitle(license)}
          </h3>
          <p className="panel-description">
            {loading
              ? "Checando o estado local e a última janela de confiança offline desta máquina."
              : license.message}
          </p>
        </div>
        {!expanded ? (
          <button type="button" className="secondary-button" onClick={() => setExpanded(true)} disabled={loading || importing}>
            Ativar licença
          </button>
        ) : null}
      </div>

      <div className="license-panel-metrics compact-license-metrics">
        <div className="metric-card compact-metric-card">
          <span className="metric-label">Estado</span>
          <strong>{resolveTrustStatus(license)}</strong>
        </div>
        <div className="metric-card compact-metric-card">
          <span className="metric-label">Validade da licença</span>
          <strong>{formatDateTime(license.expiresAt)}</strong>
        </div>
        <div className="metric-card compact-metric-card">
          <span className="metric-label">Confiança offline até</span>
          <strong>{formatDateTime(license.trustedUntil)}</strong>
        </div>
        <div className="metric-card compact-metric-card">
          <span className="metric-label">Próxima validação</span>
          <strong>{formatDateTime(license.nextValidationRequiredAt)}</strong>
        </div>
      </div>

      {expanded ? (
        <div className="license-apply-panel compact-license-apply-panel">
          <p className="license-apply-hint">Cole a chave de licença recebida e clique em ativar.</p>
          <textarea
            ref={textareaRef}
            className="license-apply-textarea"
            rows={4}
            defaultValue=""
            placeholder="Ex.: PI-ABCDE-12345-FGHIJ-67890"
          />
          <div className="license-inline-actions">
            <button type="button" className="primary-button" onClick={() => void handleApply()} disabled={loading || importing}>
              {importing ? "Ativando..." : "Ativar licença"}
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
