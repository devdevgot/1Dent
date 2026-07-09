import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { isStaticAssetPath } from "./static-dirs";

describe("isStaticAssetPath", () => {
  it("treats /assets/* as static assets", () => {
    assert.equal(isStaticAssetPath("/assets/index-BoltWwqd.js"), true);
    assert.equal(isStaticAssetPath("/assets/doctor-analytics-abc123.js"), true);
  });

  it("treats known file extensions as static assets", () => {
    assert.equal(isStaticAssetPath("/favicon.svg"), true);
    assert.equal(isStaticAssetPath("/images/revenue-empty-illustration.png"), true);
    assert.equal(isStaticAssetPath("/manifest.webmanifest"), false);
  });

  it("does not treat SPA routes as static assets", () => {
    assert.equal(isStaticAssetPath("/doctor-analytics"), false);
    assert.equal(isStaticAssetPath("/patients"), false);
    assert.equal(isStaticAssetPath("/"), false);
  });

  it("ignores query strings when checking extensions", () => {
    assert.equal(isStaticAssetPath("/assets/chunk.js?v=1"), true);
  });
});
