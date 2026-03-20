import { expect, it } from "vitest";
import { createFFmpeg } from "../../../src/sdk.ts";
import {
  describeWithFFmpeg,
  expectDurationClose,
  expectFileExists,
  FIXTURES,
  probeOutput,
  tmp,
} from "../../helpers.ts";

const ffmpeg = createFFmpeg();

describeWithFFmpeg("text()", () => {
  it("renders basic drawtext", async () => {
    const out = tmp("text-basic.mp4");
    const result = await ffmpeg
      .text()
      .input(FIXTURES.videoShort)
      .addText({
        text: "Hello World",
        anchor: "center",
        style: { fontSize: 48, fontColor: "white" },
      })
      .output(out)
      .execute();

    expectFileExists(result.outputPath);
    expectDurationClose(result.duration, 2);
    const probed = await probeOutput(out);
    expect(probed.streams.some((s) => s.type === "video")).toBe(true);
    // Audio should be copied
    expect(probed.streams.some((s) => s.type === "audio")).toBe(true);
  });

  it("renders text with box background", async () => {
    const out = tmp("text-box.mp4");
    const result = await ffmpeg
      .text()
      .input(FIXTURES.videoShort)
      .addText({
        text: "Caption",
        anchor: "bottom-center",
        style: {
          fontSize: 36,
          fontColor: "white",
          box: true,
          boxColor: "black@0.5",
          boxBorderWidth: 5,
        },
      })
      .output(out)
      .execute();

    expectFileExists(result.outputPath);
    expect(result.sizeBytes).toBeGreaterThan(0);
  });

  it("renders text with time range", async () => {
    const out = tmp("text-timerange.mp4");
    const result = await ffmpeg
      .text()
      .input(FIXTURES.videoShort)
      .addText({
        text: "Timed Text",
        anchor: "top-center",
        startTime: 0.5,
        endTime: 1.5,
        style: { fontSize: 32, fontColor: "yellow" },
      })
      .output(out)
      .execute();

    expectFileExists(result.outputPath);
    expectDurationClose(result.duration, 2);
  });

  it("renders multiple text elements", async () => {
    const out = tmp("text-multiple.mp4");
    const result = await ffmpeg
      .text()
      .input(FIXTURES.videoShort)
      .addText({
        text: "Top Left",
        anchor: "top-left",
        style: { fontSize: 24, fontColor: "white" },
      })
      .addText({
        text: "Bottom Right",
        anchor: "bottom-right",
        style: { fontSize: 24, fontColor: "red" },
      })
      .output(out)
      .execute();

    expectFileExists(result.outputPath);
    expect(result.sizeBytes).toBeGreaterThan(0);
  });

  it("renders scrolling text", async () => {
    const out = tmp("text-scroll.mp4");
    const result = await ffmpeg
      .text()
      .input(FIXTURES.videoShort)
      .scroll({
        text: "Scrolling news ticker text here",
        style: { fontSize: 28, fontColor: "white" },
        direction: "left",
        speed: 80,
      })
      .output(out)
      .execute();

    expectFileExists(result.outputPath);
    expect(result.sizeBytes).toBeGreaterThan(0);
  });

  it("renders counter", async () => {
    const out = tmp("text-counter.mp4");
    const result = await ffmpeg
      .text()
      .input(FIXTURES.videoShort)
      .counter({
        start: 0,
        end: 100,
        style: { fontSize: 48, fontColor: "white" },
        position: { x: 50, y: 50 },
      })
      .output(out)
      .execute();

    expectFileExists(result.outputPath);
    expect(result.sizeBytes).toBeGreaterThan(0);
  });

  it("tryExecute() returns success result", async () => {
    const out = tmp("text-try.mp4");
    const result = await ffmpeg
      .text()
      .input(FIXTURES.videoShort)
      .addText({ text: "Try", style: {} })
      .output(out)
      .tryExecute();
    expect(result.success).toBe(true);
  });

  it("tryExecute() returns failure on invalid input", async () => {
    const result = await ffmpeg
      .text()
      .input("nonexistent.mp4")
      .addText({ text: "Hi", style: {} })
      .output(tmp("text-fail.mp4"))
      .tryExecute();
    expect(result.success).toBe(false);
  });
});
