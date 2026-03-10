/**
 * Build an FFmpeg enable expression for a time range.
 * between(t,5,10) — show between 5s and 10s
 * gte(t,5) — show from 5s onward
 * lte(t,10) — show until 10s
 */
export function timeRange(opts: { start?: number; end?: number }): string {
  if (opts.start !== undefined && opts.end !== undefined) {
    return `between(t,${opts.start},${opts.end})`;
  }
  if (opts.start !== undefined) {
    return `gte(t,${opts.start})`;
  }
  if (opts.end !== undefined) {
    return `lte(t,${opts.end})`;
  }
  return "";
}

/**
 * Build a "between(t,start,end)" expression.
 */
export function between(start: number, end: number): string {
  return `between(t,${start},${end})`;
}

/**
 * Wrap an expression in enable='...' syntax for filter options.
 */
export function enable(expr: string): string {
  return `enable='${expr}'`;
}

/**
 * Linear interpolation expression for FFmpeg.
 * Useful for animated parameters (zoom, position).
 */
export function lerp(start: number, end: number, tExpr: string, duration: number): string {
  return `${start}+(${end}-${start})*${tExpr}/${duration}`;
}

/**
 * Build an easing expression for FFmpeg.
 * Maps EasingFunction to FFmpeg math expressions.
 */
export function easing(
  fn: "linear" | "ease-in" | "ease-out" | "ease-in-out",
  tExpr: string,
  duration: number,
): string {
  switch (fn) {
    case "linear":
      return `${tExpr}/${duration}`;
    case "ease-in":
      return `pow(${tExpr}/${duration},2)`;
    case "ease-out":
      return `1-pow(1-${tExpr}/${duration},2)`;
    case "ease-in-out":
      return `3*pow(${tExpr}/${duration},2)-2*pow(${tExpr}/${duration},3)`;
  }
}

/**
 * Clamp expression: min(max(expr, lo), hi)
 */
export function clamp(expr: string, lo: number, hi: number): string {
  return `min(max(${expr},${lo}),${hi})`;
}

/**
 * Conditional expression: if(condition, then, else)
 */
export function ifExpr(condition: string, thenExpr: string, elseExpr: string): string {
  return `if(${condition},${thenExpr},${elseExpr})`;
}
