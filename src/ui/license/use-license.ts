import { open as openExternal } from "@tauri-apps/api/shell";
import { useEffect, useMemo, useRef, useState } from "react";

import { createLicenseService, LicenseActivationError } from "../../app/license/license-service";
import {
  buildActivatingState,
  buildErrorState,
  buildNoLicenseState,
} from "../../app/license/resolve-license-state";
import { appendOperationalLog, exportOperationalLogForUser } from "../../app/use-cases/app-log";
import type { LicenseContextState } from "../../core/license/license-types";
import { LICENSE_BUY_URL } from "./license-config";

type UseLicenseResult = {
  license: LicenseContextState;
  loading: boolean;
  importing: boolean;
  exportingLogs: boolean;
  notice: string | null;
  applyLicenseText: (contents: string) => Promise<boolean>;
  exportLogs: () => Promise<void>;
  openBuyLicense: () => Promise<void>;
  clearNotice: () => void;
};

const LICENSING_BUILD_VERSION = "0.1.0";

function nowIso(): string {
  return new Date().toISOString();
}

function classifyActivationErrorCategory(
  reason: "invalid_input" | "network" | "timeout" | "server" | "invalid_response" | "config" | "unexpected",
): "network" | "license_input" | "backend_response" | "config" | "unexpected" {
  switch (reason) {
    case "network":
    case "timeout":
      return "network";
    case "invalid_input":
      return "license_input";
    case "server":
    case "invalid_response":
      return "backend_response";
    case "config":
      return "config";
    case "unexpected":
    default:
      return "unexpected";
  }
}

function getDiagnostics(error: unknown): LicenseContextState["diagnostics"] | undefined {
  if (error instanceof LicenseActivationError) {
    return error.diagnostics;
  }

  return undefined;
}

function resolveRefreshOutcome(license: LicenseContextState): "success" | "failure" | "denied" | "fallback_offline" {
  if (license.status === "OFFLINE_VALID") {
    return "fallback_offline";
  }

  if (license.isLicensed) {
    return "success";
  }

  return "denied";
}

