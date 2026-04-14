import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import {
  AdminApiError,
  getLicensingBackendStatus,
  IssueLicenseData,
  issueLicense,
  LicenseCatalogRecord,
  loadLicenseCatalog,
  removeLicenseCatalogRecords,
  ReissueLicenseData,
  reissueLicense,
  RevokeLicenseData,
  revokeLicense,
  saveLicenseCatalogRecord,
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

type CatalogFiltersState = {
  email: string;
  licenseKey: string;
};

type CatalogSummary = {
  record: LicenseCatalogRecord;
  licenseKey: string;
  status: string;
  fingerprint: string;
  lastState: string;
  revokedAt: string | null;
  classification: LicenseClassification;
};

type OverviewMetric = {
  label: string;
  value: string;
  tone?: "default" | "success" | "warning";
};

type RenewalWindowLabel = "1o aviso" | "2o aviso";

type RenewalCandidate = {
  licenseId: string;
  licenseKey: string;
  customerName: string;
  email: string;
  plan: string;
  expiresAt: string;
  daysRemaining: number;
  windowLabel: RenewalWindowLabel;
};

type LicenseClassification = "teste" | "paga" | null;

type LocalLicenseOverride = {
  status?: string;
  lastState?: string;
  revokedAt?: string | null;
  fingerprint?: string;
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

const initialCatalogFilters: CatalogFiltersState = {
  email: "",
  licenseKey: "",
};

export default function App() {
  const operationsSectionRef = useRef<HTMLElement | null>(null);
  const licenseKeyInputRef = useRef<HTMLInputElement | null>(null);
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
  const [catalogRecords, setCatalogRecords] = useState<LicenseCatalogRecord[]>([]);
  const [catalogFilters, setCatalogFilters] = useState<CatalogFiltersState>(initialCatalogFilters);
  const [catalogLoading, setCatalogLoading] = useState(false);
  const [catalogError, setCatalogError] = useState<string | null>(null);
  const [selectedCatalogLicenseId, setSelectedCatalogLicenseId] = useState<string | null>(null);
  const [renewalFeedback, setRenewalFeedback] = useState<string | null>(null);
  const [licenseOverrides, setLicenseOverrides] = useState<Record<string, LocalLicenseOverride>>({});
  const [statusFilter, setStatusFilter] = useState("all");
  const [typeFilter, setTypeFilter] = useState<"all" | "teste" | "paga">("all");
  const [showRevokeConfirm, setShowRevokeConfirm] = useState(false);
  const [revokeConfirmationText, setRevokeConfirmationText] = useState("");
  const [showCleanupConfirm, setShowCleanupConfirm] = useState(false);
  const [cleanupConfirmationText, setCleanupConfirmationText] = useState("");
  const [cleanupError, setCleanupError] = useState<string | null>(null);
  const [cleanupFeedback, setCleanupFeedback] = useState<string | null>(null);
  const [cleaningCatalog, setCleaningCatalog] = useState(false);
  const [catalogSelectionFeedback, setCatalogSelectionFeedback] = useState<string | null>(null);

  useEffect(() => {
    void refreshConfig();
  }, []);

  useEffect(() => {
    void refreshCatalog();
  }, []);

  const environmentReady = Boolean(config && !configError);

  const busy = issuing || revoking || reissuing;

  const catalogItems = useMemo(() => {
    return catalogRecords
      .map((record) => {
        const licensePayload = parseCatalogLicenseJson(record.license_json);
        const override = resolveLicenseOverride(licenseOverrides, licensePayload, record.license_hash);
        const classification = classifyLicenseRecord(record, licensePayload);
        return {
          record,
          licenseKey: readCatalogText(licensePayload, ["license_key", "licenseKey"]) ?? record.license_hash,
          status:
            override?.status ??
            readCatalogText(licensePayload, ["status", "license_status", "licenseStatus", "activation_status"]) ??
            "Nao informado",
          fingerprint:
            override?.fingerprint ??
            readCatalogText(licensePayload, [
              "machine_fingerprint",
              "machineFingerprint",
              "previous_machine_fingerprint",
              "previousMachineFingerprint",
            ]) ??
            "",
          lastState:
            override?.lastState ??
            readCatalogText(licensePayload, ["last_state", "lastState", "activation_status", "license_status"]) ??
            "",
          revokedAt: override?.revokedAt ?? readCatalogText(licensePayload, ["revoked_at", "revokedAt"]),
          classification,
        } satisfies CatalogSummary;
      })
      .sort((left, right) => compareDescendingTimestamps(left.record.created_at, right.record.created_at));
  }, [catalogRecords, licenseOverrides]);

  const filteredCatalogItems = useMemo(() => {
    const emailFilter = catalogFilters.email.trim().toLowerCase();
    const licenseKeyFilter = catalogFilters.licenseKey.trim().toLowerCase();

    return catalogItems.filter((item) => {
      const matchesEmail = !emailFilter || item.record.email?.toLowerCase().includes(emailFilter);
      const matchesLicenseKey = !licenseKeyFilter || item.licenseKey.toLowerCase().includes(licenseKeyFilter);
      const normalizedStatus = normalizeCatalogStatus(item.status);
      const matchesStatus = statusFilter === "all" || normalizedStatus === statusFilter;
      const matchesType = typeFilter === "all" || item.classification === typeFilter;
      return matchesEmail && matchesLicenseKey && matchesStatus && matchesType;
    });
  }, [catalogFilters.email, catalogFilters.licenseKey, catalogItems, statusFilter, typeFilter]);

  const selectedCatalogItem = useMemo(() => {
    if (selectedCatalogLicenseId) {
      return catalogItems.find((item) => item.record.license_id === selectedCatalogLicenseId) ?? null;
    }

    return filteredCatalogItems[0] ?? null;
  }, [catalogItems, filteredCatalogItems, selectedCatalogLicenseId]);

  const hasClassificationData = useMemo(
    () => catalogItems.some((item) => item.classification === "teste" || item.classification === "paga"),
    [catalogItems],
  );

  const revokeTargetItem = useMemo(() => {
    const normalizedKey = adminActionForm.licenseKey.trim().toLowerCase();
    if (!normalizedKey) {
      return null;
    }

    return (
      catalogItems.find((item) => {
        const itemLicenseKey = item.licenseKey?.trim().toLowerCase() ?? "";
        return itemLicenseKey === normalizedKey;
      }) ?? null
    );
  }, [adminActionForm.licenseKey, catalogItems]);

  const overviewMetrics = useMemo<OverviewMetric[]>(() => {
    const now = Date.now();
    let activeCount = 0;
    let expiredCount = 0;
    let revokedCount = 0;

    for (const item of catalogItems) {
      const normalizedStatus = normalizeCatalogStatus(item.status);
      const expirationTime = Date.parse(item.record.expiration_date);
      const isExpiredByDate = !Number.isNaN(expirationTime) && expirationTime < now;

      if (normalizedStatus === "revoked") {
        revokedCount += 1;
        continue;
      }

      if (normalizedStatus === "expired" || isExpiredByDate) {
        expiredCount += 1;
        continue;
      }

      if (normalizedStatus === "active" || normalizedStatus === "unknown") {
        activeCount += 1;
      }
    }

    return [
      { label: "Licencas catalogadas", value: String(catalogItems.length) },
      { label: "Ativas", value: String(activeCount), tone: "success" },
      { label: "Expiradas", value: String(expiredCount), tone: "warning" },
      { label: "Revogadas", value: String(revokedCount) },
    ];
  }, [catalogItems]);

  const renewalCandidates = useMemo<RenewalCandidate[]>(() => {
    return catalogItems
      .flatMap((item) => {
        const email = item.record.email?.trim();
        if (!email) {
          return [];
        }

        const normalizedStatus = normalizeCatalogStatus(item.status);
        if (normalizedStatus !== "active") {
          return [];
        }

        const daysRemaining = calculateDaysRemaining(item.record.expiration_date);
        if (daysRemaining === null || daysRemaining < 1 || daysRemaining > 30) {
          return [];
        }

        return [
          {
            licenseId: item.record.license_id,
            licenseKey: item.licenseKey,
            customerName: item.record.customer_name,
            email,
            plan: item.record.plan,
            expiresAt: item.record.expiration_date,
            daysRemaining,
            windowLabel: daysRemaining <= 15 ? "2o aviso" : "1o aviso",
          } satisfies RenewalCandidate,
        ];
      })
      .sort((left, right) => {
        const dayDiff = left.daysRemaining - right.daysRemaining;
        if (dayDiff !== 0) {
          return dayDiff;
        }

        const leftName = left.customerName?.trim() || left.licenseKey?.trim() || left.licenseId;
        const rightName = right.customerName?.trim() || right.licenseKey?.trim() || right.licenseId;
        return leftName.localeCompare(rightName);
      });
  }, [catalogItems]);

  const eligibleTestCatalogItems = useMemo(
    () => catalogItems.filter((item) => item.classification === "teste"),
    [catalogItems],
  );

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

  async function refreshCatalog() {
    setCatalogLoading(true);
    setCatalogError(null);

    try {
      const records = await loadLicenseCatalog();
      setCatalogRecords(records);
      setSelectedCatalogLicenseId((current) =>
        current && records.some((record) => record.license_id === current) ? current : records[0]?.license_id ?? null,
      );
    } catch (error) {
      setCatalogError(asMessage(error, "Falha ao carregar o catalogo local de licencas."));
    } finally {
      setCatalogLoading(false);
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
      await persistIssuedLicenseInCatalog(response.data);
    } catch (error) {
      setIssueError(asMessage(error, "Erro ao emitir licenca."));
    } finally {
      setIssuing(false);
    }
  }

  async function persistIssuedLicenseInCatalog(data: IssueLicenseData) {
    try {
      const now = new Date().toISOString();
      await saveLicenseCatalogRecord({
        license_id: data.license_id,
        customer_name: issueForm.customerName.trim(),
        email: issueForm.email.trim() || null,
        plan: issueForm.plan,
        expiration_date: data.expires_at ?? toIsoStartOfDay(issueForm.expirationDate),
        issued_at: data.issued_at,
        license_hash: data.license_key,
        license_json: JSON.stringify({
          license_id: data.license_id,
          license_key: data.license_key,
          status: data.status,
          issued_at: data.issued_at,
          expires_at: data.expires_at,
          customer_email: issueForm.email.trim() || null,
          customer_name: issueForm.customerName.trim(),
          plan: issueForm.plan,
          notes: issueForm.notes.trim() || null,
        }),
        license_preview: {
          license_id: data.license_id,
          customer_name: issueForm.customerName.trim(),
          plan: issueForm.plan,
          expiration_date: data.expires_at ?? toIsoStartOfDay(issueForm.expirationDate),
        },
        schema_version: 1,
        notes: issueForm.notes.trim() || null,
        created_at: now,
      });
      await refreshCatalog();
    } catch (error) {
      setCatalogError(
        asMessage(error, "Licenca emitida, mas nao foi possivel atualizar o catalogo local de consulta."),
      );
    }
  }

  function handleRequestRevokeLicense() {
    if (!config || !adminActionForm.licenseKey.trim() || !adminActionForm.reason.trim()) return;
    setRevokeConfirmationText("");
    setShowRevokeConfirm(true);
  }

  async function handleConfirmRevokeLicense() {
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
      setShowRevokeConfirm(false);
      setLicenseOverrides((current) => ({
        ...current,
        [response.data.license_key]: {
          status: response.data.license_status,
          lastState: response.data.activation_status ?? response.data.license_status,
          revokedAt: response.data.revoked_at,
        },
      }));
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
      setLicenseOverrides((current) => ({
        ...current,
        [response.data.license_key]: {
          status: response.data.license_status,
          lastState: response.data.previous_activation_status ?? response.data.license_status,
          fingerprint: response.data.previous_machine_fingerprint ?? undefined,
        },
      }));
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

  async function handleCopyRenewalValue(value: string, label: string) {
    await navigator.clipboard.writeText(value);
    setRenewalFeedback(`${label} copiado.`);
    window.setTimeout(() => setRenewalFeedback(null), 2000);
  }

  function handleDownloadTestCleanupSnapshot() {
    const payload = eligibleTestCatalogItems.map((item) => ({
      license_id: item.record.license_id,
      license_key: item.licenseKey,
      customer_name: item.record.customer_name,
      email: item.record.email,
      plan: item.record.plan,
      type: item.classification,
      status: item.status,
      created_at: item.record.created_at,
      expires_at: item.record.expiration_date,
      revoked_at: item.revokedAt,
    }));

    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `license-test-cleanup-snapshot-${new Date().toISOString().slice(0, 10)}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  function handleRequestTestCleanup() {
    setCleanupError(null);
    setCleanupFeedback(null);
    setCleanupConfirmationText("");
    setShowCleanupConfirm(true);
  }

  async function handleConfirmTestCleanup() {
    if (!eligibleTestCatalogItems.length) return;

    setCleaningCatalog(true);
    setCleanupError(null);

    try {
      const result = await removeLicenseCatalogRecords(eligibleTestCatalogItems.map((item) => item.record.license_id));
      setCleanupFeedback(`${result.removedCount} licenca(s) de teste removida(s) do catalogo local.`);
      setShowCleanupConfirm(false);
      setCleanupConfirmationText("");
      await refreshCatalog();
    } catch (error) {
      setCleanupError(asMessage(error, "Falha ao limpar licencas de teste do catalogo local."));
    } finally {
      setCleaningCatalog(false);
    }
  }

  function handleSelectCatalogItem(item: CatalogSummary) {
    setSelectedCatalogLicenseId(item.record.license_id);

    const selectedLicenseKey = item.licenseKey?.trim() || item.record.license_hash?.trim() || "";

    if (selectedLicenseKey) {
      setAdminActionForm((current) => ({
        ...current,
        licenseKey: selectedLicenseKey,
      }));
      setCatalogSelectionFeedback(
        `Licenca ${selectedLicenseKey} selecionada e enviada para o bloco de operacoes manuais.`,
      );

      window.requestAnimationFrame(() => {
        operationsSectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
        licenseKeyInputRef.current?.focus();
        licenseKeyInputRef.current?.select();
      });
      return;
    }

    setCatalogSelectionFeedback(
      `Licenca ${item.record.license_id || "sem identificador"} selecionada para consulta. O catalogo local nao possui license_key utilizavel para preencher as operacoes manuais.`,
    );
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
        <div className="section-header">
          <div>
            <h2>Resumo do catalogo local</h2>
            <p className="helper-text">
              Visao operacional baseada nas licencas disponiveis neste terminal administrativo. Estes numeros nao
              representam o inventario global do negocio.
            </p>
          </div>
        </div>
        <div className="overview-grid">
          {overviewMetrics.map((metric, index) => (
            <article
              key={`${metric.label}-${index}`}
              className={`overview-card${metric.tone ? ` overview-card--${metric.tone}` : ""}`}
            >
              <span>{metric.label}</span>
              <strong>{metric.value}</strong>
            </article>
          ))}
        </div>
        <p className="helper-text">
          Metricas de licencas pagas, licencas teste e receita ainda nao aparecem aqui porque o catalogo local atual
          nao fornece esses dados com confianca suficiente.
        </p>
        {!hasClassificationData ? (
          <p className="helper-text">
            Preparacao para limpeza da fase de testes: o catalogo atual ainda nao distingue teste e paga com seguranca,
            entao nenhuma acao destrutiva foi habilitada nesta rodada.
          </p>
        ) : null}
      </section>

      <section className="card">
        <div className="section-header">
          <div>
            <h2>Limpeza de licencas de teste</h2>
            <p className="helper-text">
              Esta rotina atua somente no catalogo local desta admin UI. Ela nao remove licencas do backend global.
            </p>
          </div>
        </div>
        {cleanupFeedback ? <p className="inline-feedback">{cleanupFeedback}</p> : null}
        {cleanupError ? <ErrorCard title="Erro ao limpar catalogo local" body={cleanupError} /> : null}
        {hasClassificationData ? (
          <>
            <div className="overview-grid">
              <article className="overview-card">
                <span>Licencas de teste elegiveis</span>
                <strong>{eligibleTestCatalogItems.length}</strong>
              </article>
            </div>
            <div className="actions actions--wrap">
              <button
                type="button"
                className="secondary-button"
                onClick={handleDownloadTestCleanupSnapshot}
                disabled={!eligibleTestCatalogItems.length}
              >
                Exportar snapshot JSON
              </button>
              <button
                type="button"
                className="primary-button"
                onClick={handleRequestTestCleanup}
                disabled={!eligibleTestCatalogItems.length || cleaningCatalog}
              >
                Limpar licencas de teste
              </button>
            </div>
            <div className="cleanup-preview-list">
              {eligibleTestCatalogItems.map((item, index) => (
                <article key={`${item.record.license_id || item.licenseKey || "test-cleanup"}-${index}`} className="catalog-item">
                  <div>
                    <strong>{item.licenseKey || item.record.license_id}</strong>
                    <p>{item.record.email || "Email nao informado"}</p>
                    <p>{item.record.customer_name || "Cliente nao informado"}</p>
                  </div>
                  <div>
                    <p>Tipo: {formatClassification(item.classification)}</p>
                    <p>Plano: {item.record.plan}</p>
                    <p>Status: {item.status}</p>
                  </div>
                  <div>
                    <p>Criada em: {formatDateTime(item.record.created_at)}</p>
                    <p>Expira em: {formatDateTime(item.record.expiration_date)}</p>
                  </div>
                </article>
              ))}
            </div>
          </>
        ) : (
          <p className="helper-text">
            Limpeza segura indisponivel: o catalogo local atual nao distingue licencas de teste e producao com
            confianca suficiente.
          </p>
        )}
      </section>

      <section className="card">
        <div className="section-header">
          <div>
            <h2>Renovacoes proximas</h2>
            <p className="helper-text">
              Fila manual calculada a partir do catalogo local deste terminal. Ela ajuda na operacao de contato, mas
              nao representa a carteira global completa.
            </p>
          </div>
        </div>
        {renewalFeedback ? <p className="inline-feedback">{renewalFeedback}</p> : null}
        <div className="renewal-list">
          {renewalCandidates.map((candidate, index) => {
            const mailtoLink = buildRenewalMailto(candidate);

            return (
              <article key={`${candidate.licenseId || candidate.licenseKey || "renewal"}-${index}`} className="renewal-card">
                <div>
                  <strong>{candidate.customerName || candidate.licenseKey || candidate.licenseId}</strong>
                  <p>{candidate.email}</p>
                  <p>Plano: {candidate.plan}</p>
                </div>
                <div>
                  <p>Expira em: {formatDateTime(candidate.expiresAt)}</p>
                  <p>Dias restantes: {candidate.daysRemaining}</p>
                  <p>Janela atual: {candidate.windowLabel}</p>
                </div>
                <div className="catalog-actions">
                  <button
                    type="button"
                    className="secondary-button"
                    onClick={() => void handleCopyRenewalValue(candidate.email, "Email")}
                  >
                    Copiar email
                  </button>
                  <button
                    type="button"
                    className="secondary-button"
                    onClick={() => void handleCopyRenewalValue(candidate.licenseKey, "license_key")}
                    disabled={!candidate.licenseKey}
                  >
                    Copiar license_key
                  </button>
                  <button
                    type="button"
                    className="secondary-button"
                    onClick={() =>
                      void handleCopyRenewalValue(buildRenewalEmailTemplate(candidate), "Template de email")
                    }
                  >
                    Copiar template
                  </button>
                  <a
                    className="secondary-button renewal-link"
                    href={mailtoLink}
                    target="_blank"
                    rel="noreferrer"
                  >
                    Abrir email
                  </a>
                </div>
              </article>
            );
          })}
          {!renewalCandidates.length ? (
            <section className="card compact-card">
              <p>
                Nenhuma licenca ativa com email disponivel entra hoje na fila local de 1o ou 2o aviso.
              </p>
            </section>
          ) : null}
        </div>
        <p className="helper-text">
          Marcacao de "1o aviso enviado" e "2o aviso enviado" ficou fora desta rodada para evitar criar persistencia
          local nova sem validacao adequada.
        </p>
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
        <div className="section-header">
          <div>
            <h2>Consulta de licencas</h2>
            <p className="helper-text">
              Localize licencas catalogadas por email ou license_key sem alterar o fluxo manual atual.
            </p>
          </div>
          <button type="button" className="secondary-button" onClick={() => void refreshCatalog()} disabled={catalogLoading}>
            {catalogLoading ? "Atualizando..." : "Atualizar lista"}
          </button>
        </div>

        <div className="form catalog-filters">
          <Field label="Buscar por email">
            <input
              value={catalogFilters.email}
              onChange={(event) => setCatalogFilters((current) => ({ ...current, email: event.target.value }))}
              placeholder="cliente@empresa.com"
            />
          </Field>
          <Field label="Buscar por license_key">
            <input
              value={catalogFilters.licenseKey}
              onChange={(event) => setCatalogFilters((current) => ({ ...current, licenseKey: event.target.value }))}
              placeholder="PI-..."
            />
          </Field>
          <Field label="Filtrar por status">
            <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
              <option value="all">Todos</option>
              <option value="active">Ativas</option>
              <option value="expired">Expiradas</option>
              <option value="revoked">Revogadas</option>
            </select>
          </Field>
          {hasClassificationData ? (
            <Field label="Filtrar por tipo">
              <select value={typeFilter} onChange={(event) => setTypeFilter(event.target.value as "all" | "teste" | "paga")}>
                <option value="all">Todos</option>
                <option value="teste">Teste</option>
                <option value="paga">Paga</option>
              </select>
            </Field>
          ) : null}
        </div>

        {catalogError ? <ErrorCard title="Erro ao consultar catalogo" body={catalogError} /> : null}
        {catalogSelectionFeedback ? <p className="inline-feedback">{catalogSelectionFeedback}</p> : null}

        <div className="catalog-layout">
          <div>
            <p className="helper-text">
              {filteredCatalogItems.length} licenca(s) encontrada(s) no catalogo local de apoio.
            </p>
            <div className="catalog-list">
              {filteredCatalogItems.map((item, index) => (
                <article
                  key={`${item.record.license_id || item.licenseKey || "catalog"}-${index}`}
                  className={`catalog-item${
                    selectedCatalogItem?.record.license_id === item.record.license_id ? " catalog-item--selected" : ""
                  }`}
                >
                  <div>
                    <strong>{item.record.customer_name || "Cliente nao informado"}</strong>
                    {item.record.email ? <p>{item.record.email}</p> : null}
                    {item.record.plan ? <p>Plano: {item.record.plan}</p> : null}
                  </div>
                  <div className="catalog-actions">
                    <button
                      type="button"
                      className="secondary-button"
                      onClick={() => handleSelectCatalogItem(item)}
                    >
                      {selectedCatalogItem?.record.license_id === item.record.license_id ? "Selecionada" : "Selecionar"}
                    </button>
                  </div>
                </article>
              ))}
              {!filteredCatalogItems.length && !catalogLoading ? (
                <section className="card compact-card">
                  <p>Nenhuma licenca encontrada com os filtros informados.</p>
                </section>
              ) : null}
            </div>
          </div>

          <section className="card compact-card">
            <h3>Detalhes da licenca</h3>
            {selectedCatalogItem ? (
              <div className="config-grid">
                <ConfigItem label="license_key" value={selectedCatalogItem.licenseKey || "Nao catalogada"} />
                <ConfigItem label="cliente" value={selectedCatalogItem.record.customer_name || "Nao informado"} />
                <ConfigItem label="email" value={selectedCatalogItem.record.email || "Nao informado"} />
                <ConfigItem label="tipo" value={formatClassification(selectedCatalogItem.classification)} />
                <ConfigItem label="plano" value={selectedCatalogItem.record.plan} />
                <ConfigItem label="status" value={selectedCatalogItem.status} />
                <ConfigItem label="createdAt" value={formatDateTime(selectedCatalogItem.record.created_at)} />
                <ConfigItem label="expiresAt" value={formatDateTime(selectedCatalogItem.record.expiration_date)} />
                <ConfigItem label="revokedAt" value={formatDateTime(selectedCatalogItem.revokedAt)} />
                <ConfigItem
                  label="fingerprint ou maquina vinculada"
                  value={selectedCatalogItem.fingerprint || "Nao disponivel no catalogo local"}
                />
                <ConfigItem
                  label="ultimo estado conhecido"
                  value={selectedCatalogItem.lastState || selectedCatalogItem.status}
                />
              </div>
            ) : (
              <p className="helper-text">Selecione uma licenca para visualizar os detalhes basicos.</p>
            )}
          </section>
        </div>
      </section>

      <section ref={operationsSectionRef} className="card">
        <h2>Operacoes administrativas</h2>
        <form className="form" onSubmit={(event) => event.preventDefault()}>
          <Field label="license_key">
            <input
              ref={licenseKeyInputRef}
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
            <button type="button" className="primary-button" disabled={revoking || !environmentReady || !adminActionForm.licenseKey.trim() || !adminActionForm.reason.trim()} onClick={handleRequestRevokeLicense}>
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

      {showRevokeConfirm ? (
        <section className="modal-backdrop" role="presentation">
          <div className="card modal-card" role="dialog" aria-modal="true" aria-labelledby="revoke-confirm-title">
            <h3 id="revoke-confirm-title">Confirmar revogacao</h3>
            <p className="helper-text">
              Esta acao usa o fluxo administrativo atual, mas agora exige confirmacao explicita antes de concluir.
            </p>
            <div className="config-grid">
              <ConfigItem label="license_key" value={adminActionForm.licenseKey.trim() || "Nao informado"} />
              <ConfigItem label="email" value={revokeTargetItem?.record.email || "Nao encontrado no catalogo local"} />
              <ConfigItem label="plano" value={revokeTargetItem?.record.plan || "Nao encontrado no catalogo local"} />
              <ConfigItem label="status atual" value={revokeTargetItem?.status || "Nao encontrado no catalogo local"} />
            </div>
            <Field label='Digite "REVOGAR" para confirmar'>
              <input
                value={revokeConfirmationText}
                onChange={(event) => setRevokeConfirmationText(event.target.value)}
                placeholder="REVOGAR"
              />
            </Field>
            <div className="actions actions--wrap">
              <button type="button" className="secondary-button" onClick={() => setShowRevokeConfirm(false)} disabled={revoking}>
                Cancelar
              </button>
              <button
                type="button"
                className="primary-button"
                disabled={revoking || revokeConfirmationText.trim().toUpperCase() !== "REVOGAR"}
                onClick={() => void handleConfirmRevokeLicense()}
              >
                {revoking ? "Revogando..." : "Confirmar revogacao"}
              </button>
            </div>
          </div>
        </section>
      ) : null}

      {showCleanupConfirm ? (
        <section className="modal-backdrop" role="presentation">
          <div className="card modal-card" role="dialog" aria-modal="true" aria-labelledby="cleanup-confirm-title">
            <h3 id="cleanup-confirm-title">Confirmar limpeza local das licencas de teste</h3>
            <p className="helper-text">
              Esta acao remove somente do catalogo local deste terminal {eligibleTestCatalogItems.length} licenca(s)
              classificadas com seguranca como teste. O backend global nao sera alterado.
            </p>
            <div className="cleanup-preview-list">
              {eligibleTestCatalogItems.map((item, index) => (
                <article key={`${item.record.license_id || item.licenseKey || "cleanup-confirm"}-${index}`} className="catalog-item">
                  <div>
                    <strong>{item.licenseKey || item.record.license_id}</strong>
                    <p>{item.record.email || "Email nao informado"}</p>
                  </div>
                  <div>
                    <p>Tipo: {formatClassification(item.classification)}</p>
                    <p>Plano: {item.record.plan}</p>
                    <p>Status: {item.status}</p>
                  </div>
                </article>
              ))}
            </div>
            <Field label='Digite "LIMPAR TESTES" para confirmar'>
              <input
                value={cleanupConfirmationText}
                onChange={(event) => setCleanupConfirmationText(event.target.value)}
                placeholder="LIMPAR TESTES"
              />
            </Field>
            <div className="actions actions--wrap">
              <button
                type="button"
                className="secondary-button"
                onClick={() => setShowCleanupConfirm(false)}
                disabled={cleaningCatalog}
              >
                Cancelar
              </button>
              <button
                type="button"
                className="primary-button"
                disabled={cleaningCatalog || cleanupConfirmationText.trim().toUpperCase() !== "LIMPAR TESTES"}
                onClick={() => void handleConfirmTestCleanup()}
              >
                {cleaningCatalog ? "Limpando..." : "Confirmar limpeza local"}
              </button>
            </div>
          </div>
        </section>
      ) : null}

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

function parseCatalogLicenseJson(value: string) {
  try {
    const parsed = JSON.parse(value) as Record<string, unknown>;
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch {
    return null;
  }
}

function resolveLicenseOverride(
  overrides: Record<string, LocalLicenseOverride>,
  record: Record<string, unknown> | null,
  fallbackLicenseHash: string,
) {
  const licenseKey = readCatalogText(record, ["license_key", "licenseKey"]) ?? fallbackLicenseHash;
  return overrides[licenseKey] ?? null;
}

function readCatalogText(record: Record<string, unknown> | null, keys: string[]) {
  if (!record) return null;

  for (const key of keys) {
    const value = record[key];
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
  }

  return null;
}

function classifyLicenseRecord(
  record: LicenseCatalogRecord,
  payload: Record<string, unknown> | null,
): LicenseClassification {
  const explicitType =
    readCatalogText(payload, ["license_type", "licenseType", "classification", "tier"]) ??
    readCatalogText(payload, ["kind"]);

  const normalizedType = explicitType?.trim().toLowerCase();
  if (normalizedType === "test" || normalizedType === "teste" || normalizedType === "trial") {
    return "teste";
  }

  if (
    normalizedType === "paid" ||
    normalizedType === "paga" ||
    normalizedType === "production" ||
    normalizedType === "commercial"
  ) {
    return "paga";
  }

  const explicitPlan = record.plan?.trim().toLowerCase() ?? "";
  if (explicitPlan === "trial" || explicitPlan === "test" || explicitPlan === "teste") {
    return "teste";
  }

  return null;
}

function formatClassification(value: LicenseClassification) {
  if (value === "teste") return "Teste";
  if (value === "paga") return "Paga";
  return "Nao classificada";
}

function compareDescendingTimestamps(left: string | null | undefined, right: string | null | undefined) {
  const safeLeft = left?.trim() ?? "";
  const safeRight = right?.trim() ?? "";
  const leftTime = Date.parse(safeLeft);
  const rightTime = Date.parse(safeRight);

  if (!Number.isNaN(leftTime) && !Number.isNaN(rightTime)) {
    return rightTime - leftTime;
  }

  if (!Number.isNaN(rightTime)) {
    return 1;
  }

  if (!Number.isNaN(leftTime)) {
    return -1;
  }

  return safeRight.localeCompare(safeLeft);
}

function normalizeCatalogStatus(value: string | null | undefined) {
  const normalized = value?.trim().toLowerCase() ?? "";

  if (!normalized) {
    return "unknown";
  }

  if (normalized.includes("revog")) {
    return "revoked";
  }

  if (normalized.includes("expir")) {
    return "expired";
  }

  if (normalized.includes("active") || normalized.includes("ativ") || normalized.includes("valid")) {
    return "active";
  }

  return "unknown";
}

function calculateDaysRemaining(expiresAt: string) {
  const expirationDay = parseCanonicalDay(expiresAt);
  if (expirationDay === null) {
    return null;
  }

  const today = todayUtcStartMs();
  return Math.round((expirationDay - today) / DAY_IN_MS);
}

function parseCanonicalDay(value: string | null | undefined) {
  const trimmed = value?.trim() ?? "";
  const dateOnly = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})/)?.[1];
  if (!dateOnly) {
    return null;
  }

  const [year, month, day] = dateOnly.split("-").map(Number);
  if (!year || !month || !day) {
    return null;
  }

  return Date.UTC(year, month - 1, day);
}

function todayUtcStartMs() {
  const now = new Date();
  return Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
}

function buildRenewalEmailTemplate(candidate: RenewalCandidate) {
  return [
    `Assunto: Sua licenca do Project Insights expira em ${candidate.daysRemaining} dias`,
    "",
    `Ola, ${candidate.customerName}.`,
    "",
    `Sua licenca do Project Insights expira em ${candidate.daysRemaining} dias.`,
    "",
    "Para evitar interrupcao no uso da ferramenta, recomendamos providenciar a renovacao antes do vencimento.",
    "",
    `Plano atual: ${candidate.plan}.`,
    `Licenca: ${candidate.licenseKey || candidate.licenseId}.`,
    "",
    "Se precisar de apoio, responda este email.",
    "",
    "Atenciosamente,",
    "Rafael",
    "canna.vendasonline@gmail.com",
  ].join("\n");
}

function buildRenewalMailto(candidate: RenewalCandidate) {
  const subject = `Sua licenca do Project Insights expira em ${candidate.daysRemaining} dias`;
  const body = buildRenewalEmailTemplate(candidate)
    .split("\n")
    .slice(2)
    .join("\n");

  return `mailto:${encodeURIComponent(candidate.email)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}

function formatDateTime(value: string | null | undefined) {
  if (!value) {
    return "Nao informado";
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(parsed);
}

const DAY_IN_MS = 24 * 60 * 60 * 1000;
