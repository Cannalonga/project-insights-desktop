import { FormEvent, useEffect, useMemo, useState } from "react";
import { invoke } from "@tauri-apps/api/tauri";
import { save } from "@tauri-apps/api/dialog";
import { createDir, writeTextFile } from "@tauri-apps/api/fs";
import { downloadDir, dirname, join } from "@tauri-apps/api/path";
import { open as openShell } from "@tauri-apps/api/shell";

type ConfigStatus = {
  cli: boolean;
  contract: boolean;
  base: boolean;
  privateKey: boolean;
  output: boolean;
  debug: {
    cliPathExists: boolean;
    contractExists: boolean;
    baseExists: boolean;
    privateKeyExists: boolean;
    outputExists: boolean;
    cliPathKind: string;
    contractKind: string;
    baseKind: string;
    privateKeyKind: string;
    outputKind: string;
  };
  failureReason?: string;
};

type ConfigResponse = {
  cliPath: string;
  contractPath: string;
  baseDir: string;
  privateKeyPath: string;
  issuedDir: string;
  registryFilePath: string;
  configStatus: ConfigStatus;
};

type Overrides = {
  cliPath: string;
  contractPath: string;
  baseDir: string;
};

type GenerateResponse = {
  status: "ok";
  message: string;
  filePath: string;
  licenseJson: string;
  payload: {
    customerName: string;
    licenseId: string;
    plan: "semiannual" | "annual";
    issuedAt: string;
    expiresAt: string;
  };
  uiMetadata: {
    email?: string;
    notes?: string;
    type: "semiannual" | "annual";
  };
};

type ValidateResponse = {
  status: "valid" | "expired" | "invalid" | "malformed";
  message: string;
  signatureValid: boolean;
  payload?: {
    customerName?: string;
    licenseId?: string;
    plan?: string;
    issuedAt?: string;
    expiresAt?: string;
    daysRemaining?: number;
  };
};

type ValidationResultState = {
  status: "valid" | "invalid" | null;
  message: string;
  payload?: object;
};

type CatalogRecord = {
  licenseId: string;
  customerName: string;
  email?: string;
  plan: string;
  expirationDate: string;
  issuedAt: string;
  licenseHash: string;
  licenseJson?: string;
  notes?: string;
  createdAt: string;
  schemaVersion?: number;
  licensePreview?: {
    licenseId: string;
    customerName: string;
    plan: string;
    expirationDate: string;
  };
};

const initialGenerateForm = {
  customerName: "",
  email: "",
  type: "annual" as "semiannual" | "annual",
  expirationDate: "",
  notes: "",
};

const initialOverrides: Overrides = {
  cliPath: "",
  contractPath: "",
  baseDir: "",
};

function planLabel(value: string) {
  if (value === "semiannual") {
    return "Semestral";
  }

  if (value === "annual") {
    return "Anual";
  }

  return value;
}

