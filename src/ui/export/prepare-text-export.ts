const UTF8_BOM = "\uFEFF";

function isCsvTarget(target: string): boolean {
  const normalized = target.trim().toLowerCase();
  return normalized === "csv" || normalized.endsWith(".csv");
}

export function prepareTextExportContent(content: string, target: string): string {
  if (!isCsvTarget(target) || content.startsWith(UTF8_BOM)) {
    return content;
  }

  return `${UTF8_BOM}${content}`;
}
