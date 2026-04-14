import type { Project } from "../../core/model/project";
import { adaptMPPToProject, type ConvertMPPToMSPDIXml } from "../mpp/adapter-mpp";
import { adaptMSPDIToProject } from "../mspdi/adapter-mspdi";
import { adaptXerToProject, XerProjectAdapterError } from "../primavera/adapt-xer-to-project";
import { buildXerModel, XerModelError } from "../primavera/build-xer-model";
import { parseXer, XerParseError } from "../primavera/parse-xer";
import { detectInputFormat } from "./detect-input-format";

export type ProjectInputError = {
  sourceFormat: "mpp" | "mspdi-xml" | "xer" | "unknown";
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
  xerContent?: string;
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

function toXerInputError(error: unknown): ProjectInputError {
  if (error instanceof XerProjectAdapterError) {
    return {
      sourceFormat: "xer",
      code: error.code,
      message: error.message,
    };
  }

  if (error instanceof XerModelError) {
    return {
      sourceFormat: "xer",
      code: "XER_MODEL_ERROR",
      message: error.message,
    };
  }

  if (error instanceof XerParseError) {
    return {
      sourceFormat: "xer",
      code: "XER_PARSE_ERROR",
      message: error.message,
    };
  }

  if (error instanceof Error) {
    return {
      sourceFormat: "xer",
      code: "XER_ADAPTER_ERROR",
      message: error.message,
    };
  }

  return {
    sourceFormat: "xer",
    code: "XER_ADAPTER_ERROR",
    message: "Unable to adapt Primavera XER input.",
  };
}

export async function processProjectInput(input: ProcessProjectInput): Promise<ProjectInputResult> {
  const sourceFormat = detectInputFormat({
    filePath: input.filePath,
    bytes: input.bytes,
    xmlContent: input.xmlContent ?? input.xerContent,
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

  if (sourceFormat === "xer") {
    const xerContent = input.xerContent ?? decodeBytes(input.bytes);

    if (!xerContent) {
      return toInputError({
        sourceFormat,
        code: "XER_CONTENT_UNAVAILABLE",
        message: "Primavera XER content is required.",
      });
    }

    try {
      const parsedXer = parseXer(xerContent);
      const xerModel = buildXerModel(parsedXer);
      const adaptation = adaptXerToProject(xerModel);

      return {
        ok: true,
        project: adaptation.project,
      };
    } catch (error) {
      return toInputError(toXerInputError(error));
    }
  }

  return toInputError({
    sourceFormat: "unknown",
    code: "UNSUPPORTED_PROJECT_INPUT",
    message: "Unsupported project input format.",
  });
}
