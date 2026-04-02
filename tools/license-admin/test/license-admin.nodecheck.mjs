import test from "node:test";
import assert from "node:assert/strict";
import { generateKeyPairSync } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { emitLicense } from "../src/emit-license.mjs";
import { validateLicenseFile } from "../src/validate-license.mjs";
import { ensureOperationalDirectories, resolveOperationalPaths } from "../src/paths.mjs";
import { derivePublicKeyBase64UrlFromPrivateKey, loadPrivateKey } from "../src/load-private-key.mjs";

function createTempWorkspace() {
  const root = mkdtempSync(join(tmpdir(), "license-admin-"));
  const baseDir = join(root, "operacao");
  const privateKeyDir = join(baseDir, "private_key");
  const issuedDir = join(baseDir, "issued");
  const logsDir = join(baseDir, "logs");
  const privateKeyPath = join(privateKeyDir, "private_key.pem");
  const licenseContractPath = join(root, "license-contract.json");

  return { root, baseDir, privateKeyDir, issuedDir, logsDir, privateKeyPath, licenseContractPath };
}

function writeContractFile(paths, publicKeyBase64Url) {
  writeFileSync(
    paths.licenseContractPath,
    `${JSON.stringify({
      algorithm: "Ed25519",
      canonicalizationVersion: 1,
      canonicalizationFields: ["customerName", "licenseId", "plan", "issuedAt", "expiresAt"],
      publicKeyBase64Url,
    }, null, 2)}\n`,
    "utf8",
  );
}

function createKeyMaterial(paths) {
  const { privateKey } = generateKeyPairSync("ed25519");
  ensureOperationalDirectories(
    resolveOperationalPaths({
      baseDir: paths.baseDir,
      privateKeyPath: paths.privateKeyPath,
      issuedDir: paths.issuedDir,
      logsDir: paths.logsDir,
      licenseContractPath: paths.licenseContractPath,
    }),
  );
  writeFileSync(
    paths.privateKeyPath,
    privateKey.export({ format: "pem", type: "pkcs8" }),
    "utf8",
  );
  const publicKeyBase64Url = derivePublicKeyBase64UrlFromPrivateKey(loadPrivateKey(paths.privateKeyPath));
  writeContractFile(paths, publicKeyBase64Url);
}

test("gera licenca semiannual com extensao .license", () => {
  const paths = createTempWorkspace();
  try {
    createKeyMaterial(paths);
    const result = emitLicense({
      customerName: "Cliente A",
      licenseId: "PI-0001",
      plan: "semiannual",
      issuedAt: "2026-04-01T00:00:00.000Z",
      expiresAt: "2026-10-01T00:00:00.000Z",
      outputDir: paths.issuedDir,
      privateKeyPath: paths.privateKeyPath,
      logsDir: paths.logsDir,
      licenseContractPath: paths.licenseContractPath,
    });

    assert.equal(result.payload.plan, "semiannual");
    assert.match(result.filePath, /PI-0001\.license$/);
    assert.equal(existsSync(result.filePath), true);
  } finally {
    rmSync(paths.root, { recursive: true, force: true });
  }
});

test("gera licenca annual e valida como valid", () => {
  const paths = createTempWorkspace();
  try {
    createKeyMaterial(paths);
    const emitted = emitLicense({
      customerName: "Cliente B",
      licenseId: "PI-0002",
      plan: "annual",
      issuedAt: "2026-04-01T00:00:00.000Z",
      expiresAt: "2027-04-01T00:00:00.000Z",
      outputDir: paths.issuedDir,
      privateKeyPath: paths.privateKeyPath,
      logsDir: paths.logsDir,
      licenseContractPath: paths.licenseContractPath,
    });

    const validation = validateLicenseFile({
      filePath: emitted.filePath,
      logsDir: paths.logsDir,
      licenseContractPath: paths.licenseContractPath,
    });

    assert.equal(validation.status, "valid");
    assert.equal(validation.signatureValid, true);
    assert.equal(validation.plan, "annual");
  } finally {
    rmSync(paths.root, { recursive: true, force: true });
  }
});

test("invalida licenca adulterada manualmente", () => {
  const paths = createTempWorkspace();
  try {
    createKeyMaterial(paths);
    const emitted = emitLicense({
      customerName: "Cliente C",
      licenseId: "PI-0003",
      plan: "annual",
      issuedAt: "2026-04-01T00:00:00.000Z",
      expiresAt: "2027-04-01T00:00:00.000Z",
      outputDir: paths.issuedDir,
      privateKeyPath: paths.privateKeyPath,
      logsDir: paths.logsDir,
      licenseContractPath: paths.licenseContractPath,
    });

    const file = JSON.parse(readFileSync(emitted.filePath, "utf8"));
    file.payload.expiresAt = "2028-04-01T00:00:00.000Z";
    writeFileSync(emitted.filePath, JSON.stringify(file, null, 2), "utf8");

    const validation = validateLicenseFile({
      filePath: emitted.filePath,
      logsDir: paths.logsDir,
      licenseContractPath: paths.licenseContractPath,
    });

    assert.equal(validation.status, "invalid");
    assert.equal(validation.signatureValid, false);
  } finally {
    rmSync(paths.root, { recursive: true, force: true });
  }
});

test("falha corretamente sem private_key.pem", () => {
  const paths = createTempWorkspace();
  try {
    ensureOperationalDirectories(
      resolveOperationalPaths({
        baseDir: paths.baseDir,
        privateKeyPath: paths.privateKeyPath,
        issuedDir: paths.issuedDir,
        logsDir: paths.logsDir,
        licenseContractPath: paths.licenseContractPath,
      }),
    );
    writeContractFile(paths, "MvGm3Mj4xOPskOOahQoGzdwTR1zNHtCyWcDeSpfVyNA");

    assert.throws(
      () =>
        emitLicense({
          customerName: "Cliente D",
          licenseId: "PI-0004",
          plan: "semiannual",
          issuedAt: "2026-04-01T00:00:00.000Z",
          expiresAt: "2026-10-01T00:00:00.000Z",
          outputDir: paths.issuedDir,
          privateKeyPath: paths.privateKeyPath,
          logsDir: paths.logsDir,
          licenseContractPath: paths.licenseContractPath,
        }),
      /Nao foi possivel ler a chave privada/,
    );
  } finally {
    rmSync(paths.root, { recursive: true, force: true });
  }
});

test("cria diretorios padrao quando ausentes", () => {
  const paths = createTempWorkspace();
  try {
    const resolved = resolveOperationalPaths({
      baseDir: paths.baseDir,
      privateKeyPath: paths.privateKeyPath,
      issuedDir: paths.issuedDir,
      logsDir: paths.logsDir,
      licenseContractPath: paths.licenseContractPath,
    });

    ensureOperationalDirectories(resolved);

    assert.equal(existsSync(paths.privateKeyDir), true);
    assert.equal(existsSync(paths.issuedDir), true);
    assert.equal(existsSync(paths.logsDir), true);
  } finally {
    rmSync(paths.root, { recursive: true, force: true });
  }
});
