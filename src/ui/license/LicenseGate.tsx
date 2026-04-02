import type { ReactNode } from "react";
import { useState } from "react";

import type { LicenseContextState, PremiumFeature } from "../../core/license/license-types";
import { getLicenseFeatureDecision } from "./license-feature-policy";

type LicenseGateRenderApi = {
  allowed: boolean;
  run: (action: () => void | Promise<void>) => Promise<void>;
};

type LicenseGateProps = {
  feature: PremiumFeature;
  license: LicenseContextState;
  onRequestLicense: () => Promise<void> | void;
  onOpenBuyLicense: () => Promise<void> | void;
  children: ReactNode | ((api: LicenseGateRenderApi) => ReactNode);
  fallback?: ReactNode;
};

export function LicenseGate({
  feature,
  license,
  onRequestLicense,
  onOpenBuyLicense,
  children,
  fallback,
}: LicenseGateProps) {
  const [showBlockedMessage, setShowBlockedMessage] = useState(false);
  const decision = getLicenseFeatureDecision(license, feature);

  async function run(action: () => void | Promise<void>): Promise<void> {
    if (decision.allowed) {
      await action();
      return;
    }

    setShowBlockedMessage(true);
  }

  if (!decision.allowed && fallback) {
    return (
      <section className="license-gate-block">
        {fallback}
        <div className="license-inline-blocker">
          <strong>{decision.title}</strong>
          <p>{decision.description}</p>
          <div className="license-inline-actions">
            <button type="button" className="primary-button" onClick={() => void onRequestLicense()}>
              Aplicar licenca
            </button>
          </div>
        </div>
      </section>
    );
  }

  return (
    <div className="license-gate-action">
      {typeof children === "function" ? children({ allowed: decision.allowed, run }) : children}
      {!decision.allowed && showBlockedMessage ? (
        <div className="license-inline-blocker">
          <strong>{decision.title}</strong>
          <p>{decision.description}</p>
          <div className="license-inline-actions">
            <button type="button" className="primary-button" onClick={() => void onRequestLicense()}>
              Aplicar licenca
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
