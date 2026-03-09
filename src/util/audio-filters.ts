/**
 * Build a chain of atempo filters for speed factors outside the 0.5-2.0 range.
 * FFmpeg's atempo filter only supports 0.5 to 100.0 per instance,
 * but for accuracy and compatibility, we chain at the 0.5/2.0 boundaries.
 */
export function buildAtempoChain(factor: number): string {
  const parts: string[] = [];
  let remaining = factor;

  if (factor >= 1) {
    while (remaining > 2.0) {
      parts.push("atempo=2");
      remaining /= 2;
    }
    parts.push(`atempo=${remaining}`);
  } else {
    while (remaining < 0.5) {
      parts.push("atempo=0.5");
      remaining /= 0.5;
    }
    parts.push(`atempo=${remaining}`);
  }

  return parts.join(",");
}
