import { parseMSPDI } from "../../core/parser/parse-mspdi";

export type InputFormat = "mpp" | "mspdi-xml" | "xer" | "unknown";

export type DetectInputFormatInput = {
  filePath: string;
  bytes?: Uint8Array;
  xmlContent?: string;
};

function hasExtension(filePath: string, extension: string): boolean {
  return filePath.trim().toLowerCase().endsWith(extension);
}

function decodeBytes(bytes?: Uint8Array): string | undefined {
  if (!bytes) {
    return undefined;
  }

  return new TextDecoder("utf-8", { fatal: false }).decode(bytes);
}

function isMSPDIXml(xmlContent?: string): boolean {
  if (!xmlContent?.trim()) {
    return false;
  }

  try {
    parseMSPDI(xmlContent);
    return true;
  } catch {
    return false;
  }
}

function isPrimaveraXer(filePath: string, textContent?: string): boolean {
  if (hasExtension(filePath, ".xer")) {
    return true;
  }

  if (!textContent?.trim()) {
    return false;
  }

  const normalized = textContent.replace(/^\uFEFF/, "").trimStart();
  return normalized.startsWith("ERMHDR") || normalized.includes("%T\tPROJECT");
}

export function detectInputFormat(input: DetectInputFormatInput): InputFormat {
  if (hasExtension(input.filePath, ".mpp")) {
    return "mpp";
  }

  const textContent = input.xmlContent ?? decodeBytes(input.bytes);
  if (isPrimaveraXer(input.filePath, textContent)) {
    return "xer";
  }

  const xmlContent = textContent;
  if (isMSPDIXml(xmlContent)) {
    return "mspdi-xml";
  }

  return "unknown";
}
