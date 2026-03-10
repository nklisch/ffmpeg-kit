# Project Patterns Index

- **Fluent Builder with Closure State**: Factory fn → typed interface → closure state; all config methods return `this`; no classes → [fluent-builder.md](.claude/skills/patterns/fluent-builder.md)
- **Validation with Assertion Functions**: `validateXState()` uses `asserts state is ...`; throws `missingFieldError(field)` for missing required fields → [validation-assertion.md](.claude/skills/patterns/validation-assertion.md)
- **Tri-Modal Execution**: Every builder exposes `toArgs()` (pure, sync), `execute()` (runs FFmpeg, throws), `tryExecute()` (returns `OperationResult<T>` via `wrapTryExecute`) → [tri-modal-execution.md](.claude/skills/patterns/tri-modal-execution.md)
- **Filter Chain Assembly**: Conditionally push filter strings to `string[]`, join with `,`; individual filters use `buildFilter()` from `src/core/args.ts` → [filter-chain-assembly.md](.claude/skills/patterns/filter-chain-assembly.md)
- **Post-Execution Probe Enrichment**: After FFmpeg, call `probeOutput()` to get size/duration/probeResult; extract stream metadata; parse stderr for loudness/silence → [post-exec-probe-enrichment.md](.claude/skills/patterns/post-exec-probe-enrichment.md)
- **FFmpegError Classification**: All errors are `FFmpegError` with `FFmpegErrorCode`; process errors classified by `classifyError()` regex; builder errors via `missingFieldError()` → [ffmpeg-error-classification.md](.claude/skills/patterns/ffmpeg-error-classification.md)
- **Test Helpers**: Use `FIXTURES.*`, `tmp()`, `describeWithFFmpeg`, `expectFileExists()`, `expectCodec()`, `expectDurationClose()` from `__tests__/helpers.ts` → [test-helpers.md](.claude/skills/patterns/test-helpers.md)
