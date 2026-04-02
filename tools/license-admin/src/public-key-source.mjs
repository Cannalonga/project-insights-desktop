import { createPublicKey, verify } from "node:crypto";
import { readFileSync } from "node:fs";

const ED25519_SPKI_PREFIX_HEX = "302a300506032b6570032100";
const EXPECTED_ALGORITHM = "Ed25519";
const EXPECTED_CANONICALIZATION_VERSION = 1;
const EXPECTED_CANONICALIZATION_FIELDS = [
  "customerName",
  "licenseId",
  "plan",
  "issuedAt",
  "expiresAt",
];

function rawEd25519PublicKeyToSpkiDer(rawKeyBuffer) {
  return Buffer.concat([Buffer.from(ED25519_SPKI_PREFIX_HEX, "hex"), rawKeyBuffer]);
}

function normalizeContractPublicKeys(contract, contractPath) {
  const legacyKey = typeof contract.publicKeyBase64Url === "string" && contract.publicKeyBase64Url.trim().length > 0
    ? contract.publicKeyBase64Url.trim()
    : null;

  const declaredKeys = Array.isArray(contract.publicKeys)
    ? contract.publicKeys
        .map((entry) => {
          if (!entry || typeof entry.key !== "string" || entry.key.trim().length === 0) {
            throw new Error(`Contrato de licenca com entrada de chave publica invalida em ${contractPath}.`);
          }

          return {
            id: typeof entry.id === "string" && entry.id.trim().length > 0 ? entry.id.trim() : undefined,
            key: entry.key.trim(),
          };
        })
    : [];

  if (declaredKeys.length === 0 && !legacyKey) {
    throw new Error(`Contrato de licenca sem chave publica valida em ${contractPath}.`);
  }

  const merged = [...declaredKeys];
  if (legacyKey && !merged.some((entry) => entry.key === legacyKey)) {
    merged.push({ id: "legacy", key: legacyKey });
  }

  return merged;
}

export function readLicenseContract(contractPath) {
  const contract = JSON.parse(readFileSync(contractPath, "utf8"));

  if (contract.algorithm !== EXPECTED_ALGORITHM) {
    throw new Error(`Contrato de licenca com algoritmo nao suportado em ${contractPath}.`);
  }

  if (contract.canonicalizationVersion !== EXPECTED_CANONICALIZATION_VERSION) {
    throw new Error(`Contrato de licenca com versao de canonicalizacao invalida em ${contractPath}.`);
  }

  const fields = contract.canonicalizationFields;
  if (
    !Array.isArray(fields) ||
    fields.length !== EXPECTED_CANONICALIZATION_FIELDS.length ||
    fields.some((field, index) => field !== EXPECTED_CANONICALIZATION_FIELDS[index])
  ) {
    throw new Error(`Contrato de licenca com campos de canonicalizacao invalidos em ${contractPath}.`);
  }

  const publicKeys = normalizeContractPublicKeys(contract, contractPath);

  return {
    ...contract,
    publicKeys,
    publicKeyBase64Url: typeof contract.publicKeyBase64Url === "string" ? contract.publicKeyBase64Url : publicKeys[0].key,
  };
}

export function buildVerifyingKeyFromBase64Url(publicKeyBase64Url) {
  const raw = Buffer.from(publicKeyBase64Url, "base64url");
  if (raw.length !== 32) {
    throw new Error("Chave publica Ed25519 com tamanho invalido.");
  }

  return createPublicKey({
    key: rawEd25519PublicKeyToSpkiDer(raw),
    format: "der",
    type: "spki",
  });
}

export function buildVerifyingKeysFromContract(contract) {
  return contract.publicKeys.map((entry) => ({
    id: entry.id,
    key: entry.key,
    publicKey: buildVerifyingKeyFromBase64Url(entry.key),
  }));
}

export function verifyDetachedSignature({ publicKey, payload, signature }) {
  return verify(null, Buffer.from(payload, "utf8"), publicKey, Buffer.from(signature, "base64url"));
}

export function verifyDetachedSignatureAgainstAnyKey({ contract, payload, signature }) {
  return buildVerifyingKeysFromContract(contract).some(({ publicKey }) =>
    verifyDetachedSignature({ publicKey, payload, signature }),
  );
}
