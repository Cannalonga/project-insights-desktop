import { describe, expect, it } from "vitest";

import {
  buildInvalidState,
  buildMissingState,
  resolveLicenseState,
} from "./resolve-license-state";

describe("resolveLicenseState", () => {
  it("returns a valid licensed state for an active annual license", () => {
    const state = resolveLicenseState(
      {
        customerName: "Cliente Teste",
        licenseId: "LIC-001",
        plan: "annual",
        issuedAt: "2026-01-01T00:00:00.000Z",
        expiresAt: "2026-12-31T00:00:00.000Z",
      },
      "2026-03-31T00:00:00.000Z",
    );

    expect(state).toMatchObject({
      status: "valid",
      isLicensed: true,
      plan: "annual",
      customerName: "Cliente Teste",
    });
    expect(state.daysRemaining).toBeGreaterThan(200);
  });

  it("returns a valid licensed state for an active semiannual license", () => {
    const state = resolveLicenseState(
      {
        customerName: "Cliente Teste",
        licenseId: "LIC-010",
        plan: "semiannual",
        issuedAt: "2026-01-01T00:00:00.000Z",
        expiresAt: "2026-06-30T00:00:00.000Z",
      },
      "2026-03-31T00:00:00.000Z",
    );

    expect(state).toMatchObject({
      status: "valid",
      isLicensed: true,
      plan: "semiannual",
    });
  });

  it("returns an expired state when the license is past due", () => {
    const state = resolveLicenseState(
      {
        customerName: "Cliente Teste",
        licenseId: "LIC-002",
        plan: "semiannual",
        issuedAt: "2025-01-01T00:00:00.000Z",
        expiresAt: "2026-02-01T00:00:00.000Z",
      },
      "2026-03-31T00:00:00.000Z",
    );

    expect(state).toMatchObject({
      status: "expired",
      isLicensed: false,
    });
  });

  it("returns invalid when dates are malformed", () => {
    const state = resolveLicenseState(
      {
        customerName: "Cliente Teste",
        licenseId: "LIC-003",
        plan: "annual",
        issuedAt: "not-a-date",
        expiresAt: "2026-12-31T00:00:00.000Z",
      },
      "2026-03-31T00:00:00.000Z",
    );

    expect(state).toEqual(buildInvalidState());
  });

  it("returns invalid when issuedAt is after expiresAt", () => {
    const state = resolveLicenseState(
      {
        customerName: "Cliente Teste",
        licenseId: "LIC-004",
        plan: "annual",
        issuedAt: "2027-01-01T00:00:00.000Z",
        expiresAt: "2026-12-31T00:00:00.000Z",
      },
      "2026-03-31T00:00:00.000Z",
    );

    expect(state).toEqual(buildInvalidState());
  });

  it("builds missing state for startup without persisted license", () => {
    expect(buildMissingState()).toMatchObject({
      status: "missing",
      isLicensed: false,
    });
  });
});
