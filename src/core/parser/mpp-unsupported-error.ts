export class MPPUnsupportedError extends Error {
  code: "UNSUPPORTED_MPP";

  constructor(message = "Direct .mpp support is not available in this version") {
    super(message);
    this.name = "MPPUnsupportedError";
    this.code = "UNSUPPORTED_MPP";
  }
}
