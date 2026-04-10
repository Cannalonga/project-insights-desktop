import fs from "node:fs";
import path from "node:path";

const DEFAULT_LOG_DIR = path.join(process.env.USERPROFILE ?? "", "Desktop", "CannaConverter_Logs");

const inputArgs = process.argv.slice(2);
const outputJsonIndex = inputArgs.indexOf("--json-out");
const outputCsvIndex = inputArgs.indexOf("--csv-out");

const jsonOutPath = outputJsonIndex >= 0 ? inputArgs[outputJsonIndex + 1] : null;
const csvOutPath = outputCsvIndex >= 0 ? inputArgs[outputCsvIndex + 1] : null;

const positionalArgs = inputArgs.filter((value, index) => {
  if (index === outputJsonIndex || index === outputJsonIndex + 1) return false;
  if (index === outputCsvIndex || index === outputCsvIndex + 1) return false;
  return true;
});

const inputFiles = resolveInputFiles(positionalArgs);
if (inputFiles.length === 0) {
  console.error("Nenhum arquivo de log encontrado para analisar.");
  process.exit(1);
}

const entries = inputFiles.flatMap(readLogEntries).map(normalizeEntry);
const summary = buildSummary(inputFiles, entries);

if (jsonOutPath) {
  fs.writeFileSync(jsonOutPath, JSON.stringify(summary, null, 2), "utf8");
}

if (csvOutPath) {
  fs.writeFileSync(csvOutPath, buildCsv(entries), "utf8");
}

console.log(JSON.stringify(summary, null, 2));

function resolveInputFiles(values) {
  if (values.length > 0) {
    return values.flatMap((value) => {
      const resolved = path.resolve(value);
      if (!fs.existsSync(resolved)) {
        return [];
      }

      const stat = fs.statSync(resolved);
      if (stat.isDirectory()) {
        return fs
          .readdirSync(resolved)
          .filter((file) => file.endsWith(".log"))
          .map((file) => path.join(resolved, file))
          .sort();
      }

      return [resolved];
    });
  }

  if (!fs.existsSync(DEFAULT_LOG_DIR)) {
    return [];
  }

  return fs
    .readdirSync(DEFAULT_LOG_DIR)
    .filter((file) => file.endsWith(".log"))
    .map((file) => path.join(DEFAULT_LOG_DIR, file))
    .sort();
}

function readLogEntries(filePath) {
  const contents = fs.readFileSync(filePath, "utf8");
  return contents
    .split(/\r?\n/)
    .map((line, index) => ({ filePath, line, lineNumber: index + 1 }))
    .filter(({ line }) => line.trim().length > 0)
    .flatMap(({ filePath: currentFilePath, line, lineNumber }) => {
      try {
        return [{ ...JSON.parse(line), _filePath: currentFilePath, _lineNumber: lineNumber }];
      } catch {
        return [
          {
            timestamp: null,
            event: "invalid_log_line",
            action: "unknown",
            outcome: "failure",
            reason: "invalid_json_line",
            message: `Linha ${lineNumber} invalida em ${path.basename(currentFilePath)}`,
            errorCategory: "unexpected",
            _filePath: currentFilePath,
            _lineNumber: lineNumber,
          },
        ];
      }
    });
}

function normalizeEntry(entry) {
  const action = entry.action ?? inferAction(entry.event);
  const outcome = entry.outcome ?? inferOutcome(entry.event, entry.reason);
  const errorCategory = entry.errorCategory ?? inferErrorCategory(entry.reason, entry.message, outcome);
  const message = typeof entry.message === "string" && entry.message.trim() ? entry.message.trim() : "Sem mensagem detalhada";

  return {
    timestamp: entry.timestamp ?? null,
    event: entry.event ?? "unknown_event",
    action,
    outcome,
    reason: entry.reason ?? null,
    message,
    errorName: entry.errorName ?? null,
    errorCategory,
    hadLicensedStateBeforeFailure: Boolean(entry.hadLicensedStateBeforeFailure),
    uiStateBefore: entry.uiStateBefore ?? null,
    uiStateAfter: entry.uiStateAfter ?? null,
    requestContext: entry.requestContext ?? entry.source ?? null,
    buildVersion: entry.buildVersion ?? null,
    _filePath: entry._filePath,
    _lineNumber: entry._lineNumber,
  };
}

