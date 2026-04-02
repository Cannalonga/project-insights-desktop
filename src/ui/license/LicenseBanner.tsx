import type { LicenseContextState } from "../../core/license/license-types";

type LicenseBannerProps = {
  license: LicenseContextState;
  loading: boolean;
};

function resolveBannerTone(license: LicenseContextState): "info" | "warning" | "error" | null {
  if (license.status === "valid" && (license.daysRemaining === undefined || license.daysRemaining > 15)) {
    return null;
  }

  if (license.status === "valid") {
    return "warning";
  }

  if (license.status === "expired" || license.status === "invalid") {
    return "error";
  }

  return "info";
}

export function LicenseBanner({ license, loading }: LicenseBannerProps) {
  if (loading) {
    return <p className="app-message info">Verificando licenca local para liberar os recursos premium.</p>;
  }

  const tone = resolveBannerTone(license);
  if (!tone) {
    return null;
  }

  return <p className={`app-message ${tone === "error" ? "error" : "info"} license-banner`}>{license.message}</p>;
}
