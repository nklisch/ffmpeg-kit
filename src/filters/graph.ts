import { buildFilter } from "../core/args.ts";
import type { FilterNode } from "../types/filters.ts";

interface FilterGraphState {
  videoFilters: string[];
  audioFilters: string[];
  complexGraph: string | null;
  inputMappings: Array<{ index: number; label: string; streamType: "v" | "a" }>;
  outputMappings: Array<{ label: string; streamType: "v" | "a" }>;
}

function nodeToFilterString(node: FilterNode): string {
  const inputs = (node.inputs ?? []).map((l) => `[${l}]`).join("");
  const outputs = (node.outputs ?? []).map((l) => `[${l}]`).join("");
  return `${inputs}${buildFilter(node.name, node.options)}${outputs}`;
}

function resolveFilter(filter: string | FilterNode): string {
  if (typeof filter === "string") return filter;
  return buildFilter(filter.name, filter.options);
}

/**
 * Fluent builder for constructing FFmpeg filter graphs.
 *
 * Supports three modes:
 * 1. Simple video filter chain: -vf "scale=1920:-2,fps=30"
 * 2. Simple audio filter chain: -af "loudnorm,afade=t=out:d=2"
 * 3. Complex filter graph: -filter_complex "[0:v]scale=1920:-2[v0];[0:a]loudnorm[a0]"
 */
export interface FilterGraphBuilder {
  /** Add a video filter to the simple video chain (-vf) */
  videoFilter(filter: string | FilterNode): this;

  /** Add an audio filter to the simple audio chain (-af) */
  audioFilter(filter: string | FilterNode): this;

  /**
   * Build a complex filter graph (-filter_complex).
   * Once called, videoFilter/audioFilter chains are ignored.
   */
  complex(graph: string | FilterNode[]): this;

  /**
   * Map an input stream to a label for use in complex graphs.
   */
  input(index: number, label: string, streamType?: "v" | "a"): this;

  /**
   * Map a labeled output for use as a -map argument.
   */
  output(label: string, streamType: "v" | "a"): this;

  /** Build the video filter string (for -vf). Returns empty string if no video filters. */
  buildVideoFilter(): string;

  /** Build the audio filter string (for -af). Returns empty string if no audio filters. */
  buildAudioFilter(): string;

  /** Build the complete filter_complex string. Returns empty string if not in complex mode. */
  buildComplex(): string;

  /**
   * Build the complete filter as a string.
   * Returns the filter_complex string if in complex mode,
   * otherwise returns video and audio filter strings joined with a newline.
   */
  toString(): string;

  /**
   * Build as FFmpeg CLI arguments.
   * Returns ["-vf", "..."] and/or ["-af", "..."] for simple mode,
   * or ["-filter_complex", "..."] for complex mode.
   * Includes -map args for labeled outputs in complex mode.
   */
  toArgs(): string[];
}

/**
 * Create a new FilterGraphBuilder.
 */
export function filterGraph(): FilterGraphBuilder {
  const state: FilterGraphState = {
    videoFilters: [],
    audioFilters: [],
    complexGraph: null,
    inputMappings: [],
    outputMappings: [],
  };

  const builder: FilterGraphBuilder = {
    videoFilter(f) {
      state.videoFilters.push(resolveFilter(f));
      return this;
    },

    audioFilter(f) {
      state.audioFilters.push(resolveFilter(f));
      return this;
    },

    complex(graph) {
      if (typeof graph === "string") {
        state.complexGraph = graph;
      } else {
        state.complexGraph = graph.map(nodeToFilterString).join(";");
      }
      return this;
    },

    input(index, label, streamType = "v") {
      state.inputMappings.push({ index, label, streamType });
      return this;
    },

    output(label, streamType) {
      state.outputMappings.push({ label, streamType });
      return this;
    },

    buildVideoFilter() {
      return state.videoFilters.join(",");
    },

    buildAudioFilter() {
      return state.audioFilters.join(",");
    },

    buildComplex() {
      return state.complexGraph ?? "";
    },

    toString() {
      if (state.complexGraph !== null) return state.complexGraph;
      const parts: string[] = [];
      const vf = state.videoFilters.join(",");
      const af = state.audioFilters.join(",");
      if (vf) parts.push(vf);
      if (af) parts.push(af);
      return parts.join("\n");
    },

    toArgs() {
      if (state.complexGraph !== null) {
        const args: string[] = ["-filter_complex", state.complexGraph];
        for (const out of state.outputMappings) {
          args.push("-map", `[${out.label}]`);
        }
        return args;
      }

      const args: string[] = [];
      const vf = state.videoFilters.join(",");
      const af = state.audioFilters.join(",");
      if (vf) args.push("-vf", vf);
      if (af) args.push("-af", af);
      return args;
    },
  };

  return builder;
}

/**
 * Build a single filter string from name and options.
 * Convenience re-export of buildFilter from core/args.ts.
 * filter("scale", { w: 1920, h: -2 }) → "scale=w=1920:h=-2"
 */
export function filter(
  name: string,
  options?: Record<string, string | number | boolean> | string,
): string {
  return buildFilter(name, options);
}

/**
 * Chain multiple filter strings with commas.
 * chain("scale=1920:-2", "fps=30") → "scale=1920:-2,fps=30"
 */
export function chain(...filters: string[]): string {
  return filters.filter((f) => f.length > 0).join(",");
}
