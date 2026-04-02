import { ensureOperationalDirectories, resolveOperationalPaths } from "./paths.mjs";
import { emitLicense } from "./emit-license.mjs";
import { validateLicenseFile } from "./validate-license.mjs";

function readRequiredFlag(args, flag) {
  const index = args.indexOf(flag);
  if (index === -1 || !args[index + 1]) {
    throw new Error(`Parametro obrigatorio ausente: ${flag}`);
  }

  return args[index + 1];
}

function readOptionalFlag(args, flag) {
  const index = args.indexOf(flag);
  return index === -1 ? undefined : args[index + 1];
}

function printEmitSummary(result) {
  process.stdout.write(`Licenca emitida com sucesso.\n`);
  process.stdout.write(`Cliente: ${result.payload.customerName}\n`);
  process.stdout.write(`Licenca: ${result.payload.licenseId}\n`);
  process.stdout.write(`Plano: ${result.payload.plan}\n`);
  process.stdout.write(`Expira em: ${result.payload.expiresAt}\n`);
  process.stdout.write(`Arquivo: ${result.filePath}\n`);
}

function printValidationSummary(result) {
  process.stdout.write(`Status: ${result.status}\n`);
  process.stdout.write(`Assinatura: ${result.signatureValid ? "valida" : "invalida"}\n`);
  if (result.customerName) process.stdout.write(`Cliente: ${result.customerName}\n`);
  if (result.licenseId) process.stdout.write(`Licenca: ${result.licenseId}\n`);
  if (result.plan) process.stdout.write(`Plano: ${result.plan}\n`);
  if (result.issuedAt) process.stdout.write(`Emitida em: ${result.issuedAt}\n`);
  if (result.expiresAt) process.stdout.write(`Expira em: ${result.expiresAt}\n`);
  process.stdout.write(`Arquivo: ${result.filePath}\n`);
}

function printHelp() {
  process.stdout.write(`Uso:\n`);
  process.stdout.write(`  node src/cli.mjs emitir --customer-name "Cliente" --license-id "PI-0001" --plan annual --issued-at "2026-04-01T00:00:00.000Z" --expires-at "2027-04-01T00:00:00.000Z"\n`);
  process.stdout.write(`  node src/cli.mjs validar --file "D:\\LICENCAS_CANNACONVERTER2_0\\issued\\PI-0001.license"\n`);
}

async function main() {
  const [, , command, ...args] = process.argv;
  if (!command || command === "--help" || command === "-h") {
    printHelp();
    return;
  }

  const paths = resolveOperationalPaths({
    baseDir: readOptionalFlag(args, "--base-dir"),
    privateKeyPath: readOptionalFlag(args, "--private-key-file"),
    issuedDir: readOptionalFlag(args, "--output-dir"),
    logsDir: readOptionalFlag(args, "--logs-dir"),
    licenseContractPath: readOptionalFlag(args, "--license-contract-file"),
  });

  ensureOperationalDirectories(paths);

  if (command === "emitir") {
    const result = emitLicense({
      customerName: readRequiredFlag(args, "--customer-name"),
      licenseId: readRequiredFlag(args, "--license-id"),
      plan: readRequiredFlag(args, "--plan"),
      issuedAt: readRequiredFlag(args, "--issued-at"),
      expiresAt: readRequiredFlag(args, "--expires-at"),
      outputDir: paths.issuedDir,
      outputFile: readOptionalFlag(args, "--output-file"),
      privateKeyPath: paths.privateKeyPath,
      logsDir: paths.logsDir,
      licenseContractPath: paths.licenseContractPath,
    });

    printEmitSummary(result);
    return;
  }

  if (command === "validar") {
    const result = validateLicenseFile({
      filePath: readRequiredFlag(args, "--file"),
      logsDir: paths.logsDir,
      licenseContractPath: paths.licenseContractPath,
    });

    printValidationSummary(result);
    process.exitCode = result.status === "valid" || result.status === "expired" ? 0 : 1;
    return;
  }

  throw new Error(`Comando desconhecido: ${command}`);
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : "Falha desconhecida na ferramenta de licencas.";
  process.stderr.write(`${message}\n`);
  process.exitCode = 1;
});
