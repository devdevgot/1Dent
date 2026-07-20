import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import jwt from "jsonwebtoken";
import {
  issueTmaSessionToken,
  verifyTmaSessionToken,
  TMA_SESSION_TTL_SEC,
} from "./tma-session";
import type { TmaUser } from "./tma.types";

describe("TMA session JWT", () => {
  const prevSecret = process.env["JWT_SECRET"];

  before(() => {
    process.env["JWT_SECRET"] = "test-tma-session-secret";
  });

  after(() => {
    if (prevSecret === undefined) delete process.env["JWT_SECRET"];
    else process.env["JWT_SECRET"] = prevSecret;
  });

  it("issues a typ=tma token that lasts 6 hours", () => {
    const user: TmaUser = {
      telegramUserId: "1337923744",
      name: "Superadmin",
      isAdmin: true,
    };

    const token = issueTmaSessionToken(user);
    const payload = jwt.verify(token, "test-tma-session-secret") as {
      typ: string;
      telegramUserId: string;
      name: string;
      exp: number;
      iat: number;
    };

    assert.equal(payload.typ, "tma");
    assert.equal(payload.telegramUserId, user.telegramUserId);
    assert.equal(payload.name, user.name);
    assert.equal(payload.exp - payload.iat, TMA_SESSION_TTL_SEC);
    assert.equal(TMA_SESSION_TTL_SEC, 6 * 60 * 60);
    assert.ok(verifyTmaSessionToken(token));
  });

  it("rejects CRM-shaped tokens without typ=tma", () => {
    const crmToken = jwt.sign(
      { userId: "u1", clinicId: "c1", role: "owner", email: "a@b.c" },
      "test-tma-session-secret",
      { expiresIn: "1h" },
    );
    assert.equal(verifyTmaSessionToken(crmToken), null);
  });
});
