import { describe, expect, it } from "vitest";

import {
  buildActivatingState,
  buildErrorState,
  buildInvalidState,
  buildMismatchState,
  buildNoLicenseState,
  buildOfflineValidState,
  buildRevokedState,
  buildValidationRequiredErrorState,
} from "./resolve-license-state";

describe("resolve license state builders", () => {
  it("builds no-license state", () => {
    expect(buildNoLicenseState()).toMatchObject({
      status: "NO_LICENSE",
      isLicensed: false,
    });
  });

  it("builds activating and invalid states", () => {
    expect(buildActivatingState()).toMatchObject({
      status: "ACTIVATING",
      isLicensed: false,
    });

    expect(buildInvalidState()).toMatchObject({
      status: "INVALID",
      isLicensed: false,
    });
  });

  it("builds offline valid state", () => {
    expect(buildOfflineValidState("2026-04-10T00:00:00.000Z", "2026-04-10T00:00:00.000Z", "2027-04-05T00:00:00.000Z")).toMatchObject({
      status: "OFFLINE_VALID",
      isLicensed: true,
      expiresAt: "2027-04-05T00:00:00.000Z",
    });
  });

  it("builds actionable error states", () => {
    expect(buildValidationRequiredErrorState()).toMatchObject({
      status: "ERROR",
      isLicensed: false,
    });

    expect(buildErrorState("erro")).toMatchObject({
      status: "ERROR",
      isLicensed: false,
      message: "erro",
    });
  });

  it("builds revoked and mismatch states", () => {
    expect(buildRevokedState()).toMatchObject({ status: "REVOKED", isLicensed: false });
    expect(buildMismatchState()).toMatchObject({ status: "MISMATCH", isLicensed: false });
  });
});
