import fs from "fs";
import path from "path";
import { execFileSync } from "child_process";
import { fileURLToPath } from "url";

function readFlag(args, flag, fallback) {
  const index = args.indexOf(flag);
  if (index === -1 || !args[index + 1]) {
    return fallback;
  }

  return args[index + 1];
}

function pad(value, size = 4) {
  return String(value).padStart(size, "0");
}

function addDays(date, days) {
  const next = new Date(date);
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function runCli(nodePath, cliPath, args, cwd) {
  return execFileSync(nodePath, [cliPath, ...args], {
    cwd,
    encoding: "utf-8",
    stdio: ["ignore", "pipe", "pipe"],
  });
}

function main() {
  const args = process.argv.slice(2);
  const count = Number(readFlag(args, "--count", "50"));
  if (!Number.isFinite(count) || count <= 0) {
    throw new Error("Parametro invalido: --count precisa ser um numero maior que zero.");
  }

  const scriptDir = path.dirname(fileURLToPath(import.meta.url));
  const cwd = path.resolve(scriptDir, "..");
  const cliPath = path.join(cwd, "src", "cli.mjs");
  const nodePath = process.execPath;
  const baseDir = readFlag(args, "--base-dir", String.raw`D:\LICENCAS_CANNACONVERTER2_0`);
  const contractPath = readFlag(args, "--license-contract-file", path.resolve(cwd, "..", "..", "shared", "license-contract.json"));
  const privateKeyPath = readFlag(args, "--private-key-file", path.join(baseDir, "private_key", "private_key.pem"));
  const runLabel = readFlag(args, "--label", `stress-${new Date().toISOString().replace(/[.:]/g, "-")}`);
  const stressRoot = path.join(baseDir, "stress-tests", runLabel);
  const outputDir = path.join(stressRoot, "issued");
  const logsDir = path.join(stressRoot, "logs");
  const reportPath = path.join(stressRoot, "report.json");

  ensureDir(outputDir);
  ensureDir(logsDir);

  const startedAt = new Date();
  const failures = [];
  const validated = [];

  for (let index = 1; index <= count; index += 1) {
    const issuedAt = new Date(Date.UTC(2026, 3, 2, 12, 0, 0, 0));
    issuedAt.setUTCMinutes(index);
    const expiresAt = addDays(issuedAt, index % 2 === 0 ? 365 : 180);
    const plan = index % 2 === 0 ? "annual" : "semiannual";
    const licenseId = `STRESS-${pad(index, 5)}`;
    const customerName = `Stress Test ${pad(index, 5)}`;

    try {
      runCli(nodePath, cliPath, [
        "emitir",
        "--customer-name", customerName,
        "--license-id", licenseId,
        "--plan", plan,
        "--issued-at", issuedAt.toISOString(),
        "--expires-at", expiresAt.toISOString(),
        "--output-dir", outputDir,
        "--logs-dir", logsDir,
        "--private-key-file", privateKeyPath,
        "--license-contract-file", contractPath,
      ], cwd);

      const filePath = path.join(outputDir, `${licenseId}.license`);
      const validationOutput = runCli(nodePath, cliPath, [
        "validar",
        "--file", filePath,
        "--logs-dir", logsDir,
        "--license-contract-file", contractPath,
      ], cwd);

      validated.push({ licenseId, filePath, validationOutput });
    } catch (error) {
      failures.push({
        licenseId,
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }

  const summary = {
    startedAt: startedAt.toISOString(),
    finishedAt: new Date().toISOString(),
    countRequested: count,
    successCount: validated.length,
    failureCount: failures.length,
    outputDir,
    logsDir,
    failures,
  };

  fs.writeFileSync(reportPath, JSON.stringify(summary, null, 2), "utf-8");

  process.stdout.write(`Teste de estresse concluido.
`);
  process.stdout.write(`Solicitadas: ${count}
`);
  process.stdout.write(`Emitidas e validadas: ${validated.length}
`);
  process.stdout.write(`Falhas: ${failures.length}
`);
  process.stdout.write(`Saida isolada: ${outputDir}
`);
  process.stdout.write(`Relatorio: ${reportPath}
`);

  if (failures.length > 0) {
    process.exitCode = 1;
  }
}

main();
