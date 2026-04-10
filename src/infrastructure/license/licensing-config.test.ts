import { describe, expect, it } from "vitest";

import { LicensingConfigError, resolveLicensingConfig } from "./licensing-config";

describe("resolveLicensingConfig", () => {
  it("accepts a hosted Supabase project URL when it matches the project ref", () => {
    const config = resolveLicensingConfig({
      VITE_LICENSING_SUPABASE_URL: "https://uziellpqviqtyquyaomr.supabase.co",
      VITE_LICENSING_ANON_KEY: "test-anon",
      VITE_LICENSING_PROJECT_REF: "uziellpqviqtyquyaomr",
      VITE_LICENSING_TIMEOUT_MS: "4000",
    } as ImportMetaEnv);

    expect(config.functionsBaseUrl).toBe("https://uziellpqviqtyquyaomr.supabase.co/functions/v1");
  });

  it("accepts the local Supabase URL only when project ref is local", () => {
    const config = resolveLicensingConfig({
      VITE_LICENSING_SUPABASE_URL: "http://127.0.0.1:54321",
      VITE_LICENSING_ANON_KEY: "test-anon",
      VITE_LICENSING_PROJECT_REF: "local",
      VITE_LICENSING_TIMEOUT_MS: "4000",
    } as ImportMetaEnv);

    expect(config.functionsBaseUrl).toBe("http://127.0.0.1:54321/functions/v1");
  });

  it("rejects a local URL when project ref is not local", () => {
    expect(() =>
      resolveLicensingConfig({
        VITE_LICENSING_SUPABASE_URL: "http://127.0.0.1:54321",
        VITE_LICENSING_ANON_KEY: "test-anon",
        VITE_LICENSING_PROJECT_REF: "uziellpqviqtyquyaomr",
      } as ImportMetaEnv),
    ).toThrow(LicensingConfigError);
  });
});
