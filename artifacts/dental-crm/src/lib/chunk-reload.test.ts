import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { isChunkLoadError, isMissingLazyExportError } from "./chunk-reload";

describe("isMissingLazyExportError", () => {
  it("detects Safari stale named-export access", () => {
    const err = new TypeError("undefined is not an object (evaluating 'e.PlanPaywall')");
    assert.equal(isMissingLazyExportError(err), true);
  });

  it("detects Safari AttendanceCheckModal stale access from login→dashboard", () => {
    const err = new TypeError(
      "undefined is not an object (evaluating 'e.AttendanceCheckModal')",
    );
    assert.equal(isMissingLazyExportError(err), true);
  });

  it("detects Chromium stale named-export access", () => {
    const err = new TypeError("Cannot read properties of undefined (reading 'PlanPaywall')");
    assert.equal(isMissingLazyExportError(err), true);
  });

  it("detects explicit missing named export errors", () => {
    const err = new TypeError(
      "Failed to fetch dynamically imported module: missing named export 'AttendanceCheckModal'",
    );
    assert.equal(isMissingLazyExportError(err), true);
  });
});

describe("isChunkLoadError", () => {
  it("detects MIME type mismatch from stale chunk loads", () => {
    const err = new TypeError("'text/html' is not a valid JavaScript MIME type.");
    assert.equal(isChunkLoadError(err), true);
  });

  it("detects dynamic import fetch failures", () => {
    const err = new TypeError("Failed to fetch dynamically imported module: https://example.com/assets/page.js");
    assert.equal(isChunkLoadError(err), true);
  });

  it("detects missing default export after stale deploy", () => {
    const err = new TypeError("Failed to fetch dynamically imported module: missing default export");
    assert.equal(isChunkLoadError(err), true);
  });

  it("detects Safari Load failed on 404 chunks", () => {
    assert.equal(isChunkLoadError(new TypeError("Load failed")), true);
  });

  it("detects failed module script MIME mismatches", () => {
    const err = new TypeError(
      "Failed to load module script: Expected a JavaScript-or-Wasm module script but the server responded with a MIME type of \"text/html\"",
    );
    assert.equal(isChunkLoadError(err), true);
  });

  it("detects stale named-export access via Safari message", () => {
    const err = new TypeError("undefined is not an object (evaluating 'e.AttendanceCheckModal')");
    assert.equal(isChunkLoadError(err), true);
  });

  it("ignores unrelated errors", () => {
    assert.equal(isChunkLoadError(new Error("Cannot read properties of null")), false);
    assert.equal(isChunkLoadError("boom"), false);
  });
});
