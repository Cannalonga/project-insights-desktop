import { FormEvent, useEffect, useMemo, useState } from "react";
import {
  AdminApiError,
  getLicensingBackendStatus,
  IssueLicenseData,
  issueLicense,
  ReissueLicenseData,
  reissueLicense,
  RevokeLicenseData,
  revokeLicense,
} from "./licensing-api";
import { LicensingAdminConfig, LicensingAdminConfigError, loadLicensingAdminConfig } from "./licensing-config";

type IssueFormState = {
  customerName: string;
  email: string;
  plan: "semiannual" | "annual";
  expirationDate: string;
  notes: string;
};

type AdminActionFormState = {
  licenseKey: string;
  reason: string;
};

type OperationState =
  | {
      type: "issue";
      code: string;
      data: IssueLicenseData;
      message: string;
    }
  | {
      type: "revoke";
      code: string;
      data: RevokeLicenseData;
      message: string;
    }
  | {
      type: "reissue";
      code: string;
      data: ReissueLicenseData;
      message: string;
    };

const initialIssueForm: IssueFormState = {
  customerName: "",
  email: "",
  plan: "annual",
  expirationDate: "",
  notes: "",
};

const initialAdminActionForm: AdminActionFormState = {
  licenseKey: "",
  reason: "",
};

