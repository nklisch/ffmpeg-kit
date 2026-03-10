import { describe, expect, it, vi } from "vitest";
import { batch } from "../../src/convenience/batch.ts";

describe("batch", () => {
  it("returns empty results for empty inputs", async () => {
    const result = await batch({
      inputs: [],
      operation: () => ({
        input: () => ({ execute: async () => ({}) }),
      }),
    });
    expect(result.results).toHaveLength(0);
    expect(result.totalDurationMs).toBeGreaterThanOrEqual(0);
  });

  it("processes all inputs and returns results in input order", async () => {
    const inputs = ["a.mp4", "b.mp4", "c.mp4"];
    const result = await batch({
      inputs,
      concurrency: 2,
      operation: (input) => ({
        input: (_path: string) => ({
          execute: async () => ({ name: input }),
        }),
      }),
    });
    expect(result.results).toHaveLength(3);
    expect(result.results[0]).toMatchObject({ success: true, input: "a.mp4", data: { name: "a.mp4" } });
    expect(result.results[1]).toMatchObject({ success: true, input: "b.mp4", data: { name: "b.mp4" } });
    expect(result.results[2]).toMatchObject({ success: true, input: "c.mp4", data: { name: "c.mp4" } });
  });

  it("captures individual failures without stopping the batch", async () => {
    const inputs = ["a.mp4", "fail.mp4", "c.mp4"];
    const result = await batch({
      inputs,
      operation: (input) => ({
        input: (_path: string) => ({
          execute: async () => {
            if (input === "fail.mp4") throw new Error("intentional failure");
            return { name: input };
          },
        }),
      }),
    });
    expect(result.results).toHaveLength(3);
    expect(result.results[0]).toMatchObject({ success: true });
    expect(result.results[1]).toMatchObject({ success: false, input: "fail.mp4" });
    expect(result.results[2]).toMatchObject({ success: true });
  });

  it("calls onItemComplete for successful items", async () => {
    const onComplete = vi.fn();
    const inputs = ["a.mp4", "b.mp4"];
    await batch({
      inputs,
      onItemComplete: onComplete,
      operation: (input) => ({
        input: (_path: string) => ({
          execute: async () => ({ name: input }),
        }),
      }),
    });
    expect(onComplete).toHaveBeenCalledTimes(2);
  });

  it("calls onItemError for failed items", async () => {
    const onError = vi.fn();
    const inputs = ["fail.mp4"];
    await batch({
      inputs,
      onItemError: onError,
      operation: () => ({
        input: (_path: string) => ({
          execute: async () => { throw new Error("boom"); },
        }),
      }),
    });
    expect(onError).toHaveBeenCalledTimes(1);
    expect(onError).toHaveBeenCalledWith("fail.mp4", expect.any(Error));
  });

  it("respects concurrency limit", async () => {
    let activeCount = 0;
    let maxObserved = 0;
    const concurrency = 2;
    const inputs = ["a", "b", "c", "d", "e"];

    await batch({
      inputs,
      concurrency,
      operation: () => ({
        input: (_path: string) => ({
          execute: async () => {
            activeCount++;
            maxObserved = Math.max(maxObserved, activeCount);
            await new Promise((resolve) => setTimeout(resolve, 10));
            activeCount--;
            return {};
          },
        }),
      }),
    });

    expect(maxObserved).toBeLessThanOrEqual(concurrency);
  });
});
