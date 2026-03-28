export type DiagnosticSeverity = "error" | "warning" | "info";

export type DiagnosticCategory = "structure" | "schedule" | "dependency" | "data-quality";

export interface DiagnosticIssue {
  id: string;
  severity: DiagnosticSeverity;
  category: DiagnosticCategory;
  message: string;
  taskId?: string;
  taskName?: string;
}
