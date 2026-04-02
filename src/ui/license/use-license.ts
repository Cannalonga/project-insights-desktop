import { open as openDialog } from "@tauri-apps/api/dialog";
import { readTextFile } from "@tauri-apps/api/fs";
import { open as openExternal } from "@tauri-apps/api/shell";
import { useEffect, useMemo, useState } from "react";

import type { LicenseContextState } from "../../core/license/license-types";
import { createLicenseService } from "../../app/license/license-service";
import { buildInvalidState, buildMissingState } from "../../app/license/resolve-license-state";
import { LicenseVerificationError } from "../../app/license/verify-license";
import { appendOperationalLog, exportOperationalLogForUser } from "../../app/use-cases/app-log";
import { LICENSE_BUY_URL } from "./license-config";

type UseLicenseResult = {
  license: LicenseContextState;
  loading: boolean;
  importing: boolean;
  exportingLogs: boolean;
  notice: string | null;
  applyLicenseText: (contents: string) => Promise<boolean>;
  importLicenseFromFile: () => Promise<void>;
  exportLogs: () => Promise<void>;
  openBuyLicense: () => Promise<void>;
  clearNotice: () => void;
};

type LicenseInputSource = "paste" | "file";

function unwrapLicenseText(contents: string): string {
  const trimmed = contents.trim();
  if (!trimmed) {
    throw new LicenseVerificationError("Licenca invalida");
  }

  if (trimmed.includes("-----BEGIN LICENSE-----") && trimmed.includes("-----END LICENSE-----")) {
    return trimmed
      .replace("-----BEGIN LICENSE-----", "")
      .replace("-----END LICENSE-----", "")
      .trim();
  }

  return trimmed;
}

function validateMinimumLicenseShape(contents: string): string {
  const normalized = unwrapLicenseText(contents);

  let parsed: unknown;
  try {
    parsed = JSON.parse(normalized);
  } catch {
    throw new Error("parse_error");
  }

  if (
    typeof parsed !== "object" ||
    parsed === null ||
    !("payload" in parsed) ||
    !("signature" in parsed)
  ) {
    throw new Error("validation_error");
  }

  return normalized;
}

function nowIso(): string {
  return new Date().toISOString();
}

export function useLicense(): UseLicenseResult {
  const service = useMemo(() => createLicenseService(), []);
  const [license, setLicense] = useState<LicenseContextState>(buildMissingState());
  const [loading, setLoading] = useState(true);
  const [importing, setImporting] = useState(false);
  const [exportingLogs, setExportingLogs] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function loadInitialLicense(): Promise<void> {
      try {
        const state = await service.loadCurrentState();
        if (!cancelled) {
          setLicense(state);
        }
      } catch {
        if (!cancelled) {
          setLicense(buildInvalidState());
          setNotice("Nao foi possivel validar a licenca salva. O app segue em modo demonstracao.");
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    void loadInitialLicense();

    return () => {
      cancelled = true;
    };
  }, [service]);

  async function applyLicenseContents(contents: string, source: LicenseInputSource): Promise<boolean> {
    setImporting(true);
    setNotice(null);

    try {
      const normalized = validateMinimumLicenseShape(contents);
      const state = await service.importLicense(normalized);
      setLicense(state);
      setNotice("Licenca aplicada com sucesso.");
      await appendOperationalLog({
        timestamp: nowIso(),
        event: "license_apply_success",
        source,
        inputLength: normalized.length,
      });
      return true;
    } catch (error) {
      if (error instanceof Error && error.message === "parse_error") {
        setLicense(buildInvalidState());
        setNotice("Licenca invalida");
        await appendOperationalLog({
          timestamp: nowIso(),
          event: "parse_error",
          source,
          inputLength: contents.length,
          reason: "json_parse_failed",
        });
        await appendOperationalLog({
          timestamp: nowIso(),
          event: "license_apply_failed",
          source,
          inputLength: contents.length,
          reason: "parse_error",
        });
        return false;
      }

      if (error instanceof Error && error.message === "validation_error") {
        setLicense(buildInvalidState());
        setNotice("Licenca invalida");
        await appendOperationalLog({
          timestamp: nowIso(),
          event: "validation_error",
          source,
          inputLength: contents.length,
          reason: "missing_payload_or_signature",
        });
        await appendOperationalLog({
          timestamp: nowIso(),
          event: "license_apply_failed",
          source,
          inputLength: contents.length,
          reason: "validation_error",
        });
        return false;
      }

      if (error instanceof LicenseVerificationError) {
        setLicense(buildInvalidState());
        setNotice("Licenca invalida");
        await appendOperationalLog({
          timestamp: nowIso(),
          event: "validation_error",
          source,
          inputLength: contents.length,
          reason: "signature_verification_failed",
        });
        await appendOperationalLog({
          timestamp: nowIso(),
          event: "license_apply_failed",
          source,
          inputLength: contents.length,
          reason: "license_verification_failed",
        });
        return false;
      }

      setNotice("Nao foi possivel aplicar a licenca agora.");
      await appendOperationalLog({
        timestamp: nowIso(),
        event: "license_apply_failed",
        source,
        inputLength: contents.length,
        reason: "unexpected_error",
      });
      return false;
    } finally {
      setImporting(false);
    }
  }

  async function applyLicenseText(contents: string): Promise<boolean> {
    return applyLicenseContents(contents, "paste");
  }

  async function importLicenseFromFile(): Promise<void> {
    setImporting(true);
    setNotice(null);

    try {
      const filePath = await openDialog({
        multiple: false,
        filters: [{ name: "License Files", extensions: ["dat", "json", "license"] }],
      });

      if (!filePath || Array.isArray(filePath)) {
        return;
      }

      const contents = await readTextFile(filePath);
      await applyLicenseContents(contents, "file");
    } catch {
      setNotice("Nao foi possivel aplicar a licenca agora.");
    } finally {
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
    importLicenseFromFile,
    exportLogs,
    openBuyLicense,
    clearNotice: () => setNotice(null),
  };
}
