import { parseMSPDI } from "../../core/parser/parse-mspdi";

export type InputFormat = "mpp" | "mspdi-xml" | "unknown";

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

export function detectInputFormat(input: DetectInputFormatInput): InputFormat {
  if (hasExtension(input.filePath, ".mpp")) {
    return "mpp";
  }

  const xmlContent = input.xmlContent ?? decodeBytes(input.bytes);
  if (isMSPDIXml(xmlContent)) {
    return "mspdi-xml";
  }

  return "unknown";
}
