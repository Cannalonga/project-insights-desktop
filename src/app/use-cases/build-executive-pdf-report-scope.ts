import { buildExecutivePdfReport } from "../../core/report/build-executive-pdf-report";
import type { ProcessResult } from "./process-mpp";
import {
  resolveExecutiveReportInputForScope,
  type ExecutiveReportScope,
} from "./build-executive-report-scope";

export function buildExecutivePdfReportForScope(
  result: ProcessResult,
  scope: ExecutiveReportScope,
): string {
  return buildExecutivePdfReport(resolveExecutiveReportInputForScope(result, scope));
}
