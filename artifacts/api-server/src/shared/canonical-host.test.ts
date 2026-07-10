import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  buildCanonicalRedirectUrl,
  normalizeRequestHost,
  shouldRedirectToCanonicalHost,
} from "./canonical-host";

describe("canonical-host", () => {
  it("normalizes host without port", () => {
    assert.equal(normalizeRequestHost("WWW.1Dent.KZ:443"), "www.1dent.kz");
  });

  it("redirects apex to www", () => {
    assert.equal(shouldRedirectToCanonicalHost("1dent.kz", "www.1dent.kz"), true);
    assert.equal(
      buildCanonicalRedirectUrl("1dent.kz", "/login?next=/app", {
        canonicalHost: "www.1dent.kz",
        protocol: "https",
      }),
      "https://www.1dent.kz/login?next=/app",
    );
  });

  it("does not redirect canonical or unrelated hosts", () => {
    assert.equal(shouldRedirectToCanonicalHost("www.1dent.kz", "www.1dent.kz"), false);
    assert.equal(shouldRedirectToCanonicalHost("localhost", "www.1dent.kz"), false);
    assert.equal(shouldRedirectToCanonicalHost("tkudyzds.up.railway.app", "www.1dent.kz"), false);
    assert.equal(buildCanonicalRedirectUrl("www.1dent.kz", "/"), null);
  });
});
