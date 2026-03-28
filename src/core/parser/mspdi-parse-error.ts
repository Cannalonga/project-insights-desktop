export type MSPDIParseErrorCode =
  | "EMPTY_FILE"
  | "INVALID_XML"
  | "INVALID_MSPDI"
  | "NO_TASKS_FOUND"
  | "UNSAFE_XML"
  | "XML_TOO_LARGE"
  | "TOO_MANY_TASKS"
  | "OUTLINE_DEPTH_EXCEEDED";

export class MSPDIParseError extends Error {
  code: MSPDIParseErrorCode;

  constructor(code: MSPDIParseErrorCode, message: string) {
    super(message);
    this.name = "MSPDIParseError";
    this.code = code;
  }
}
