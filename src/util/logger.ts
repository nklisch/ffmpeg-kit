/** SDK log levels (subset used internally) */
export type LogLevel = "debug" | "info" | "warn" | "error";

/** Logger interface — the port for logging */
export interface Logger {
  debug(msg: string, data?: Record<string, unknown>): void;
  info(msg: string, data?: Record<string, unknown>): void;
  warn(msg: string, data?: Record<string, unknown>): void;
  error(msg: string, data?: Record<string, unknown>): void;
}

/**
 * No-op logger. All methods do nothing.
 * This is the default when no pino instance is provided.
 */
export const noopLogger: Logger = Object.freeze({
  debug: () => {},
  info: () => {},
  warn: () => {},
  error: () => {},
});

type PinoLike = {
  debug: (obj: Record<string, unknown>, msg: string) => void;
  info: (obj: Record<string, unknown>, msg: string) => void;
  warn: (obj: Record<string, unknown>, msg: string) => void;
  error: (obj: Record<string, unknown>, msg: string) => void;
};

function isPinoLike(value: unknown): value is PinoLike {
  return (
    value != null &&
    typeof value === "object" &&
    typeof (value as Record<string, unknown>).debug === "function" &&
    typeof (value as Record<string, unknown>).info === "function" &&
    typeof (value as Record<string, unknown>).warn === "function" &&
    typeof (value as Record<string, unknown>).error === "function"
  );
}

/**
 * Create a logger from a pino instance.
 * If pino is not installed or not provided, returns noopLogger.
 */
export function createLogger(pino?: unknown): Logger {
  if (!isPinoLike(pino)) return noopLogger;

  return {
    debug: (msg, data) => pino.debug({ ...data }, msg),
    info: (msg, data) => pino.info({ ...data }, msg),
    warn: (msg, data) => pino.warn({ ...data }, msg),
    error: (msg, data) => pino.error({ ...data }, msg),
  };
}