function inferAction(event) {
  switch (event) {
    case "license_apply_success":
    case "license_apply_failed":
      return "apply_license";
    case "license_state_loaded":
    case "license_state_load_failed":
      return "load_stored_state";
    case "license_refresh_result":
      return "refresh_license";
    case "validation_error":
      return "validate_license";
    default:
      return "unknown";
  }
}

function inferOutcome(event, reason) {
  if (event === "license_apply_success" || event === "license_state_loaded") {
    return "success";
  }

  if (event === "license_refresh_result" && reason === "offline_valid") {
    return "fallback_offline";
  }

  if (reason === "revoked" || reason === "blocked" || reason === "expired" || reason === "mismatch" || reason === "invalid_license") {
    return "denied";
  }

  return "failure";
}

function inferErrorCategory(reason, message, outcome) {
  if (outcome === "success" || outcome === "fallback_offline") {
    return null;
  }

  switch (reason) {
    case "network":
    case "timeout":
      return "network";
    case "invalid_input":
      return "license_input";
    case "revoked":
    case "blocked":
    case "expired":
    case "mismatch":
    case "invalid_license":
      return "license_state";
    case "server":
    case "invalid_response":
      return "backend_response";
    case "config":
      return "config";
    case "unexpected":
      return "unexpected";
    default:
      if (typeof message === "string" && message.toLowerCase().includes("rede")) return "network";
      return "unexpected";
  }
}

function buildSummary(files, entries) {
  const failureEntries = entries.filter((entry) => entry.outcome === "failure" || entry.outcome === "denied");
  const categoryCounts = countBy(failureEntries, "errorCategory");
  const actionCounts = countBy(entries, "action");
  const outcomeCounts = countBy(entries, "outcome");
  const reasonCounts = countBy(failureEntries, "reason");
  const errorNameCounts = countBy(failureEntries, "errorName");
  const messageCounts = countBy(failureEntries, "message");

  const topReasons = topEntries(reasonCounts, 5);
  const topMessages = topEntries(messageCounts, 5);
  const percentByCategory = Object.fromEntries(
    Object.entries(categoryCounts).map(([key, value]) => [key, percentage(value, failureEntries.length)]),
  );

  return {
    analyzedFiles: files,
    totalEvents: entries.length,
    totalFailures: failureEntries.length,
    totalsByEvent: countBy(entries, "event"),
    totalsByAction: actionCounts,
    totalsByOutcome: outcomeCounts,
    failuresByCategory: categoryCounts,
    failuresByAction: countBy(failureEntries, "action"),
    failuresWithPreviouslyLicensedState: failureEntries.filter((entry) => entry.hadLicensedStateBeforeFailure).length,
    topReasons,
    topMessages,
    topErrorNames: topEntries(errorNameCounts, 5),
    unexpectedErrors: failureEntries.filter((entry) => entry.errorCategory === "unexpected").map(selectCompactFailure),
    failurePercentageByCategory: percentByCategory,
    executiveSummary: {
      totalEventsAnalyzed: entries.length,
      totalFailures: failureEntries.length,
      top5Causes: topReasons,
      top5Messages: topMessages,
      failuresWithPreviouslyLicensedState: failureEntries.filter((entry) => entry.hadLicensedStateBeforeFailure).length,
      recommendations: buildRecommendations(topReasons, topMessages, categoryCounts, failureEntries),
    },
    findings: classifyFindings(categoryCounts, topReasons, topMessages, failureEntries),
  };
}

function countBy(entries, field) {
  const counts = {};
  for (const entry of entries) {
    const key = entry[field] ?? "unknown";
    counts[key] = (counts[key] ?? 0) + 1;
  }
  return counts;
}

