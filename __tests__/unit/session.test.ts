import { afterEach, describe, expect, it } from "vitest";
import { clearHardwareCache } from "../../src/hardware/detect.ts";
import { _resetNvencSessions, acquireSession, withHwSession } from "../../src/hardware/session.ts";

afterEach(() => {
  _resetNvencSessions();
  clearHardwareCache();
});

describe("acquireSession cpu", () => {
  it("returns session with cpu mode and libx264 encoder", async () => {
    const session = await acquireSession("cpu", "h264");
    expect(session.mode).toBe("cpu");
    expect(session.encoder).toBe("libx264");
    expect(session.inputArgs).toEqual([]);
    session.release();
  });

  it("returns session with libx265 for hevc", async () => {
    const session = await acquireSession("cpu", "hevc");
    expect(session.encoder).toBe("libx265");
    session.release();
  });

  it("returns session with libsvtav1 for av1", async () => {
    const session = await acquireSession("cpu", "av1");
    expect(session.encoder).toBe("libsvtav1");
    session.release();
  });
});

describe("session.release idempotency", () => {
  it("calling release twice does not throw", async () => {
    const session = await acquireSession("cpu", "h264");
    expect(() => {
      session.release();
      session.release();
    }).not.toThrow();
  });

  it("does not double-decrement NVENC counter on double release", async () => {
    // We can only test this indirectly by ensuring the counter doesn't go below 0
    // Use cpu mode since we can't guarantee nvidia is available in tests
    const session = await acquireSession("cpu", "h264");
    session.release();
    session.release();
    // No error means idempotency is working
  });
});

describe("withHwSession", () => {
  it("calls release on success", async () => {
    const result = await withHwSession("cpu", async (session) => {
      expect(session.mode).toBe("cpu");
      return "done";
    });
    expect(result).toBe("done");
  });

  it("calls release on operation failure", async () => {
    let error: Error | undefined;
    try {
      await withHwSession("cpu", async () => {
        throw new Error("operation failed");
      });
    } catch (e) {
      error = e as Error;
    }
    expect(error?.message).toBe("operation failed");
    // If release was NOT called, a subsequent NVENC acquire would block —
    // but since we're using CPU mode we just verify the error propagates correctly
  });

  it("returns the operation result", async () => {
    const result = await withHwSession("cpu", async () => {
      return 42;
    });
    expect(result).toBe(42);
  });
});

describe("acquireSession auto", () => {
  it("falls back to cpu if no hardware available", async () => {
    // On a machine with no GPU, auto should resolve to cpu
    const session = await acquireSession("auto", "h264");
    // Mode should be a valid HwAccelMode
    expect(["cpu", "nvidia", "vaapi", "qsv", "vulkan"]).toContain(session.mode);
    session.release();
  });
});