export default function App() {
  const [config, setConfig] = useState<ConfigResponse | null>(null);
  const [loadingConfig, setLoadingConfig] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [showOverrides, setShowOverrides] = useState(false);
  const [overrides, setOverrides] = useState<Overrides>(initialOverrides);
  const [generateForm, setGenerateForm] = useState(initialGenerateForm);
  const [validateInput, setValidateInput] = useState("");
  const [catalogQuery, setCatalogQuery] = useState("");
  const [catalogRecords, setCatalogRecords] = useState<CatalogRecord[]>([]);
  const [catalogLoading, setCatalogLoading] = useState(false);
  const [catalogError, setCatalogError] = useState<string | null>(null);
  const [generateResult, setGenerateResult] = useState<GenerateResponse | null>(null);
  const [generatedLicense, setGeneratedLicense] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [copiedCatalogLicenseId, setCopiedCatalogLicenseId] = useState<string | null>(null);
  const [validationResult, setValidationResult] = useState<ValidationResultState>({
    status: null,
    message: "",
  });
  const [generateError, setGenerateError] = useState<string | null>(null);
  const [validateError, setValidateError] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);
  const [validating, setValidating] = useState(false);
  const [savingFile, setSavingFile] = useState(false);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const [autoSavedPath, setAutoSavedPath] = useState<string | null>(null);
  const [copiedSavedPath, setCopiedSavedPath] = useState(false);
  const [showGeneratedDetails, setShowGeneratedDetails] = useState(false);

  useEffect(() => {
    void refreshConfig();
    void loadCatalog();
  }, []);

  const environmentReady = useMemo(() => {
    if (!config) return false;
    const status = config.configStatus;
    return status.cli && status.contract && status.base && status.privateKey && status.output;
  }, [config]);

  const filteredCatalogRecords = useMemo(() => {
    const query = catalogQuery.trim().toLowerCase();
    if (!query) return catalogRecords;

    return catalogRecords.filter((record) => {
      const emailMatch = (record.email ?? "").toLowerCase().includes(query);
      const customerMatch = record.customerName.toLowerCase().includes(query);
      const licenseIdMatch = record.licenseId.toLowerCase() === query;
      return emailMatch || customerMatch || licenseIdMatch;
    });
  }, [catalogQuery, catalogRecords]);

  const operatorGenerateError = generateError
    ? environmentReady
      ? "Erro ao gerar licenca"
      : "Ambiente nao configurado"
    : null;

  const operatorCatalogError = catalogError ? "Erro ao carregar catalogo" : null;

  async function refreshConfig() {
    setLoadingConfig(true);
    try {
      const response = await invoke<ConfigResponse>("get_license_admin_config");
      setConfig(response);
    } catch (error) {
      setGenerateError(asMessage(error));
    } finally {
      setLoadingConfig(false);
    }
  }

  async function loadCatalog() {
    setCatalogLoading(true);
    setCatalogError(null);
    try {
      const response = await invoke<string>("load_license_catalog", {
        overrides: normalizedOverrides(overrides),
      });
      const parsed = JSON.parse(response) as CatalogRecord[];
      setCatalogRecords(parsed.reverse());
    } catch (error) {
      setCatalogError(asMessage(error));
    } finally {
      setCatalogLoading(false);
    }
  }

  async function handleGenerate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setGenerateError(null);
    setGenerateResult(null);
    setGeneratedLicense(null);
    setSaveMessage(null);
    setAutoSavedPath(null);
    setCopiedSavedPath(false);
    setCopied(false);
    setShowGeneratedDetails(false);
    setGenerating(true);

    try {
      const response = await invoke<string>("generate_license", {
        input: JSON.stringify({
          ...generateForm,
          expirationDate: toIsoStartOfDay(generateForm.expirationDate),
          overrides: normalizedOverrides(overrides),
        }),
      });
      const parsed = JSON.parse(response) as GenerateResponse;
      setGenerateResult(parsed);
      setGeneratedLicense(parsed.licenseJson);
      const savedPath = await saveOperatorLicenseCopy(parsed);
      setAutoSavedPath(savedPath);
      await saveCatalogRecord(parsed);
      await refreshConfig();
      await loadCatalog();
    } catch (error) {
      setGenerateError(asMessage(error));
    } finally {
      setGenerating(false);
    }
  }

  async function handleValidate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setValidateError(null);
    setValidationResult({ status: null, message: "" });
    setValidating(true);

    try {
      const response = await invoke<string>("validate_license", {
        input: JSON.stringify({ licenseJson: validateInput, overrides: normalizedOverrides(overrides) }),
      });
      const parsed = JSON.parse(response) as ValidateResponse;
      setValidationResult({
        status: parsed.status === "valid" ? "valid" : "invalid",
        message: parsed.message,
        payload: parsed.payload,
      });
    } catch (error) {
      setValidateError(asMessage(error));
    } finally {
      setValidating(false);
    }
  }

  async function handleCopyLicense() {
    if (!generatedLicense) return;
    await navigator.clipboard.writeText(generatedLicense);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 2000);
  }

  async function handleCopyCatalogLicense(licenseId: string, licenseJson?: string) {
    if (!licenseJson) return;
    await navigator.clipboard.writeText(licenseJson);
    setCopiedCatalogLicenseId(licenseId);
    window.setTimeout(() => setCopiedCatalogLicenseId((current) => (current === licenseId ? null : current)), 2000);
  }

  async function handleCopySavedPath() {
    if (!autoSavedPath) return;
    await navigator.clipboard.writeText(autoSavedPath);
    setCopiedSavedPath(true);
    window.setTimeout(() => setCopiedSavedPath(false), 2000);
  }

  async function handleOpenSavedFolder() {
    if (!autoSavedPath) return;
    const folderPath = await dirname(autoSavedPath);
    await openShell(folderPath);
  }

  async function handleSaveLicense() {
    if (!generatedLicense || !generateResult) return;
    setSaveMessage(null);
    setSavingFile(true);
    try {
      const suggestedName = `${sanitizeFileName(generateResult.payload.customerName || generateResult.payload.licenseId)}.license`;
      const filePath = await save({
        defaultPath: suggestedName,
        filters: [{ name: "License", extensions: ["license"] }],
      });
      if (!filePath) {
        setSaveMessage("Salvamento cancelado.");
        return;
      }
      await writeTextFile(filePath, generatedLicense);
      setSaveMessage(`Arquivo salvo em: ${filePath}`);
    } catch (error) {
      setSaveMessage(asMessage(error));
    } finally {
      setSavingFile(false);
    }
  }

  async function saveOperatorLicenseCopy(result: GenerateResponse) {
    const fileName = `${sanitizeFileName(result.payload.licenseId)}.license`;

    try {
      const downloadsPath = await downloadDir();
      const projectInsightsDir = await join(downloadsPath, "ProjectInsights");
      const licensesDir = await join(projectInsightsDir, "Licencas");
      await createDir(licensesDir, { recursive: true });
      const outputPath = await join(licensesDir, fileName);
      await writeTextFile(outputPath, result.licenseJson);
      return outputPath;
    } catch {
      return result.filePath;
    }
  }

  async function saveCatalogRecord(result: GenerateResponse) {
    const createdAt = new Date().toISOString();
    const licenseHash = await sha256Base64Url(result.licenseJson);
    const record: CatalogRecord = {
      licenseId: result.payload.licenseId,
      customerName: result.payload.customerName,
      email: result.uiMetadata.email,
      plan: result.payload.plan,
      expirationDate: result.payload.expiresAt,
      issuedAt: result.payload.issuedAt,
      licenseHash,
      licenseJson: result.licenseJson,
      notes: result.uiMetadata.notes,
      createdAt,
      licensePreview: {
        licenseId: result.payload.licenseId,
        customerName: result.payload.customerName,
        plan: result.payload.plan,
        expirationDate: result.payload.expiresAt,
      },
    };

    await invoke("save_license_record", {
      record: JSON.stringify(record),
      overrides: normalizedOverrides(overrides),
    });
  }

  return (
    <main className="shell">
      <header className="shell__header">
        <div>
          <h1>License Admin UI</h1>
          <p>Operacao local de emissao e consulta de licencas.</p>
        </div>
        <div className="actions actions--wrap">
          <button type="button" className="secondary-button" onClick={() => setShowAdvanced((current) => !current)}>
            {showAdvanced ? "Ocultar configuracao" : "Mostrar configuracao"}
          </button>
          <button type="button" className="secondary-button" onClick={refreshConfig} disabled={loadingConfig}>
            {loadingConfig ? "Atualizando..." : "Atualizar configuracao"}
          </button>
          <button type="button" className="secondary-button" onClick={() => void loadCatalog()} disabled={catalogLoading}>
            {catalogLoading ? "Carregando catalogo..." : "Atualizar catalogo"}
          </button>
        </div>
      </header>

      {!environmentReady ? (
        <section className="card card--warning compact-card">
          <h2>Ambiente nao configurado</h2>
          <p>Revise a configuracao antes de emitir ou validar licencas.</p>
        </section>
      ) : null}

      <section className="card">
        <h2>Emitir licenca</h2>
        <form className="form" onSubmit={handleGenerate}>
          <Field label="customerName">
            <input required value={generateForm.customerName} onChange={(event) => setGenerateForm((current) => ({ ...current, customerName: event.target.value }))} />
          </Field>
          <Field label="email (opcional)">
            <input type="email" value={generateForm.email} onChange={(event) => setGenerateForm((current) => ({ ...current, email: event.target.value }))} />
          </Field>
          <Field label="plan">
            <select value={generateForm.type} onChange={(event) => setGenerateForm((current) => ({ ...current, type: event.target.value as "semiannual" | "annual" }))}>
              <option value="semiannual">Semestral</option>
              <option value="annual">Anual</option>
            </select>
          </Field>
          <Field label="expirationDate">
            <input type="date" required value={generateForm.expirationDate} onChange={(event) => setGenerateForm((current) => ({ ...current, expirationDate: event.target.value }))} />
          </Field>
          <Field label="notes (opcional)">
            <textarea rows={4} value={generateForm.notes} onChange={(event) => setGenerateForm((current) => ({ ...current, notes: event.target.value }))} />
          </Field>
          <div className="actions">
            <button type="submit" className="primary-button" disabled={generating || !environmentReady}>
              {generating ? "Gerando..." : "GERAR LICENCA"}
            </button>
          </div>
        </form>
        {operatorGenerateError ? <ErrorCard title={operatorGenerateError} body={showAdvanced ? generateError ?? operatorGenerateError : undefined} /> : null}
        {generateResult && generatedLicense ? (
          <section className="card result-card">
            <h3>Licenca gerada com sucesso</h3>
            <div className="config-grid">
              <ConfigItem label="licenseId" value={generateResult.payload.licenseId} />
              <ConfigItem label="customerName" value={generateResult.payload.customerName} />
              <ConfigItem label="plan" value={planLabel(generateResult.payload.plan)} />
              <ConfigItem label="expirationDate" value={generateResult.payload.expiresAt} />
            </div>
            <p className="helper-text">Licenca salva em: {autoSavedPath ?? generateResult.filePath}</p>
            <div className="actions actions--wrap">
              <button type="button" className="secondary-button" onClick={handleCopyLicense}>
                Copiar licenca
              </button>
              <button type="button" className="secondary-button" onClick={handleSaveLicense} disabled={savingFile}>
                {savingFile ? "Salvando..." : "Salvar arquivo"}
              </button>
              <button type="button" className="secondary-button" onClick={handleOpenSavedFolder}>
                Abrir pasta
              </button>
              <button type="button" className="secondary-button" onClick={handleCopySavedPath}>
                Copiar caminho
              </button>
              <button type="button" className="secondary-button" onClick={() => setShowGeneratedDetails((current) => !current)}>
                {showGeneratedDetails ? "Ocultar detalhes" : "Ver detalhes"}
              </button>
              {copied ? <span className="inline-feedback">Licenca copiada</span> : null}
              {copiedSavedPath ? <span className="inline-feedback">Caminho copiado</span> : null}
            </div>
            {saveMessage ? <p className="helper-text">{saveMessage}</p> : null}
            {showGeneratedDetails ? <pre>{generatedLicense}</pre> : null}
          </section>
        ) : null}
        {showAdvanced && generateResult ? <JsonCard title="Resumo da emissao" value={generateResult} /> : null}
      </section>

      <section className="card">
        <div className="section-header">
          <h2>Catalogo de licencas</h2>
          <span className="helper-text">Busca por email, customerName ou licenseId.</span>
        </div>
        <Field label="Busca">
          <input value={catalogQuery} onChange={(event) => setCatalogQuery(event.target.value)} placeholder="Digite email, cliente ou licenseId" />
        </Field>
        {operatorCatalogError ? <ErrorCard title={operatorCatalogError} body={showAdvanced ? catalogError ?? operatorCatalogError : undefined} /> : null}
        <div className="catalog-list">
          {filteredCatalogRecords.map((record) => (
            <article key={`${record.licenseId}-${record.createdAt}`} className="catalog-item">
              <div>
                <strong>{record.licensePreview?.licenseId ?? record.licenseId}</strong>
                <p>{record.licensePreview?.customerName ?? record.customerName}</p>
                <p>{record.email || "Sem email"}</p>
              </div>
              <div>
                <p>Plano: {planLabel(record.licensePreview?.plan ?? record.plan)}</p>
                <p>Expira em: {record.licensePreview?.expirationDate ?? record.expirationDate}</p>
                {showAdvanced ? <p>Emitida em: {record.issuedAt}</p> : null}
              </div>
              <div className="catalog-actions">
                {record.licenseJson ? (
                  <button type="button" className="secondary-button" onClick={() => void handleCopyCatalogLicense(record.licenseId, record.licenseJson)}>
                    Copiar licenca
                  </button>
                ) : null}
                {copiedCatalogLicenseId === record.licenseId ? <span className="inline-feedback">Copiado</span> : null}
              </div>
            </article>
          ))}
          {!catalogLoading && filteredCatalogRecords.length === 0 ? <p className="helper-text">Nenhum registro encontrado.</p> : null}
        </div>
      </section>

      {showAdvanced ? (
        <>
          <section className="card">
            <div className="section-header">
              <h2>Configuracao local</h2>
              <button type="button" className="secondary-button" onClick={() => setShowOverrides((current) => !current)}>
                {showOverrides ? "Ocultar override" : "Mostrar override"}
              </button>
            </div>
            <div className="config-grid">
              <ConfigItem label="CLI efetivo" value={config?.cliPath ?? "Nao carregado"} />
              <ConfigItem label="Contrato efetivo" value={config?.contractPath ?? "Nao carregado"} />
              <ConfigItem label="Base efetiva" value={config?.baseDir ?? "Nao carregado"} />
              <ConfigItem label="Chave privada" value={config?.privateKeyPath ?? "Nao carregado"} />
              <ConfigItem label="Saida" value={config?.issuedDir ?? "Nao carregado"} />
              <ConfigItem label="Catalogo" value={config?.registryFilePath ?? "Nao carregado"} />
            </div>
            {showOverrides ? (
              <div className="override-grid">
                <Field label="Override CLI (opcional)">
                  <input value={overrides.cliPath} onChange={(event) => setOverrides((current) => ({ ...current, cliPath: event.target.value }))} />
                </Field>
                <Field label="Override contrato (opcional)">
                  <input value={overrides.contractPath} onChange={(event) => setOverrides((current) => ({ ...current, contractPath: event.target.value }))} />
                </Field>
                <Field label="Override base operacional (opcional)">
                  <input value={overrides.baseDir} onChange={(event) => setOverrides((current) => ({ ...current, baseDir: event.target.value }))} />
                </Field>
              </div>
            ) : null}
            {!environmentReady ? <EnvironmentWarning config={config} /> : null}
          </section>

          <section className="card">
            <h2>Validar licenca</h2>
            <form className="form" onSubmit={handleValidate}>
              <Field label='Cole o JSON do arquivo ".license"'>
                <textarea rows={16} required value={validateInput} onChange={(event) => setValidateInput(event.target.value)} />
              </Field>
              <div className="actions">
                <button type="submit" className="primary-button" disabled={validating || !environmentReady}>
                  {validating ? "Validando..." : "VALIDAR LICENCA"}
                </button>
              </div>
            </form>
            {validateError ? <ErrorCard title="Erro ao validar licenca" body={validateError} /> : null}
            {validationResult.status ? <ValidationCard result={validationResult} /> : null}
          </section>
        </>
      ) : null}
    </main>
  );
}

