export type LicensingAdminConfig = {
  supabaseUrl: string;
  functionsBaseUrl: string;
  anonKey: string;
  timeoutMs: number;
  adminTokenConfigured: boolean;
};

export class LicensingAdminConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "LicensingAdminConfigError";
  }
}

const DEFAULT_TIMEOUT_MS = 8000;

export function loadLicensingAdminConfig(): LicensingAdminConfig {
  const supabaseUrl = readRequiredEnv("VITE_LICENSING_SUPABASE_URL");
  const anonKey = readRequiredEnv("VITE_LICENSING_ANON_KEY");
  const timeoutMs = readTimeoutMs(import.meta.env.VITE_LICENSING_TIMEOUT_MS);

  const parsed = parseSupabaseUrl(supabaseUrl);

  return {
    supabaseUrl: parsed.supabaseUrl,
    functionsBaseUrl: parsed.functionsBaseUrl,
    anonKey,
    timeoutMs,
    adminTokenConfigured: false,
  };
}

function readRequiredEnv(name: string) {
  const env = import.meta.env as Record<string, string | undefined>;
  const value = env[name]?.trim();
  if (!value) {
    throw new LicensingAdminConfigError(`${name} nao configurado.`);
  }
  return value;
}

function readTimeoutMs(raw: string | undefined) {
  if (!raw) return DEFAULT_TIMEOUT_MS;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new LicensingAdminConfigError("VITE_LICENSING_TIMEOUT_MS invalido.");
  }
  return parsed;
}

function parseSupabaseUrl(input: string) {
  let url: URL;
  try {
    url = new URL(input);
  } catch {
    throw new LicensingAdminConfigError("VITE_LICENSING_SUPABASE_URL invalido.");
  }

  const isLocal = isLocalHost(url.hostname);
  const isSupabaseCloud = url.hostname.endsWith(".supabase.co");

  if (!isLocal && !isSupabaseCloud) {
    throw new LicensingAdminConfigError("VITE_LICENSING_SUPABASE_URL fora do padrao permitido.");
  }

  const normalizedPath = url.pathname.replace(/\/+$/, "");
  if (normalizedPath === "/functions/v1") {
    return {
      supabaseUrl: `${url.origin}`,
      functionsBaseUrl: `${url.origin}/functions/v1`,
    };
  }

  if (normalizedPath && normalizedPath !== "") {
    throw new LicensingAdminConfigError("VITE_LICENSING_SUPABASE_URL deve apontar para a raiz do projeto ou /functions/v1.");
  }

  return {
    supabaseUrl: `${url.origin}`,
    functionsBaseUrl: `${url.origin}/functions/v1`,
  };
}

function isLocalHost(hostname: string) {
  return hostname === "127.0.0.1" || hostname === "localhost";
}
