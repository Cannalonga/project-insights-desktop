import type { Project } from "../../core/model/project";
import { adaptMSPDIToProject } from "../mspdi/adapter-mspdi";

export type ConvertMPPToMSPDIXml = (filePath: string) => Promise<string>;

export type MPPAdapterError = {
  sourceFormat: "mpp";
  code: string;
  message: string;
};

export type MPPAdapterResult =
  | {
      ok: true;
      project: Project;
    }
  | {
      ok: false;
      error: MPPAdapterError;
    };

export type AdaptMPPToProjectInput = {
  filePath: string;
  convertToMSPDIXml: ConvertMPPToMSPDIXml;
};

function getErrorCode(error: unknown): string {
  if (typeof error === "object" && error !== null && "code" in error) {
    const code = (error as { code?: unknown }).code;
    if (typeof code === "string" && code) {
      return code;
    }
  }

  return "MPP_ADAPTER_ERROR";
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message) {
    return error.message;
  }

  return "Unable to adapt MPP input.";
}

export async function adaptMPPToProject(input: AdaptMPPToProjectInput): Promise<MPPAdapterResult> {
  try {
    const xmlContent = await input.convertToMSPDIXml(input.filePath);
    const mspdiResult = adaptMSPDIToProject(xmlContent);

    if (!mspdiResult.ok) {
      return {
        ok: false,
        error: {
          sourceFormat: "mpp",
          code: mspdiResult.error.code,
          message: mspdiResult.error.message,
        },
      };
    }

    return {
      ok: true,
      project: mspdiResult.project,
    };
  } catch (error) {
    return {
      ok: false,
      error: {
        sourceFormat: "mpp",
        code: getErrorCode(error),
        message: getErrorMessage(error),
      },
    };
  }
}
