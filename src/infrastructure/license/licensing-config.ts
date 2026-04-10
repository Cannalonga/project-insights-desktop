export type LicensingConfig = {
  projectRef: string;
  supabaseUrl: string;
  functionsBaseUrl: string;
  anonKey: string;
  requestTimeoutMs: number;
};

export class LicensingConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "LicensingConfigError";
  }
}

function isLocalLicensingHost(host: string): boolean {
  return host === "127.0.0.1:54321" || host === "localhost:54321";
}

function readRequiredEnv(value: string | undefined, label: string): string {
  if (!value || value.trim().length === 0) {
    throw new LicensingConfigError(`${label} is not configured.`);
  }

  return value.trim();
}

function parseTimeout(raw: string | undefined): number {
  const parsed = raw ? Number(raw) : 5000;
  if (!Number.isFinite(parsed) || parsed < 1000 || parsed > 15000) {
    return 5000;
  }

  return parsed;
}

export function resolveLicensingConfig(env: ImportMetaEnv = import.meta.env): LicensingConfig {
  const supabaseUrl = readRequiredEnv(env.VITE_LICENSING_SUPABASE_URL, "VITE_LICENSING_SUPABASE_URL");
  const anonKey = readRequiredEnv(env.VITE_LICENSING_ANON_KEY, "VITE_LICENSING_ANON_KEY");
  const projectRef = readRequiredEnv(env.VITE_LICENSING_PROJECT_REF, "VITE_LICENSING_PROJECT_REF");

  let parsedUrl: URL;
  try {
    parsedUrl = new URL(supabaseUrl);
  } catch {
    throw new LicensingConfigError("VITE_LICENSING_SUPABASE_URL is invalid.");
  }

  const expectedHost = `${projectRef}.supabase.co`;
  const isLocalEnvironment = projectRef === "local" && isLocalLicensingHost(parsedUrl.host);
  if (parsedUrl.host !== expectedHost && !isLocalEnvironment) {
    throw new LicensingConfigError("Licensing project configuration does not match the expected Supabase project ref.");
  }

  return {
    projectRef,
    supabaseUrl,
    functionsBaseUrl: `${parsedUrl.origin}/functions/v1`,
    anonKey,
    requestTimeoutMs: parseTimeout(env.VITE_LICENSING_TIMEOUT_MS),
  };
}