function normalizedOverrides(overrides: Overrides) {
  return {
    cliPath: overrides.cliPath.trim() || undefined,
    contractPath: overrides.contractPath.trim() || undefined,
    baseDir: overrides.baseDir.trim() || undefined,
  };
}

function toIsoStartOfDay(value: string) {
  return `${value}T00:00:00.000Z`;
}

function sanitizeFileName(value: string) {
  return value.replace(/[^a-zA-Z0-9-_]/g, "_");
}

async function sha256Base64Url(value: string) {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return toBase64Url(new Uint8Array(digest));
}

function toBase64Url(bytes: Uint8Array) {
  let binary = "";
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
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

function EnvironmentWarning({ config }: { config: ConfigResponse | null }) {
  const status = config?.configStatus;
  return (
    <section className="card card--warning compact-card">
      <h3>Ambiente nao configurado corretamente</h3>
      <p>{status?.failureReason ?? "Revise CLI, contrato, base, chave privada e diretorio de saida antes de operar."}</p>
      {status ? <pre>{JSON.stringify(status, null, 2)}</pre> : null}
    </section>
  );
}

function ErrorCard({ title, body }: { title: string; body?: string }) {
  return (
    <section className="card card--error compact-card">
      <h3>{title}</h3>
      {body ? <p>{body}</p> : null}
    </section>
  );
}

function ValidationCard({ result }: { result: ValidationResultState }) {
  const valid = result.status === "valid";
  return (
    <section className={valid ? "card card--success compact-card" : "card card--error compact-card"}>
      <h3>{valid ? "Status: VALIDA" : "Status: INVALIDA"}</h3>
      <p>{valid ? result.message : `Motivo: ${result.message}`}</p>
      {result.payload ? <pre>{JSON.stringify(result.payload, null, 2)}</pre> : null}
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

function asMessage(error: unknown) {
  const fallback = "Erro ao executar operacao";
  if (typeof error === "string") {
    return normalizeStructuredError(error, fallback);
  }
  if (error instanceof Error) {
    return normalizeStructuredError(error.message, fallback);
  }
  return fallback;
}

function normalizeStructuredError(message: string, fallback: string) {
  try {
    const parsed = JSON.parse(message) as { message?: string; details?: { reason?: string; stderr?: string } };
    return parsed.details?.reason || parsed.details?.stderr || parsed.message || fallback;
  } catch {
    return message || fallback;
  }
}
