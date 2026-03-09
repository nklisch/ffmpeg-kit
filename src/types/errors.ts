export enum FFmpegErrorCode {
  BINARY_NOT_FOUND = "BINARY_NOT_FOUND",
  INPUT_NOT_FOUND = "INPUT_NOT_FOUND",
  INVALID_INPUT = "INVALID_INPUT",
  ENCODING_FAILED = "ENCODING_FAILED",
  TIMEOUT = "TIMEOUT",
  FILTER_ERROR = "FILTER_ERROR",
  HWACCEL_ERROR = "HWACCEL_ERROR",
  OUTPUT_ERROR = "OUTPUT_ERROR",
  CANCELLED = "CANCELLED",
  SESSION_LIMIT = "SESSION_LIMIT",
  CODEC_NOT_AVAILABLE = "CODEC_NOT_AVAILABLE",
  PERMISSION_DENIED = "PERMISSION_DENIED",
  UNKNOWN = "UNKNOWN",
}

export class FFmpegError extends Error {
  readonly code: FFmpegErrorCode;
  readonly stderr: string;
  readonly command: string[];
  readonly exitCode: number;

  constructor(options: {
    code: FFmpegErrorCode;
    message: string;
    stderr: string;
    command: string[];
    exitCode: number;
    cause?: Error;
  }) {
    super(options.message, { cause: options.cause });
    Object.defineProperty(this, "name", { value: "FFmpegError" });
    this.code = options.code;
    this.stderr = options.stderr;
    this.command = options.command;
    this.exitCode = options.exitCode;
  }
}
