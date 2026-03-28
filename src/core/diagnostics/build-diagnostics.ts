import type { ValidationResult } from "../validation/validate-project";
import type { DiagnosticIssue } from "./types";

export interface Diagnostics {
  hasErrors: boolean;
  hasWarnings: boolean;
  hasInfo: boolean;
  items: DiagnosticIssue[];
  errors: DiagnosticIssue[];
  warnings: DiagnosticIssue[];
  info: DiagnosticIssue[];
}

export function buildDiagnostics(result: ValidationResult): Diagnostics {
  const items = result.issues ?? [];
  const errors = items.filter((issue) => issue.severity === "error");
  const warnings = items.filter((issue) => issue.severity === "warning");
  const info = items.filter((issue) => issue.severity === "info");

  return {
    hasErrors: errors.length > 0,
    hasWarnings: warnings.length > 0,
    hasInfo: info.length > 0,
    items,
    errors,
    warnings,
    info,
  };
}
