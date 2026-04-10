import { mapRawProjectToModel } from "../../core/mapper/map-project";
import type { Project } from "../../core/model/project";
import { MSPDIParseError } from "../../core/parser/mspdi-parse-error";
import { parseMSPDI } from "../../core/parser/parse-mspdi";

export type MSPDIAdapterError = {
  sourceFormat: "mspdi-xml";
  code: string;
  message: string;
};

export type MSPDIAdapterResult =
  | {
      ok: true;
      project: Project;
    }
  | {
      ok: false;
      error: MSPDIAdapterError;
    };

function toMSPDIAdapterError(error: unknown): MSPDIAdapterError {
  if (error instanceof MSPDIParseError) {
    return {
      sourceFormat: "mspdi-xml",
      code: error.code,
      message: error.message,
    };
  }

  if (error instanceof Error) {
    return {
      sourceFormat: "mspdi-xml",
      code: "MSPDI_ADAPTER_ERROR",
      message: error.message,
    };
  }

  return {
    sourceFormat: "mspdi-xml",
    code: "MSPDI_ADAPTER_ERROR",
    message: "Unable to adapt MSPDI XML input.",
  };
}

export function adaptMSPDIToProject(xmlContent: string): MSPDIAdapterResult {
  try {
    const rawProject = parseMSPDI(xmlContent);
    const project = mapRawProjectToModel(rawProject);

    return {
      ok: true,
      project,
    };
  } catch (error) {
    return {
      ok: false,
      error: toMSPDIAdapterError(error),
    };
  }
}
