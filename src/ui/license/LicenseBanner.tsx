import { LICENSE_CLIENT_STATES, type LicenseContextState } from "../../core/license/license-types";

type LicenseBannerProps = {
  license: LicenseContextState;
  loading: boolean;
};

function resolveBannerTone(license: LicenseContextState): "info" | "warning" | "error" | null {
  switch (license.status) {
    case LICENSE_CLIENT_STATES.VALID:
      return null;
    case LICENSE_CLIENT_STATES.ACTIVATING:
      return "info";
    case LICENSE_CLIENT_STATES.OFFLINE_VALID:
      return "warning";
    case LICENSE_CLIENT_STATES.REVOKED:
    case LICENSE_CLIENT_STATES.BLOCKED:
    case LICENSE_CLIENT_STATES.MISMATCH:
    case LICENSE_CLIENT_STATES.INVALID:
    case LICENSE_CLIENT_STATES.ERROR:
    case LICENSE_CLIENT_STATES.EXPIRED:
      return "error";
    case LICENSE_CLIENT_STATES.NO_LICENSE:
    default:
      return "info";
  }
}

export function LicenseBanner({ license, loading }: LicenseBannerProps) {
  if (loading) {
    return <p className="app-message info">Verificando o estado local da licença e a última janela de confiança offline.</p>;
  }

  const tone = resolveBannerTone(license);
  if (!tone) {
    return null;
  }

  return <p className={`app-message ${tone === "error" ? "error" : "info"} license-banner`}>{license.message}</p>;
}
