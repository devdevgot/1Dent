import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { isChunkLoadError } from "./chunk-reload";

describe("isChunkLoadError", () => {
  it("detects MIME type mismatch from stale chunk loads", () => {
    const err = new TypeError("'text/html' is not a valid JavaScript MIME type.");
    assert.equal(isChunkLoadError(err), true);
  });

  it("detects dynamic import fetch failures", () => {
    const err = new TypeError("Failed to fetch dynamically imported module: https://example.com/assets/page.js");
    assert.equal(isChunkLoadError(err), true);
  });

  it("ignores unrelated errors", () => {
    assert.equal(isChunkLoadError(new Error("Cannot read properties of null")), false);
    assert.equal(isChunkLoadError("boom"), false);
  });
});
