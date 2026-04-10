import type { Project } from "../../core/model/project";
import { adaptMPPToProject, type ConvertMPPToMSPDIXml } from "../mpp/adapter-mpp";
import { adaptMSPDIToProject } from "../mspdi/adapter-mspdi";
import { detectInputFormat } from "./detect-input-format";

export type ProjectInputError = {
  sourceFormat: "mpp" | "mspdi-xml" | "unknown";
  code: string;
  message: string;
};

export type ProjectInputResult =
  | {
      ok: true;
      project: Project;
    }
  | {
      ok: false;
      error: ProjectInputError;
    };

export type ProcessProjectInput = {
  filePath: string;
  bytes?: Uint8Array;
  xmlContent?: string;
  convertMPPToMSPDIXml?: ConvertMPPToMSPDIXml;
};

function decodeBytes(bytes?: Uint8Array): string | undefined {
  if (!bytes) {
    return undefined;
  }

  return new TextDecoder("utf-8", { fatal: false }).decode(bytes);
}

function toInputError(error: ProjectInputError): ProjectInputResult {
  return {
    ok: false,
    error,
  };
}

export async function processProjectInput(input: ProcessProjectInput): Promise<ProjectInputResult> {
  const sourceFormat = detectInputFormat({
    filePath: input.filePath,
    bytes: input.bytes,
    xmlContent: input.xmlContent,
  });

  if (sourceFormat === "mpp") {
    if (!input.convertMPPToMSPDIXml) {
      return toInputError({
        sourceFormat,
        code: "MPP_CONVERTER_UNAVAILABLE",
        message: "MPP conversion function is required.",
      });
    }

    return adaptMPPToProject({
      filePath: input.filePath,
      convertToMSPDIXml: input.convertMPPToMSPDIXml,
    });
  }

  if (sourceFormat === "mspdi-xml") {
    const xmlContent = input.xmlContent ?? decodeBytes(input.bytes);

    if (!xmlContent) {
      return toInputError({
        sourceFormat,
        code: "MSPDI_XML_CONTENT_UNAVAILABLE",
        message: "MSPDI XML content is required.",
      });
    }

    return adaptMSPDIToProject(xmlContent);
  }

  return toInputError({
    sourceFormat: "unknown",
    code: "UNSUPPORTED_PROJECT_INPUT",
    message: "Unsupported project input format.",
  });
}