export default function App() {
  const [config, setConfig] = useState<LicensingAdminConfig | null>(null);
  const [configError, setConfigError] = useState<string | null>(null);
  const [showConfig, setShowConfig] = useState(false);

  const [issueForm, setIssueForm] = useState<IssueFormState>(initialIssueForm);
  const [adminActionForm, setAdminActionForm] = useState<AdminActionFormState>(initialAdminActionForm);

  const [issuing, setIssuing] = useState(false);
  const [revoking, setRevoking] = useState(false);
  const [reissuing, setReissuing] = useState(false);

  const [issueError, setIssueError] = useState<string | null>(null);
  const [adminActionError, setAdminActionError] = useState<string | null>(null);
  const [operationResult, setOperationResult] = useState<OperationState | null>(null);
  const [copiedLicenseKey, setCopiedLicenseKey] = useState(false);

  useEffect(() => {
    void refreshConfig();
  }, []);

  const environmentReady = Boolean(config && !configError);

  const busy = issuing || revoking || reissuing;

  const headerStatus = useMemo(() => {
    if (configError) {
      return {
        title: "Ambiente nao configurado",
        body: configError,
        className: "card card--warning compact-card",
      };
    }

    if (!config) {
      return {
        title: "Carregando configuracao",
        body: "Validando configuracao da admin UI para o backend central.",
        className: "card compact-card",
      };
    }

    return {
      title: "Backend central conectado",
      body: "A interface administrativa esta configurada para operar contra o backend central de licenciamento.",
      className: "card card--success compact-card",
    };
  }, [config, configError]);

  async function refreshConfig() {
    try {
      const loaded = loadLicensingAdminConfig();
      const status = await getLicensingBackendStatus();
      setConfig({
        ...loaded,
        adminTokenConfigured: status.adminTokenConfigured,
      });
      setConfigError(status.adminTokenConfigured ? null : "LICENSING_ADMIN_TOKEN nao configurado no ambiente local seguro.");
    } catch (error) {
      const message = error instanceof LicensingAdminConfigError ? error.message : "Falha ao carregar configuracao.";
      setConfig(null);
      setConfigError(message);
    }
  }

  async function handleIssueLicense(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!config) return;

    setIssuing(true);
    setIssueError(null);
    setOperationResult(null);
    setCopiedLicenseKey(false);

    try {
      const response = await issueLicense(config, {
        plan: issueForm.plan,
        expires_at: toIsoStartOfDay(issueForm.expirationDate),
        customer_name: issueForm.customerName.trim(),
        customer_email: issueForm.email.trim() || null,
        metadata: issueForm.notes.trim() ? { notes: issueForm.notes.trim() } : null,
      });

      setOperationResult({
        type: "issue",
        code: response.code,
        data: response.data,
        message: "Licenca emitida com sucesso pelo backend central.",
      });
      setAdminActionForm((current) => ({ ...current, licenseKey: response.data.license_key }));
    } catch (error) {
      setIssueError(asMessage(error, "Erro ao emitir licenca."));
    } finally {
      setIssuing(false);
    }
  }

  async function handleRevokeLicense() {
    if (!config) return;

    setRevoking(true);
    setAdminActionError(null);
    setOperationResult(null);

    try {
      const response = await revokeLicense(config, {
        license_key: adminActionForm.licenseKey.trim(),
        reason: adminActionForm.reason.trim(),
        metadata: { source: "license-admin-ui" },
      });

      setOperationResult({
        type: "revoke",
        code: response.code,
        data: response.data,
        message: "Licenca revogada com sucesso pelo backend central.",
      });
    } catch (error) {
      setAdminActionError(asMessage(error, "Erro ao revogar licenca."));
    } finally {
      setRevoking(false);
    }
  }

  async function handleReissueLicense() {
    if (!config) return;

    setReissuing(true);
    setAdminActionError(null);
    setOperationResult(null);

    try {
      const response = await reissueLicense(config, {
        license_key: adminActionForm.licenseKey.trim(),
        reason: adminActionForm.reason.trim(),
        metadata: { source: "license-admin-ui" },
      });

      setOperationResult({
        type: "reissue",
        code: response.code,
        data: response.data,
        message: "Licenca preparada para nova ativacao pelo backend central.",
      });
    } catch (error) {
      setAdminActionError(asMessage(error, "Erro ao reemitir licenca."));
    } finally {
      setReissuing(false);
    }
  }

  async function handleCopyLicenseKey() {
    if (!operationResult || operationResult.type !== "issue") return;
    await navigator.clipboard.writeText(operationResult.data.license_key);
    setCopiedLicenseKey(true);
    window.setTimeout(() => setCopiedLicenseKey(false), 2000);
  }

  return (
    <main className="shell">
      <header className="shell__header">
        <div>
          <h1>License Admin UI</h1>
          <p>Operacao administrativa conectada ao backend central de licenciamento.</p>
        </div>
        <div className="actions actions--wrap">
          <button type="button" className="secondary-button" onClick={() => setShowConfig((current) => !current)}>
            {showConfig ? "Ocultar configuracao" : "Mostrar configuracao"}
          </button>
          <button type="button" className="secondary-button" onClick={() => void refreshConfig()} disabled={busy}>
            Atualizar configuracao
          </button>
        </div>
      </header>

      <section className={headerStatus.className}>
        <h2>{headerStatus.title}</h2>
        <p>{headerStatus.body}</p>
      </section>

      <section className="card">
        <h2>Emitir licenca</h2>
        <form className="form" onSubmit={handleIssueLicense}>
          <Field label="customerName">
            <input
              required
              value={issueForm.customerName}
              onChange={(event) => setIssueForm((current) => ({ ...current, customerName: event.target.value }))}
            />
          </Field>
          <Field label="email (opcional)">
            <input
              type="email"
              value={issueForm.email}
              onChange={(event) => setIssueForm((current) => ({ ...current, email: event.target.value }))}
            />
          </Field>
          <Field label="plan">
            <select
              value={issueForm.plan}
              onChange={(event) =>
                setIssueForm((current) => ({ ...current, plan: event.target.value as IssueFormState["plan"] }))
              }
            >
              <option value="semiannual">Semestral</option>
              <option value="annual">Anual</option>
            </select>
          </Field>
          <Field label="expirationDate">
            <input
              type="date"
              required
              value={issueForm.expirationDate}
              onChange={(event) => setIssueForm((current) => ({ ...current, expirationDate: event.target.value }))}
            />
          </Field>
          <Field label="notes (opcional)">
            <textarea rows={4} value={issueForm.notes} onChange={(event) => setIssueForm((current) => ({ ...current, notes: event.target.value }))} />
          </Field>
          <div className="actions">
            <button type="submit" className="primary-button" disabled={issuing || !environmentReady}>
              {issuing ? "Emitindo..." : "GERAR LICENCA"}
            </button>
          </div>
        </form>
        {issueError ? <ErrorCard title="Erro ao emitir licenca" body={issueError} /> : null}
        {operationResult?.type === "issue" ? (
          <section className="card result-card">
            <h3>Licenca emitida</h3>
            <div className="config-grid">
              <ConfigItem label="license_key" value={operationResult.data.license_key} />
              <ConfigItem label="license_id" value={operationResult.data.license_id} />
              <ConfigItem label="status" value={operationResult.data.status} />
              <ConfigItem label="issued_at" value={operationResult.data.issued_at} />
              <ConfigItem label="expires_at" value={operationResult.data.expires_at ?? "Sem expiracao"} />
            </div>
            <p className="helper-text">{operationResult.message}</p>
            <div className="actions actions--wrap">
              <button type="button" className="secondary-button" onClick={handleCopyLicenseKey}>
                Copiar license_key
              </button>
              {copiedLicenseKey ? <span className="inline-feedback">license_key copiada</span> : null}
            </div>
            <JsonCard title={`Resposta do backend (${operationResult.code})`} value={operationResult.data} />
          </section>
        ) : null}
      </section>

      <section className="card">
        <h2>Operacoes administrativas</h2>
        <form className="form" onSubmit={(event) => event.preventDefault()}>
          <Field label="license_key">
            <input
              required
              value={adminActionForm.licenseKey}
              onChange={(event) => setAdminActionForm((current) => ({ ...current, licenseKey: event.target.value }))}
              placeholder="Cole a license_key"
            />
          </Field>
          <Field label="reason">
            <textarea
              rows={3}
              required
              value={adminActionForm.reason}
              onChange={(event) => setAdminActionForm((current) => ({ ...current, reason: event.target.value }))}
              placeholder="Motivo operacional da revogacao ou reemissao"
            />
          </Field>
          <div className="actions actions--wrap">
            <button type="button" className="primary-button" disabled={revoking || !environmentReady || !adminActionForm.licenseKey.trim() || !adminActionForm.reason.trim()} onClick={() => void handleRevokeLicense()}>
              {revoking ? "Revogando..." : "REVOGAR"}
            </button>
            <button type="button" className="secondary-button" disabled={reissuing || !environmentReady || !adminActionForm.licenseKey.trim() || !adminActionForm.reason.trim()} onClick={() => void handleReissueLicense()}>
              {reissuing ? "Reemitindo..." : "REEMITIR"}
            </button>
          </div>
        </form>
        {adminActionError ? <ErrorCard title="Erro operacional" body={adminActionError} /> : null}
        {operationResult?.type === "revoke" ? (
          <section className="card result-card">
            <h3>Licenca revogada</h3>
            <p className="helper-text">{operationResult.message}</p>
            <JsonCard title={`Resposta do backend (${operationResult.code})`} value={operationResult.data} />
          </section>
        ) : null}
        {operationResult?.type === "reissue" ? (
          <section className="card result-card">
            <h3>Licenca reemitida</h3>
            <p className="helper-text">{operationResult.message}</p>
            <JsonCard title={`Resposta do backend (${operationResult.code})`} value={operationResult.data} />
          </section>
        ) : null}
      </section>

      {showConfig ? (
        <section className="card">
          <h2>Configuracao ativa</h2>
          <div className="config-grid">
            <ConfigItem label="Supabase URL" value={config?.supabaseUrl ?? "Nao carregado"} />
            <ConfigItem label="Functions base URL" value={config?.functionsBaseUrl ?? "Nao carregado"} />
            <ConfigItem label="Anon/public key" value={config ? "Configurada" : "Nao carregada"} />
            <ConfigItem label="Admin token" value={config?.adminTokenConfigured ? "Configurado" : "Nao carregado"} />
            <ConfigItem label="Timeout (ms)" value={config ? String(config.timeoutMs) : "Nao carregado"} />
          </div>
          {configError ? <ErrorCard title="Configuracao invalida" body={configError} /> : null}
        </section>
      ) : null}
    </main>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="field">
      <span>{label}</span>
      {children}
    </label>
  );
}

function ConfigItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="config-item">
      <strong>{label}</strong>
      <code>{value}</code>
    </div>
  );
}

function ErrorCard({ title, body }: { title: string; body: string }) {
  return (
    <section className="card card--error compact-card">
      <h3>{title}</h3>
      <p>{body}</p>
    </section>
  );
}

function JsonCard({ title, value }: { title: string; value: unknown }) {
  return (
    <section className="card result-card">
      <h3>{title}</h3>
      <pre>{JSON.stringify(value, null, 2)}</pre>
    </section>
  );
}

function toIsoStartOfDay(value: string) {
  return `${value}T00:00:00.000Z`;
}

function asMessage(error: unknown, fallback: string) {
  if (error instanceof AdminApiError) {
    return error.message;
  }
  if (error instanceof Error) {
    return error.message || fallback;
  }
  if (typeof error === "string") {
    return error;
  }
  return fallback;
}