export function useLicense(): UseLicenseResult {
  const service = useMemo(() => createLicenseService(), []);
  const [license, setLicense] = useState<LicenseContextState>(buildNoLicenseState());
  const [loading, setLoading] = useState(true);
  const [importing, setImporting] = useState(false);
  const [exportingLogs, setExportingLogs] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const activationInFlightRef = useRef(false);

  useEffect(() => {
    let cancelled = false;

    async function bootstrapLicense(): Promise<void> {
      try {
        const initialState = await service.loadCurrentState();
        await appendOperationalLog({
          timestamp: nowIso(),
          event: "license_state_loaded",
          action: "load_stored_state",
          outcome: "success",
          source: "file",
          uiStateAfter: initialState.status,
          requestContext: initialState.source,
          buildVersion: LICENSING_BUILD_VERSION,
        });

        if (!cancelled) {
          setLicense(initialState);
        }

        const validatedState = await service.validateCurrentState();
        if (!cancelled && validatedState) {
          await appendOperationalLog({
            timestamp: nowIso(),
            event: "license_refresh_result",
            action: validatedState.status === "OFFLINE_VALID" ? "offline_reopen" : "refresh_license",
            outcome: resolveRefreshOutcome(validatedState),
            source: "file",
            reason: validatedState.isLicensed ? undefined : validatedState.status.toLowerCase(),
            classifiedReason: validatedState.diagnostics?.classifiedReason,
            message: validatedState.message,
            rawErrorName: validatedState.diagnostics?.rawErrorName,
            rawErrorMessage: validatedState.diagnostics?.rawErrorMessage,
            rawErrorCode: validatedState.diagnostics?.rawErrorCode,
            errorCategory: validatedState.isLicensed ? undefined : "license_state",
            operation: validatedState.diagnostics?.operation,
            httpStatus: validatedState.diagnostics?.httpStatus,
            elapsedMs: validatedState.diagnostics?.elapsedMs,
            host: validatedState.diagnostics?.host,
            stage: validatedState.diagnostics?.stage,
            uiStateBefore: initialState.status,
            uiStateAfter: validatedState.status,
            requestContext: validatedState.source,
            buildVersion: LICENSING_BUILD_VERSION,
          });

          setLicense(validatedState);
          if (!validatedState.isLicensed) {
            setNotice(validatedState.message);
          }
        }
      } catch (error) {
        const message =
          error instanceof Error
            ? error.message
            : "Nao foi possivel carregar o estado de licenciamento desta maquina. Reinicie o app e tente novamente.";
        const errorName = error instanceof Error ? error.name : "UnknownError";

        await appendOperationalLog({
          timestamp: nowIso(),
          event: "license_state_load_failed",
          action: "load_stored_state",
          outcome: "failure",
          source: "file",
          message,
          errorName,
          errorCategory: "license_state",
          uiStateAfter: "ERROR",
          buildVersion: LICENSING_BUILD_VERSION,
        });

        if (!cancelled) {
          const failureState = buildErrorState(
            "Nao foi possivel carregar o estado de licenciamento desta maquina. Reinicie o app e tente novamente.",
          );
          setNotice(failureState.message);
          setLicense(failureState);
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    void bootstrapLicense();

    return () => {
      cancelled = true;
    };
  }, [service]);

  async function applyLicenseText(contents: string): Promise<boolean> {
    if (activationInFlightRef.current) {
      return false;
    }

    activationInFlightRef.current = true;
    setImporting(true);
    setNotice(null);
    const previousState = license;
    setLicense(buildActivatingState());

    try {
      const state = await service.activateLicense(contents);
      setLicense(state);
      setNotice(state.message);

      await appendOperationalLog({
        timestamp: nowIso(),
        event: "license_apply_success",
        action: "apply_license",
        outcome: "success",
        source: "paste",
        inputLength: contents.trim().length,
        uiStateBefore: previousState.status,
        uiStateAfter: state.status,
        requestContext: state.source,
        buildVersion: LICENSING_BUILD_VERSION,
      });

      return state.isLicensed;
    } catch (error) {
      const reason = error instanceof LicenseActivationError ? error.code : "unexpected";
      const message = error instanceof Error ? error.message : "Nao foi possivel ativar a licenca agora.";
      const errorName = error instanceof Error ? error.name : "UnknownError";
      const diagnostics = getDiagnostics(error);

      if (previousState.isLicensed) {
        setLicense(previousState);
      } else {
        setLicense(buildErrorState(message));
      }
      setNotice(message);

      await appendOperationalLog({
        timestamp: nowIso(),
        event: "license_apply_failed",
        action: "apply_license",
        outcome: "failure",
        source: "paste",
        inputLength: contents.trim().length,
        reason,
        classifiedReason: diagnostics?.classifiedReason,
        message,
        errorName,
        rawErrorName: diagnostics?.rawErrorName,
        rawErrorMessage: diagnostics?.rawErrorMessage,
        rawErrorCode: diagnostics?.rawErrorCode,
        errorCategory: classifyActivationErrorCategory(reason),
        operation: diagnostics?.operation,
        httpStatus: diagnostics?.httpStatus,
        elapsedMs: diagnostics?.elapsedMs,
        host: diagnostics?.host,
        stage: diagnostics?.stage,
        hadLicensedStateBeforeFailure: previousState.isLicensed,
        uiStateBefore: previousState.status,
        uiStateAfter: previousState.isLicensed ? previousState.status : "ERROR",
        buildVersion: LICENSING_BUILD_VERSION,
      });

      return false;
    } finally {
      activationInFlightRef.current = false;
      setImporting(false);
    }
  }

  async function exportLogs(): Promise<void> {
    setExportingLogs(true);
    try {
      const exportPath = await exportOperationalLogForUser();
      if (exportPath) {
        setNotice(`Logs exportados para ${exportPath}`);
        return;
      }

      setNotice("Nao foi possivel exportar os logs agora.");
    } finally {
      setExportingLogs(false);
    }
  }

  async function openBuyLicense(): Promise<void> {
    try {
      await openExternal(LICENSE_BUY_URL);
    } catch {
      setNotice("Nao foi possivel abrir a pagina de obtencao de licenca agora.");
    }
  }

  return {
    license,
    loading,
    importing,
    exportingLogs,
    notice,
    applyLicenseText,
    exportLogs,
    openBuyLicense,
    clearNotice: () => setNotice(null),
  };
}