function topEntries(counts, limit) {
  return Object.entries(counts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([value, count]) => ({ value, count }));
}

function percentage(value, total) {
  if (!total) return 0;
  return Number(((value / total) * 100).toFixed(2));
}

function selectCompactFailure(entry) {
  return {
    timestamp: entry.timestamp,
    action: entry.action,
    reason: entry.reason,
    message: entry.message,
    errorName: entry.errorName,
    file: path.basename(entry._filePath),
    line: entry._lineNumber,
  };
}

function buildRecommendations(topReasons, topMessages, categoryCounts, failureEntries) {
  const recommendations = [];

  if ((categoryCounts.unexpected ?? 0) > 0) {
    recommendations.push("Priorizar investigação das falhas categorizadas como unexpected e cruzar com o backend no mesmo horário.");
  }

  if ((categoryCounts.license_input ?? 0) > 0) {
    recommendations.push("Reduzir erros de entrada com orientação mais clara sobre colar apenas a license_key.");
  }

  if (failureEntries.some((entry) => entry.hadLicensedStateBeforeFailure)) {
    recommendations.push("Revisar falhas ocorridas com licença previamente válida, pois elas têm maior impacto operacional.");
  }

  if (topMessages.some((entry) => entry.value === "Sem mensagem detalhada")) {
    recommendations.push("Reexportar logs após reproduzir o problema para capturar mensagens detalhadas nos eventos novos.");
  }

  if (recommendations.length === 0 && topReasons.length === 0) {
    recommendations.push("Sem falhas relevantes no conjunto analisado.");
  }

  return recommendations;
}

function classifyFindings(categoryCounts, topReasons, topMessages, failureEntries) {
  const findings = [];

  if ((categoryCounts.unexpected ?? 0) > 0) {
    findings.push({
      classification: "problema técnico importante",
      detail: "Há falhas unexpected que exigem correlação com backend para identificar causa raiz.",
    });
  }

  if ((categoryCounts.license_input ?? 0) > 0) {
    findings.push({
      classification: "problema de UX / fricção",
      detail: "Há falhas por entrada inválida de licença, indicando atrito no uso do campo de ativação.",
    });
  }

  if (failureEntries.some((entry) => entry.hadLicensedStateBeforeFailure)) {
    findings.push({
      classification: "problema técnico crítico",
      detail: "Existem falhas ocorrendo quando já havia licença válida antes, o que pode afetar continuidade operacional.",
    });
  }

  if (topMessages.every((entry) => entry.value !== "Sem mensagem detalhada")) {
    findings.push({
      classification: "ruído / não prioritário",
      detail: "O conjunto analisado não apresenta perda relevante de contexto nas mensagens de erro.",
    });
  }

  return findings;
}

function buildCsv(entries) {
  const headers = [
    "timestamp",
    "event",
    "action",
    "outcome",
    "reason",
    "message",
    "errorName",
    "errorCategory",
    "hadLicensedStateBeforeFailure",
    "uiStateBefore",
    "uiStateAfter",
    "requestContext",
    "buildVersion",
    "file",
    "line",
  ];

  const rows = entries.map((entry) =>
    [
      entry.timestamp,
      entry.event,
      entry.action,
      entry.outcome,
      entry.reason,
      entry.message,
      entry.errorName,
      entry.errorCategory,
      entry.hadLicensedStateBeforeFailure,
      entry.uiStateBefore,
      entry.uiStateAfter,
      entry.requestContext,
      entry.buildVersion,
      path.basename(entry._filePath),
      entry._lineNumber,
    ].map(csvEscape).join(","),
  );

  return [headers.join(","), ...rows].join("\n");
}

function csvEscape(value) {
  const text = value == null ? "" : String(value);
  if (text.includes(",") || text.includes("\"") || text.includes("\n")) {
    return `"${text.replaceAll("\"", "\"\"")}"`;
  }
  return text;
}
